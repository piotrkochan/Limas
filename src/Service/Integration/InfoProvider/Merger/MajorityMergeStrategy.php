<?php

namespace Limas\Service\Integration\InfoProvider\Merger;

use Limas\Service\Integration\InfoProvider\Dto\FieldWithProvenance;


/**
 * Majority-wins strategy with hierarchy fallback:
 *   - 0 non-empty sources → null, no conflict, only_source resolution
 *   - 1 non-empty source  → that value, only_source
 *   - 2 sources           → no majority possible; fall back to hierarchy
 *   - 3+ sources          → pick value with most votes; ties broken by hierarchy
 *
 * Always marks isConflict=true when sources disagreed, regardless of resolution
 */
final readonly class MajorityMergeStrategy
	implements MergeStrategyInterface
{
	private HierarchyMergeStrategy $hierarchyFallback;


	/**
	 * @param string[] $priority distributor names from most to least trusted (used to break ties)
	 */
	public function __construct(
		private array $priority
	)
	{
		$this->hierarchyFallback = new HierarchyMergeStrategy($priority);
	}

	public function resolve(array $values): FieldWithProvenance
	{
		$nonEmpty = array_filter($values, static fn(?string $v): bool => $v !== null && $v !== '');

		if ($nonEmpty === []) {
			return new FieldWithProvenance(null, $values, false, FieldWithProvenance::RESOLUTION_ONLY_SOURCE);
		}
		if (count($nonEmpty) === 1) {
			return new FieldWithProvenance(reset($nonEmpty), $values, false, FieldWithProvenance::RESOLUTION_ONLY_SOURCE);
		}

		// Conflict detection uses *normalised* distinctness — case+whitespace
		// differences ("Diotec Semiconductor" vs "DIOTEC SEMICONDUCTOR") are
		// not real disagreements and shouldn't surface as ⚠ to the user.
		// Chosen value still preserves the original casing from whichever
		// source the strategy picks.
		$normalizedDistinct = array_unique(array_map(
			static fn(string $v): string => self::softNormalize($v),
			array_values($nonEmpty)
		));
		$isConflict = count($normalizedDistinct) > 1;
		if (!$isConflict) {
			return new FieldWithProvenance(reset($nonEmpty), $values, false, FieldWithProvenance::RESOLUTION_CONSENSUS);
		}

		if (count($nonEmpty) < 3) {
			// Hierarchy fallback for 2-source conflicts
			$base = $this->hierarchyFallback->resolve($values);
			return new FieldWithProvenance($base->chosenValue, $base->sourcesValues, true, FieldWithProvenance::RESOLUTION_HIERARCHY);
		}

		// 3+ sources, conflict — vote on *normalised* keys so case/whitespace
		// variants of one value count together (mirrors the conflict detection
		// above). Otherwise "1N4148"/"1n4148"/"1N4148W" tally 1-1-1 (fake tie)
		// and the hierarchy tie-break overrides the real 2-of-3 majority.
		// Keep a representative original-cased value per key to return.
		$votes = [];
		$representative = [];
		foreach (array_values($nonEmpty) as $value) {
			$key = self::softNormalize($value);
			$votes[$key] = ($votes[$key] ?? 0) + 1;
			$representative[$key] ??= $value;
		}
		arsort($votes);
		$top = max($votes);
		$winners = array_keys(array_filter($votes, static fn(int $c): bool => $c === $top));

		if (count($winners) === 1) {
			return new FieldWithProvenance($representative[$winners[0]], $values, true, FieldWithProvenance::RESOLUTION_MAJORITY);
		}

		// Tie among normalised winners — break with hierarchy among only the sources whose (normalised) value is one of the tied winners
		$tiedBySource = array_filter($nonEmpty, static fn(?string $v): bool => in_array(self::softNormalize((string)$v), $winners, true));
		foreach ($this->priority as $src) {
			if (array_key_exists($src, $tiedBySource)) {
				return new FieldWithProvenance($tiedBySource[$src], $values, true, FieldWithProvenance::RESOLUTION_HIERARCHY);
			}
		}
		// No priority source among tied winners — first tied representative wins
		return new FieldWithProvenance($representative[$winners[0]], $values, true, FieldWithProvenance::RESOLUTION_HIERARCHY);
	}

	/**
	 * Lower-cased, whitespace-collapsed comparison key. Used ONLY for the
	 * isConflict flag — chosen values are returned in their original casing.
	 */
	public static function softNormalize(string $value): string
	{
		$collapsed = preg_replace('/\s+/u', ' ', trim($value));
		return mb_strtolower($collapsed ?? $value);
	}
}
