<?php

namespace Limas\Service;

use Doctrine\ORM\EntityManagerInterface;
use Limas\Entity\Manufacturer;
use Limas\Entity\ManufacturerAlias;
use Limas\Entity\PartManufacturer;


/**
 * Maps free-form manufacturer name strings returned by info providers to the
 * canonical Limas Manufacturer entity. Lookups go via ManufacturerAlias
 * (aliasNormalized has UNIQUE index, so they are O(1)).
 *
 * Four-step resolve (mirrors FootprintCanonicalizer):
 *  1. ManufacturerAlias by aliasNormalized — if matched and `manufacturer` is
 *     set, bump usageCount and return it; if alias exists but manufacturer is
 *     null (pending admin verification), still bump usage but return null
 *  2. Fallback: direct case-insensitive name match on Manufacturer.name — if
 *     matched, auto-register a verified alias for next time
 *  3. Auto-create an unverified alias with manufacturer=NULL so the admin grid
 *     surfaces it (sorted by usageCount) for human triage
 *  4. Return null — caller (importer) creates a new Manufacturer and assigns
 *     it to the pending alias
 */
class ManufacturerCanonicalizer
{
	/**
	 * Per-request memo of resolved canonical manufacturers, keyed by the
	 * normalized name. Only SUCCESSFUL (non-null) resolutions are cached:
	 * an aggregator search/import fans out many candidates sharing the same
	 * manufacturer, and without this each repeat did a fresh alias lookup +
	 * a full em->flush() (usageCount bump). Misses are deliberately NOT
	 * cached — the importer creates a Manufacturer + registerAlias() on a
	 * miss, and a stale null would make the next candidate create a DUPLICATE
	 * manufacturer. registerAlias()/mergeInto() keep this map coherent.
	 *
	 * @var array<string, Manufacturer>
	 */
	private array $memo = [];


	public function __construct(
		private readonly EntityManagerInterface $em
	)
	{
	}

	public function canonicalize(string $rawName): ?Manufacturer
	{
		$key = self::normalize($rawName);
		if ($key === '') {
			return null;
		}

		if (isset($this->memo[$key])) {
			// Already resolved this request — no query, no flush. The first
			// resolution already bumped usageCount once for this request.
			return $this->memo[$key];
		}

		// 1) alias lookup
		$alias = $this->em->getRepository(ManufacturerAlias::class)
			->findOneBy(['aliasNormalized' => $key]);
		if ($alias !== null) {
			$alias->incrementUsageCount();
			$this->em->flush();
			// Alias hit but manufacturer not assigned yet → admin must verify;
			// canonicalize stays a miss from the caller's perspective
			$manufacturer = $alias->getManufacturer();
			if ($manufacturer !== null) {
				$this->memo[$key] = $manufacturer;
			}
			return $manufacturer;
		}

		// 2) direct name match → register a verified alias for next time
		$direct = $this->em->createQueryBuilder()
			->select('m')
			->from(Manufacturer::class, 'm')
			->where('LOWER(m.name) = :key')
			->setParameter('key', $key)
			->setMaxResults(1)
			->getQuery()
			->getOneOrNullResult();
		if ($direct instanceof Manufacturer) {
			$this->registerAliasInternal($rawName, $key, $direct, ManufacturerAlias::SOURCE_AUTO, verified: true);
			$this->memo[$key] = $direct;
			return $direct;
		}

		// 3) auto-create unverified, manufacturer=NULL — surfaces in admin grid
		$this->registerAliasInternal($rawName, $key, null, ManufacturerAlias::SOURCE_AUTO, verified: false);
		return null;
	}

	/**
	 * Register `$rawAlias` as another spelling of `$manufacturer` from external
	 * code (admin UI or import tools). Idempotent; throws on conflict with a
	 * different manufacturer
	 */
	public function registerAlias(Manufacturer $manufacturer, string $rawAlias): ManufacturerAlias
	{
		$normalized = self::normalize($rawAlias);
		if ($normalized === '') {
			throw new \InvalidArgumentException('Cannot register an empty alias.');
		}

		$existing = $this->em->getRepository(ManufacturerAlias::class)
			->findOneBy(['aliasNormalized' => $normalized]);

		if ($existing !== null) {
			if ($existing->getManufacturer() === null) {
				// Pending alias — assign the manufacturer, mark verified
				$existing->setManufacturer($manufacturer);
				$existing->setVerified(true);
				$this->em->flush();
				// Keep the resolve memo coherent: the importer's miss→create→registerAlias flow now resolves this key on the next candidate
				$this->memo[$normalized] = $manufacturer;
				return $existing;
			}
			if ($existing->getManufacturer()->getId() !== $manufacturer->getId()) {
				throw new \RuntimeException(sprintf(
					'Alias "%s" already maps to a different manufacturer (#%d "%s") — cannot reassign to #%d "%s"',
					$normalized,
					$existing->getManufacturer()->getId() ?? 0,
					$existing->getManufacturer()->getName(),
					$manufacturer->getId() ?? 0,
					$manufacturer->getName()
				));
			}
			$this->memo[$normalized] = $manufacturer;
			return $existing;
		}

		$this->memo[$normalized] = $manufacturer;
		return $this->registerAliasInternal($rawAlias, $normalized, $manufacturer, ManufacturerAlias::SOURCE_USER, verified: true);
	}

	/**
	 * Merge `$source` into `$target`:
	 *   - reassign every PartManufacturer.manufacturer FK from source → target
	 *   - reassign every existing ManufacturerAlias pointing at source → target
	 *     (with conflict resolution if the same normalized alias already maps
	 *     to target — bump usage, drop the dupe)
	 *   - record source's own name as a verified alias of target (so future
	 *     imports of source's spelling resolve to target automatically)
	 *   - delete source
	 *
	 * Returns the number of PartManufacturer rows reassigned, for the UX
	 * confirmation toast.
	 */
	public function mergeInto(Manufacturer $source, Manufacturer $target): int
	{
		if ($source->getId() === $target->getId()) {
			throw new \InvalidArgumentException('Cannot merge a manufacturer into itself.');
		}

		$conn = $this->em->getConnection();
		$conn->beginTransaction();
		try {
			$reassigned = $this->em->createQueryBuilder()
				->update(PartManufacturer::class, 'pm')
				->set('pm.manufacturer', ':target')
				->where('pm.manufacturer = :source')
				->setParameter('target', $target)
				->setParameter('source', $source)
				->getQuery()
				->execute();

			// Migrate existing aliases pointing at source → target
			$sourceAliases = $this->em->getRepository(ManufacturerAlias::class)
				->findBy(['manufacturer' => $source]);
			foreach ($sourceAliases as $alias) {
				$existing = $this->em->getRepository(ManufacturerAlias::class)
					->findOneBy(['aliasNormalized' => $alias->getAliasNormalized()]);
				if ($existing !== null && $existing !== $alias && $existing->getManufacturer()?->getId() === $target->getId()) {
					// Same normalized key already maps to target — keep that one,
					// drop the dupe coming from source
					$existing->incrementUsageCount();
					$this->em->remove($alias);
					continue;
				}
				$alias->setManufacturer($target);
				$alias->setVerified(true);
			}

			// Cache source's own name as an alias of target — future imports
			// of "Bivar Inc." spelling resolve directly to "Bivar"
			$sourceName = (string)$source->getName();
			$sourceKey = self::normalize($sourceName);
			if ($sourceKey !== '') {
				$existing = $this->em->getRepository(ManufacturerAlias::class)
					->findOneBy(['aliasNormalized' => $sourceKey]);
				if ($existing === null) {
					$this->registerAliasInternal($sourceName, $sourceKey, $target, ManufacturerAlias::SOURCE_USER, verified: true);
				} elseif ($existing->getManufacturer() === null) {
					$existing->setManufacturer($target);
					$existing->setVerified(true);
				} elseif ($existing->getManufacturer()->getId() !== $target->getId()) {
					$existing->setManufacturer($target);
					$existing->setVerified(true);
				}
			}

			$this->em->remove($source);
			$this->em->flush();
			$conn->commit();
			// A merge remaps source's spellings onto target — drop the resolve memo so no stale source→Manufacturer mapping survives
			$this->memo = [];
			return $reassigned;
		} catch (\Throwable $e) {
			$conn->rollBack();
			throw $e;
		}
	}

	private function registerAliasInternal(string $alias, string $normalized, ?Manufacturer $manufacturer, string $source, bool $verified): ManufacturerAlias
	{
		$entity = new ManufacturerAlias($alias, $normalized, $manufacturer);
		$entity->setSource($source);
		$entity->setVerified($verified);
		$entity->incrementUsageCount();
		try {
			$this->em->persist($entity);
			$this->em->flush();
		} catch (\Throwable) {
			// Race: another request inserted the same normalized form.
			// Re-fetch and bump usage instead.
			$existing = $this->em->getRepository(ManufacturerAlias::class)
				->findOneBy(['aliasNormalized' => $normalized]);
			if ($existing !== null) {
				$existing->incrementUsageCount();
				$this->em->flush();
				return $existing;
			}
			throw new \RuntimeException('ManufacturerAlias insert race could not be resolved');
		}
		return $entity;
	}

	/**
	 * Deterministic normalisation:
	 *   - trim
	 *   - collapse runs of whitespace to single space
	 *   - lowercase
	 *   - strip trailing corporate suffixes (Inc, Ltd, GmbH, …) so e.g.
	 *     "Bivar" / "Bivar Inc." / "Bivar Inc" all collapse to one key
	 * Static so the InfoProviderMerger can use it as a fallback grouping key
	 * without depending on the entity manager
	 */
	public static function normalize(string $name): string
	{
		$collapsed = preg_replace('/\s+/u', ' ', trim($name));
		$lower = mb_strtolower($collapsed ?? $name);
		return self::stripCorporateSuffixes($lower);
	}

	/**
	 * Repeatedly strips trailing corporate-form suffixes so chained forms
	 * like "Samsung Electronics Co., Ltd." collapse all the way down to
	 * "samsung electronics". Requires whitespace or comma before the suffix
	 * and anchors to end-of-string, so legitimate names containing these
	 * substrings inside a word ("Coca-Cola") and MPN tokens never false-
	 * positive
	 */
	private static function stripCorporateSuffixes(string $name): string
	{
		static $pattern = '/[\s,]+(?:inc|incorporated|llc|l\.l\.c\.|ltd|limited|corp|corporation|company|co|gmbh|mbh|ag|kg|kgaa|ab|bv|b\.v\.|nv|n\.v\.|sa|s\.a\.|spa|s\.p\.a\.|sl|s\.l\.|plc|p\.l\.c\.)\.?\s*$/iu';
		while (true) {
			$stripped = preg_replace($pattern, '', $name) ?? $name;
			if ($stripped === $name || $stripped === '') {
				break;
			}
			$name = $stripped;
		}
		return $name;
	}
}
