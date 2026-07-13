<?php

namespace Limas\Tests;

use Limas\Service\Integration\InfoProvider\Dto\FieldWithProvenance;
use Limas\Service\Integration\InfoProvider\Merger\HierarchyMergeStrategy;
use Limas\Service\Integration\InfoProvider\Merger\MajorityMergeStrategy;
use PHPUnit\Framework\TestCase;


class MergeStrategyTest
	extends TestCase
{
	private const array PRIORITY = ['digikey', 'mouser', 'farnell', 'tme'];


	private function majority(): MajorityMergeStrategy
	{
		return new MajorityMergeStrategy(self::PRIORITY);
	}

	private function hierarchy(): HierarchyMergeStrategy
	{
		return new HierarchyMergeStrategy(self::PRIORITY);
	}

	// --- MajorityMergeStrategy ---

	public function testMajorityNoNonEmptySources(): void
	{
		$r = $this->majority()->resolve(['digikey' => null, 'mouser' => '']);
		self::assertNull($r->chosenValue);
		self::assertFalse($r->isConflict);
		self::assertSame(FieldWithProvenance::RESOLUTION_ONLY_SOURCE, $r->resolution);
	}

	public function testMajoritySingleSource(): void
	{
		$r = $this->majority()->resolve(['mouser' => 'ACME']);
		self::assertSame('ACME', $r->chosenValue);
		self::assertFalse($r->isConflict);
		self::assertSame(FieldWithProvenance::RESOLUTION_ONLY_SOURCE, $r->resolution);
	}

	public function testMajorityConsensusIgnoresCaseAndWhitespace(): void
	{
		$r = $this->majority()->resolve([
			'digikey' => 'Diotec Semiconductor',
			'mouser' => 'DIOTEC   SEMICONDUCTOR'
		]);
		self::assertFalse($r->isConflict);
		self::assertSame(FieldWithProvenance::RESOLUTION_CONSENSUS, $r->resolution);
	}

	public function testMajorityTwoSourceConflictFallsBackToHierarchy(): void
	{
		$r = $this->majority()->resolve(['mouser' => 'B', 'digikey' => 'A']);
		self::assertTrue($r->isConflict);
		self::assertSame('A', $r->chosenValue); // digikey outranks mouser
		self::assertSame(FieldWithProvenance::RESOLUTION_HIERARCHY, $r->resolution);
	}

	public function testMajorityThreeSourcesVote(): void
	{
		$r = $this->majority()->resolve([
			'digikey' => 'X',
			'mouser' => 'Y',
			'farnell' => 'Y'
		]);
		self::assertTrue($r->isConflict);
		self::assertSame('Y', $r->chosenValue); // 2 votes vs 1
		self::assertSame(FieldWithProvenance::RESOLUTION_MAJORITY, $r->resolution);
	}

	public function testMajorityVotesOnNormalisedValue(): void
	{
		// Two sources agree modulo case ("1N4148"/"1n4148"), a third differs
		// ("1N4148W"). Raw tallying would count 1-1-1 (a fake tie handed to
		// hierarchy); normalised tallying sees the real 2-of-3 majority and
		// returns it in its original casing.
		$r = $this->majority()->resolve([
			'digikey' => '1N4148',
			'tme' => '1n4148',
			'farnell' => '1N4148W'
		]);
		self::assertTrue($r->isConflict);
		self::assertSame('1N4148', $r->chosenValue);
		self::assertSame(FieldWithProvenance::RESOLUTION_MAJORITY, $r->resolution);
	}

	public function testMajorityTieBrokenByPriority(): void
	{
		$r = $this->majority()->resolve([
			'farnell' => 'A',
			'mouser' => 'B',
			'tme' => 'C'
		]);
		// three distinct values, all tied at one vote → hierarchy among the
		// tied → mouser wins (highest-priority source present)
		self::assertTrue($r->isConflict);
		self::assertSame('B', $r->chosenValue);
		self::assertSame(FieldWithProvenance::RESOLUTION_HIERARCHY, $r->resolution);
	}

	// --- HierarchyMergeStrategy ---

	public function testHierarchyPicksHighestPriority(): void
	{
		$r = $this->hierarchy()->resolve([
			'tme' => 'C',
			'digikey' => 'A',
			'farnell' => 'B'
		]);
		self::assertSame('A', $r->chosenValue);
		self::assertTrue($r->isConflict);
		self::assertSame(FieldWithProvenance::RESOLUTION_HIERARCHY, $r->resolution);
	}

	public function testHierarchyFallsBackToAnyWhenNoPrioritySource(): void
	{
		$r = $this->hierarchy()->resolve(['unknownvendor' => 'Z']);
		self::assertSame('Z', $r->chosenValue);
		self::assertFalse($r->isConflict);
		self::assertSame(FieldWithProvenance::RESOLUTION_ONLY_SOURCE, $r->resolution);
	}

	public function testHierarchyEmpty(): void
	{
		$r = $this->hierarchy()->resolve(['digikey' => null]);
		self::assertNull($r->chosenValue);
		self::assertFalse($r->isConflict);
		self::assertSame(FieldWithProvenance::RESOLUTION_ONLY_SOURCE, $r->resolution);
	}
}
