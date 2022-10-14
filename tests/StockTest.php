<?php

namespace Limas\Tests;

use Doctrine\Common\DataFixtures\ReferenceRepository;
use Liip\FunctionalTestBundle\Test\WebTestCase;
use Liip\TestFixturesBundle\Services\DatabaseToolCollection;
use Limas\Entity\Part;
use Limas\Tests\DataFixtures\PartCategoryDataLoader;
use Limas\Tests\DataFixtures\PartDataLoader;
use Limas\Tests\DataFixtures\StorageLocationCategoryDataLoader;
use Limas\Tests\DataFixtures\StorageLocationDataLoader;
use Limas\Tests\DataFixtures\UserDataLoader;
use Nette\Utils\Json;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;


class StockTest
	extends WebTestCase
{
	protected ReferenceRepository $fixtures;
	protected KernelBrowser $testClient;


	protected function setUp(): void
	{
		parent::setUp();
		$this->fixtures = $this->getContainer()->get(DatabaseToolCollection::class)->get()->loadFixtures([
			UserDataLoader::class,
			StorageLocationCategoryDataLoader::class,
			StorageLocationDataLoader::class,
			PartCategoryDataLoader::class,
			PartDataLoader::class
		])->getReferenceRepository();
	}

	private function getStockLevel(Part $part)
	{
		$qb = $this->getContainer()->get('doctrine.orm.entity_manager')->createQueryBuilder();
		return $qb->select('p.stockLevel')
			->from(Part::class, 'p')
			->where($qb->expr()->eq('p.id', ':id'))
			->setParameter('id', $part->getId())
			->getQuery()->getSingleScalarResult();
	}

	public function testAddStock(): void
	{
		$client = $this->makeAuthenticatedClient();

		$part = $this->fixtures->getReference('part.1');
		$oldStockLevel = $this->getStockLevel($part);

		$client->request(
			'PUT',
			$this->getContainer()->get('api_platform.iri_converter')->getIriFromResource($part) . '/addStock',
			['quantity' => 5],
			[],
//			['CONTENT_TYPE' => 'application/json'],
			['CONTENT_TYPE' => 'application/x-www-form-urlencoded']
//			Json::encode(['quantity' => 5])
		);

		$result = Json::decode($client->getResponse()->getContent());
		$newStockLevel = $this->getStockLevel($part);

		self::assertEquals($oldStockLevel + 5, $newStockLevel);
		self::assertObjectHasAttribute('stockLevel', $result);
		self::assertEquals($newStockLevel, $result->stockLevel);
	}

	public function testRemoveStock(): void
	{
		$client = static::makeAuthenticatedClient();

		$part = $this->fixtures->getReference('part.1');
		$oldStockLevel = $this->getStockLevel($part);

		$client->request(
			'PUT',
			$this->getContainer()->get('api_platform.iri_converter')->getIriFromResource($part) . '/removeStock',
			['quantity' => 7],
			[],
//			['CONTENT_TYPE' => 'application/json'],
			['CONTENT_TYPE' => 'application/x-www-form-urlencoded']
//			Json::encode(['quantity' => 7])
		);

		$result = Json::decode($client->getResponse()->getContent());
		$newStockLevel = $this->getStockLevel($part);

		self::assertEquals($oldStockLevel - 7, $newStockLevel);
		self::assertObjectHasAttribute('stockLevel', $result);
		self::assertEquals($newStockLevel, $result->stockLevel);
	}

	public function testSetStock(): void
	{
		$client = static::makeAuthenticatedClient();

		$part = $this->fixtures->getReference('part.1');

		$client->request(
			'PUT',
			$this->getContainer()->get('api_platform.iri_converter')->getIriFromResource($part) . '/setStock',
			['quantity' => 33],
			[],
//			['CONTENT_TYPE' => 'application/json'],
			['CONTENT_TYPE' => 'application/x-www-form-urlencoded']
//			Json::encode(['quantity' => 33])
		);

		$result = Json::decode($client->getResponse()->getContent());
		$newStockLevel = $this->getStockLevel($part);

		self::assertEquals(33, $newStockLevel);
		self::assertObjectHasAttribute('stockLevel', $result);
		self::assertEquals($newStockLevel, $result->stockLevel);
	}
}
