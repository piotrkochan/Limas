<?php

namespace Limas\Object;

use Nette\Utils\FileSystem;


class OperatingSystem
{
	/**
	 * Returns the platform name the system is running on
	 *
	 * Typical return values are: "Linux", "FreeBSD", "Darwin" (Mac OSX),
	 * "Windows NT". Uses php_uname() so it works everywhere without the
	 * posix extension.
	 */
	public function getPlatform(): string
	{
		$sysname = php_uname('s');
		return $sysname !== '' ? $sysname : 'unknown';
	}

	/**
	 * Returns the OS release / distribution
	 */
	public function getRelease(): string
	{
		return match (\PHP_OS_FAMILY) {
			'Darwin' => $this->getMacVersion(),
			'Linux' => $this->getLinuxDistribution(),
			// Windows / BSD / Solaris / unknown: php_uname('r') is the
			// kernel/OS release string (e.g. "10.0", "13.2-RELEASE", "5.11")
			default => $this->unameRelease(),
		};
	}

	/**
	 * Kernel/OS release string, with a safe fallback for the (unlikely)
	 * empty result
	 */
	private function unameRelease(): string
	{
		$release = php_uname('r');
		return $release !== '' ? $release : 'unknown';
	}

	/**
	 * Mac stores its version number in a public readable plist file (XML)
	 */
	private function getMacVersion(): string
	{
		$plist = '/System/Library/CoreServices/SystemVersion.plist';
		if (!is_readable($plist)) {
			return $this->unameRelease();
		}

		$document = new \DOMDocument;
		if (@$document->load($plist) === false) {
			return $this->unameRelease();
		}
		$xpath = new \DOMXPath($document);
		$entries = $xpath->query('/plist/dict/*');

		$previous = '';
		foreach ($entries === false ? [] : $entries as $entry) {
			if (str_contains($previous, 'ProductVersion')) {
				return $entry->textContent;
			}
			$previous = $entry->textContent;
		}

		return 'unknown';
	}

	/**
	 * Detects the Linux distribution from the freedesktop os-release file
	 * (PRETTY_NAME, falling back to NAME). This is the systemd-era standard
	 * present on essentially every current distro — no external process, so
	 * no `lsb_release` shell-out (which triggered a static-analysis flag and
	 * leaked a "command not found" line to stderr when the tool was absent).
	 */
	public function getLinuxDistribution(): string
	{
		$name = '';
		$globbed = glob('/etc/*-release');
		$candidates = array_merge($globbed === false ? [] : $globbed, ['/usr/lib/os-release']);
		foreach ($candidates as $file) {
			if (!is_readable($file)) {
				continue;
			}
			foreach (FileSystem::readLines($file) as $line) {
				$kv = explode('=', $line);
				if (count($kv) !== 2) {
					continue;
				}
				$key = trim($kv[0]);
				$value = trim(str_replace(['"', "'"], '', $kv[1]));
				if ($key === 'PRETTY_NAME' && $value !== '') {
					return $value;
				}
				if ($name === '' && $key === 'NAME') {
					$name = $value;
				}
			}
		}

		return $name !== '' ? $name : 'unknown';
	}
}
