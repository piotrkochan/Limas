<?php declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261106000100 extends AbstractMigration
{
	public function up(Schema $schema): void
	{
		$this->addSql('ALTER TABLE PartCategory ADD color VARCHAR(7) DEFAULT NULL');
	}

	public function down(Schema $schema): void
	{
		$this->addSql('ALTER TABLE PartCategory DROP color');
	}
}
