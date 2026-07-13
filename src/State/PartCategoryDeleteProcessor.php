<?php

namespace Limas\State;

use ApiPlatform\Doctrine\Common\State\RemoveProcessor;
use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use Doctrine\ORM\EntityManagerInterface;
use Limas\Entity\Part;
use Limas\Entity\PartCategory;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;


/**
 * DELETE /api/part_categories/{id} refuses to proceed when the category
 * — or any of its descendants — still has Parts attached. Without this
 * check the raw MySQL FK on Part.category triggers a 500 with no
 * actionable message; here we return a 409 with a friendly summary of
 * how many parts are in the way so the admin can move or delete them
 * first
 */
final readonly class PartCategoryDeleteProcessor
	implements ProcessorInterface
{
	public function __construct(
		private RemoveProcessor        $innerProcessor,
		private EntityManagerInterface $em
	)
	{
	}

	public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): mixed
	{
		if ($data instanceof PartCategory) {
			$partCount = $this->countPartsInSubtree($data);
			if ($partCount > 0) {
				throw new ConflictHttpException(sprintf(
					'Cannot delete category "%s" — %d part(s) are attached to it or one of its subcategories. Move or delete them first.',
					$data->getName(),
					$partCount
				));
			}
		}
		$this->innerProcessor->process($data, $operation, $uriVariables, $context);
		return null;
	}

	/**
	 * Counts Parts whose category is `$root` OR any descendant of `$root`,
	 * using the Gedmo nested-set lft/rgt bounds of the tree
	 */
	private function countPartsInSubtree(PartCategory $root): int
	{
		return (int)$this->em->createQueryBuilder()
			->select('COUNT(p.id)')
			->from(Part::class, 'p')
			->join('p.category', 'c')
			->where('c.lft >= :lft')
			->andWhere('c.rgt <= :rgt')
			->setParameter('lft', $root->getLeftValue())
			->setParameter('rgt', $root->getRightValue())
			->getQuery()
			->getSingleScalarResult();
	}
}
