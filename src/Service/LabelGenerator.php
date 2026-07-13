<?php

namespace Limas\Service;

use Com\Tecnick\Barcode\Barcode;
use Limas\Entity\Part;
use Limas\Entity\StorageLocation;
use Limas\Exceptions\SystemPreferenceNotFoundException;
use Symfony\Component\HttpFoundation\RequestStack;


/**
 * Renders a printable SVG label for a Part / StorageLocation, with a 2D
 * barcode on the left (deep-link to the entity in the Limas UI) and the
 * entity's identifying text on the right. Configurable via
 * SystemPreference — admin can override label dimensions, the barcode
 * symbology (QR, Data Matrix, or Aztec — all square 2D codes), the QR
 * error-correction level, and the base URL used in the deep-link.
 *
 * Defaults match Brother QL 54×17mm continuous tape, QR symbology with
 * ECC level Q (quartile / ~25%) — the workshop-grade sweet spot between
 * density and resilience against scuffed / dusty labels. Data Matrix and
 * Aztec are offered for very small stock (their correction is fixed, so
 * the ECC preference is ignored when either is selected).
 */
readonly class LabelGenerator
{
	private const string PREF_WIDTH_MM = 'limas.label.widthMm';
	private const string PREF_HEIGHT_MM = 'limas.label.heightMm';
	private const string PREF_ECC = 'limas.label.qr.eccLevel';
	private const string PREF_SYMBOLOGY = 'limas.label.symbology';
	private const string PREF_BASE_URL = 'limas.label.qrBaseUrl';
	private const string PREF_PART_SUBTITLES = 'limas.label.part.subtitleFields';
	private const string PREF_STORAGE_SUBTITLES = 'limas.label.storage.subtitleFields';
	// Storage may override the shared (Part) dimensions / ecc when its
	// labels print on different physical stock; off by default so a single
	// roll setup only configures the Part fields
	private const string PREF_STORAGE_OVERRIDE = 'limas.label.storage.overrideBase';
	private const string PREF_STORAGE_WIDTH_MM = 'limas.label.storage.widthMm';
	private const string PREF_STORAGE_HEIGHT_MM = 'limas.label.storage.heightMm';
	private const string PREF_STORAGE_ECC = 'limas.label.storage.qr.eccLevel';
	private const string PREF_STORAGE_SYMBOLOGY = 'limas.label.storage.symbology';

	private const float DEFAULT_WIDTH_MM = 54.0;
	private const float DEFAULT_HEIGHT_MM = 17.0;
	private const string DEFAULT_ECC = 'Q';
	private const string DEFAULT_SYMBOLOGY = 'qrcode';
	/** @var list<string> */
	private const array DEFAULT_PART_SUBTITLES = ['internalPartNumber'];
	/** @var list<string> */
	private const array DEFAULT_STORAGE_SUBTITLES = ['category'];

	private const int MAX_SUBTITLE_LINES = 3;
	private const float LABEL_MARGIN_MM = 1.0;
	// Absolute font sizes (mm) — fixed, not scaled to label height, so text
	// stays a readable constant size regardless of stock dimensions
	private const float TITLE_FONT_MM = 3.5;
	private const float SUBTITLE_FONT_MM = 2.3;


	public function __construct(
		private SystemPreferenceService $preferences,
		private RequestStack            $requestStack
	)
	{
	}

	public function generateForPart(Part $part): string
	{
		[$w, $h, $ecc, $symbology] = $this->partDimensions();
		return $this->renderLabel(
			(string)$part->getName(),
			$this->partSubtitles($part),
			$this->baseUrl() . '#part/' . $part->getId(),
			$w,
			$h,
			$ecc,
			$symbology
		);
	}

	public function generateForStorageLocation(StorageLocation $location): string
	{
		[$w, $h, $ecc, $symbology] = $this->storageDimensions();
		return $this->renderLabel(
			(string)$location->getName(),
			$this->storageSubtitles($location),
			$this->baseUrl() . '#storage/' . $location->getId(),
			$w,
			$h,
			$ecc,
			$symbology
		);
	}

	/**
	 * @return array{0: float, 1: float, 2: string, 3: string} width, height, ecc, symbology
	 */
	private function partDimensions(): array
	{
		return [
			$this->floatPref(self::PREF_WIDTH_MM, self::DEFAULT_WIDTH_MM),
			$this->floatPref(self::PREF_HEIGHT_MM, self::DEFAULT_HEIGHT_MM),
			$this->eccLevel($this->stringPref(self::PREF_ECC, self::DEFAULT_ECC)),
			$this->symbology($this->stringPref(self::PREF_SYMBOLOGY, self::DEFAULT_SYMBOLOGY))
		];
	}

	/**
	 * Storage uses the shared (Part) dimensions unless the admin ticked
	 * "override" — then its own width / height / ecc / symbology apply
	 *
	 * @return array{0: float, 1: float, 2: string, 3: string} width, height, ecc, symbology
	 */
	private function storageDimensions(): array
	{
		if (!$this->boolPref(self::PREF_STORAGE_OVERRIDE, false)) {
			return $this->partDimensions();
		}
		return [
			$this->floatPref(self::PREF_STORAGE_WIDTH_MM, self::DEFAULT_WIDTH_MM),
			$this->floatPref(self::PREF_STORAGE_HEIGHT_MM, self::DEFAULT_HEIGHT_MM),
			$this->eccLevel($this->stringPref(self::PREF_STORAGE_ECC, self::DEFAULT_ECC)),
			$this->symbology($this->stringPref(self::PREF_STORAGE_SYMBOLOGY, self::DEFAULT_SYMBOLOGY))
		];
	}

	/**
	 * Render a single label SVG from explicit values rather than stored
	 * preferences, so the admin config panel can show a live preview of
	 * the not-yet-saved input values. Uses a sample payload — the preview
	 * is about layout / dimensions / symbology / ecc density, not the real
	 * deep-link
	 *
	 * @param list<string> $subtitles
	 */
	public function generatePreview(float $widthMm, float $heightMm, string $ecc, string $title, array $subtitles, string $symbology = self::DEFAULT_SYMBOLOGY): string
	{
		return $this->renderLabel(
			$title,
			array_slice(array_values(array_filter($subtitles, static fn(string $s): bool => trim($s) !== '')), 0, self::MAX_SUBTITLE_LINES),
			$this->baseUrl() . '#part/0',
			$widthMm > 0 ? $widthMm : self::DEFAULT_WIDTH_MM,
			$heightMm > 0 ? $heightMm : self::DEFAULT_HEIGHT_MM,
			$this->eccLevel($ecc),
			$this->symbology($symbology)
		);
	}

	/**
	 * Resolve the configured ordered list of Part subtitle fields into
	 * their values, dropping empties, capped at MAX_SUBTITLE_LINES
	 *
	 * @return list<string>
	 */
	private function partSubtitles(Part $part): array
	{
		$lines = [];
		foreach ($this->arrayPref(self::PREF_PART_SUBTITLES, self::DEFAULT_PART_SUBTITLES) as $field) {
			$value = trim(match ($field) {
				'description' => (string)$part->getDescription(),
				'category' => (string)$part->getCategory()?->getName(),
				'categoryPath' => $part->getCategoryPath(),
				'footprint' => (string)$part->getFootprint()?->getName(),
				'manufacturer' => $this->firstManufacturerName($part),
				'mpn' => $this->firstManufacturerPartNumber($part),
				'internalPartNumber' => $part->getInternalPartNumber() ?? '',
				default => ''
			});
			if ($value !== '') {
				$lines[] = $value;
			}
			if (count($lines) >= self::MAX_SUBTITLE_LINES) {
				break;
			}
		}
		return $lines;
	}

	/**
	 * @return list<string>
	 */
	private function storageSubtitles(StorageLocation $location): array
	{
		$lines = [];
		foreach ($this->arrayPref(self::PREF_STORAGE_SUBTITLES, self::DEFAULT_STORAGE_SUBTITLES) as $field) {
			$value = trim(match ($field) {
				'category' => (string)$location->getCategory()?->getName(),
				'categoryPath' => $location->getCategoryPath(),
				default => ''
			});
			if ($value !== '') {
				$lines[] = $value;
			}
			if (count($lines) >= self::MAX_SUBTITLE_LINES) {
				break;
			}
		}
		return $lines;
	}

	private function firstManufacturerName(Part $part): string
	{
		foreach ($part->getManufacturers() as $partMfr) {
			$name = $partMfr->getManufacturer()?->getName();
			if ($name !== null && $name !== '') {
				return $name;
			}
		}
		return '';
	}

	private function firstManufacturerPartNumber(Part $part): string
	{
		foreach ($part->getManufacturers() as $partMfr) {
			$pn = $partMfr->getPartNumber();
			if ($pn !== null && $pn !== '') {
				return $pn;
			}
		}
		return '';
	}

	/**
	 * Compose a print-ready HTML document containing every requested label
	 * tiled on A4 portrait pages. Labels overflow across pages via CSS
	 * page-break: pure SVG has no page primitive but the browser print
	 * pipeline honours `page-break-after: always` on wrapper divs.
	 *
	 * Each page's SVG is height-tightened to the rows it actually uses so
	 * the last page doesn't emit blank whitespace that would trigger a
	 * spurious extra sheet in the print dialog.
	 *
	 * @param list<string> $labelSvgs Individual label SVGs (already rendered)
	 */
	public function composeSheet(array $labelSvgs): string
	{
		// Derive the grid cell from the actual labels rather than a single
		// preference — a batch may mix Part and Storage stock of different
		// sizes; using the max width/height keeps cells uniform so nothing
		// overlaps (smaller labels just leave a little gap in their cell)
		$labelW = self::DEFAULT_WIDTH_MM;
		$labelH = self::DEFAULT_HEIGHT_MM;
		foreach ($labelSvgs as $labelSvg) {
			[$w, $h] = $this->parseSvgDimensions($labelSvg);
			$labelW = max($labelW, $w);
			$labelH = max($labelH, $h);
		}
		$sheetW = 210.0;
		$sheetH = 297.0;
		$sheetMargin = 5.0;
		$gap = 2.0;

		$cols = max(1, (int)floor(($sheetW - 2 * $sheetMargin + $gap) / ($labelW + $gap)));
		$maxRows = max(1, (int)floor(($sheetH - 2 * $sheetMargin + $gap) / ($labelH + $gap)));
		$perPage = $cols * $maxRows;

		$pages = array_chunk($labelSvgs, $perPage);
		$pageSvgs = [];
		foreach ($pages as $pageLabels) {
			$pageSvgs[] = $this->renderPage($pageLabels, $cols, $labelW, $labelH, $sheetW, $sheetMargin, $gap);
		}

		$html = '<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>'
			. 'html,body{margin:0;padding:0;background:#fff;}'
			. 'svg{display:block;}'
			// One page per label group. page-break-after runs on print, margin-bottom keeps them separated in on-screen preview
			. '.limas-label-page{page-break-after:always;margin-bottom:8mm;}'
			. '.limas-label-page:last-child{page-break-after:auto;margin-bottom:0;}'
			. '@page{size:A4;margin:0;}'
			. '@media print{html,body{margin:0;padding:0;}.limas-label-page{margin-bottom:0;}}'
			. '</style></head><body>';
		foreach ($pageSvgs as $svg) {
			$html .= '<div class="limas-label-page">' . $svg . '</div>';
		}
		$html .= '</body></html>';
		return $html;
	}

	/**
	 * @param list<string> $labelSvgs
	 */
	private function renderPage(array $labelSvgs, int $cols, float $labelW, float $labelH, float $sheetW, float $sheetMargin, float $gap): string
	{
		$count = count($labelSvgs);
		$usedRows = (int)ceil($count / $cols);
		$pageHeight = 2 * $sheetMargin + $usedRows * $labelH + max(0, $usedRows - 1) * $gap;

		$svg = sprintf(
			'<svg xmlns="http://www.w3.org/2000/svg" width="%1$smm" height="%2$smm" viewBox="0 0 %1$s %2$s">',
			$sheetW,
			$pageHeight
		);
		foreach ($labelSvgs as $i => $labelSvg) {
			$col = $i % $cols;
			$row = intdiv($i, $cols);
			$x = $sheetMargin + $col * ($labelW + $gap);
			$y = $sheetMargin + $row * ($labelH + $gap);
			$svg .= sprintf(
				'<svg x="%s" y="%s" width="%s" height="%s" viewBox="0 0 %s %s">%s</svg>',
				$x,
				$y,
				$labelW,
				$labelH,
				$labelW,
				$labelH,
				$this->stripOuterSvg($labelSvg)
			);
		}
		$svg .= '</svg>';
		return $svg;
	}

	/**
	 * @param list<string> $subtitles up to MAX_SUBTITLE_LINES lines
	 */
	private function renderLabel(string $title, array $subtitles, string $codeData, float $labelW, float $labelH, string $ecc, string $symbology): string
	{
		// The 2D barcode is square, sized to the label height — but capped to
		// half the width so a tall label (e.g. 150x100) doesn't let the code
		// eat the whole width and leave no room for text. Vertically centred
		// so the leftover height (if the cap kicked in) is balanced top/bottom.
		// Clamp to 0 so a label smaller than its own margins (height/width
		// < 2·margin) can't yield negative sizes → malformed SVG. Tiny stock
		// then just renders an empty/degenerate label instead of breaking.
		$codeSize = max(0, min($labelH - 2 * self::LABEL_MARGIN_MM, $labelW * 0.5));
		$codeY = (($labelH - $codeSize) / 2);
		$textX = self::LABEL_MARGIN_MM + $codeSize + self::LABEL_MARGIN_MM;
		$textHeight = max(0, $labelH - 2 * self::LABEL_MARGIN_MM);

		[$codeInner, $codeExtent] = $this->renderCode($codeData, $symbology, $ecc);

		$svg = sprintf(
			'<?xml version="1.0" encoding="UTF-8"?>' . "\n"
			. '<svg xmlns="http://www.w3.org/2000/svg" width="%1$smm" height="%2$smm" viewBox="0 0 %1$s %2$s">' . "\n"
			. '<rect width="%1$s" height="%2$s" fill="#ffffff"/>' . "\n"
			. '<svg x="%3$s" y="%4$s" width="%5$s" height="%5$s" viewBox="0 0 %7$s %7$s" preserveAspectRatio="xMidYMid meet">%6$s</svg>' . "\n",
			$labelW,
			$labelH,
			self::LABEL_MARGIN_MM,
			$codeY,
			$codeSize,
			$codeInner,
			$codeExtent
		);

		$svg .= $this->renderTextLines($title, $subtitles, $textX, max(0, $labelW - $textX - self::LABEL_MARGIN_MM), $textHeight);
		$svg .= '</svg>';
		return $svg;
	}

	/**
	 * Lay out the bold title plus 0..N subtitle lines stacked in the text
	 * column. Font sizes are ABSOLUTE (mm) with fixed defaults rather than
	 * scaled to the label height — a big label just leaves more whitespace,
	 * it doesn't get giant text (the failure mode on tall stock). Fonts
	 * only shrink, never grow, and only when the lines wouldn't otherwise
	 * fit the available height. The block is vertically centred. Each line
	 * is width-clipped so long values never overrun the QR / label edge.
	 *
	 * @param list<string> $subtitles
	 */
	private function renderTextLines(string $title, array $subtitles, float $textX, float $textWidth, float $textHeight): string
	{
		// Absolute defaults, tuned for a typical component label
		$titleFont = self::TITLE_FONT_MM;
		$subtitleFont = self::SUBTITLE_FONT_MM;
		$lineSpacing = 1.25; // line-height multiplier

		// Total height the text block wants; shrink uniformly if it exceeds
		// the label so nothing clips vertically on small stock
		$blockHeight = ($titleFont + count($subtitles) * $subtitleFont) * $lineSpacing;
		if ($blockHeight > $textHeight && $blockHeight > 0) {
			$shrink = $textHeight / $blockHeight;
			$titleFont *= $shrink;
			$subtitleFont *= $shrink;
			$blockHeight = $textHeight;
		}

		// Vertically centre the block within the text column
		$cursor = self::LABEL_MARGIN_MM + max(0, ($textHeight - $blockHeight) / 2);

		$cursor += $titleFont * $lineSpacing;
		$lines = sprintf(
			'<text x="%s" y="%s" font-family="sans-serif" font-size="%s" font-weight="bold">%s</text>' . "\n",
			$textX,
			$cursor - $titleFont * 0.25,
			$titleFont,
			$this->escape($this->clip($title, $textWidth, $titleFont))
		);
		foreach ($subtitles as $subtitle) {
			$cursor += $subtitleFont * $lineSpacing;
			$lines .= sprintf(
				'<text x="%s" y="%s" font-family="sans-serif" font-size="%s" fill="#444444">%s</text>' . "\n",
				$textX,
				$cursor - $subtitleFont * 0.25,
				$subtitleFont,
				$this->escape($this->clip($subtitle, $textWidth, $subtitleFont))
			);
		}
		return $lines;
	}

	/**
	 * Rough character clip: with a sans-serif font, average glyph advance
	 * is ~0.55em. Trim to what fits `$widthMm` and append an ellipsis so
	 * the QR / label edge is never overrun. Cheap approximation — we have
	 * no font metrics server-side, but it keeps long descriptions sane
	 */
	private function clip(string $text, float $widthMm, float $fontMm): string
	{
		if ($text === '' || $fontMm <= 0) {
			return $text;
		}
		$maxChars = (int)floor($widthMm / ($fontMm * 0.55));
		if ($maxChars <= 0) {
			return '';
		}
		if (mb_strlen($text) <= $maxChars) {
			return $text;
		}
		return rtrim(mb_substr($text, 0, max(1, $maxChars - 1))) . '…';
	}

	/**
	 * Extract the mm width/height a rendered label SVG declares, falling
	 * back to defaults if the attributes aren't found
	 *
	 * @return array{0: float, 1: float}
	 */
	private function parseSvgDimensions(string $svg): array
	{
		$w = self::DEFAULT_WIDTH_MM;
		$h = self::DEFAULT_HEIGHT_MM;
		if (preg_match('/width="([\d.]+)mm"/', $svg, $m) === 1) {
			$w = (float)$m[1];
		}
		if (preg_match('/height="([\d.]+)mm"/', $svg, $m) === 1) {
			$h = (float)$m[1];
		}
		return [$w, $h];
	}

	/**
	 * Render the deep-link into a 2D barcode SVG, returning the inner markup
	 * plus its (square) module extent so renderLabel can nest it with a
	 * matching viewBox. tc-lib-barcode emits a whole <svg> document — xml
	 * declaration, a <desc> carrying the raw payload, then one <rect> per
	 * module — so we peel the wrapper and drop the <desc> to keep the
	 * deep-link URL out of the label source as plaintext.
	 *
	 * ECC only applies to QR; Data Matrix (ECC200) and Aztec carry their own
	 * fixed correction, so the level is ignored for them. All three are
	 * square, which the square-slot label layout relies on.
	 *
	 * @return array{0: string, 1: float} inner SVG markup, square viewBox extent
	 */
	private function renderCode(string $data, string $symbology, string $ecc): array
	{
		$type = match ($symbology) {
			'datamatrix' => 'DATAMATRIX',
			'aztec' => 'AZTEC',
			default => 'QRCODE,' . $ecc
		};
		// Negative width/height = pixels-per-module; zero padding — the outer label SVG supplies the quiet zone via LABEL_MARGIN_MM
		$svg = (new Barcode)
			->getBarcodeObj($type, $data, -4, -4, 'black', [0, 0, 0, 0])
			->getSvgCode();

		$extent = 100.0;
		if (preg_match('/viewBox="0 0 ([\d.]+) [\d.]+"/', $svg, $m) === 1) {
			$extent = (float)$m[1];
		}
		$inner = $this->stripOuterSvg($svg);
		$inner = preg_replace('#<desc>.*?</desc>#us', '', $inner) ?? $inner;
		return [$inner, $extent];
	}

	/**
	 * Normalise the stored ECC preference to a level tc-lib accepts in its
	 * "QRCODE,<level>" type string, defaulting junk / unset to Q
	 */
	private function eccLevel(string $value): string
	{
		return match (strtoupper(trim($value))) {
			'L' => 'L',
			'M' => 'M',
			'H' => 'H',
			default => 'Q'
		};
	}

	/**
	 * Normalise the stored symbology preference; only the explicit square 2D
	 * opt-ins ("datamatrix" / "aztec") are honoured, everything else — junk,
	 * unset, or a would-be rectangular code — falls back to QR
	 */
	private function symbology(string $value): string
	{
		$value = strtolower(trim($value));
		return in_array($value, ['datamatrix', 'aztec'], true) ? $value : 'qrcode';
	}

	private function baseUrl(): string
	{
		$override = trim($this->stringPref(self::PREF_BASE_URL, ''));
		if ($override !== '') {
			return rtrim($override, '/') . '/';
		}
		$request = $this->requestStack->getCurrentRequest();
		if ($request === null) {
			return '/';
		}
		return $request->getSchemeAndHttpHost() . $request->getBasePath() . '/';
	}

	/**
	 * SystemPreferences are written from the frontend through
	 * Limas.setSystemPreference which JSON-encodes every value, so a
	 * string lands in the DB as `"Q"` and an array as `["a","b"]`. Decode
	 * here so the backend sees the same shape the admin picked. Falls back
	 * to the raw string when it isn't valid JSON (hand-set / legacy rows)
	 */
	private function decodedPref(string $key): mixed
	{
		$raw = $this->preferences->getSystemPreferenceValue($key);
		$decoded = json_decode($raw, true);
		return json_last_error() === JSON_ERROR_NONE ? $decoded : $raw;
	}

	private function floatPref(string $key, float $default): float
	{
		try {
			$value = $this->decodedPref($key);
			$float = is_numeric($value) ? (float)$value : 0.0;
			return $float > 0 ? $float : $default;
		} catch (SystemPreferenceNotFoundException) {
			return $default;
		}
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
	 * @param list<string> $default
	 * @return list<string>
	 */
	private function arrayPref(string $key, array $default): array
	{
		try {
			$value = $this->decodedPref($key);
			if (!is_array($value)) {
				return $default;
			}
			$out = [];
			foreach ($value as $item) {
				if (is_string($item) && $item !== '' && $item !== 'none') {
					$out[] = $item;
				}
			}
			return $out;
		} catch (SystemPreferenceNotFoundException) {
			return $default;
		}
	}

	private function escape(string $text): string
	{
		return htmlspecialchars($text, ENT_XML1 | ENT_QUOTES, 'UTF-8');
	}

	/**
	 * Pull the inner content out of a complete SVG document so it can be
	 * nested inside a larger SVG (barcode into label, or label into a batch
	 * sheet). Peels an optional leading <?xml ...?> declaration and the
	 * outer <svg ...>...</svg> wrapper
	 */
	private function stripOuterSvg(string $svg): string
	{
		$svg = preg_replace('/^\s*<\?xml[^?]*\?>\s*/u', '', $svg) ?? $svg;
		$svg = preg_replace('/^\s*<svg[^>]*>/u', '', $svg, 1) ?? $svg;
		return preg_replace('/<\/svg>\s*$/u', '', $svg) ?? $svg;
	}
}
