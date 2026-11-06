<?php

namespace Limas\Controller\Actions;

use Limas\Service\ExchangeRateService;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

final readonly class ExchangeRateActions
{
	public function __construct(private ExchangeRateService $rates) {}

	#[Route(path: '/api/exchange-rates', methods: ['GET'])]
	public function get(): JsonResponse
	{
		$rates = $this->rates->latest();
		return $rates ? new JsonResponse($rates) : new JsonResponse(['error' => 'Exchange rates unavailable.'], 503);
	}

	#[IsGranted('ROLE_ADMIN')]
	#[Route(path: '/api/exchange-rates/refresh', methods: ['POST'])]
	public function refresh(): JsonResponse
	{
		try {
			return new JsonResponse($this->rates->refresh());
		} catch (\Throwable) {
			return new JsonResponse(['error' => 'Could not fetch ECB exchange rates.'], 502);
		}
	}
}
