<?php

namespace Limas\Entity;

use ApiPlatform\Metadata\ApiProperty;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Post;
use ApiPlatform\Metadata\Put;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Limas\Exceptions\PackagingUnitOutOfRangeException;
use Symfony\Component\Serializer\Attribute\Groups;


#[ORM\Entity]
#[ApiResource(
	operations: [
		new GetCollection,
		new Post,
		new Get,
		new Put,
		new Delete
	],
	normalizationContext: ['groups' => ['default']],
	denormalizationContext: ['groups' => ['default']]
)]
class PartDistributor
	extends BaseEntity
{
	#[ORM\ManyToOne(targetEntity: Part::class, inversedBy: 'distributors')]
	private ?Part $part;
	#[ORM\ManyToOne(targetEntity: Distributor::class)]
	#[Groups(['default'])]
	#[ApiProperty(readableLink: true, writableLink: true)]
	private ?Distributor $distributor;
	#[ORM\Column(type: Types::STRING, nullable: true)]
	#[Groups(['default'])]
	private ?string $orderNumber;
	#[ORM\Column(type: Types::INTEGER)]
	#[Groups(['default'])]
	private int $packagingUnit = 1;
	#[ORM\Column(type: Types::DECIMAL, precision: 13, scale: 4, nullable: true)]
	#[Groups(['default'])]
	private ?string $price;
	#[ORM\Column(type: Types::STRING, length: 3, nullable: true)]
	#[Groups(['default'])]
	private ?string $currency;
	#[ORM\Column(type: Types::STRING, nullable: true)]
	#[Groups(['default'])]
	private ?string $sku;
	/** @var list<array{quantity: int, price: string}>|null */
	#[ORM\Column(type: Types::JSON, nullable: true)]
	#[Groups(['default'])]
	private ?array $priceBreaks = null;
	#[ORM\Column(type: Types::BOOLEAN, nullable: true)]
	#[Groups(['default'])]
	private ?bool $ignoreForReports = false;


	public function isIgnoreForReports(): ?bool
	{
		return $this->ignoreForReports;
	}

	public function setIgnoreForReports(?bool $ignoreForReports): self
	{
		$this->ignoreForReports = $ignoreForReports;
		return $this;
	}

	public function getCurrency(): mixed
	{
		return $this->currency;
	}

	public function setCurrency(mixed $currency): self
	{
		$this->currency = $currency;
		return $this;
	}

	public function getPackagingUnit(): ?int
	{
		return $this->packagingUnit;
	}

	public function setPackagingUnit(int $packagingUnit): self
	{
		if ($packagingUnit < 1) {
			throw new PackagingUnitOutOfRangeException;
		}
		$this->packagingUnit = $packagingUnit;
		return $this;
	}

	public function getPart(): Part
	{
		return $this->part;
	}

	public function setPart(?Part $part): self
	{
		$this->part = $part;
		return $this;
	}

	public function getDistributor(): ?Distributor
	{
		return $this->distributor;
	}

	public function setDistributor(Distributor $distributor): self
	{
		$this->distributor = $distributor;
		return $this;
	}

	public function getOrderNumber(): ?string
	{
		return $this->orderNumber;
	}

	public function setOrderNumber(?string $orderNumber): self
	{
		$this->orderNumber = $orderNumber;
		return $this;
	}

	public function getPrice(): ?string
	{
		return $this->price;
	}

	public function setPrice(?string $price): self
	{
		$this->price = $price;
		return $this;
	}

	public function getSku(): ?string
	{
		return $this->sku;
	}

	public function setSku(?string $sku): self
	{
		$this->sku = $sku;
		return $this;
	}

	/** @return list<array{quantity: int, price: string}> */
	public function getPriceBreaks(): array
	{
		return $this->priceBreaks ?? [];
	}

	/** @param list<array{quantity: int|string, price: int|float|string}>|null $breaks */
	public function setPriceBreaks(?array $breaks): self
	{
		$normalized = [];
		foreach ($breaks ?? [] as $break) {
			$quantity = filter_var($break['quantity'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
			$price = $break['price'] ?? null;
			if (!is_int($quantity) || !is_numeric($price) || !is_finite((float)$price) || (float)$price < 0) {
				throw new \InvalidArgumentException('Price breaks require a positive quantity and non-negative price');
			}
			$normalized[$quantity] = ['quantity' => $quantity, 'price' => sprintf('%.8f', (float)$price)];
		}
		ksort($normalized, SORT_NUMERIC);
		$this->priceBreaks = array_values($normalized);
		return $this;
	}

	public function getIgnoreForReports(): ?bool
	{
		return $this->ignoreForReports;
	}
}
