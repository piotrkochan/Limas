<?php

namespace Limas\Tests;


class ImportControllerSecurityTest
	extends WebTestCase
{
	/**
	 * The CSV import routes used to live outside /api (/getSource/, /getPreview/, /executeImport/) and were reachable with NO
	 * authentication — an anonymous caller could read any uploaded temp file by IRI and write entities into the database.
	 * They now live under /api and must reject anonymous callers.
	 */
	public function testImportRoutesRejectUnauthenticated(): void
	{
		$routes = [
			['GET', '/api/import/getSource?file=/api/temp_uploaded_files/1'],
			['POST', '/api/import/getPreview'],
			['POST', '/api/import/executeImport']
		];

		foreach ($routes as [$method, $url]) {
			self::ensureKernelShutdown();
			$client = self::createClient(['environment' => 'test']);
			$client->request($method, $url);
			self::assertEquals(
				401,
				$client->getResponse()->getStatusCode(),
				sprintf('%s %s must require authentication', $method, $url)
			);
		}
	}

	/**
	 * A missing / empty file reference must fail gracefully (400 with a JSON
	 * error) rather than 500-ing out of an unchecked fopen or a null IRI
	 */
	public function testGetSourceWithoutFileFailsGracefully(): void
	{
		$client = $this->makeAuthenticatedClient();
		$client->request('GET', '/api/import/getSource');

		self::assertSame(400, $client->getResponse()->getStatusCode());
		self::assertStringContainsString('error', (string)$client->getResponse()->getContent());
	}
}
