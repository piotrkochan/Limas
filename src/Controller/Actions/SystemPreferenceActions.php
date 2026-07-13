<?php

namespace Limas\Controller\Actions;

use Limas\Service\SystemPreferenceService;
use Nette\Utils\Json;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;


class SystemPreferenceActions
	extends AbstractController
{
	public function __construct(private readonly SystemPreferenceService $service)
	{
	}

	public function getAction(): JsonResponse
	{
		$preferences = $this->service->getPreferences();
		$data = [];
		foreach ($preferences as $preference) {
			$data[] = [
				'preferenceKey' => $preference->getPreferenceKey(),
				'preferenceValue' => $preference->getPreferenceValue()
			];
		}
		return new JsonResponse($data);
	}

	// Writing global system configuration is admin-only — a normal user must
	// not be able to flip auth policy, limits, duplicate-detection mode, etc.
	// Reads (getAction) stay open to any authenticated user; the frontend
	// needs them (label config, etc.).
	#[IsGranted('ROLE_ADMIN')]
	#[Route(path: '/api/system_preferences', name: 'SystemPreferenceSet', methods: ['POST', 'PUT'])]
	public function setAction(Request $request): JsonResponse
	{
		$data = Json::decode($request->getContent());
		if (!property_exists($data, 'preferenceKey') || !property_exists($data, 'preferenceValue')) {
			throw new \RuntimeException('Invalid format');
		}
		$preference = $this->service->setSystemPreference($data->preferenceKey, $data->preferenceValue);
		return new JsonResponse([
			'preferenceKey' => $preference->getPreferenceKey(),
			'preferenceValue' => $preference->getPreferenceValue()
		]);
	}

	public function deleteAction(Request $request): void
	{
		if ($request->request->has('preferenceKey')) {
			$this->service->deletePreference($request->request->get('preferenceKey'));
		} else {
			throw new \RuntimeException('Invalid format');
		}
	}
}
