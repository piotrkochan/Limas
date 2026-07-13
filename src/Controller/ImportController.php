<?php

namespace Limas\Controller;

use ApiPlatform\Metadata\IriConverterInterface;
use Limas\Service\ImporterService;
use Limas\Service\UploadedFileService;
use Nette\Utils\Json;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;


class ImportController
	extends AbstractController
{
	public function __construct(
		private readonly ImporterService       $importerService,
		private readonly IriConverterInterface $iriConverter,
		private readonly UploadedFileService   $uploadedFileService
	)
	{
	}

	#[Route(path: '/api/import/getSource', name: 'getsource', methods: ['GET'])]
	public function getSourceAction(Request $request): JsonResponse
	{
		try {
			return new JsonResponse($this->extractCSVData($request->query->get('file')));
		} catch (\Throwable $e) {
			return new JsonResponse(['error' => $e->getMessage()], JsonResponse::HTTP_BAD_REQUEST);
		}
	}

	#[Route(path: '/api/import/getPreview', name: 'getpreview', methods: ['POST'])]
	public function getPreviewAction(Request $request): JsonResponse
	{
		try {
			$this->importerService->setBaseEntity($request->request->get('baseEntity'));
			$this->importerService->setImportConfiguration(Json::decode($request->request->get('configuration')));
			$this->importerService->setImportData($this->extractCSVData($request->request->get('file'), false));
			list($entities, $logs) = $this->importerService->import(true);
		} catch (\Throwable $e) {
			$logs = [$e->getMessage()];
		}

		return new JsonResponse(['logs' => $logs]);
	}

	#[Route(path: '/api/import/executeImport', name: 'import', methods: ['POST'])]
	public function importAction(Request $request): JsonResponse
	{
		// A malformed / truncated CSV must surface as an import log, not a 500 — mirror getPreview so the UI shows the reason instead of a stack trace
		try {
			$this->importerService->setBaseEntity($request->request->get('baseEntity'));
			$this->importerService->setImportConfiguration(Json::decode($request->request->get('configuration')));
			$this->importerService->setImportData($this->extractCSVData($request->request->get('file'), false));
			list($entities, $logs) = $this->importerService->import();
		} catch (\Throwable $e) {
			$logs = [$e->getMessage()];
		}

		return new JsonResponse(['logs' => $logs]);
	}

	/**
	 * @return list<array<int, string|null>>
	 */
	protected function extractCSVData(?string $tempFileIRI, bool $includeHeaders = true): array
	{
		if ($tempFileIRI === null || $tempFileIRI === '') {
			throw new \RuntimeException('No import file was specified.');
		}

		$tempUploadedFile = $this->iriConverter->getResourceFromIri($tempFileIRI);

		$tempFile = tempnam(sys_get_temp_dir(), 'import');
		if ($tempFile === false) {
			throw new \RuntimeException('Could not allocate a temporary file for the import.');
		}

		$data = [];
		try {
			file_put_contents($tempFile, $this->uploadedFileService->getStorage($tempUploadedFile)->read($tempUploadedFile->getFilename()));

			$fp = fopen($tempFile, 'r');
			if ($fp === false) {
				throw new \RuntimeException('Could not open the uploaded file for reading.');
			}
			try {
				// Explicit escape arg silences the PHP 8.4 fgetcsv deprecation
				if (!$includeHeaders) {
					fgetcsv($fp, 0, ',', '"', '\\');
				}
				while (($row = fgetcsv($fp, 0, ',', '"', '\\')) !== false) {
					if ($row === [null]) {
						continue; // blank line
					}
					$data[] = $row;
				}
			} finally {
				fclose($fp);
			}
		} finally {
			@unlink($tempFile);
		}

		if ($data === []) {
			throw new \RuntimeException('The uploaded file is empty or is not valid CSV data.');
		}

		return $data;
	}
}
