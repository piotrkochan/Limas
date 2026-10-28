<?php declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261025000100 extends AbstractMigration
{
	public function up(Schema $schema): void
	{
		$this->addSql('ALTER TABLE BulkImportJob ADD project_id INT DEFAULT NULL, ADD INDEX IDX_BULK_IMPORT_PROJECT (project_id)');
		$this->addSql('ALTER TABLE BulkImportJob ADD CONSTRAINT FK_BULK_IMPORT_PROJECT FOREIGN KEY (project_id) REFERENCES Project (id) ON DELETE SET NULL');
		$this->addSql('ALTER TABLE BulkImportJobItem ADD rawLcsc VARCHAR(64) DEFAULT NULL, ADD rawDesignators LONGTEXT DEFAULT NULL, ADD rawComment LONGTEXT DEFAULT NULL, ADD rawFootprint VARCHAR(255) DEFAULT NULL, ADD projectDecision VARCHAR(20) DEFAULT NULL');
		$this->addSql('ALTER TABLE ProjectPart MODIFY remarks LONGTEXT DEFAULT NULL');
	}

	public function down(Schema $schema): void
	{
		$this->addSql('ALTER TABLE BulkImportJob DROP FOREIGN KEY FK_BULK_IMPORT_PROJECT');
		$this->addSql('ALTER TABLE BulkImportJob DROP INDEX IDX_BULK_IMPORT_PROJECT, DROP project_id');
		$this->addSql('ALTER TABLE BulkImportJobItem DROP rawLcsc, DROP rawDesignators, DROP rawComment, DROP rawFootprint, DROP projectDecision');
		$this->addSql('ALTER TABLE ProjectPart MODIFY remarks VARCHAR(255) DEFAULT NULL');
	}

	public function isTransactional(): bool
	{
		return false;
	}
}
