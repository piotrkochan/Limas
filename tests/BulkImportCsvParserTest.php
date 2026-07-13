<?php

namespace Limas\Tests;

use Limas\Service\Integration\InfoProvider\BulkImportCsvParser;
use PHPUnit\Framework\TestCase;


class BulkImportCsvParserTest
	extends TestCase
{
	private BulkImportCsvParser $parser;
	/** @var string[] */
	private array $tempFiles = [];


	protected function setUp(): void
	{
		$this->parser = new BulkImportCsvParser;
	}

	protected function tearDown(): void
	{
		foreach ($this->tempFiles as $file) {
			@unlink($file);
		}
	}

	private function csv(string $content): string
	{
		$path = tempnam(sys_get_temp_dir(), 'csvtest');
		file_put_contents($path, $content);
		$this->tempFiles[] = $path;
		return $path;
	}

	public function testCommaDelimited(): void
	{
		$rows = $this->parser->parse($this->csv("mpn,manufacturer\nLM358,TI\nNE555,ST\n"));
		self::assertSame([
			['mpn', 'manufacturer'],
			['LM358', 'TI'],
			['NE555', 'ST']
		], $rows);
	}

	public function testSemicolonDelimiterAutoDetected(): void
	{
		$rows = $this->parser->parse($this->csv("mpn;manufacturer\nLM358;TI\n"));
		self::assertSame([['mpn', 'manufacturer'], ['LM358', 'TI']], $rows);
	}

	public function testTabDelimiterAutoDetected(): void
	{
		$rows = $this->parser->parse($this->csv("mpn\tmanufacturer\nLM358\tTI\n"));
		self::assertSame([['mpn', 'manufacturer'], ['LM358', 'TI']], $rows);
	}

	public function testUtf8BomStripped(): void
	{
		$rows = $this->parser->parse($this->csv("\xEF\xBB\xBFmpn,manufacturer\nLM358,TI\n"));
		self::assertSame('mpn', $rows[0][0]); // no BOM glommed onto the first cell
	}

	public function testCellsTrimmedAndBlankLinesSkipped(): void
	{
		$rows = $this->parser->parse($this->csv("  mpn , manufacturer \n\nLM358 , TI\n"));
		self::assertSame([['mpn', 'manufacturer'], ['LM358', 'TI']], $rows);
	}

	public function testMissingFileThrows(): void
	{
		$this->expectException(\RuntimeException::class);
		$this->parser->parse('/nonexistent/path/does-not-exist.csv');
	}
}
