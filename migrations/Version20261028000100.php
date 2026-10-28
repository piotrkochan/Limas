<?php declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261028000100 extends AbstractMigration
{
	public function up(Schema $schema): void
	{
		// The import migration used a readable index name, while Doctrine's
		// mapping expects the generated name. Production may already have been
		// repaired with schema:update, so this migration must be repeatable.
		if ($this->hasIndex('IDX_BULK_IMPORT_PROJECT')) {
			$this->addSql('ALTER TABLE BulkImportJob RENAME INDEX IDX_BULK_IMPORT_PROJECT TO IDX_6A0BF902166D1F9C');
		}
	}

	public function down(Schema $schema): void
	{
		if ($this->hasIndex('IDX_6A0BF902166D1F9C')) {
			$this->addSql('ALTER TABLE BulkImportJob RENAME INDEX IDX_6A0BF902166D1F9C TO IDX_BULK_IMPORT_PROJECT');
		}
	}

	private function hasIndex(string $name): bool
	{
		return (bool) $this->connection->fetchOne(
			'SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1',
			['BulkImportJob', $name]
		);
	}

	public function isTransactional(): bool
	{
		return false;
	}
}
