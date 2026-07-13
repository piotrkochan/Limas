<?php

namespace Limas\Tests;

use Limas\Service\ManufacturerCanonicalizer;
use PHPUnit\Framework\TestCase;


class ManufacturerCanonicalizerTest
	extends TestCase
{
	public function testTrimAndLowercase(): void
	{
		self::assertSame('bivar', ManufacturerCanonicalizer::normalize('  Bivar  '));
	}

	public function testCollapsesInternalWhitespace(): void
	{
		self::assertSame('texas instruments', ManufacturerCanonicalizer::normalize("Texas\tInstruments"));
	}

	/**
	 * The whole point of the suffix strip: "Bivar" and "Bivar Inc." must
	 * canonicalize to the same key so the aggregator merges them without
	 * needing a hand-curated alias
	 */
	public function testStripsSingleTrailingSuffix(): void
	{
		self::assertSame('bivar', ManufacturerCanonicalizer::normalize('Bivar Inc'));
		self::assertSame('bivar', ManufacturerCanonicalizer::normalize('Bivar Inc.'));
		self::assertSame('bivar', ManufacturerCanonicalizer::normalize('Bivar, Inc.'));
		self::assertSame('on semiconductor', ManufacturerCanonicalizer::normalize('ON Semiconductor Corporation'));
		self::assertSame('stmicroelectronics', ManufacturerCanonicalizer::normalize('STMicroelectronics N.V.'));
	}

	public function testStripsChainedSuffixes(): void
	{
		self::assertSame('samsung electronics', ManufacturerCanonicalizer::normalize('Samsung Electronics Co., Ltd.'));
		self::assertSame('hitachi', ManufacturerCanonicalizer::normalize('Hitachi Co Ltd'));
	}

	public function testKeepsSuffixSubstringInsideWord(): void
	{
		// "Coca-Cola" — "Co" sits inside a hyphenated word, not preceded by
		// whitespace or comma, so the strip must NOT fire
		self::assertSame('coca-cola', ManufacturerCanonicalizer::normalize('Coca-Cola'));
	}

	public function testKeepsSuffixSubstringAtStartOfName(): void
	{
		// "AB Electronics" — "AB" matches the suffix list but only at end
		// of string. With end-anchor, this stays untouched
		self::assertSame('ab electronics', ManufacturerCanonicalizer::normalize('AB Electronics'));
	}

	public function testKeepsBareSuffixWord(): void
	{
		// A degenerate manufacturer literally named "Inc" has nothing to
		// strip (no whitespace boundary before suffix) — leave as-is
		// rather than emptying it
		self::assertSame('inc', ManufacturerCanonicalizer::normalize('Inc'));
	}

	public function testMpnLikeTokensUnaffected(): void
	{
		// normalize() is still reused as an MPN grouping key inside
		// InfoProviderMerger (symmetric PHP-side use). Real MPNs don't carry
		// corporate suffixes, but make sure plausible ones aren't truncated.
		// (ExistingPartFinder deliberately uses lowercase+trim instead, to
		// mirror its SQL LOWER(TRIM(partNumber)) match)
		self::assertSame('bc547b', ManufacturerCanonicalizer::normalize('BC547B'));
		self::assertSame('tps5430dda', ManufacturerCanonicalizer::normalize('TPS5430DDA'));
		self::assertSame('ne555', ManufacturerCanonicalizer::normalize('NE555'));
	}

	public function testEmptyInput(): void
	{
		self::assertSame('', ManufacturerCanonicalizer::normalize(''));
		self::assertSame('', ManufacturerCanonicalizer::normalize('   '));
	}
}
