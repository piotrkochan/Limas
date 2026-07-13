<?php

namespace Limas\Service;

use Doctrine\ORM\EntityManagerInterface;
use Limas\Entity\Part;
use Limas\Entity\PartManufacturer;
use Limas\Entity\PartParameter;
use Limas\Exceptions\NotAMetaPartException;
use Limas\Exceptions\SystemPreferenceNotFoundException;
use Limas\Filter\Filter;


readonly class PartService
{
	private const string PREF_DUP_MODE = 'limas.part.duplicateDetection.mode';
	private const string PREF_DUP_CHECK_NAME = 'limas.part.duplicateDetection.checkName';
	private const string PREF_DUP_CHECK_MPN = 'limas.part.duplicateDetection.checkMpn';


	public function __construct(
		private EntityManagerInterface  $entityManager,
		private FilterService           $filterService,
		private SystemPreferenceService $systemPreferenceService,
		private array                   $limas,
		private int|bool                $partLimit = false
	)
	{
	}

	public function getPartCount(): int
	{
		$qb = $this->entityManager->createQueryBuilder();
		return $qb->select($qb->expr()->count('p'))->from(Part::class, 'p')->getQuery()->getSingleScalarResult();
	}

	public function isInternalPartNumberUnique(?string $internalPartNumber, ?Part $part = null): bool
	{
		if (!$this->limas['parts']['internalpartnumberunique'] || $internalPartNumber === '') {
			return true;
		}
		$qb = $this->entityManager->getRepository(Part::class)->createQueryBuilder('p');
		$qb->select($qb->expr()->count('p'))
			->andWhere($qb->expr()->eq('p.internalPartNumber', ':internalPartNumber'))
			->setParameter(':internalPartNumber', $internalPartNumber);
		if ($part !== null) {
			$qb->andWhere($qb->expr()->neq('p.id', ':partId'))
				->setParameter(':partId', $part->getId());
		}
		return 0 === $qb->getQuery()->getSingleScalarResult();
	}

	public function checkPartLimit(): bool
	{
		return $this->partLimit !== false
			&& $this->partLimit !== -1
			&& $this->getPartCount() >= $this->partLimit;
	}

	/**
	 * Duplicate-part detection mode: 'off' | 'warn' | 'block'. Admin-set via
	 * SystemPreferences; anything unrecognised is treated as 'off'
	 */
	public function getDuplicateDetectionMode(): string
	{
		$mode = $this->stringPref(self::PREF_DUP_MODE, 'off');
		return in_array($mode, ['warn', 'block'], true) ? $mode : 'off';
	}

	/**
	 * Find existing Parts that collide with the given name and/or
	 * manufacturer part number, honouring the checkName / checkMpn
	 * preferences. Returns an empty array when detection is off or nothing
	 * matches. `$excludePart` (its id) is left out so edit flows don't match
	 * the part against itself.
	 *
	 * @return Part[]
	 */
	public function findDuplicateParts(?string $name, ?string $mpn, ?Part $excludePart = null): array
	{
		if ($this->getDuplicateDetectionMode() === 'off') {
			return [];
		}

		$checkName = $this->boolPref(self::PREF_DUP_CHECK_NAME, true);
		$checkMpn = $this->boolPref(self::PREF_DUP_CHECK_MPN, true);
		$name = trim((string)$name);
		$mpn = trim((string)$mpn);

		$qb = $this->entityManager->getRepository(Part::class)->createQueryBuilder('p');
		$or = $qb->expr()->orX();
		if ($checkName && $name !== '') {
			$or->add($qb->expr()->eq('LOWER(p.name)', ':dupName'));
			$qb->setParameter('dupName', mb_strtolower($name));
		}
		if ($checkMpn && $mpn !== '') {
			// Correlated EXISTS instead of a join — no row multiplication,
			// no GROUP BY, and the DQL stays self-contained
			$sub = $this->entityManager->createQueryBuilder()
				->select('1')
				->from(PartManufacturer::class, 'pm')
				->where('pm.part = p')
				->andWhere('LOWER(pm.partNumber) = :dupMpn');
			$or->add($qb->expr()->exists($sub->getDQL()));
			$qb->setParameter('dupMpn', mb_strtolower($mpn));
		}
		if ($or->count() === 0) {
			return [];
		}

		$qb->andWhere($or);
		if ($excludePart !== null && $excludePart->getId() !== null) {
			$qb->andWhere($qb->expr()->neq('p.id', ':excludeId'))
				->setParameter('excludeId', $excludePart->getId());
		}

		return $qb->getQuery()->getResult();
	}

	/**
	 * SystemPreferences are JSON-encoded by the frontend, so a string lands
	 * as `"warn"` and a bool as `true`; decode before use
	 */
	private function decodedPref(string $key): mixed
	{
		$raw = $this->systemPreferenceService->getSystemPreferenceValue($key);
		$decoded = json_decode($raw, true);
		return json_last_error() === JSON_ERROR_NONE ? $decoded : $raw;
	}

	private function stringPref(string $key, string $default): string
	{
		try {
			$value = $this->decodedPref($key);
			return is_scalar($value) ? trim((string)$value) : $default;
		} catch (SystemPreferenceNotFoundException) {
			return $default;
		}
	}

	private function boolPref(string $key, bool $default): bool
	{
		try {
			$value = $this->decodedPref($key);
			if (is_bool($value)) {
				return $value;
			}
			if (is_string($value)) {
				return $value === 'true' || $value === '1';
			}
			return (bool)$value;
		} catch (SystemPreferenceNotFoundException) {
			return $default;
		}
	}

	/**
	 * @return Part[]
	 */
	public function getMatchingMetaParts(Part $metaPart): array
	{
		$paramCount = 0;
		$paramPrefix = ':param';
		$results = [];

		if (!$metaPart->isMetaPart()) {
			throw new NotAMetaPartException;
		}

		foreach ($metaPart->getMetaPartParameterCriterias() as $metaPartParameterCriteria) {
			$qb = $this->entityManager->createQueryBuilder();
			$qb->select('p.id AS id')
				->from(PartParameter::class, 'pp')
				->join('pp.part', 'p');

			$filter = (new Filter)
				->setOperator($metaPartParameterCriteria->getOperator())
				->setProperty('name');

			switch ($metaPartParameterCriteria->getValueType()) {
				case PartParameter::VALUE_TYPE_NUMERIC:
					$expr = $this->filterService->getExpressionForFilter($filter, 'pp.normalizedValue', $paramPrefix . $paramCount);
					$qb->setParameter($paramPrefix . $paramCount, $metaPartParameterCriteria->getNormalizedValue());
					$paramCount++;
					break;
				case PartParameter::VALUE_TYPE_STRING:
					$expr = $this->filterService->getExpressionForFilter($filter, 'pp.stringValue', $paramPrefix . $paramCount);
					$qb->setParameter($paramPrefix . $paramCount, $metaPartParameterCriteria->getStringValue());
					$paramCount++;
					break;
				default:
					throw new \InvalidArgumentException('Unknown value type');
			}

			$qb->setParameter($paramPrefix . $paramCount, $metaPartParameterCriteria->getPartParameterName())
				->andWhere($qb->expr()->andX(
					$expr,
					$qb->expr()->eq('pp.name', $paramPrefix . $paramCount)
				));

			$result = [];
			foreach ($qb->getQuery()->getScalarResult() as $partId) {
				$result[] = $partId['id'];
			}
			$results[] = $result;
		}

		if (count($results) > 1) {
			$result = array_intersect(...$results);
		} else {
			$result = count($results) === 1
				? $results[0]
				: [];
		}

		if (count($result) > 0) {
			$qb = $this->entityManager->createQueryBuilder();
			return $qb->select('p')->from(Part::class, 'p')
				->where($qb->expr()->in('p.id', ':result'))
				->setParameter(':result', $result)
				->getQuery()->getResult();
		}
		return [];
	}
}
