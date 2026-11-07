<?php

namespace Limas\Controller\Actions;

use Limas\Service\Integration\InfoProvider\PartDistributorDataRefresh;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

final readonly class PartDistributorDataRefreshActions
{
	public function __construct(private PartDistributorDataRefresh $refresh) {}

	#[Route(path: '/api/parts/distributor-data/preview', methods: ['POST'])]
	public function preview(Request $request): JsonResponse
	{
		$ids = $this->partIds($request);
		if ($ids === null) return new JsonResponse(['error' => 'Select 1 to 100 parts.'], 400);
		try {
			return new JsonResponse($this->refresh->preview($ids));
		} catch (\InvalidArgumentException $error) {
			return new JsonResponse(['error' => $error->getMessage()], 404);
		}
	}

	#[Route(path: '/api/parts/distributor-data/apply', methods: ['POST'])]
	public function apply(Request $request): JsonResponse
	{
		$ids = $this->partIds($request);
		if ($ids === null) return new JsonResponse(['error' => 'Select 1 to 100 parts.'], 400);
		$body = json_decode($request->getContent(), true);
		$selected = $body['selected'] ?? null;
		$previewId = $body['previewId'] ?? null;
		if (!is_array($selected) || count($selected) > 2000) {
			return new JsonResponse(['error' => 'Invalid field selection.'], 400);
		}
		if (!is_string($previewId) || !preg_match('/^[a-f0-9]{48}$/', $previewId)) {
			return new JsonResponse(['error' => 'Missing or invalid preview ID. Refresh the preview.'], 400);
		}
		foreach ($selected as $key => $fingerprint) {
			if (!is_string($key) || !preg_match('/^[1-9][0-9]*:(?:0|[1-9][0-9]*):[a-zA-Z0-9]+$/', $key)
				|| !is_string($fingerprint) || !preg_match('/^[a-f0-9]{64}$/', $fingerprint)) {
				return new JsonResponse(['error' => 'Invalid field selection.'], 400);
			}
		}
		try {
			return new JsonResponse($this->refresh->apply($ids, $selected, $previewId));
		} catch (\InvalidArgumentException $error) {
			return new JsonResponse(['error' => $error->getMessage()], 404);
		} catch (\RuntimeException $error) {
			return new JsonResponse(['error' => $error->getMessage()], 409);
		}
	}

	/** @return list<int>|null */
	private function partIds(Request $request): ?array
	{
		$body = json_decode($request->getContent(), true);
		$parts = $body['parts'] ?? null;
		if (!is_array($parts) || count($parts) < 1 || count($parts) > 100) return null;
		$ids = [];
		foreach ($parts as $iri) {
			if (!is_string($iri) || !preg_match('#^/api/parts/([1-9][0-9]*)$#', $iri, $match)) return null;
			$ids[(int)$match[1]] = true;
		}
		return array_keys($ids);
	}
}
