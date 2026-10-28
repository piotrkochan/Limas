<?php

namespace Limas\Service\Integration\InfoProvider;

use Doctrine\ORM\EntityManagerInterface;
use Limas\Entity\Part;
use Limas\Entity\PartCategory;
use Limas\Entity\PartDistributor;
use Limas\Entity\StorageLocation;
use Limas\Service\Integration\InfoProvider\Adapter\LcscAdapter;
use Psr\Log\LoggerInterface;

/** Resolve an LCSC catalog number exactly; never substitute a fuzzy MPN match. */
final readonly class LcscPartResolver
{
	public function __construct(
		private EntityManagerInterface $em,
		private InfoProviderAggregator $aggregator,
		private AggregatorImporter $importer,
		private LcscAdapter $lcsc,
		private LoggerInterface $logger
	) {}

	/** @return Part[] */
	public function findExisting(string $id): array
	{
		$rows = $this->em->createQueryBuilder()
			->select('pd', 'p')
			->from(PartDistributor::class, 'pd')
			->join('pd.part', 'p')
			->join('pd.distributor', 'd')
			->where('LOWER(d.name) = :source')
			->andWhere('(pd.sku = :id OR pd.orderNumber = :id)')
			->setParameter('source', 'lcsc')
			->setParameter('id', $id)
			->getQuery()->getResult();
		$parts = [];
		foreach ($rows as $row) {
			$part = $row->getPart();
			$parts[$part->getId()] = $part;
		}
		return array_values($parts);
	}

	/** Refresh all rows for an exact LCSC catalog number; caller flushes. */
	public function refreshPrices(string $id): int
	{
		$id = strtoupper(trim($id));
		$rows = $this->em->createQueryBuilder()
			->select('pd')
			->from(PartDistributor::class, 'pd')
			->join('pd.distributor', 'd')
			->where('LOWER(d.name) = :source')
			->andWhere('(pd.sku = :id OR pd.orderNumber = :id)')
			->setParameter('source', 'lcsc')
			->setParameter('id', $id)
			->getQuery()->getResult();
		if ($rows === []) return 0;
		$details = $this->lcsc->getDetails($id);
		if ($details === null || strtoupper($details->sourceSku) !== $id || $details->priceBreaks === []) {
			throw new \RuntimeException('No exact LCSC price breaks returned for ' . $id);
		}
		$breaks = [];
		foreach ($details->priceBreaks as $break) {
			if ($break->quantity > 0 && is_finite($break->price) && $break->price >= 0) {
				$breaks[] = ['quantity' => $break->quantity, 'price' => $break->price];
			}
		}
		if ($breaks === []) throw new \RuntimeException('No valid LCSC prices returned for ' . $id);
		foreach ($rows as $partDistributor) {
			$partDistributor->setPriceBreaks($breaks);
			$first = $partDistributor->getPriceBreaks()[0];
			$partDistributor->setPrice(sprintf('%.4f', (float)$first['price']));
			if ($details->currency !== null && $details->currency !== '') {
				$partDistributor->setCurrency(substr($details->currency, 0, 3));
			}
		}
		return count($rows);
	}

	/** @return array{0: Part, 1: bool} Part and whether it was newly imported. */
	public function resolve(string $id, PartCategory $category, StorageLocation $storage): array
	{
		$id = strtoupper(trim($id));
		if (!preg_match('/^C[1-9][0-9]*$/', $id)) {
			throw new \InvalidArgumentException('Invalid LCSC ID: ' . $id);
		}
		$existing = $this->findExisting($id);
		if (count($existing) > 1) {
			throw new \InvalidArgumentException('Multiple Parts already use LCSC ID ' . $id);
		}
		if ($existing !== []) {
			try {
				$this->refreshPrices($id);
			} catch (\Throwable $error) {
				$this->logger->warning('LCSC price refresh failed for {id}: {error}', ['id' => $id, 'error' => $error->getMessage()]);
			}
			return [$existing[0], false];
		}

		$candidate = $this->aggregator->deepenCandidate(['lcsc' => $id]);
		if ($candidate === null || ($candidate->providerSpecific['lcsc']->sourceSku ?? null) !== $id) {
			throw new \RuntimeException('LCSC ID not found: ' . $id);
		}
		return [$this->importer->import($candidate, $category, $storage), true];
	}
}
