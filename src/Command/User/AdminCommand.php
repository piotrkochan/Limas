<?php

namespace Limas\Command\User;

use Doctrine\ORM\EntityManagerInterface;
use Limas\Entity\User;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;


#[AsCommand(
	name: 'limas:user:admin',
	description: 'Grants (or revokes with --revoke) ROLE_ADMIN for a given user'
)]
class AdminCommand
	extends Command
{
	public function __construct(
		private readonly EntityManagerInterface $entityManager
	)
	{
		parent::__construct();
	}

	protected function configure(): void
	{
		$this
			->addArgument('username', InputArgument::REQUIRED, 'The username to grant/revoke admin for')
			->addOption('revoke', null, InputOption::VALUE_NONE, 'Revoke ROLE_ADMIN instead of granting it');
	}

	protected function execute(InputInterface $input, OutputInterface $output): int
	{
		$io = new SymfonyStyle($input, $output);

		$username = $input->getArgument('username');
		$user = $this->entityManager->getRepository(User::class)->findOneBy(['username' => $username]);
		if (null === $user) {
			$io->error(sprintf('User %s not found', $username));
			return Command::FAILURE;
		}

		$grant = !$input->getOption('revoke');
		$user->setAdmin($grant);
		$this->entityManager->flush();

		$io->success(sprintf(
			'User %s %s ROLE_ADMIN',
			$username,
			$grant ? 'granted' : 'revoked'
		));

		return Command::SUCCESS;
	}
}
