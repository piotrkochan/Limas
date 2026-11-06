<?php

namespace Limas\Controller\Actions;

use Doctrine\ORM\EntityManagerInterface;
use Limas\Entity\Part;
use Limas\Entity\PartCategory;
use Limas\Service\AutoCategorySuggester;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/** Preview AI suggestions, then apply only the rows confirmed by the user. */
final readonly class AutoCategoryActions
{
	public function __construct(
		private EntityManagerInterface $em,
		private AutoCategorySuggester $suggester
	) {}

	#[Route(path: '/api/parts/autoCategory/preview', methods: ['POST'])]
	public function preview(Request $request): JsonResponse
	{
		$input = json_decode($request->getContent(), true);
		$ids = $this->parsePartIds($input['parts'] ?? null);
		if ($ids === null) return new JsonResponse(['error' => 'Select 1 to 40 parts.'], 400);
		$allowNew = ($input['proposeNew'] ?? false) === true;
		$parts = [];
		foreach ($ids as $id) {
			$part = $this->em->find(Part::class, $id);
			if (!$part) return new JsonResponse(['error' => 'Part ' . $id . ' no longer exists.'], 404);
			$parts[$id] = $part;
		}
		$categories = $this->em->getRepository(PartCategory::class)->findAll();
		$byId = [];
		$byParentAndName = [];
		$categoryData = [];
		foreach ($categories as $category) {
			$byId[$category->getId()] = $category;
			$parentId = $category->getParent()?->getId();
			$byParentAndName[($parentId ?? 0) . ':' . mb_strtolower(trim($category->getName()))] = $category;
			$categoryData[] = ['id' => $category->getId(), 'name' => $category->getName(), 'parentId' => $parentId];
		}
		if (!$categoryData) return new JsonResponse(['error' => 'No categories are configured.'], 409);
		$partData = array_map(static fn(Part $part): array => [
			'id' => $part->getId(), 'name' => $part->getName(), 'description' => $part->getDescription() ?? ''
		], array_values($parts));
		try {
			$reply = $this->suggester->suggest($categoryData, $partData, $allowNew);
		} catch (\Throwable $e) {
			return new JsonResponse(['error' => $e->getMessage()], 502);
		}
		$chosen = [];
		foreach ($reply['a'] as $pair) {
			if (!is_array($pair) || count($pair) !== 2) continue;
			[$partId, $categoryId] = $pair;
			$partId = $this->modelId($partId);
			$categoryId = $this->modelId($categoryId);
			if ($partId === null || $categoryId === null || !isset($parts[$partId], $byId[$categoryId]) || isset($chosen[$partId])) continue;
			$chosen[$partId] = ['categoryId' => $categoryId, 'target' => $byId[$categoryId]->getCategoryPath() ?: $byId[$categoryId]->getName()];
		}
		if ($allowNew) foreach ($reply['n'] as $proposal) {
			if (!is_array($proposal) || count($proposal) !== 3) continue;
			[$partId, $parentId, $name] = $proposal;
			$partId = $this->modelId($partId);
			$parentId = $this->modelId($parentId);
			if ($partId === null || $parentId === null || !is_string($name) || !isset($parts[$partId], $byId[$parentId]) || isset($chosen[$partId])) continue;
			$name = trim($name);
			if ($name === '' || mb_strlen($name) > 128 || preg_match('/[\r\n<>]/', $name)) continue;
			$existing = $byParentAndName[$parentId . ':' . mb_strtolower($name)] ?? null;
			if ($existing !== null) {
				$chosen[$partId] = [
					'categoryId' => $existing->getId(),
					'target' => $existing->getCategoryPath() ?: $existing->getName()
				];
				continue;
			}
			$chosen[$partId] = [
				'newCategory' => ['parentId' => $parentId, 'name' => $name],
				'target' => ($byId[$parentId]->getCategoryPath() ?: $byId[$parentId]->getName()) . ' ➤ ' . $name
			];
		}
		$rows = [];
		foreach ($parts as $part) {
			$id = $part->getId();
			$rows[] = array_merge([
				'partId' => $id,
				'partName' => $part->getName(),
				'current' => $part->getCategory()?->getCategoryPath() ?? '',
				'target' => '',
				'categoryId' => null,
				'newCategory' => null
			], $chosen[$id] ?? []);
		}
		return new JsonResponse(['rows' => $rows]);
	}

	#[Route(path: '/api/parts/autoCategory/apply', methods: ['POST'])]
	public function apply(Request $request): JsonResponse
	{
		$input = json_decode($request->getContent(), true);
		$rows = $input['rows'] ?? null;
		if (!is_array($rows) || $rows === [] || count($rows) > 40) return new JsonResponse(['error' => 'Expected 1 to 40 rows.'], 400);
		$changes = [];
		$seen = [];
		foreach ($rows as $row) {
			if (!is_array($row) || !is_int($row['partId'] ?? null) || isset($seen[$row['partId']])) return new JsonResponse(['error' => 'Invalid part row.'], 400);
			$id = $row['partId'];
			$seen[$id] = true;
			$part = $this->em->find(Part::class, $id);
			if (!$part) return new JsonResponse(['error' => 'Part ' . $id . ' no longer exists.'], 404);
			$categoryId = $row['categoryId'] ?? null;
			$new = $row['newCategory'] ?? null;
			if (is_int($categoryId) && $new === null) {
				$category = $this->em->find(PartCategory::class, $categoryId);
				if (!$category) return new JsonResponse(['error' => 'Invalid category.'], 400);
				$changes[] = [$part, $category, null];
			} elseif ($categoryId === null && is_array($new)) {
				$parentId = $new['parentId'] ?? null;
				$name = trim((string)($new['name'] ?? ''));
				if (!is_int($parentId) || $name === '' || mb_strlen($name) > 128 || preg_match('/[\r\n<>]/', $name)) return new JsonResponse(['error' => 'Invalid new category.'], 400);
				$parent = $this->em->find(PartCategory::class, $parentId);
				if (!$parent) return new JsonResponse(['error' => 'Invalid parent category.'], 400);
				$changes[] = [$part, null, [$parent, $name]];
			} else {
				return new JsonResponse(['error' => 'Each row needs one target category.'], 400);
			}
		}
		$created = [];
		$this->em->wrapInTransaction(function () use ($changes, &$created): void {
			$cache = [];
			foreach ($changes as [$part, $category, $new]) {
				if ($new !== null) {
					[$parent, $name] = $new;
					$key = $parent->getId() . ':' . mb_strtolower($name);
					if (!isset($cache[$key])) {
						$cache[$key] = $this->em->getRepository(PartCategory::class)->findOneBy(['parent' => $parent, 'name' => $name]);
						if (!$cache[$key]) {
							$cache[$key] = (new PartCategory)->setName($name)->setParent($parent)->setDescription(null);
							$this->em->persist($cache[$key]);
							$created[] = $name;
						}
					}
					$category = $cache[$key];
				}
				$part->setCategory($category);
			}
		});
		return new JsonResponse(['updated' => count($changes), 'createdCategories' => $created]);
	}

	/** @return list<int>|null */
	private function parsePartIds(mixed $items): ?array
	{
		if (!is_array($items) || count($items) < 1 || count($items) > 40) return null;
		$ids = [];
		foreach ($items as $iri) {
			if (!is_string($iri) || !preg_match('#^/api/parts/([1-9][0-9]*)$#', $iri, $matches)) return null;
			$ids[] = (int)$matches[1];
		}
		return count(array_unique($ids)) === count($ids) ? $ids : null;
	}

	private function modelId(mixed $value): ?int
	{
		if (is_int($value) && $value > 0) return $value;
		if (is_string($value) && preg_match('/^[1-9][0-9]*$/', $value)) return (int)$value;
		return null;
	}
}
