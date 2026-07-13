<?php

namespace Limas\Listener;

use Doctrine\ORM\AbstractQuery;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Event\JWTDecodedEvent;
use Limas\Entity\User;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\RequestStack;


readonly class JWTDecoded
	implements EventSubscriberInterface
{
	public function __construct(
		private RequestStack           $requestStack,
		private EntityManagerInterface $entityManager
	)
	{
	}

	public static function getSubscribedEvents(): array
	{
		return [
			'lexik_jwt_authentication.on_jwt_decoded' => 'onJWTDecoded'
		];
	}

	public function onJWTDecoded(JWTDecodedEvent $event): void
	{
		$payload = $event->getPayload();

		if (!isset($payload['ip']) || $payload['ip'] !== $this->requestStack->getCurrentRequest()->getClientIp()) {
			$event->markAsInvalid();
			return;
		}

		// Reject any token issued before the user's last password change. The
		// lookup is a single primary-key read (id is embedded in the token by
		// JWTCreated); the user is already reloaded per request by the stateful
		// firewall anyway. Absent claim / null stamp (legacy tokens & users)
		// => skip, so a deploy doesn't invalidate everyone's session at once.
		if (isset($payload['id'], $payload['pca'])) {
			$currentStamp = $this->entityManager->createQueryBuilder()
				->select('u.passwordChangedAt')
				->from(User::class, 'u')
				->where('u.id = :id')
				->setParameter('id', $payload['id'])
				->getQuery()
				->getOneOrNullResult(AbstractQuery::HYDRATE_SINGLE_SCALAR);

			if ($currentStamp !== null && (int)$payload['pca'] < (int)$currentStamp) {
				$event->markAsInvalid();
				return;
			}
		}

		$event->setPayload($payload);
	}
}
