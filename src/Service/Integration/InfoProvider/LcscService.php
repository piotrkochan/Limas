<?php

namespace Limas\Service\Integration\InfoProvider;

use Nette\Utils\Json;
use Psr\Cache\CacheItemInterface;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Symfony\Contracts\HttpClient\ResponseInterface;


/**
 * Thin client over LCSC's data, hit via two unauthenticated endpoints:
 *  - **wmsc.lcsc.com** (`https://wmsc.lcsc.com/ftps/wm/product/query/list`) —
 *    LCSC's public catalog list, queried by keyword/MPN for Phase-1 search.
 *  - **wmsc.lcsc.com** (`https://wmsc.lcsc.com/ftps/wm/product/detail`) —
 *    LCSC's own unauthenticated product-detail endpoint, lookup by
 *    `productCode` (the Cxxxxx code). Returns FULL data: price ladder,
 *    datasheet PDF URL, manufacturer name (English), parametric attributes,
 *    image URLs. Used for Phase-2 detail.
 *
 * Why this approach instead of LCSC's official IPS API (`ips.lcsc.com`):
 * the official API requires per-customer approval + IP whitelisting + signature
 * authentication. These public endpoints ship LCSC data without any of that,
 * which makes the LCSC source available out-of-the-box once env vars are set
 * to anything non-empty.
 *
 * No env var is strictly required to enable LCSC — the adapter is "configured"
 * whenever the LCSC base URLs are reachable. We still expose a single
 * `LCSC_ENABLED` flag so it can be disabled deployment-wide without removing
 * the service definition.
 */
class LcscService
{
	private const string WMSC_SEARCH_ENDPOINT = 'https://wmsc.lcsc.com/ftps/wm/product/query/list';
	private const string WMSC_DETAIL_ENDPOINT = 'https://wmsc.lcsc.com/ftps/wm/product/detail';


	public function __construct(
		private readonly HttpClientInterface $httpClient,
		private readonly CacheInterface      $lcscCache,
		private readonly bool                $enabled = true
	)
	{
	}

	public function isConfigured(): bool
	{
		return $this->enabled;
	}

	/**
	 * Phase-1 async dispatch. The old JLC search index misses products that
	 * LCSC itself lists, so search the LCSC catalog directly.
	 */
	public function searchAsync(string $query, int $limit = 20): ResponseInterface
	{
		return $this->httpClient->request('POST', self::WMSC_SEARCH_ENDPOINT, [
			'json' => [
				'keyword' => $query,
				'currentPage' => 1,
				'pageSize' => max(1, min($limit, 100))
			],
			'headers' => [
				'Accept' => 'application/json',
				'User-Agent' => 'Limas-Aggregator/1.0 (+https://github.com/Lopo/Limas)'
			],
			'timeout' => 15
		]);
	}

	/**
	 * Phase-2 async dispatch — full detail lookup by LCSC product code
	 * (e.g. `C2128`). Falls back to NULL when wmsc returns an error or
	 * the product is no longer listed (rare but happens for obsoleted
	 * SKUs that jlcsearch's cache hadn't refreshed yet).
	 */
	public function getDetailAsync(string $productCode): ResponseInterface
	{
		return $this->httpClient->request('GET', self::WMSC_DETAIL_ENDPOINT, [
			'query' => [
				'productCode' => strtoupper($productCode),
			],
			'headers' => [
				'Accept' => 'application/json',
				'User-Agent' => 'Limas-Aggregator/1.0 (+https://github.com/Lopo/Limas)'
			],
			'timeout' => 15
		]);
	}

	/**
	 * Normalize LCSC's list rows to the adapter's light search shape.
	 *
	 * @return array{components: array<int, array<string, mixed>>}
	 */
	public function awaitSearch(ResponseInterface $response): array
	{
		try {
			$data = $response->toArray(false);
		} catch (\Throwable) {
			return ['components' => []];
		}
		$rows = $data['result']['dataList'] ?? null;
		if (($data['ok'] ?? true) === false || !is_array($rows)) {
			return ['components' => []];
		}
		$components = [];
		foreach ($rows as $row) {
			if (!is_array($row)) continue;
			$code = strtoupper((string)($row['productCode'] ?? ''));
			if (!preg_match('/^C[1-9][0-9]*$/', $code)) continue;
			$components[] = [
				'lcsc' => substr($code, 1),
				'mfr' => (string)($row['productModel'] ?? ''),
				'package' => $row['encapStandard'] ?? null,
				'description' => $row['productIntroEn'] ?? ($row['productDescEn'] ?? null),
				'stock' => $row['stockNumber'] ?? null
			];
		}
		return ['components' => $components];
	}

	/**
	 * Await + decode the wmsc detail response. wmsc wraps everything in
	 * `{code, msg, result, ok}` — we unwrap to just `result` (a flat dict)
	 * so adapters don't have to know about the envelope.
	 *
	 * On successful decode, also caches the result per-LCSC-code so that
	 * Phase-2 batched detail fetches that re-query the same codes (a
	 * common pattern when Phase-1 enriched the SearchResult with a Phase-2
	 * mfr lookup) hit cache instead of re-firing wmsc. Mirrors the same
	 * trick `FarnellService::awaitAndCache` uses.
	 *
	 * @return array<string, mixed>|null
	 */
	public function awaitDetail(ResponseInterface $response): ?array
	{
		try {
			$data = $response->toArray(false);
		} catch (\Throwable) {
			return null;
		}
		$ok = $data['ok'] ?? null;
		if ($ok === false) {
			return null;
		}
		$result = $data['result'] ?? null;
		if (!is_array($result)) {
			return null;
		}
		$code = (string)($result['productCode'] ?? '');
		if ($code !== '') {
			$cacheKey = 'detail_' . strtoupper($code);
			$this->lcscCache->delete($cacheKey);
			$this->lcscCache->get($cacheKey, static fn(CacheItemInterface $item) => Json::encode($result));
		}
		return $result;
	}

	/**
	 * Read a previously-cached wmsc detail by LCSC code, or null if not
	 * present. Used by Phase-2 detail mapping to avoid re-fetching when
	 * Phase-1's enrichment pass already warmed the cache.
	 *
	 * @return array<string, mixed>|null
	 */
	public function getCachedDetail(string $productCode): ?array
	{
		$cacheKey = 'detail_' . strtoupper($productCode);
		// PSR-6 path — Symfony's get($key, fn() => null) callback shape
		// makes phpstan infer the return as always-null. getItem() side
		// keeps the cache's real value typed as mixed.
		if (!$this->lcscCache instanceof \Psr\Cache\CacheItemPoolInterface) {
			return null;
		}
		$item = $this->lcscCache->getItem($cacheKey);
		if (!$item->isHit()) {
			return null;
		}
		$raw = $item->get();
		if (!is_string($raw) || $raw === '') {
			return null;
		}
		try {
			$decoded = Json::decode($raw, true);
		} catch (\Throwable) {
			return null;
		}
		return is_array($decoded) ? $decoded : null;
	}
}
