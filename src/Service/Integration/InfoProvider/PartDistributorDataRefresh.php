<?php

namespace Limas\Service\Integration\InfoProvider;

use Doctrine\ORM\EntityManagerInterface;
use Limas\Entity\Part;
use Limas\Entity\PartDistributor;
use Limas\Entity\Distributor;
use Limas\Entity\Manufacturer;
use Limas\Entity\ManufacturerAlias;
use Limas\Entity\PartManufacturer;
use Limas\Service\Integration\InfoProvider\Dto\InfoProviderResult;
use Limas\Service\Integration\InfoProvider\Dto\InfoProviderSearchResult;
use Limas\Service\ManufacturerCanonicalizer;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

/** Builds a field-by-field preview and applies only explicitly selected changes. */
final readonly class PartDistributorDataRefresh
{
	public function __construct(
		private EntityManagerInterface $em,
		private InfoProviderAggregator $providers,
		private ManufacturerCanonicalizer $manufacturerCanonicalizer,
		#[Autowire(service: 'distributor_refresh_preview.cache')]
		private CacheItemPoolInterface $previewCache
	) {}

	/** @param list<int> $partIds */
	public function preview(array $partIds): array
	{
		[$rows, $updates, $skipped, $unchanged] = $this->collect($partIds);
		$previewId = bin2hex(random_bytes(24));
		$snapshotRows = [];
		foreach ($rows as $row) {
			[$target, $field, $value, $current] = $updates[$row['key']];
			$snapshotRows[$row['key']] = [
				'fingerprint' => $row['fingerprint'],
				'partId' => $row['partId'], 'distributor' => $row['distributor'], 'label' => $row['label'],
				'targetType' => $target instanceof PartDistributor ? 'offer' : 'part',
				'targetId' => $target->getId(), 'field' => $field, 'value' => $value, 'current' => $current
			];
		}
		$item = $this->previewCache->getItem('preview_' . $previewId);
		$item->set(['partIds' => array_values($partIds), 'rows' => $snapshotRows]);
		$item->expiresAfter(1800);
		$this->previewCache->save($item);
		return ['previewId' => $previewId, 'rows' => $rows, 'unchanged' => $unchanged, 'skipped' => $skipped];
	}

	/** @param list<int> $partIds
	 *  @param array<string, string> $selected Fingerprints from the preview.
	 */
	public function apply(array $partIds, array $selected, string $previewId): array
	{
		$item = $this->previewCache->getItem('preview_' . $previewId);
		$snapshot = $item->isHit() ? $item->get() : null;
		if (!is_array($snapshot) || !isset($snapshot['partIds'], $snapshot['rows'])) {
			throw new \RuntimeException('Preview expired. Refresh distributor data and select changes again.');
		}
		$expectedIds = $snapshot['partIds'];
		$providedIds = $partIds;
		sort($expectedIds);
		sort($providedIds);
		if ($expectedIds !== $providedIds) {
			throw new \RuntimeException('Preview does not match the selected parts. Refresh the preview.');
		}
		$rows = $snapshot['rows'];
		$skipped = [];
		$connection = $this->em->getConnection();
		$connection->beginTransaction();
		try {
			$updated = 0;
			$pending = [];
			foreach ($selected as $key => $fingerprint) {
				$row = $rows[$key] ?? null;
				if ($row === null) {
					$skipped[] = ['partId' => (int)explode(':', $key, 2)[0], 'distributor' => '',
						'reason' => 'Field was not in the preview'];
					continue;
				}
				if (!hash_equals($row['fingerprint'], $fingerprint)) {
					$skipped[] = ['partId' => $row['partId'], 'distributor' => $row['distributor'],
						'reason' => 'Preview selection mismatch'];
					continue;
				}
				$target = $this->em->find($row['targetType'] === 'offer' ? PartDistributor::class : Part::class, $row['targetId']);
				if ($target === null || ($target instanceof PartDistributor
					? $target->getPart()->getId() : $target->getId()) !== $row['partId']) {
					$skipped[] = ['partId' => $row['partId'], 'distributor' => $row['distributor'],
						'reason' => 'Part or distributor offer no longer exists'];
					continue;
				}
				$field = $row['field'];
				$value = $row['value'];
				if ($field !== 'offer' && !$this->sameValue($field, $this->currentValue($target, $field), $row['current'])) {
				$skipped[] = ['partId' => $row['partId'], 'distributor' => $row['distributor'],
					'reason' => $row['label'] . ' changed in Limas since preview'];
				continue;
				}
				$pending[] = [$row, $target, $field, $value];
			}
			foreach ($pending as [$row, $target, $field, $value]) {
				if ($field === 'offer') {
					if (!$this->addOffer($target, $value)) {
						$skipped[] = ['partId' => $row['partId'], 'distributor' => $row['distributor'],
							'reason' => 'Offer already exists'];
						continue;
					}
				} elseif ($target instanceof PartDistributor) {
					match ($field) {
						'pricing' => $this->applyPricing($target, $value),
						'rohsStatus' => $target->setRohsStatus($value),
						'assemblyClass' => $target->setAssemblyClass($value)
					};
				} else {
					match ($field) {
						'name' => $target->setName($value),
						'description' => $target->setDescription($value),
						'catalogPackage' => $target->setCatalogPackage($value)
					};
				}
				$updated++;
			}
			$this->em->flush();
			$connection->commit();
		} catch (\Throwable $error) {
			$connection->rollBack();
			throw $error;
		}
		$this->previewCache->deleteItem('preview_' . $previewId);
		return ['updated' => $updated, 'skipped' => $skipped];
	}

	private function currentValue(Part|PartDistributor $target, string $field): mixed
	{
		if ($target instanceof PartDistributor) {
			return match ($field) {
				'pricing' => ['priceBreaks' => $target->getPriceBreaks(), 'price' => $target->getPrice(), 'currency' => $target->getCurrency()],
				'rohsStatus' => $target->getRohsStatus(),
				'assemblyClass' => $target->getAssemblyClass(),
				default => null
			};
		}
		return match ($field) {
			'name' => $target->getName(),
			'description' => $target->getDescription(),
			'catalogPackage' => $target->getCatalogPackage(),
			default => null
		};
	}

	/** @param list<int> $partIds */
	private function collect(array $partIds): array
	{
		$sources = [];
		foreach ($this->providers->sourcesWithCapabilities() as $source) {
			if ($source['configured']) $sources[strtolower($source['name'])] = $source['name'];
		}
		$rows = $updates = $skipped = $unchanged = $detailsCache = [];
		foreach ($partIds as $partId) {
			$part = $this->em->find(Part::class, $partId);
			if (!$part) throw new \InvalidArgumentException('Part ' . $partId . ' no longer exists.');
			$hasOffers = !$part->getDistributors()->isEmpty();
			foreach ($part->getDistributors() as $offer) {
				$source = strtolower(trim($offer->getDistributor()?->getName() ?? ''));
				$sku = trim($offer->getSku() ?: $offer->getOrderNumber() ?: '');
				$label = $offer->getDistributor()?->getName() ?: 'Unknown distributor';
				if (!isset($sources[$source]) || $sku === '') {
					$skipped[] = ['partId' => $partId, 'distributor' => $label,
						'reason' => $sku === '' ? 'Missing SKU or order number' : 'No configured provider'];
					continue;
				}
				$cacheKey = $source . ':' . $sku;
				try {
					if (!array_key_exists($cacheKey, $detailsCache)) {
						$detailsCache[$cacheKey] = $this->providers->getDetails($sources[$source], $sku);
					}
					$details = $detailsCache[$cacheKey];
				} catch (\Throwable) {
					$skipped[] = ['partId' => $partId, 'distributor' => $label, 'reason' => 'Provider request failed'];
					continue;
				}
				if (!$details instanceof InfoProviderResult || strcasecmp(trim($details->sourceSku), $sku) !== 0) {
					$skipped[] = ['partId' => $partId, 'distributor' => $label, 'reason' => 'No exact SKU match'];
					continue;
				}
				$this->addChanges($part, $offer, $label, $sku, $details, $rows, $updates, $unchanged);
			}
			if (!$hasOffers) {
				$this->discoverOffers($part, $sources, $detailsCache, $rows, $updates, $skipped, $unchanged);
			}
		}
		return [$rows, $updates, $skipped, $unchanged];
	}

	/** Discover exact MPN matches only. Preview never creates database rows. */
	private function discoverOffers(Part $part, array $sources, array &$detailsCache,
		array &$rows, array &$updates, array &$skipped, array &$unchanged): void
	{
		if ($sources === []) {
			$skipped[] = ['partId' => $part->getId(), 'distributor' => '', 'reason' => 'No configured providers'];
			return;
		}
		$lookups = [];
		foreach ($part->getManufacturers() as $partManufacturer) {
			$mpn = trim((string)$partManufacturer->getPartNumber());
			if ($mpn === '') continue;
			$key = mb_strtolower($mpn);
			$lookups[$key] ??= ['mpn' => $mpn, 'manufacturers' => [], 'manufacturerLabels' => []];
			$manufacturer = $partManufacturer->getManufacturer();
			if ($manufacturer === null) continue;
			$lookups[$key]['manufacturers'][] = ManufacturerCanonicalizer::normalize((string)$manufacturer->getName());
			$lookups[$key]['manufacturerLabels'][] = (string)$manufacturer->getName();
			foreach ($this->em->getRepository(ManufacturerAlias::class)->findBy(['manufacturer' => $manufacturer]) as $alias) {
				$lookups[$key]['manufacturers'][] = $alias->getAliasNormalized();
			}
		}
		if ($lookups === [] && preg_match('/^\S{2,80}$/u', trim((string)$part->getName()))) {
			$mpn = trim((string)$part->getName());
			$lookups[mb_strtolower($mpn)] = ['mpn' => $mpn, 'manufacturers' => [], 'manufacturerLabels' => []];
		}
		if ($lookups === []) {
			$skipped[] = ['partId' => $part->getId(), 'distributor' => '',
				'reason' => 'No manufacturer part number or usable part name'];
			return;
		}
		$found = false;
		$seen = [];
		foreach ($lookups as $lookup) {
			$mpn = $lookup['mpn'];
			$manufacturers = array_unique(array_filter($lookup['manufacturers']));
			$savedManufacturers = array_values(array_unique($lookup['manufacturerLabels']));
			try {
				$results = $this->providers->searchByMpn($mpn, array_values($sources), 10);
			} catch (\Throwable) {
				continue;
			}
			foreach ($results as $source => $matches) {
				if (!is_array($matches) || isset($matches['error']) || !isset($sources[strtolower($source)])) continue;
				foreach ($matches as $match) {
					if (!$match instanceof InfoProviderSearchResult || strcasecmp(trim($match->manufacturerPartNumber), $mpn) !== 0) continue;
					$sku = trim($match->sourceSku);
					if ($sku === '') continue;
					$cacheKey = strtolower($source) . ':' . $sku;
					if (isset($seen[$cacheKey])) continue;
					try {
						$detailsCache[$cacheKey] ??= $this->providers->getDetails($sources[strtolower($source)], $sku);
						$details = $detailsCache[$cacheKey];
					} catch (\Throwable) {
						continue;
					}
					if (!$details instanceof InfoProviderResult || strcasecmp(trim($details->sourceSku), $sku) !== 0
						|| strcasecmp(trim($details->manufacturerPartNumber), $mpn) !== 0) continue;
					$seen[$cacheKey] = true;
					$data = $this->newOfferData($details);
					$manufacturerWarning = $manufacturers !== []
						&& !$this->manufacturerMatches($details->manufacturerName, $manufacturers);
					$key = $part->getId() . ':0:offer' . substr(hash('sha256', $cacheKey), 0, 16);
					$rows[] = [
						'key' => $key, 'partId' => $part->getId(), 'partName' => $part->getName(),
						'distributor' => $sources[strtolower($source)], 'sku' => $sku,
						'field' => 'offer', 'label' => 'New offer', 'current' => '',
						'proposed' => $this->newOfferSummary($data, $manufacturerWarning ? $savedManufacturers : []),
						'defaultSelected' => false,
						'fingerprint' => hash('sha256', json_encode([$data, $savedManufacturers], JSON_THROW_ON_ERROR))
					];
					$updates[$key] = [$part, 'offer', $data, null];
					$this->addDiscoveredPartChange($part, $sources[strtolower($source)], $sku,
						'Description', 'description', $part->getDescription(), $details->description,
						$rows, $updates, $unchanged);
					$this->addDiscoveredPartChange($part, $sources[strtolower($source)], $sku,
						'Catalog package', 'catalogPackage', $part->getCatalogPackage(), $details->packageName,
						$rows, $updates, $unchanged);
					$found = true;
				}
			}
		}
		if (!$found) {
			$skipped[] = ['partId' => $part->getId(), 'distributor' => '',
				'reason' => 'No exact distributor match for the saved MPN'];
		}
	}

	private function addDiscoveredPartChange(Part $part, string $source, string $sku, string $label,
		string $field, ?string $current, ?string $proposed,
		array &$rows, array &$updates, array &$unchanged): void
	{
		if ($proposed === null || $proposed === '') return;
		$key = $part->getId() . ':0:' . $field . substr(hash('sha256', strtolower($source) . ':' . $sku), 0, 16);
		$row = [
			'key' => $key, 'partId' => $part->getId(), 'partName' => $part->getName(),
			'distributor' => $source, 'sku' => $sku, 'field' => $field, 'label' => $label,
			'current' => $this->display($current), 'proposed' => $this->display($proposed),
			'defaultSelected' => false,
			'fingerprint' => hash('sha256', json_encode([$current, $proposed], JSON_THROW_ON_ERROR))
		];
		if ($this->sameValue($field, $current, $proposed)) {
			$unchanged[] = $row;
			return;
		}
		$rows[] = $row;
		$updates[$key] = [$part, $field, $proposed, $current];
	}

	private function manufacturerMatches(string $name, array $knownNames): bool
	{
		return $knownNames === [] || in_array(ManufacturerCanonicalizer::normalize($name), $knownNames, true);
	}

	private function newOfferData(InfoProviderResult $details): array
	{
		$breaks = [];
		foreach ($details->priceBreaks as $break) {
			if ($break->quantity > 0 && is_finite($break->price) && $break->price >= 0) {
				$breaks[] = ['quantity' => $break->quantity, 'price' => sprintf('%.8f', $break->price)];
			}
		}
		return [
			'source' => strtolower($details->source), 'sku' => $details->sourceSku,
			'manufacturer' => $details->manufacturerName, 'mpn' => $details->manufacturerPartNumber,
			'description' => $details->description, 'catalogPackage' => $details->packageName,
			'currency' => $details->currency,
			'priceBreaks' => $breaks, 'rohsStatus' => $details->rohsStatus,
			'assemblyClass' => $details->assemblyClass
		];
	}

	private function newOfferSummary(array $data, array $differentManufacturers = []): string
	{
		$lines = [];
		if ($differentManufacturers !== []) {
			$lines[] = 'Manufacturer differs from saved: ' . implode(', ', $differentManufacturers);
		}
		$lines[] = trim($data['manufacturer'] . ' ' . $data['mpn']);
		if ($data['description']) $lines[] = $data['description'];
		if ($data['priceBreaks'] !== []) $lines[] = ($data['currency'] ?: '') . ' ' . $this->display($data['priceBreaks']);
		if ($data['rohsStatus']) $lines[] = 'RoHS: ' . $data['rohsStatus'];
		if ($data['assemblyClass']) $lines[] = 'Assembly: ' . $data['assemblyClass'];
		return implode("\n", $lines);
	}

	private function addOffer(Part $part, array $data): bool
	{
		foreach ($part->getDistributors() as $existing) {
			if (strcasecmp((string)$existing->getDistributor()?->getName(), $data['source']) === 0
				&& strcasecmp(trim((string)($existing->getSku() ?: $existing->getOrderNumber())), $data['sku']) === 0) {
				return false;
			}
		}
		$distributor = $this->em->getRepository(Distributor::class)->createQueryBuilder('d')
			->where('LOWER(d.name) = :name')->setParameter('name', $data['source'])
			->setMaxResults(1)->getQuery()->getOneOrNullResult();
		if (!$distributor instanceof Distributor) {
			$distributor = (new Distributor)->setName($data['source']);
			$this->em->persist($distributor);
		}
		$offer = (new PartDistributor)
			->setDistributor($distributor)
			->setSku($data['sku'])
			->setOrderNumber($data['sku'])
			->setRohsStatus($data['rohsStatus'])
			->setAssemblyClass($data['assemblyClass']);
		if ($data['priceBreaks'] !== []) {
			$offer->setPriceBreaks($data['priceBreaks']);
			$offer->setPrice(sprintf('%.4f', (float)$data['priceBreaks'][0]['price']));
			$offer->setPackagingUnit(max(1, $data['priceBreaks'][0]['quantity']));
		}
		if ($data['currency']) $offer->setCurrency(substr($data['currency'], 0, 3));
		$part->addDistributor($offer);
		$this->em->persist($offer);
		if ($part->getManufacturers()->isEmpty() && trim($data['manufacturer']) !== '') {
			$manufacturer = $this->manufacturerCanonicalizer->canonicalize($data['manufacturer']);
			if ($manufacturer === null) {
				$manufacturer = (new Manufacturer)->setName($data['manufacturer']);
				$this->em->persist($manufacturer);
				$this->manufacturerCanonicalizer->registerAlias($manufacturer, $data['manufacturer']);
			}
			$partManufacturer = (new PartManufacturer)
				->setManufacturer($manufacturer)
				->setPartNumber($data['mpn']);
			$part->addManufacturer($partManufacturer);
			$this->em->persist($partManufacturer);
		}
		return true;
	}

	private function addChanges(Part $part, PartDistributor $offer, string $source, string $sku,
		InfoProviderResult $details, array &$rows, array &$updates, array &$unchanged): void
	{
		$add = function (object $target, string $field, string $label, mixed $current, mixed $proposed,
			bool $defaultSelected = false) use ($part, $offer, $source, $sku, &$rows, &$updates, &$unchanged): void {
			if ($proposed === null || $proposed === '' || $proposed === []) return;
			$key = $part->getId() . ':' . $offer->getId() . ':' . $field;
			$row = [
				'key' => $key,
				'partId' => $part->getId(),
				'partName' => $part->getName(),
				'distributor' => $source,
				'sku' => $sku,
				'field' => $field,
				'label' => $label,
				'current' => $this->display($current),
				'proposed' => $this->display($proposed),
				'defaultSelected' => $defaultSelected,
				'fingerprint' => hash('sha256', json_encode([$current, $proposed], JSON_THROW_ON_ERROR))
			];
			if ($this->sameValue($field, $current, $proposed)) {
				$unchanged[] = $row;
				return;
			}
			$rows[] = $row;
			$updates[$key] = [$target, $field, $proposed, $current];
		};
		$add($part, 'name', 'Name', $part->getName(), $details->manufacturerPartNumber);
		$add($part, 'description', 'Description', $part->getDescription(), $details->description);
		$add($part, 'catalogPackage', 'Catalog package', $part->getCatalogPackage(), $details->packageName);
		$add($offer, 'rohsStatus', 'RoHS', $offer->getRohsStatus(), $details->rohsStatus, true);
		$add($offer, 'assemblyClass', 'Assembly class', $offer->getAssemblyClass(), $details->assemblyClass, true);
		$breaks = [];
		foreach ($details->priceBreaks as $break) {
			if ($break->quantity > 0 && is_finite($break->price) && $break->price >= 0) {
				$breaks[] = ['quantity' => $break->quantity, 'price' => sprintf('%.8f', $break->price)];
			}
		}
		if ($breaks !== []) {
			$add($offer, 'pricing', 'Pricing', [
				'priceBreaks' => $offer->getPriceBreaks(), 'price' => $offer->getPrice(), 'currency' => $offer->getCurrency()
			], [
				'priceBreaks' => $breaks, 'price' => sprintf('%.4f', (float)$breaks[0]['price']),
				'currency' => $details->currency ? substr($details->currency, 0, 3) : $offer->getCurrency()
			], true);
		}
	}

	private function applyPricing(PartDistributor $offer, array $value): void
	{
		$offer->setPriceBreaks($value['priceBreaks']);
		$offer->setPrice($value['price']);
		if ($value['currency'] !== null) $offer->setCurrency($value['currency']);
	}

	private function sameValue(string $field, mixed $current, mixed $proposed): bool
	{
		if ($field === 'pricing' && is_array($current) && is_array($proposed)) {
			return $this->normalizedPricing($current) === $this->normalizedPricing($proposed);
		}
		if (is_string($current) && is_string($proposed)) {
			$clean = static fn(string $value) => preg_replace('/\s+/u', ' ', trim($value)) ?? trim($value);
			return $clean($current) === $clean($proposed);
		}
		return $current === $proposed;
	}

	private function normalizedPricing(array $value): array
	{
		$breaks = [];
		foreach ($value['priceBreaks'] ?? [] as $break) {
			$breaks[(int)$break['quantity']] = sprintf('%.8f', (float)$break['price']);
		}
		ksort($breaks, SORT_NUMERIC);
		return [
			'price' => $value['price'] === null ? null : sprintf('%.4f', (float)$value['price']),
			'currency' => strtoupper(trim((string)($value['currency'] ?? ''))),
			'priceBreaks' => $breaks
		];
	}

	private function display(mixed $value): string
	{
		if (is_array($value)) {
			if (array_key_exists('priceBreaks', $value)) {
				$currency = $value['currency'] ?? '';
				$price = $value['price'] === null ? '—' : $value['price'];
				return 'Base price: ' . $price . ' ' . $currency . "\n" . $this->display($value['priceBreaks']);
			}
			return implode("\n", array_map(static fn(array $row) => $row['quantity'] . '+: ' . $row['price'], $value));
		}
		return $value === null ? '' : (string)$value;
	}
}
