<?php declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261106000300 extends AbstractMigration
{
	public function up(Schema $schema): void
	{
		$this->addSql('ALTER TABLE BulkImportJob ADD projectBomQuantity TINYINT(1) NOT NULL DEFAULT 1, ADD projectStockQuantity TINYINT(1) NOT NULL DEFAULT 0');
	}

	public function down(Schema $schema): void
	{
		$this->addSql('ALTER TABLE BulkImportJob DROP projectBomQuantity, DROP projectStockQuantity');
	}

	public function isTransactional(): bool
	{
		return false;
	}
}
