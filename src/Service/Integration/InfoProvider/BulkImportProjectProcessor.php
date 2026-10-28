<?php

namespace Limas\Service\Integration\InfoProvider;

use Doctrine\ORM\EntityManagerInterface;
use Limas\Entity\BulkImportJob;
use Limas\Entity\BulkImportJobItem;
use Limas\Entity\ProjectPart;
use Limas\Service\Integration\InfoProvider\Enum\BulkImportItemStatus;
use Limas\Service\Integration\InfoProvider\Enum\BulkImportJobStatus;

final readonly class BulkImportProjectProcessor
{
	public function __construct(private EntityManagerInterface $em, private LcscPartResolver $resolver) {}

	/** @return array{success: int, warning: int, skipped: int, ambiguous: int, failed: int} */
	public function run(BulkImportJob $job, ?callable $onProgress = null): array
	{
		if ($job->getProject() === null) throw new \InvalidArgumentException('Project is required');
		if (in_array($job->getStatus(), [BulkImportJobStatus::Completed, BulkImportJobStatus::Partial, BulkImportJobStatus::WaitingDecision], true)) {
			return ['success' => 0, 'warning' => 0, 'skipped' => 0, 'ambiguous' => 0, 'failed' => 0];
		}
		$job->setStatus(BulkImportJobStatus::Running);
		$this->em->flush();
		$counts = ['success' => 0, 'warning' => 0, 'skipped' => 0, 'ambiguous' => 0, 'failed' => 0];
		$processed = 0;
		foreach ($job->getItems() as $item) {
			if ($item->getStatus() !== BulkImportItemStatus::Pending) {
				$processed++;
				continue;
			}
			try {
				$this->processItem($job, $item);
			} catch (\Throwable $e) {
				// A failed Doctrine flush closes the manager. Preserve the original
				// exception so Messenger reports the real database error.
				if (!$this->em->isOpen()) throw $e;
				$item->setStatus(BulkImportItemStatus::Failed)->setErrorMessage($e->getMessage());
			}
			if (isset($counts[$item->getStatus()->value])) $counts[$item->getStatus()->value]++;
			$job->incrementProcessedRows();
			$this->em->flush();
			$processed++;
			if ($onProgress !== null) $onProgress($item, $processed, $job->getTotalRows());
		}
		$this->refreshStatus($job);
		$this->em->flush();
		return $counts;
	}

	private function processItem(BulkImportJob $job, BulkImportJobItem $item): void
	{
		$id = $item->getRawLcsc();
		$qty = filter_var($item->getRawQuantity(), FILTER_VALIDATE_INT);
		if ($id === null || $qty === false || $qty < 1) {
			throw new \InvalidArgumentException('Project row needs valid LCSC ID and positive integer Quantity');
		}
		[$part, $created] = $this->resolver->resolve($id, $job->getDefaultCategory(), $job->getDefaultStorage());
		$item->setPart($created ? $part : null)->setExistingPart($created ? null : $part);
		$project = $job->getProject();
		$matches = $this->em->getRepository(ProjectPart::class)->findBy(['project' => $project, 'part' => $part]);
		if (count($matches) > 1) throw new \RuntimeException('Project has multiple rows for Part #' . $part->getId());
		if ($matches !== []) {
			$item->setStatus(BulkImportItemStatus::Conflict)
				->setErrorMessage('Already in project with quantity ' . $matches[0]->getQuantity() . '. Choose keep, replace or add.');
			return;
		}
		$row = (new ProjectPart)->setPart($part)->setQuantity($qty)->setRemarks($this->remarks($item));
		$project->addPart($row);
		$this->em->persist($row);
		$item->setStatus(BulkImportItemStatus::Success);
	}

	/** @param array<string, string> $decisions Map item ID to keep, replace, or add. */
	public function applyDecisions(int $jobId, array $decisions): void
	{
		$job = $this->em->find(BulkImportJob::class, $jobId);
		if ($job === null || $job->getProject() === null) throw new \InvalidArgumentException('Project import job not found');
		$valid = ['keep', 'replace', 'add'];
		foreach ($decisions as $itemId => $choice) {
			if (!ctype_digit((string)$itemId) || !in_array($choice, $valid, true)) {
				throw new \InvalidArgumentException('Invalid conflict decision');
			}
			$item = $this->em->find(BulkImportJobItem::class, (int)$itemId);
			if ($item === null || $item->getJob()->getId() !== $jobId || $item->getStatus() !== BulkImportItemStatus::Conflict) {
				throw new \InvalidArgumentException('Conflict item not found: ' . $itemId);
			}
		}
		foreach ($decisions as $itemId => $choice) {
			$item = $this->em->find(BulkImportJobItem::class, (int)$itemId);
			$part = $item->getPart() ?? $item->getExistingPart();
			$rows = $this->em->getRepository(ProjectPart::class)->findBy(['project' => $job->getProject(), 'part' => $part]);
			if (count($rows) !== 1) throw new \InvalidArgumentException('Project row changed for item ' . $itemId);
			$row = $rows[0];
			$qty = (int)$item->getRawQuantity();
			if ($choice === 'replace') {
				$row->setQuantity($qty)->setRemarks($this->remarks($item));
			} elseif ($choice === 'add') {
				$row->setQuantity($row->getQuantity() + $qty);
				$row->setRemarks(implode(' | ', array_filter([$row->getRemarks(), $this->remarks($item)])));
			}
			$item->setProjectDecision($choice)
				->setStatus($choice === 'keep' ? BulkImportItemStatus::Skipped : BulkImportItemStatus::Success)
				->setErrorMessage('Project conflict: ' . $choice);
		}
		$this->refreshStatus($job);
		$this->em->flush();
	}

	private function refreshStatus(BulkImportJob $job): void
	{
		$waiting = false;
		$issues = false;
		foreach ($job->getItems() as $item) {
			if ($item->getStatus() === BulkImportItemStatus::Conflict) $waiting = true;
			if (in_array($item->getStatus(), [BulkImportItemStatus::Failed, BulkImportItemStatus::Ambiguous, BulkImportItemStatus::Warning], true)) $issues = true;
		}
		$job->setStatus($waiting ? BulkImportJobStatus::WaitingDecision : ($issues ? BulkImportJobStatus::Partial : BulkImportJobStatus::Completed));
	}

	private function remarks(BulkImportJobItem $item): ?string
	{
		$parts = [];
		foreach (['Designators' => $item->getRawDesignators(), 'Comment' => $item->getRawComment(), 'Footprint' => $item->getRawFootprint()] as $label => $value) {
			if ($value !== null && $value !== '') $parts[] = $label . ': ' . $value;
		}
		return $parts === [] ? null : implode(' | ', $parts);
	}
}
