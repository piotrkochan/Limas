<?php declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261106000200 extends AbstractMigration
{
	public function up(Schema $schema): void
	{
		$this->addSql('ALTER TABLE Part ADD catalogPackage VARCHAR(255) DEFAULT NULL');
	}

	public function down(Schema $schema): void
	{
		$this->addSql('ALTER TABLE Part DROP catalogPackage');
	}

	public function isTransactional(): bool
	{
		return false;
	}
}
