<?php

namespace Limas\Tests;

use Limas\Service\UploadedFileService;


class SsrfGuardTest
	extends WebTestCase
{
	/**
	 * isPrivateIp must reject IPv4-mapped IPv6 in BOTH notations. The old
	 * dotted-decimal-only regex let the hextet form (::ffff:7f00:1, which is
	 * 127.0.0.1 and routes there on Linux) pass as "public", bypassing the
	 * SSRF allowlist.
	 */
	public function testIsPrivateIp(): void
	{
		$service = self::getContainer()->get(UploadedFileService::class);
		$method = new \ReflectionMethod($service, 'isPrivateIp');

		$cases = [
			// The regression: IPv4-mapped IPv6 in hextet form
			['::ffff:7f00:1', true],
			['::ffff:a9fe:a9fe', true],
			// Dotted-decimal mapped form still caught
			['::ffff:127.0.0.1', true],
			// Plain private / reserved ranges
			['127.0.0.1', true],
			['169.254.169.254', true],
			['10.0.0.1', true],
			['::1', true],
			// Genuinely public addresses stay allowed
			['8.8.8.8', false],
			['1.1.1.1', false]
		];

		foreach ($cases as [$ip, $expectedPrivate]) {
			self::assertSame($expectedPrivate, $method->invoke($service, $ip), $ip);
		}
	}

	/**
	 * assertHostIsPublic returns the vetted address(es) so the caller can pin
	 * the connection (CURLOPT_RESOLVE) and close the DNS-rebinding TOCTOU, and
	 * rejects any private/loopback literal. Uses literal IPs so there's no DNS
	 * dependency.
	 */
	public function testAssertHostIsPublic(): void
	{
		$service = self::getContainer()->get(UploadedFileService::class);
		$method = new \ReflectionMethod($service, 'assertHostIsPublic');

		// Public literal → returned verbatim as the vetted address
		self::assertSame(['8.8.8.8'], $method->invoke($service, '8.8.8.8'));

		// Private / loopback / link-local literals are rejected
		foreach (['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1'] as $ip) {
			try {
				$method->invoke($service, $ip);
				self::fail($ip . ' should be rejected as private');
			} catch (\InvalidArgumentException $e) {
				self::assertStringContainsStringIgnoringCase('private', $e->getMessage(), $ip);
			}
		}
	}
}
