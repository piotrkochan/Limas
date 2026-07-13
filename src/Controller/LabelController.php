<?php

namespace Limas\Controller;

use Doctrine\ORM\EntityManagerInterface;
use Limas\Entity\Part;
use Limas\Entity\StorageLocation;
use Limas\Service\LabelGenerator;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;


class LabelController
	extends AbstractController
{
	public function __construct(
		private readonly LabelGenerator         $labelGenerator,
		private readonly EntityManagerInterface $em
	)
	{
	}

	#[Route('/api/labels/part/{id}', name: 'labels_part', requirements: ['id' => '\d+'], defaults: ['method' => 'GET'], priority: 100)]
	public function partAction(int $id): Response
	{
		$part = $this->em->find(Part::class, $id);
		if ($part === null) {
			throw $this->createNotFoundException();
		}
		return $this->svgResponse($this->labelGenerator->generateForPart($part));
	}

	#[Route('/api/labels/storage_location/{id}', name: 'labels_storage_location', requirements: ['id' => '\d+'], defaults: ['method' => 'GET'], priority: 100)]
	public function storageLocationAction(int $id): Response
	{
		$location = $this->em->find(StorageLocation::class, $id);
		if ($location === null) {
			throw $this->createNotFoundException();
		}
		return $this->svgResponse($this->labelGenerator->generateForStorageLocation($location));
	}

	/**
	 * Body: {"parts": [12, 34, …], "storageLocations": [5, 6, …]}
	 * Either array may be omitted. Returns a single sheet SVG with the
	 * requested labels tiled in row-major order (parts first).
	 */
	#[Route('/api/labels/sheet', name: 'labels_sheet', methods: ['POST'], priority: 100)]
	public function sheetAction(Request $request): Response
	{
		$payload = json_decode($request->getContent(), true);
		if (!is_array($payload)) {
			return new JsonResponse(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
		}
		$partIds = array_values(array_filter(
			$payload['parts'] ?? [],
			static fn($v): bool => is_int($v) || (is_string($v) && ctype_digit($v))
		));
		$locationIds = array_values(array_filter(
			$payload['storageLocations'] ?? [],
			static fn($v): bool => is_int($v) || (is_string($v) && ctype_digit($v))
		));
		if ($partIds === [] && $locationIds === []) {
			return new JsonResponse(['error' => 'No parts or storage locations specified'], Response::HTTP_BAD_REQUEST);
		}

		$labels = [];
		if ($partIds !== []) {
			// One fetch-join instead of find()-per-id + a lazy load per
			// subtitle field (category / footprint / manufacturer) — the
			// label roll used to fire an N+1 burst scaling with the sheet
			$parts = $this->em->createQueryBuilder()
				->select('p', 'cat', 'fp', 'pm', 'mfr')
				->from(Part::class, 'p')
				->leftJoin('p.category', 'cat')
				->leftJoin('p.footprint', 'fp')
				->leftJoin('p.manufacturers', 'pm')
				->leftJoin('pm.manufacturer', 'mfr')
				->where('p.id IN (:ids)')
				->setParameter('ids', array_map('intval', $partIds))
				->getQuery()->getResult();
			$partsById = [];
			foreach ($parts as $part) {
				$partsById[$part->getId()] = $part;
			}
			// Preserve the requested order; silently skip ids that didn't resolve
			foreach ($partIds as $id) {
				if (isset($partsById[(int)$id])) {
					$labels[] = $this->labelGenerator->generateForPart($partsById[(int)$id]);
				}
			}
		}
		if ($locationIds !== []) {
			$locations = $this->em->createQueryBuilder()
				->select('l', 'lcat')
				->from(StorageLocation::class, 'l')
				->leftJoin('l.category', 'lcat')
				->where('l.id IN (:ids)')
				->setParameter('ids', array_map('intval', $locationIds))
				->getQuery()->getResult();
			$locationsById = [];
			foreach ($locations as $location) {
				$locationsById[$location->getId()] = $location;
			}
			foreach ($locationIds as $id) {
				if (isset($locationsById[(int)$id])) {
					$labels[] = $this->labelGenerator->generateForStorageLocation($locationsById[(int)$id]);
				}
			}
		}

		if ($labels === []) {
			throw $this->createNotFoundException();
		}

		return new Response(
			$this->labelGenerator->composeSheet($labels),
			Response::HTTP_OK,
			[
				'Content-Type' => 'text/html; charset=utf-8',
				'Cache-Control' => 'no-store'
			]
		);
	}

	/**
	 * Live preview for the Label Configuration admin panel — renders a
	 * single sample label from the current (unsaved) input values passed
	 * as query params, so the admin sees the layout before committing
	 */
	#[Route('/api/labels/preview', name: 'labels_preview', defaults: ['method' => 'GET'], priority: 100)]
	public function previewAction(Request $request): Response
	{
		$width = (float)$request->query->getString('width', '54');
		$height = (float)$request->query->getString('height', '17');
		$ecc = $request->query->getString('ecc', 'Q');
		$symbology = $request->query->getString('symbology', 'qrcode');
		$title = trim($request->query->getString('title'));
		if ($title === '') {
			$title = 'Sample Part';
		}
		// subtitles is a JSON array of already-resolved sample line strings;
		// an empty array is a legitimate choice (no subtitle lines)
		$subtitles = json_decode($request->query->getString('subtitles', '[]'), true);
		if (!is_array($subtitles)) {
			$subtitles = [];
		}
		$subtitles = array_values(array_filter(
			array_map(static fn($s): string => is_string($s) ? $s : '', $subtitles),
			static fn(string $s): bool => trim($s) !== ''
		));

		return $this->svgResponse(
			$this->labelGenerator->generatePreview($width, $height, $ecc, $title, $subtitles, $symbology)
		);
	}

	private function svgResponse(string $svg): Response
	{
		return new Response($svg, Response::HTTP_OK, [
			'Content-Type' => 'image/svg+xml; charset=utf-8',
			'Cache-Control' => 'no-store'
		]);
	}
}
