<?php

namespace Limas\Controller\Actions;

use Doctrine\ORM\EntityManagerInterface;
use Limas\Entity\Part;
use Limas\Service\Integration\InfoProvider\InfoProviderAggregator;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/** Refresh saved distributor offers using their own configured providers. */
final readonly class PartPriceRefreshActions
{
	public function __construct(
		private EntityManagerInterface $em,
		private InfoProviderAggregator $providers
	) {}

	#[Route(path: '/api/parts/refreshPrices', methods: ['POST'])]
	public function refresh(Request $request): JsonResponse
	{
		$input = json_decode($request->getContent(), true);
		$iris = $input['parts'] ?? null;
		if (!is_array($iris) || count($iris) < 1 || count($iris) > 100) {
			return new JsonResponse(['error' => 'Select 1 to 100 parts.'], 400);
		}
		$ids = [];
		foreach ($iris as $iri) {
			if (!is_string($iri) || !preg_match('#^/api/parts/([1-9][0-9]*)$#', $iri, $match)) {
				return new JsonResponse(['error' => 'Invalid part identifier.'], 400);
			}
			$ids[(int)$match[1]] = true;
		}
		$parts = [];
		foreach (array_keys($ids) as $id) {
			$part = $this->em->find(Part::class, $id);
			if (!$part) return new JsonResponse(['error' => 'Part ' . $id . ' no longer exists.'], 404);
			$parts[] = $part;
		}

		$sources = [];
		foreach ($this->providers->sourcesWithCapabilities() as $source) {
			if ($source['configured'] && in_array('price', $source['capabilities'], true)) {
				$sources[strtolower($source['name'])] = $source['name'];
			}
		}
		$detailsCache = [];
		$updated = 0;
		$skipped = [];
		foreach ($parts as $part) {
			foreach ($part->getDistributors() as $offer) {
				$source = strtolower(trim($offer->getDistributor()?->getName() ?? ''));
				$sku = trim($offer->getSku() ?: $offer->getOrderNumber() ?: '');
				$label = $offer->getDistributor()?->getName() ?: 'Unknown distributor';
				$reason = null;
				if (!isset($sources[$source])) $reason = 'No configured price provider';
				elseif ($sku === '') $reason = 'Missing SKU or order number';
				else {
					$key = $source . ':' . $sku;
					try {
						if (!array_key_exists($key, $detailsCache)) {
							$detailsCache[$key] = $this->providers->getDetails($sources[$source], $sku);
						}
						$details = $detailsCache[$key];
						if (!$details || strcasecmp(trim($details->sourceSku), $sku) !== 0) {
							$reason = 'No exact SKU match';
						} else {
							$breaks = [];
							foreach ($details->priceBreaks as $break) {
								if ($break->quantity > 0 && is_finite($break->price) && $break->price >= 0) {
									$breaks[] = ['quantity' => $break->quantity, 'price' => $break->price];
								}
							}
							if ($breaks === []) $reason = 'No valid price breaks';
							else {
								$offer->setPriceBreaks($breaks);
								$offer->setPrice(sprintf('%.4f', (float)$offer->getPriceBreaks()[0]['price']));
								if ($details->currency) $offer->setCurrency(substr($details->currency, 0, 3));
								$updated++;
							}
						}
					} catch (\Throwable) {
						$reason = 'Provider request failed';
					}
				}
				if ($reason) $skipped[] = ['partId' => $part->getId(), 'distributor' => $label, 'reason' => $reason];
			}
		}
		$this->em->flush();
		return new JsonResponse(['updated' => $updated, 'skipped' => $skipped]);
	}
}
