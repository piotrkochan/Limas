<?php

namespace Limas\Controller\Actions;

use Doctrine\ORM\EntityManagerInterface;
use Limas\Entity\BulkImportJob;
use Limas\Entity\BulkImportJobItem;
use Limas\Entity\PartCategory;
use Limas\Entity\PartDistributor;
use Limas\Entity\PartManufacturer;
use Limas\Entity\ManufacturerAlias;
use Limas\Entity\Project;
use Limas\Entity\ProjectPart;
use Limas\Entity\StorageLocation;
use Limas\Entity\User;
use Limas\Message\BulkImportJobMessage;
use Limas\Service\Integration\InfoProvider\BulkImportCsvParser;
use Limas\Service\Integration\InfoProvider\BulkImportProjectProcessor;
use Limas\Service\Integration\InfoProvider\Enum\BulkImportDuplicatesBehavior;
use Limas\Service\ManufacturerCanonicalizer;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;


/**
 * REST endpoints for the Bulk Import feature
 *
 *   POST /api/bulk-import
 *     multipart/form-data: `file` (CSV) + `meta` JSON field with
 *     { hasHeader, mapping: {mpn, manufacturer?, category?, storage?},
 *       defaultCategoryId, defaultStorageLocationId, duplicatesBehavior? }
 *     Returns { jobId, totalRows }. Dispatches a BulkImportJobMessage
 *     onto the `async` Messenger transport — a `messenger:consume async`
 *     worker picks it up and runs BulkImportJobProcessor. FE polls
 *     /bulk-import-jobs/<id> for progress.
 *
 *   GET /api/bulk-import-jobs/{id}
 *     Returns job + per-item status. Used by FE progress panel polling.
 */
class BulkImportActions
	extends AbstractController
{
	public function __construct(
		private readonly EntityManagerInterface $em,
		private readonly BulkImportCsvParser    $csvParser,
		private readonly MessageBusInterface    $messageBus,
		private readonly BulkImportProjectProcessor $projectProcessor
	)
	{
	}

	#[Route(path: '/api/bulk-import/lookup', methods: ['POST'])]
	public function lookupAction(Request $request): JsonResponse
	{
		$data = json_decode($request->getContent(), true);
		$rows = $data['rows'] ?? null;
		if (!is_array($rows) || !array_is_list($rows) || count($rows) > 250) {
			return new JsonResponse(['error' => 'rows must be a list of at most 250 items'], 400);
		}
		$projectId = $data['projectId'] ?? null;
		if ($projectId !== null && (!is_int($projectId) || $projectId < 1)) {
			return new JsonResponse(['error' => 'projectId must be a positive integer'], 400);
		}
		if ($projectId !== null && $this->em->find(Project::class, $projectId) === null) {
			return new JsonResponse(['error' => 'Project not found'], 404);
		}

		$lcscIds = [];
		$mpns = [];
		$manufacturerNames = [];
		foreach ($rows as $row) {
			if (!is_array($row)) return new JsonResponse(['error' => 'Each row must be an object'], 400);
			foreach (['lcsc', 'mpn', 'manufacturer'] as $field) {
				if (isset($row[$field]) && (!is_string($row[$field]) || mb_strlen($row[$field]) > 255)) {
					return new JsonResponse(['error' => $field . ' must be a string of at most 255 characters'], 400);
				}
			}
			$lcsc = strtoupper(trim((string)($row['lcsc'] ?? '')));
			$mpn = mb_strtolower(trim((string)($row['mpn'] ?? '')));
			if ($lcsc !== '') $lcscIds[$lcsc] = $lcsc;
			elseif ($mpn !== '') {
				$mpns[$mpn] = $mpn;
				$name = ManufacturerCanonicalizer::normalize((string)($row['manufacturer'] ?? ''));
				if ($name !== '') $manufacturerNames[$name] = $name;
			}
		}
		$aliases = [];
		if ($manufacturerNames !== []) {
			$aliasRows = $this->em->createQueryBuilder()
				->select('a.aliasNormalized AS aliasName', 'm.id AS manufacturerId')
				->from(ManufacturerAlias::class, 'a')
				->leftJoin('a.manufacturer', 'm')
				->where('a.aliasNormalized IN (:names)')
				->setParameter('names', array_values($manufacturerNames))
				->getQuery()->getArrayResult();
			foreach ($aliasRows as $alias) $aliases[$alias['aliasName']] = $alias['manufacturerId'] !== null ? (int)$alias['manufacturerId'] : null;
		}

		$byLcsc = [];
		if ($lcscIds !== []) {
			$offers = $this->em->createQueryBuilder()
				->select('pd.sku AS sku', 'pd.orderNumber AS orderNumber', 'p.id AS partId', 'p.name AS partName')
				->from(PartDistributor::class, 'pd')
				->join('pd.part', 'p')
				->join('pd.distributor', 'd')
				->where('LOWER(d.name) = :source')
				->andWhere('(pd.sku IN (:ids) OR pd.orderNumber IN (:ids))')
				->setParameter('source', 'lcsc')
				->setParameter('ids', array_values($lcscIds))
				->getQuery()->getArrayResult();
			foreach ($offers as $offer) {
				foreach (['sku', 'orderNumber'] as $field) {
					$key = strtoupper(trim((string)($offer[$field] ?? '')));
					if (isset($lcscIds[$key])) $byLcsc[$key][(int)$offer['partId']] = ['id' => (int)$offer['partId'], 'name' => $offer['partName']];
				}
			}
		}

		$byMpn = [];
		if ($mpns !== []) {
			$manufacturers = $this->em->createQueryBuilder()
				->select('pm.partNumber AS mpn', 'm.name AS manufacturer', 'm.id AS manufacturerId', 'p.id AS partId', 'p.name AS partName')
				->from(PartManufacturer::class, 'pm')
				->join('pm.part', 'p')
				->join('pm.manufacturer', 'm')
				->where('LOWER(TRIM(pm.partNumber)) IN (:mpns)')
				->setParameter('mpns', array_values($mpns))
				->getQuery()->getArrayResult();
			foreach ($manufacturers as $manufacturer) {
				$key = mb_strtolower(trim((string)$manufacturer['mpn']));
				$byMpn[$key][] = $manufacturer;
			}
		}

		$matchesByRow = [];
		$partIds = [];
		foreach ($rows as $row) {
			$lcsc = strtoupper(trim((string)($row['lcsc'] ?? '')));
			$mpn = mb_strtolower(trim((string)($row['mpn'] ?? '')));
			$matches = $lcsc !== '' ? ($byLcsc[$lcsc] ?? []) : [];
			if ($lcsc === '' && $mpn !== '') {
				$rawManufacturer = trim((string)($row['manufacturer'] ?? ''));
				$manufacturerKey = $rawManufacturer !== '' ? ManufacturerCanonicalizer::normalize($rawManufacturer) : null;
				foreach ($byMpn[$mpn] ?? [] as $candidate) {
					if ($manufacturerKey !== null) {
						if (array_key_exists($manufacturerKey, $aliases)) {
							if ($aliases[$manufacturerKey] !== (int)$candidate['manufacturerId']) continue;
						} elseif (ManufacturerCanonicalizer::normalize((string)$candidate['manufacturer']) !== $manufacturerKey) continue;
					}
					$id = (int)$candidate['partId'];
					$matches[$id] = ['id' => $id, 'name' => $candidate['partName']];
				}
			}
			$matchesByRow[] = array_values($matches);
			foreach ($matches as $id => $match) $partIds[$id] = $id;
		}

		$inProject = [];
		if ($projectId !== null && $partIds !== []) {
			$projectParts = $this->em->createQueryBuilder()
				->select('p.id AS partId')
				->from(ProjectPart::class, 'pp')
				->join('pp.part', 'p')
				->where('pp.project = :project')
				->andWhere('p.id IN (:ids)')
				->setParameter('project', $projectId)
				->setParameter('ids', array_values($partIds))
				->getQuery()->getArrayResult();
			foreach ($projectParts as $part) $inProject[(int)$part['partId']] = true;
		}

		$results = [];
		foreach ($matchesByRow as $matches) {
			$count = count($matches);
			$results[] = [
				'status' => $count === 0 ? 'new' : ($count === 1 ? 'existing' : 'multiple'),
				'matches' => $matches,
				'projectStatus' => $projectId === null ? null : ($count === 0 ? 'new' : ($count > 1 ? 'multiple' : (isset($inProject[$matches[0]['id']]) ? 'in' : 'not_in')))
			];
		}
		return new JsonResponse(['results' => $results]);
	}

	#[Route(path: '/api/bulk-import', methods: ['POST'])]
	public function createJobAction(Request $request): JsonResponse
	{
		$file = $request->files->get('file');
		$metaJson = $request->request->get('meta', '');
		if ($file === null || !is_string($metaJson) || $metaJson === '') {
			return new JsonResponse(['error' => 'Multipart fields `file` and `meta` are required'], 400);
		}
		$meta = json_decode($metaJson, true);
		if (!is_array($meta)) {
			return new JsonResponse(['error' => '`meta` must be a JSON object'], 400);
		}

		$mapping = $meta['mapping'] ?? null;
		if (!is_array($mapping) || (!isset($mapping['mpn']) && !isset($mapping['lcsc']))
			|| (isset($mapping['mpn']) && !is_int($mapping['mpn']))
			|| (isset($mapping['lcsc']) && !is_int($mapping['lcsc']))) {
			return new JsonResponse(['error' => '`mapping.mpn` or `mapping.lcsc` (column index) is required'], 400);
		}
		$projectId = (int)($meta['projectId'] ?? 0);
		$projectName = trim((string)($meta['projectName'] ?? ''));
		if ($projectId > 0 && $projectName !== '') {
			return new JsonResponse(['error' => 'Choose projectId or projectName, not both'], 400);
		}
		$project = $projectId > 0 ? $this->em->find(Project::class, $projectId) : null;
		if ($projectId > 0 && $project === null) {
			return new JsonResponse(['error' => 'Project not found'], 404);
		}
		$projectMode = $projectId > 0 || $projectName !== '';
		$projectBomQuantity = $meta['projectBomQuantity'] ?? true;
		$projectStockQuantity = $meta['projectStockQuantity'] ?? false;
		if (!is_bool($projectBomQuantity) || !is_bool($projectStockQuantity)) {
			return new JsonResponse(['error' => 'Project quantity options must be booleans'], 400);
		}
		if ($projectMode && !isset($mapping['lcsc'])) {
			return new JsonResponse(['error' => 'Project import requires an LCSC column'], 400);
		}
		if ($projectMode && ($projectBomQuantity || $projectStockQuantity) && !isset($mapping['quantity'])) {
			return new JsonResponse(['error' => 'Selected project quantity options require a Quantity column'], 400);
		}
		if ($projectMode && ($meta['duplicatesBehavior'] ?? 'skip') === 'update_stock') {
			return new JsonResponse(['error' => 'Project import cannot update stock'], 400);
		}

		$categoryId = (int)($meta['defaultCategoryId'] ?? 0);
		$storageId = (int)($meta['defaultStorageLocationId'] ?? 0);
		$category = $this->em->find(PartCategory::class, $categoryId);
		$storage = $this->em->find(StorageLocation::class, $storageId);
		if ($category === null || $storage === null) {
			return new JsonResponse(['error' => 'defaultCategoryId / defaultStorageLocationId must reference existing entities'], 400);
		}

		try {
			$rows = $this->csvParser->parse($file->getPathname());
		} catch (\Throwable $e) {
			return new JsonResponse(['error' => 'CSV parse failed: ' . $e->getMessage()], 400);
		}
		if ($rows === []) {
			return new JsonResponse(['error' => 'CSV is empty'], 400);
		}

		$hasHeader = ($meta['hasHeader'] ?? true) === true;
		if ($hasHeader) {
			array_shift($rows);
		}
		if ($rows === []) {
			return new JsonResponse(['error' => 'CSV has only a header row'], 400);
		}

		$mpnCol = $mapping['mpn'] ?? null;
		$lcscCol = $mapping['lcsc'] ?? null;
		$desCol = isset($mapping['designator']) && is_int($mapping['designator']) ? $mapping['designator'] : null;
		$commentCol = isset($mapping['comment']) && is_int($mapping['comment']) ? $mapping['comment'] : null;
		$footprintCol = isset($mapping['footprint']) && is_int($mapping['footprint']) ? $mapping['footprint'] : null;
		$mfrCol = isset($mapping['manufacturer']) && is_int($mapping['manufacturer']) ? $mapping['manufacturer'] : null;
		$catCol = isset($mapping['category']) && is_int($mapping['category']) ? $mapping['category'] : null;
		$stoCol = isset($mapping['storage']) && is_int($mapping['storage']) ? $mapping['storage'] : null;
		// The same CSV column can supply BOM quantity, stock quantity, or both.
		$qtyCol = isset($mapping['quantity']) && is_int($mapping['quantity']) ? $mapping['quantity'] : null;

		$job = new BulkImportJob;
		if ($projectName !== '') {
			$project = (new Project)->setName($projectName);
			$this->em->persist($project);
		}
		$job->setProject($project);
		$job->setProjectBomQuantity($projectMode && $projectBomQuantity);
		$job->setProjectStockQuantity($projectMode && $projectStockQuantity);
		$job->setDefaultCategory($category);
		$job->setDefaultStorage($storage);
		$dupRaw = $meta['duplicatesBehavior'] ?? 'skip';
		$job->setDuplicatesBehavior(BulkImportDuplicatesBehavior::tryFrom(is_string($dupRaw) ? $dupRaw : 'skip') ?? BulkImportDuplicatesBehavior::Skip);
		$user = $this->getUser();
		if ($user instanceof User) {
			$job->setCreatedBy($user);
			if ($projectName !== '') $project->setUser($user);
		}

		$total = 0;
		$byLcsc = [];
		foreach ($rows as $i => $row) {
			$mpn = $mpnCol !== null ? $this->cell($row, $mpnCol) : '';
			$lcsc = $lcscCol !== null ? strtoupper($this->cell($row, $lcscCol)) : '';
			if ($mpn === '' && $lcsc === '') {
				// Skip blank rows silently — operators routinely leave
				// trailing empty lines in Excel exports. We do NOT
				// create a failed item for these; they're noise.
				continue;
			}
			$item = (new BulkImportJobItem)
				->setLine($i + 1)
				->setRawMpn($mpn)
				->setRawLcsc($lcsc !== '' ? $lcsc : null)
				->setRawDesignators($this->optionalCell($row, $desCol))
				->setRawComment($this->optionalCell($row, $commentCol))
				->setRawFootprint($this->optionalCell($row, $footprintCol))
				->setRawManufacturer($this->optionalCell($row, $mfrCol))
				->setRawCategory($this->optionalCell($row, $catCol))
				->setRawStorage($this->optionalCell($row, $stoCol))
				->setRawQuantity($this->optionalCell($row, $qtyCol));
			if ($projectMode && $lcsc !== '' && isset($byLcsc[$lcsc])) {
				$prior = $byLcsc[$lcsc];
				$a = filter_var($prior->getRawQuantity(), FILTER_VALIDATE_INT);
				$b = filter_var($item->getRawQuantity(), FILTER_VALIDATE_INT);
				if ($projectBomQuantity || $projectStockQuantity) {
					$prior->setRawQuantity($a !== false && $b !== false && $a > 0 && $b > 0 ? (string)($a + $b) : 'invalid');
				}
				$prior->setRawDesignators(implode(', ', array_filter([$prior->getRawDesignators(), $item->getRawDesignators()])));
				$prior->setRawComment(implode(' | ', array_unique(array_filter([$prior->getRawComment(), $item->getRawComment()]))));
				continue;
			}
			if ($projectMode && $lcsc !== '') $byLcsc[$lcsc] = $item;
			$job->addItem($item);
			$total++;
		}
		$job->setTotalRows($total);

		if ($total === 0) {
			return new JsonResponse(['error' => 'No usable rows (MPN and LCSC cells were empty)'], 400);
		}

		$this->em->persist($job);
		$this->em->flush();

		// Hand the job off to Messenger. Picked up by
		// `bin/console messenger:consume async` (a long-running worker
		// the operator/sysadmin starts once and supervises). If no
		// consumer is running the message just queues up safely.
		$this->messageBus->dispatch(new BulkImportJobMessage($job->getId()));

		return new JsonResponse([
			'jobId' => $job->getId(),
			'totalRows' => $total,
			'message' => 'Job queued — a messenger:consume worker will process it.'
		], 201);
	}

	#[Route(path: '/api/bulk-import-jobs/{id}', requirements: ['id' => '\d+'], methods: ['GET'])]
	public function getJobAction(int $id): JsonResponse
	{
		$job = $this->em->find(BulkImportJob::class, $id);
		if ($job === null) {
			return new JsonResponse(['error' => 'Job not found'], 404);
		}
		$items = [];
		foreach ($job->getItems() as $item) {
			$items[] = [
				'line' => $item->getLine(),
				'mpn' => $item->getRawMpn(),
				'id' => $item->getId(),
				'lcsc' => $item->getRawLcsc(),
				'designators' => $item->getRawDesignators(),
				'projectDecision' => $item->getProjectDecision(),
				'manufacturer' => $item->getRawManufacturer(),
				'category' => $item->getRawCategory(),
				'storage' => $item->getRawStorage(),
				'rawQuantity' => $item->getRawQuantity(),
				'quantityApplied' => $item->getQuantityApplied(),
				'status' => $item->getStatus()->value,
				'errorMessage' => $item->getErrorMessage(),
				'partId' => $item->getPart()?->getId(),
				'partName' => $item->getPart()?->getName(),
				'existingPartId' => $item->getExistingPart()?->getId(),
				'existingPartName' => $item->getExistingPart()?->getName()
			];
		}
		return new JsonResponse([
			'id' => $job->getId(),
			'status' => $job->getStatus()->value,
			'totalRows' => $job->getTotalRows(),
			'processedRows' => $job->getProcessedRows(),
			'createdAt' => $job->getCreatedAt()->format(\DateTimeInterface::ATOM),
			'duplicatesBehavior' => $job->getDuplicatesBehavior()->value,
			'defaultCategory' => $job->getDefaultCategory()->getName(),
			'defaultStorage' => $job->getDefaultStorage()->getName(),
			'projectId' => $job->getProject()?->getId(),
			'projectName' => $job->getProject()?->getName(),
			'projectBomQuantity' => $job->usesProjectBomQuantity(),
			'projectStockQuantity' => $job->usesProjectStockQuantity(),
			'items' => $items
		]);
	}

	#[Route(path: '/api/bulk-import-jobs/{id}/decisions', requirements: ['id' => '\\d+'], methods: ['POST'])]
	public function decideAction(int $id, Request $request): JsonResponse
	{
		$data = json_decode($request->getContent(), true);
		if (!is_array($data) || !is_array($data['decisions'] ?? null)) {
			return new JsonResponse(['error' => 'decisions object is required'], 400);
		}
		try {
			$this->projectProcessor->applyDecisions($id, $data['decisions']);
		} catch (\InvalidArgumentException $e) {
			return new JsonResponse(['error' => $e->getMessage()], 400);
		}
		return $this->getJobAction($id);
	}

	/**
	 * @param string[] $row
	 */
	private function cell(array $row, int $idx): string
	{
		return isset($row[$idx]) ? trim($row[$idx]) : '';
	}

	/**
	 * Trim + return null when the cell is blank or the column wasn't
	 * mapped. Used for optional fields where blank stays null in the DB.
	 *
	 * @param string[] $row
	 */
	private function optionalCell(array $row, ?int $idx): ?string
	{
		if ($idx === null) {
			return null;
		}
		$v = $this->cell($row, $idx);
		return $v === '' ? null : $v;
	}
}
