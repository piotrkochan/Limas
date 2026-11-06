<?php declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261106000400 extends AbstractMigration
{
	public function up(Schema $schema): void
	{
		$this->addSql('ALTER TABLE PartDistributor ADD rohsStatus VARCHAR(32) DEFAULT NULL, ADD assemblyClass VARCHAR(32) DEFAULT NULL');
	}

	public function down(Schema $schema): void
	{
		$this->addSql('ALTER TABLE PartDistributor DROP rohsStatus, DROP assemblyClass');
	}

	public function isTransactional(): bool
	{
		return false;
	}
}
