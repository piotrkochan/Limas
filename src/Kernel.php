<?php

namespace Limas;

use Symfony\Bundle\FrameworkBundle\Kernel\MicroKernelTrait;
use Symfony\Component\HttpKernel\Kernel as BaseKernel;

class Kernel extends BaseKernel
{
	use MicroKernelTrait;


	public function boot(): void
	{
		parent::boot();

		// Fail-closed in production: refuse to SERVE (web / php-fpm) with an
		// empty or trivially-guessable secret. CLI is exempt so setup/fix-up
		// commands (generate keys, clear cache, set the secret) still run;
		// dev/test are exempt entirely (debug is on there).
		if (!$this->isDebug() && !\in_array(\PHP_SAPI, ['cli', 'phpdbg'], true)) {
			$this->assertStrongSecrets();
		}
	}

	/**
	 * @throws \RuntimeException when APP_SECRET / JWT_PASSPHRASE are weak in prod
	 */
	private function assertStrongSecrets(): void
	{
		$problems = [];

		// Read from the environment rather than the kernel.secret parameter:
		// Symfony already throws EmptyParameterValueException for an empty
		// APP_SECRET in prod, but that only catches empty — this also rejects
		// short/junk values, with a clearer message
		$appSecret = (string)($_SERVER['APP_SECRET'] ?? $_ENV['APP_SECRET'] ?? '');
		if (strlen($appSecret) < 16) {
			$problems[] = 'APP_SECRET is empty or too short — set a long random value';
		}

		$jwtPassphrase = (string)($_SERVER['JWT_PASSPHRASE'] ?? $_ENV['JWT_PASSPHRASE'] ?? '');
		if ($jwtPassphrase === '' || $jwtPassphrase === 'passphrase') {
			$problems[] = 'JWT_PASSPHRASE is empty or the shipped default — regenerate the keypair with a strong passphrase';
		}

		if ($problems !== []) {
			throw new \RuntimeException(sprintf(
				'Refusing to boot in production with weak secrets: %s. Set them in .env.local or the real environment.',
				implode('; ', $problems)
			));
		}
	}

	/**
	 * @return list<string> An array of allowed values for APP_ENV
	 */
	private function getAllowedEnvs(): array
	{
		return ['prod', 'dev', 'test'];
	}
}
