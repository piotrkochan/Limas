<?php

namespace Limas\Command;

use Limas\Service\ExchangeRateService;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'limas:currency:refresh', description: 'Fetch the latest ECB exchange rates.')]
final class RefreshExchangeRatesCommand extends Command
{
	public function __construct(private readonly ExchangeRateService $rates) { parent::__construct(); }

	protected function execute(InputInterface $input, OutputInterface $output): int
	{
		$result = $this->rates->refresh();
		$output->writeln(sprintf('ECB rates for %s: %d currencies.', $result['date'], count($result['rates'])));
		return Command::SUCCESS;
	}
}
