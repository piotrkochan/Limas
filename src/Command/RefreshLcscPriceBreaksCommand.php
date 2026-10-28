<?php

namespace Limas\Command;

use Doctrine\ORM\EntityManagerInterface;
use Limas\Entity\PartDistributor;
use Limas\Service\Integration\InfoProvider\LcscPartResolver;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'limas:prices:refresh-lcsc', description: 'Refresh LCSC price breaks on existing part distributors')]
final class RefreshLcscPriceBreaksCommand extends Command
{
	public function __construct(
		private readonly EntityManagerInterface $em,
		private readonly LcscPartResolver $resolver
	) {
		parent::__construct();
	}

	protected function configure(): void
	{
		$this->addOption('limit', null, InputOption::VALUE_REQUIRED, 'Maximum distinct LCSC IDs to refresh', '0');
	}

	protected function execute(InputInterface $input, OutputInterface $output): int
	{
		$limit = max(0, (int)$input->getOption('limit'));
		$rows = $this->em->createQueryBuilder()
			->select('pd')
			->from(PartDistributor::class, 'pd')
			->join('pd.distributor', 'd')
			->where('LOWER(d.name) = :name')
			->setParameter('name', 'lcsc')
			->getQuery()->getResult();
		$codes = [];
		foreach ($rows as $row) {
			$code = strtoupper(trim((string)($row->getSku() ?: $row->getOrderNumber())));
			if (preg_match('/^C[1-9][0-9]*$/', $code)) {
				$codes[$code] = true;
			}
		}
		$updated = 0;
		$failed = 0;
		foreach ($codes as $code => $_) {
			if ($limit > 0 && $updated + $failed >= $limit) break;
			try {
				$this->resolver->refreshPrices($code);
				$this->em->flush();
				$updated++;
			} catch (\Throwable $error) {
				$output->writeln(sprintf('<error>%s: %s</error>', $code, $error->getMessage()));
				$failed++;
			}
		}
		$output->writeln(sprintf('LCSC IDs refreshed: %d; failed: %d', $updated, $failed));
		return $failed === 0 ? Command::SUCCESS : Command::FAILURE;
	}
}
