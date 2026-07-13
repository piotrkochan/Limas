<?php

namespace Limas\Listener;

use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;


/**
 * Defence-in-depth response headers on every response. Kept deliberately
 * minimal so it can't break the ExtJS app: no script/style CSP (ExtJS relies
 * on inline styles + eval), only framing/sniffing/referrer/transport hardening.
 */
class SecurityHeaders
	implements EventSubscriberInterface
{
	public static function getSubscribedEvents(): array
	{
		return [
			KernelEvents::RESPONSE => 'onKernelResponse'
		];
	}

	public function onKernelResponse(ResponseEvent $event): void
	{
		if (!$event->isMainRequest()) {
			return;
		}

		$headers = $event->getResponse()->headers;

		if (!$headers->has('X-Content-Type-Options')) {
			$headers->set('X-Content-Type-Options', 'nosniff');
		}
		// SAMEORIGIN, not DENY: the app frames its own attachment getFile
		// endpoint in a same-origin iframe. frame-ancestors is the modern
		// (non-deprecated) equivalent — set both, scoped to framing only so
		// no other CSP directive is implied.
		if (!$headers->has('X-Frame-Options')) {
			$headers->set('X-Frame-Options', 'SAMEORIGIN');
		}
		if (!$headers->has('Content-Security-Policy')) {
			$headers->set('Content-Security-Policy', "frame-ancestors 'self'");
		}
		if (!$headers->has('Referrer-Policy')) {
			$headers->set('Referrer-Policy', 'same-origin');
		}
		// HSTS only makes sense over HTTPS; browsers ignore it on plain HTTP and it would be wrong for local http dev
		if ($event->getRequest()->isSecure() && !$headers->has('Strict-Transport-Security')) {
			$headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
		}
	}
}
