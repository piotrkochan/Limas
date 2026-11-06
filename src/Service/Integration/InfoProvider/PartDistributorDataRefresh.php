<?php

namespace Limas\Service\Integration\InfoProvider;

use Doctrine\ORM\EntityManagerInterface;
use Limas\Entity\Part;
use Limas\Entity\PartDistributor;
use Limas\Service\Integration\InfoProvider\Dto\InfoProviderResult;

/** Builds a field-by-field preview and applies only explicitly selected changes. */
final readonly class PartDistributorDataRefresh
{
	public function __construct(
		private EntityManagerInterface $em,
		private InfoProviderAggregator $providers
	) {}

	/** @param list<int> $partIds */
	public function preview(array $partIds): array
	{
		[$rows, , $skipped] = $this->collect($partIds);
		return ['rows' => $rows, 'skipped' => $skipped];
	}

	/** @param list<int> $partIds
	 *  @param array<string, string> $selected Fingerprints from the preview.
	 */
	public function apply(array $partIds, array $selected): array
	{
		[$rows, $updates, $skipped] = $this->collect($partIds);
		$updated = 0;
		$seen = [];
		foreach ($rows as $row) {
			$key = $row['key'];
			if (!isset($selected[$key])) continue;
			$seen[$key] = true;
			if (!hash_equals($row['fingerprint'], $selected[$key])) {
				$skipped[] = ['partId' => $row['partId'], 'distributor' => $row['distributor'],
					'reason' => $row['label'] . ' changed since preview'];
				continue;
			}
			[$target, $field, $value] = $updates[$key];
			if ($target instanceof PartDistributor) {
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
		foreach (array_keys($selected) as $key) {
			if (!isset($seen[$key])) {
				$skipped[] = ['partId' => (int)explode(':', $key, 2)[0], 'distributor' => '',
					'reason' => 'Field no longer matches the preview'];
			}
		}
		$this->em->flush();
		return ['updated' => $updated, 'skipped' => $skipped];
	}

	/** @param list<int> $partIds */
	private function collect(array $partIds): array
	{
		$sources = [];
		foreach ($this->providers->sourcesWithCapabilities() as $source) {
			if ($source['configured']) $sources[strtolower($source['name'])] = $source['name'];
		}
		$rows = $updates = $skipped = $detailsCache = [];
		foreach ($partIds as $partId) {
			$part = $this->em->find(Part::class, $partId);
			if (!$part) throw new \InvalidArgumentException('Part ' . $partId . ' no longer exists.');
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
				$this->addChanges($part, $offer, $label, $sku, $details, $rows, $updates);
			}
		}
		return [$rows, $updates, $skipped];
	}

	private function addChanges(Part $part, PartDistributor $offer, string $source, string $sku,
		InfoProviderResult $details, array &$rows, array &$updates): void
	{
		$add = function (object $target, string $field, string $label, mixed $current, mixed $proposed,
			bool $defaultSelected = false) use ($part, $offer, $source, $sku, &$rows, &$updates): void {
			if ($proposed === null || $proposed === '' || $proposed === [] || $current === $proposed) return;
			$key = $part->getId() . ':' . $offer->getId() . ':' . $field;
			$rows[] = [
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
			$updates[$key] = [$target, $field, $proposed];
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

	private function display(mixed $value): string
	{
		if (is_array($value)) {
			if (array_key_exists('priceBreaks', $value)) {
				$currency = $value['currency'] ?? '';
				return $currency . "\n" . $this->display($value['priceBreaks']);
			}
			return implode("\n", array_map(static fn(array $row) => $row['quantity'] . '+: ' . $row['price'], $value));
		}
		return $value === null ? '' : (string)$value;
	}
}
