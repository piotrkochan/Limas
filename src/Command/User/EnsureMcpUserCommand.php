<?php

namespace Limas\Command\User;

use Doctrine\ORM\EntityManagerInterface;
use Limas\Entity\User;
use Limas\Service\UserService;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

#[AsCommand(name: 'limas:user:ensure-mcp', description: 'Ensure dedicated ROLE_USER for the MCP gateway')]
final class EnsureMcpUserCommand extends Command
{
	public function __construct(
		private readonly EntityManagerInterface $em,
		private readonly UserService $users,
		private readonly UserPasswordHasherInterface $hasher
	) { parent::__construct(); }

	protected function execute(InputInterface $input, OutputInterface $output): int
	{
		$password = getenv('LIMAS_MCP_PASSWORD');
		if (!is_string($password) || strlen($password) < 32) {
			$output->writeln('<error>LIMAS_MCP_PASSWORD must contain at least 32 characters</error>');
			return Command::FAILURE;
		}
		$repo = $this->em->getRepository(User::class);
		$user = $repo->findOneBy(['username' => 'limas-mcp']);
		if ($user === null) {
			$user = (new User('limas-mcp', $this->users->getBuiltinProvider()))
				->setEmail('limas-mcp@inter.dc7.pl')->setRoles(['ROLE_USER']);
			$this->em->persist($user);
		}
		if (!$this->hasher->isPasswordValid($user, $password)) {
			$user->setPassword($this->hasher->hashPassword($user, $password));
		}
		$user->setRoles(['ROLE_USER']);
		$this->em->flush();
		$output->writeln('MCP user ready');
		return Command::SUCCESS;
	}
}
