<?php

namespace Limas\Tests;

use Limas\Exceptions\SystemPreferenceNotFoundException;
use Limas\Service\LabelGenerator;
use Limas\Service\SystemPreferenceService;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\RequestStack;


/**
 * Exercises the SVG label renderer through generatePreview() — the one
 * entry point that needs no persisted preferences, so a stub
 * SystemPreferenceService (every key "not found" → defaults) plus an
 * empty RequestStack is enough. Asserts the barcode is embedded, that
 * both symbologies render, and that the deep-link payload never leaks
 * into the SVG as plaintext.
 */
class LabelGeneratorTest
	extends TestCase
{
	private function generator(): LabelGenerator
	{
		$prefs = $this->createStub(SystemPreferenceService::class);
		$prefs->method('getSystemPreferenceValue')
			->willThrowException(new SystemPreferenceNotFoundException);
		return new LabelGenerator($prefs, new RequestStack);
	}

	private function preview(string $symbology): string
	{
		return $this->generator()->generatePreview(54, 17, 'Q', 'Sample Part', ['R-0805-10K'], $symbology);
	}

	public function testQrPreviewEmbedsASquareBarcode(): void
	{
		$svg = $this->preview('qrcode');

		self::assertStringContainsString('width="54mm"', $svg);
		self::assertStringContainsString('height="17mm"', $svg);
		// The barcode renders as many <rect> modules nested in a square viewBox
		self::assertStringContainsString('<rect', $svg);
		self::assertMatchesRegularExpression('/viewBox="0 0 (\d+(?:\.\d+)?) \1"/', $svg, 'nested barcode viewBox should be square');
		// Title text is laid out alongside the code
		self::assertStringContainsString('Sample Part', $svg);
	}

	public function testDataMatrixPreviewRendersAndDiffersFromQr(): void
	{
		$dataMatrix = $this->preview('datamatrix');

		self::assertStringContainsString('width="54mm"', $dataMatrix);
		self::assertStringContainsString('<rect', $dataMatrix);
		// Same inputs, different symbology → a materially different bitmap
		self::assertNotSame($this->preview('qrcode'), $dataMatrix);
	}

	public function testAztecPreviewRendersAndDiffersFromQr(): void
	{
		$aztec = $this->preview('aztec');

		self::assertStringContainsString('width="54mm"', $aztec);
		self::assertStringContainsString('<rect', $aztec);
		self::assertNotSame($this->preview('qrcode'), $aztec);
		self::assertNotSame($this->preview('datamatrix'), $aztec);
	}

	public function testUnknownSymbologyFallsBackToQr(): void
	{
		self::assertSame($this->preview('qrcode'), $this->preview('nonsense'));
	}

	public function testTinyLabelDoesNotEmitNegativeDimensions(): void
	{
		// A label smaller than twice its own margin used to derive negative
		// code/text sizes → malformed SVG. It must now degrade gracefully
		$svg = $this->generator()->generatePreview(1, 1, 'Q', 'X', ['Y'], 'qrcode');

		self::assertStringContainsString('<svg', $svg);
		self::assertDoesNotMatchRegularExpression(
			'/(?:width|height|x|y|font-size)="-/',
			$svg,
			'no SVG geometry attribute may be negative on sub-margin labels'
		);
	}

	public function testDeepLinkPayloadIsNotLeakedAsPlaintext(): void
	{
		// tc-lib-barcode emits a <desc> carrying the raw payload; we strip it
		// so the deep-link URL isn't recoverable from the SVG source
		$svg = $this->preview('qrcode');
		self::assertStringNotContainsString('<desc>', $svg);
		self::assertStringNotContainsString('#part/', $svg);
	}
}
