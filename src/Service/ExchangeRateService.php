<?php

namespace Limas\Service;

use Symfony\Contracts\HttpClient\HttpClientInterface;

/** ECB reference rates, quoted as units of each currency per EUR. */
final readonly class ExchangeRateService
{
	private const string KEY = 'limas.exchange_rates.ecb';
	private const string URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

	public function __construct(
		private HttpClientInterface $httpClient,
		private SystemPreferenceService $preferences
	) {}

	/** @return array{date: string, base: string, rates: array<string, float>} */
	public function refresh(): array
	{
		$xml = $this->httpClient->request('GET', self::URL, ['timeout' => 15])->getContent();
		$document = new \DOMDocument();
		if (!@$document->loadXML($xml, LIBXML_NONET)) {
			throw new \RuntimeException('ECB returned invalid XML.');
		}
		$xpath = new \DOMXPath($document);
		$days = $xpath->query('//*[local-name()="Cube"][@time]');
		$day = $days?->item(0);
		$date = $day?->attributes?->getNamedItem('time')?->nodeValue;
		if (!$day || !$date || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
			throw new \RuntimeException('ECB response has no rate date.');
		}
		$rates = ['EUR' => 1.0];
		foreach ($xpath->query('./*[local-name()="Cube"][@currency][@rate]', $day) as $node) {
			$currency = $node->attributes->getNamedItem('currency')?->nodeValue;
			$rate = (float)$node->attributes->getNamedItem('rate')?->nodeValue;
			if ($currency && preg_match('/^[A-Z]{3}$/', $currency) && is_finite($rate) && $rate > 0) {
				$rates[$currency] = $rate;
			}
		}
		if (count($rates) < 5) throw new \RuntimeException('ECB response has too few rates.');
		$result = ['date' => $date, 'base' => 'EUR', 'rates' => $rates];
		$this->preferences->setSystemPreference(self::KEY, json_encode($result, JSON_THROW_ON_ERROR));
		return $result;
	}

	/** @return array{date: string, base: string, rates: array<string, float>}|null */
	public function latest(): ?array
	{
		try {
			$data = json_decode($this->preferences->getSystemPreferenceValue(self::KEY), true, 512, JSON_THROW_ON_ERROR);
			return is_array($data) && isset($data['date'], $data['rates']['EUR']) ? $data : null;
		} catch (\Throwable) {
			return null;
		}
	}
}
