<?php declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;


final class Version20260712074527
	extends AbstractMigration
{
	public function up(Schema $schema): void
	{
		$this->addSql('ALTER TABLE User ADD passwordChangedAt INT DEFAULT NULL');

		$this->addSql('CREATE INDEX idx_footprintcategory_categorypath ON FootprintCategory (categoryPath(191))');
		$this->addSql('CREATE INDEX idx_partcategory_categorypath ON PartCategory (categoryPath(191))');
		$this->addSql('CREATE INDEX idx_storagelocationcategory_categorypath ON StorageLocationCategory (categoryPath(191))');

		$this->addSql('CREATE INDEX idx_part_internalpartnumber ON Part (internalPartNumber(191))');
		$this->addSql('CREATE INDEX idx_partparameter_name_normalized ON PartParameter (name(191), normalizedValue)');
		$this->addSql('CREATE INDEX idx_partparameter_name_string ON PartParameter (name(191), stringValue(191))');
	}

	public function down(Schema $schema): void
	{
		$this->addSql('DROP INDEX idx_part_internalpartnumber ON Part');
		$this->addSql('DROP INDEX idx_partparameter_name_normalized ON PartParameter');
		$this->addSql('DROP INDEX idx_partparameter_name_string ON PartParameter');

		$this->addSql('DROP INDEX idx_footprintcategory_categorypath ON FootprintCategory');
		$this->addSql('DROP INDEX idx_partcategory_categorypath ON PartCategory');
		$this->addSql('DROP INDEX idx_storagelocationcategory_categorypath ON StorageLocationCategory');

		$this->addSql('ALTER TABLE User DROP passwordChangedAt');
	}

	public function isTransactional(): bool
	{
		return false;
	}
}
