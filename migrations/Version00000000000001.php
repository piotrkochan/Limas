<?php declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;
use Limas\Entity\FootprintCategory;
use Limas\Entity\PartCategory;
use Limas\Entity\PartMeasurementUnit;
use Limas\Entity\SiPrefix;
use Limas\Entity\StorageLocationCategory;
use Limas\Entity\Unit;
use Limas\Entity\UserProvider;
use Limas\Service\UserService;
use Symfony\Component\DependencyInjection\ContainerAwareInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;


final class Version00000000000001
	extends AbstractMigration
	implements ContainerAwareInterface
{
	private ContainerInterface $container;


	public function getDescription(): string
	{
		return 'Create tables';
	}

	public function up(Schema $schema): void
	{
		$this->addSql('CREATE TABLE BatchJob (id INT AUTO_INCREMENT NOT NULL, name VARCHAR(64) NOT NULL, baseEntity VARCHAR(255) NOT NULL, UNIQUE INDEX UNIQ_AF3CBF045E237E06 (name), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE BatchJobQueryField (id INT AUTO_INCREMENT NOT NULL, property VARCHAR(255) NOT NULL, operator VARCHAR(64) NOT NULL, value LONGTEXT NOT NULL, description LONGTEXT NOT NULL, dynamic TINYINT(1) NOT NULL, batchJob_id INT DEFAULT NULL, INDEX IDX_6118E78CABE62C64 (batchJob_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE BatchJobUpdateField (id INT AUTO_INCREMENT NOT NULL, property VARCHAR(255) NOT NULL, value LONGTEXT NOT NULL, description LONGTEXT NOT NULL, dynamic TINYINT(1) NOT NULL, batchJob_id INT DEFAULT NULL, INDEX IDX_E1ADA7DFABE62C64 (batchJob_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE CachedImage (id INT AUTO_INCREMENT NOT NULL, originalId INT NOT NULL, originalType VARCHAR(255) NOT NULL, cacheFile VARCHAR(255) NOT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE CronLogger (id INT AUTO_INCREMENT NOT NULL, lastRunDate DATETIME NOT NULL, cronjob VARCHAR(255) NOT NULL, UNIQUE INDEX UNIQ_B4000D4FA5DA7C8A (cronjob), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE Distributor (id INT AUTO_INCREMENT NOT NULL, name VARCHAR(255) NOT NULL, address LONGTEXT DEFAULT NULL, url VARCHAR(255) DEFAULT NULL, phone VARCHAR(255) DEFAULT NULL, fax VARCHAR(255) DEFAULT NULL, email VARCHAR(255) DEFAULT NULL, comment LONGTEXT DEFAULT NULL, skuurl VARCHAR(255) DEFAULT NULL, enabledForReports TINYINT(1) DEFAULT 0 NOT NULL, UNIQUE INDEX UNIQ_2559D8A65E237E06 (name), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE Footprint (id INT AUTO_INCREMENT NOT NULL, category_id INT DEFAULT NULL, name VARCHAR(64) NOT NULL, description LONGTEXT DEFAULT NULL, UNIQUE INDEX UNIQ_7CF324945E237E06 (name), INDEX IDX_7CF3249412469DE2 (category_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE FootprintAttachment (id INT AUTO_INCREMENT NOT NULL, footprint_id INT DEFAULT NULL, type VARCHAR(255) NOT NULL, filename VARCHAR(255) NOT NULL, originalname VARCHAR(255) DEFAULT NULL, mimetype VARCHAR(255) NOT NULL, size INT NOT NULL, extension VARCHAR(255) DEFAULT NULL, description LONGTEXT DEFAULT NULL, created DATETIME NOT NULL, INDEX IDX_7B7388A151364C98 (footprint_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE FootprintCategory (id INT AUTO_INCREMENT NOT NULL, parent_id INT DEFAULT NULL, lft INT NOT NULL, rgt INT NOT NULL, lvl INT NOT NULL, root INT DEFAULT NULL, name VARCHAR(128) NOT NULL, description LONGTEXT DEFAULT NULL, categoryPath LONGTEXT DEFAULT NULL, INDEX IDX_C026BA6A727ACA70 (parent_id), INDEX IDX_C026BA6ADA439252 (lft), INDEX IDX_C026BA6AD5E02D69 (rgt), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE FootprintImage (id INT AUTO_INCREMENT NOT NULL, footprint_id INT DEFAULT NULL, type VARCHAR(255) NOT NULL, filename VARCHAR(255) NOT NULL, originalname VARCHAR(255) DEFAULT NULL, mimetype VARCHAR(255) NOT NULL, size INT NOT NULL, extension VARCHAR(255) DEFAULT NULL, description LONGTEXT DEFAULT NULL, created DATETIME NOT NULL, UNIQUE INDEX UNIQ_3B22699151364C98 (footprint_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE GridPreset (id INT AUTO_INCREMENT NOT NULL, grid VARCHAR(255) NOT NULL, name VARCHAR(255) NOT NULL, configuration LONGTEXT NOT NULL, gridDefault TINYINT(1) NOT NULL, UNIQUE INDEX name_grid_unique (grid, name), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE ImportPreset (id INT AUTO_INCREMENT NOT NULL, baseEntity VARCHAR(255) NOT NULL, name VARCHAR(255) NOT NULL, configuration LONGTEXT NOT NULL, UNIQUE INDEX name_entity_unique (baseEntity, name), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE Manufacturer (id INT AUTO_INCREMENT NOT NULL, name VARCHAR(255) NOT NULL, address LONGTEXT DEFAULT NULL, url VARCHAR(255) DEFAULT NULL, email VARCHAR(255) DEFAULT NULL, comment LONGTEXT DEFAULT NULL, phone VARCHAR(255) DEFAULT NULL, fax VARCHAR(255) DEFAULT NULL, UNIQUE INDEX UNIQ_253B3D245E237E06 (name), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE ManufacturerICLogo (id INT AUTO_INCREMENT NOT NULL, manufacturer_id INT DEFAULT NULL, type VARCHAR(255) NOT NULL, filename VARCHAR(255) NOT NULL, originalname VARCHAR(255) DEFAULT NULL, mimetype VARCHAR(255) NOT NULL, size INT NOT NULL, extension VARCHAR(255) DEFAULT NULL, description LONGTEXT DEFAULT NULL, created DATETIME NOT NULL, INDEX IDX_3F1EF213A23B42D (manufacturer_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE MetaPartParameterCriteria (id INT AUTO_INCREMENT NOT NULL, part_id INT DEFAULT NULL, unit_id INT DEFAULT NULL, partParameterName VARCHAR(255) NOT NULL, operator VARCHAR(255) NOT NULL, value DOUBLE PRECISION DEFAULT NULL, normalizedValue DOUBLE PRECISION DEFAULT NULL, stringValue VARCHAR(255) NOT NULL, valueType VARCHAR(255) NOT NULL, siPrefix_id INT DEFAULT NULL, INDEX IDX_6EE1D3924CE34BEC (part_id), INDEX IDX_6EE1D39219187357 (siPrefix_id), INDEX IDX_6EE1D392F8BD700D (unit_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE Part (id INT AUTO_INCREMENT NOT NULL, category_id INT DEFAULT NULL, footprint_id INT DEFAULT NULL, name VARCHAR(255) NOT NULL, description VARCHAR(255) DEFAULT NULL, comment LONGTEXT NOT NULL, stockLevel INT NOT NULL, minStockLevel INT NOT NULL, averagePrice NUMERIC(13, 4) NOT NULL, status VARCHAR(255) DEFAULT NULL, needsReview TINYINT(1) NOT NULL, partCondition VARCHAR(255) DEFAULT NULL, productionRemarks VARCHAR(255) DEFAULT NULL, createDate DATETIME DEFAULT NULL, internalPartNumber VARCHAR(255) DEFAULT NULL, removals TINYINT(1) NOT NULL, lowStock TINYINT(1) NOT NULL, metaPart TINYINT(1) DEFAULT 0 NOT NULL, partUnit_id INT DEFAULT NULL, storageLocation_id INT DEFAULT NULL, INDEX IDX_E93DDFF812469DE2 (category_id), INDEX IDX_E93DDFF851364C98 (footprint_id), INDEX IDX_E93DDFF8F7A36E87 (partUnit_id), INDEX IDX_E93DDFF873CD58AF (storageLocation_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE PartAttachment (id INT AUTO_INCREMENT NOT NULL, part_id INT DEFAULT NULL, type VARCHAR(255) NOT NULL, filename VARCHAR(255) NOT NULL, originalname VARCHAR(255) DEFAULT NULL, mimetype VARCHAR(255) NOT NULL, size INT NOT NULL, extension VARCHAR(255) DEFAULT NULL, description LONGTEXT DEFAULT NULL, created DATETIME NOT NULL, isImage TINYINT(1) DEFAULT NULL, INDEX IDX_76D73D864CE34BEC (part_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE PartCategory (id INT AUTO_INCREMENT NOT NULL, parent_id INT DEFAULT NULL, lft INT NOT NULL, rgt INT NOT NULL, lvl INT NOT NULL, root INT DEFAULT NULL, name VARCHAR(128) NOT NULL, description LONGTEXT DEFAULT NULL, categoryPath LONGTEXT DEFAULT NULL, INDEX IDX_131FB619727ACA70 (parent_id), INDEX IDX_131FB619DA439252 (lft), INDEX IDX_131FB619D5E02D69 (rgt), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE PartDistributor (id INT AUTO_INCREMENT NOT NULL, part_id INT DEFAULT NULL, distributor_id INT DEFAULT NULL, orderNumber VARCHAR(255) DEFAULT NULL, packagingUnit INT NOT NULL, price NUMERIC(13, 4) DEFAULT NULL, currency VARCHAR(3) DEFAULT NULL, sku VARCHAR(255) DEFAULT NULL, ignoreForReports TINYINT(1) DEFAULT NULL, INDEX IDX_FBA293844CE34BEC (part_id), INDEX IDX_FBA293842D863A58 (distributor_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE PartManufacturer (id INT AUTO_INCREMENT NOT NULL, part_id INT DEFAULT NULL, manufacturer_id INT DEFAULT NULL, partNumber VARCHAR(255) DEFAULT NULL, INDEX IDX_F085878B4CE34BEC (part_id), INDEX IDX_F085878BA23B42D (manufacturer_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE PartMeasurementUnit (id INT AUTO_INCREMENT NOT NULL, name VARCHAR(255) NOT NULL, shortName VARCHAR(255) NOT NULL, is_default TINYINT(1) NOT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE PartParameter (id INT AUTO_INCREMENT NOT NULL, part_id INT DEFAULT NULL, unit_id INT DEFAULT NULL, name VARCHAR(255) NOT NULL, description VARCHAR(255) NOT NULL, value DOUBLE PRECISION DEFAULT NULL, normalizedValue DOUBLE PRECISION DEFAULT NULL, maximumValue DOUBLE PRECISION DEFAULT NULL, normalizedMaxValue DOUBLE PRECISION DEFAULT NULL, minimumValue DOUBLE PRECISION DEFAULT NULL, normalizedMinValue DOUBLE PRECISION DEFAULT NULL, stringValue VARCHAR(255) NOT NULL, valueType VARCHAR(255) NOT NULL, siPrefix_id INT DEFAULT NULL, minSiPrefix_id INT DEFAULT NULL, maxSiPrefix_id INT DEFAULT NULL, INDEX IDX_A28A98594CE34BEC (part_id), INDEX IDX_A28A9859F8BD700D (unit_id), INDEX IDX_A28A985919187357 (siPrefix_id), INDEX IDX_A28A9859569AA479 (minSiPrefix_id), INDEX IDX_A28A9859EFBC3F08 (maxSiPrefix_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE Project (id INT AUTO_INCREMENT NOT NULL, user_id INT DEFAULT NULL, name VARCHAR(255) NOT NULL, description VARCHAR(255) DEFAULT NULL, INDEX IDX_E00EE972A76ED395 (user_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE ProjectAttachment (id INT AUTO_INCREMENT NOT NULL, project_id INT DEFAULT NULL, type VARCHAR(255) NOT NULL, filename VARCHAR(255) NOT NULL, originalname VARCHAR(255) DEFAULT NULL, mimetype VARCHAR(255) NOT NULL, size INT NOT NULL, extension VARCHAR(255) DEFAULT NULL, description LONGTEXT DEFAULT NULL, created DATETIME NOT NULL, INDEX IDX_44010C5B166D1F9C (project_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE ProjectPart (id INT AUTO_INCREMENT NOT NULL, part_id INT DEFAULT NULL, project_id INT DEFAULT NULL, quantity INT NOT NULL, remarks VARCHAR(255) DEFAULT NULL, overageType VARCHAR(255) DEFAULT \'\' NOT NULL, overage INT DEFAULT 0 NOT NULL, lotNumber LONGTEXT NOT NULL, INDEX IDX_B0B193364CE34BEC (part_id), INDEX IDX_B0B19336166D1F9C (project_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE ProjectRun (id INT AUTO_INCREMENT NOT NULL, project_id INT DEFAULT NULL, runDateTime DATETIME NOT NULL, quantity INT NOT NULL, INDEX IDX_574A3B5C166D1F9C (project_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE ProjectRunPart (id INT AUTO_INCREMENT NOT NULL, part_id INT DEFAULT NULL, quantity INT NOT NULL, lotNumber LONGTEXT NOT NULL, projectRun_id INT DEFAULT NULL, INDEX IDX_BF41064B1A221EF0 (projectRun_id), INDEX IDX_BF41064B4CE34BEC (part_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE Report (id INT AUTO_INCREMENT NOT NULL, name VARCHAR(255) DEFAULT NULL, createDateTime DATETIME NOT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE ReportPart (id INT AUTO_INCREMENT NOT NULL, report_id INT DEFAULT NULL, part_id INT DEFAULT NULL, distributor_id INT DEFAULT NULL, quantity INT NOT NULL, INDEX IDX_1BF0BD554BD2A4C0 (report_id), INDEX IDX_1BF0BD554CE34BEC (part_id), INDEX IDX_1BF0BD552D863A58 (distributor_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE ReportProject (id INT AUTO_INCREMENT NOT NULL, report_id INT DEFAULT NULL, project_id INT DEFAULT NULL, quantity INT NOT NULL, INDEX IDX_83B0909B4BD2A4C0 (report_id), INDEX IDX_83B0909B166D1F9C (project_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE SiPrefix (id INT AUTO_INCREMENT NOT NULL, prefix VARCHAR(255) NOT NULL, symbol VARCHAR(2) NOT NULL, exponent INT NOT NULL, base INT NOT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE StatisticSnapshot (id INT AUTO_INCREMENT NOT NULL, dateTime DATETIME NOT NULL, parts INT NOT NULL, categories INT NOT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE StatisticSnapshotUnit (id INT AUTO_INCREMENT NOT NULL, stockLevel INT NOT NULL, statisticSnapshot_id INT DEFAULT NULL, partUnit_id INT DEFAULT NULL, INDEX IDX_368BD669A16DD05F (statisticSnapshot_id), INDEX IDX_368BD669F7A36E87 (partUnit_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE StockEntry (id INT AUTO_INCREMENT NOT NULL, part_id INT DEFAULT NULL, user_id INT DEFAULT NULL, stockLevel INT NOT NULL, price NUMERIC(13, 4) DEFAULT NULL, dateTime DATETIME NOT NULL, correction TINYINT(1) NOT NULL, comment VARCHAR(255) DEFAULT NULL, INDEX IDX_E182997B4CE34BEC (part_id), INDEX IDX_E182997BA76ED395 (user_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE StorageLocation (id INT AUTO_INCREMENT NOT NULL, category_id INT DEFAULT NULL, name VARCHAR(255) NOT NULL, UNIQUE INDEX UNIQ_2C59071C5E237E06 (name), INDEX IDX_2C59071C12469DE2 (category_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE StorageLocationCategory (id INT AUTO_INCREMENT NOT NULL, parent_id INT DEFAULT NULL, lft INT NOT NULL, rgt INT NOT NULL, lvl INT NOT NULL, root INT DEFAULT NULL, name VARCHAR(128) NOT NULL, description LONGTEXT DEFAULT NULL, categoryPath LONGTEXT DEFAULT NULL, INDEX IDX_3E39FA47727ACA70 (parent_id), INDEX IDX_3E39FA47DA439252 (lft), INDEX IDX_3E39FA47D5E02D69 (rgt), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE StorageLocationImage (id INT AUTO_INCREMENT NOT NULL, type VARCHAR(255) NOT NULL, filename VARCHAR(255) NOT NULL, originalname VARCHAR(255) DEFAULT NULL, mimetype VARCHAR(255) NOT NULL, size INT NOT NULL, extension VARCHAR(255) DEFAULT NULL, description LONGTEXT DEFAULT NULL, created DATETIME NOT NULL, storageLocation_id INT DEFAULT NULL, UNIQUE INDEX UNIQ_666717F073CD58AF (storageLocation_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE SystemNotice (id INT AUTO_INCREMENT NOT NULL, date DATETIME NOT NULL, title VARCHAR(255) NOT NULL, description LONGTEXT NOT NULL, acknowledged TINYINT(1) NOT NULL, type VARCHAR(255) NOT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE SystemPreference (preferenceKey VARCHAR(255) NOT NULL, preferenceValue LONGTEXT NOT NULL, PRIMARY KEY(preferenceKey)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE TempImage (id INT AUTO_INCREMENT NOT NULL, type VARCHAR(255) NOT NULL, filename VARCHAR(255) NOT NULL, originalname VARCHAR(255) DEFAULT NULL, mimetype VARCHAR(255) NOT NULL, size INT NOT NULL, extension VARCHAR(255) DEFAULT NULL, description LONGTEXT DEFAULT NULL, created DATETIME NOT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE TempUploadedFile (id INT AUTO_INCREMENT NOT NULL, type VARCHAR(255) NOT NULL, filename VARCHAR(255) NOT NULL, originalname VARCHAR(255) DEFAULT NULL, mimetype VARCHAR(255) NOT NULL, size INT NOT NULL, extension VARCHAR(255) DEFAULT NULL, description LONGTEXT DEFAULT NULL, created DATETIME NOT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE TipOfTheDay (id INT AUTO_INCREMENT NOT NULL, name VARCHAR(255) NOT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE TipOfTheDayHistory (id INT AUTO_INCREMENT NOT NULL, user_id INT DEFAULT NULL, name VARCHAR(255) NOT NULL, INDEX IDX_3177BC2A76ED395 (user_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE Unit (id INT AUTO_INCREMENT NOT NULL, name VARCHAR(255) NOT NULL, symbol VARCHAR(255) NOT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE unit_siprefix (unit_id INT NOT NULL, siprefix_id INT NOT NULL, INDEX IDX_E9E8D93F8BD700D (unit_id), INDEX IDX_E9E8D939BE9F1F4 (siprefix_id), PRIMARY KEY(unit_id, siprefix_id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE User (id INT AUTO_INCREMENT NOT NULL, provider_id INT NOT NULL, username VARCHAR(50) NOT NULL, password VARCHAR(255) DEFAULT NULL, email VARCHAR(255) DEFAULT NULL, lastSeen DATETIME DEFAULT NULL, active TINYINT(1) NOT NULL, protected TINYINT(1) NOT NULL, roles JSON NOT NULL, INDEX IDX_2DA17977A53A8AA (provider_id), UNIQUE INDEX username_provider (username, provider_id), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE UserPreference (user_id INT NOT NULL, preferenceKey VARCHAR(255) NOT NULL, preferenceValue LONGTEXT NOT NULL, INDEX IDX_922CE7A2A76ED395 (user_id), PRIMARY KEY(preferenceKey, user_id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE UserProvider (id INT AUTO_INCREMENT NOT NULL, type VARCHAR(255) NOT NULL, editable TINYINT(1) NOT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE refresh_tokens (id INT AUTO_INCREMENT NOT NULL, refresh_token VARCHAR(128) NOT NULL, username VARCHAR(255) NOT NULL, valid DATETIME NOT NULL, UNIQUE INDEX UNIQ_9BACE7E1C74F2195 (refresh_token), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('CREATE TABLE messenger_messages (id BIGINT AUTO_INCREMENT NOT NULL, body LONGTEXT NOT NULL, headers LONGTEXT NOT NULL, queue_name VARCHAR(190) NOT NULL, created_at DATETIME NOT NULL, available_at DATETIME NOT NULL, delivered_at DATETIME DEFAULT NULL, INDEX IDX_75EA56E0FB7336F0 (queue_name), INDEX IDX_75EA56E0E3BD61CE (available_at), INDEX IDX_75EA56E016BA31DB (delivered_at), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
		$this->addSql('ALTER TABLE BatchJobQueryField ADD CONSTRAINT FK_6118E78CABE62C64 FOREIGN KEY (batchJob_id) REFERENCES BatchJob (id)');
		$this->addSql('ALTER TABLE BatchJobUpdateField ADD CONSTRAINT FK_E1ADA7DFABE62C64 FOREIGN KEY (batchJob_id) REFERENCES BatchJob (id)');
		$this->addSql('ALTER TABLE Footprint ADD CONSTRAINT FK_7CF3249412469DE2 FOREIGN KEY (category_id) REFERENCES FootprintCategory (id)');
		$this->addSql('ALTER TABLE FootprintAttachment ADD CONSTRAINT FK_7B7388A151364C98 FOREIGN KEY (footprint_id) REFERENCES Footprint (id)');
		$this->addSql('ALTER TABLE FootprintCategory ADD CONSTRAINT FK_C026BA6A727ACA70 FOREIGN KEY (parent_id) REFERENCES FootprintCategory (id) ON DELETE CASCADE');
		$this->addSql('ALTER TABLE FootprintImage ADD CONSTRAINT FK_3B22699151364C98 FOREIGN KEY (footprint_id) REFERENCES Footprint (id)');
		$this->addSql('ALTER TABLE ManufacturerICLogo ADD CONSTRAINT FK_3F1EF213A23B42D FOREIGN KEY (manufacturer_id) REFERENCES Manufacturer (id)');
		$this->addSql('ALTER TABLE MetaPartParameterCriteria ADD CONSTRAINT FK_6EE1D3924CE34BEC FOREIGN KEY (part_id) REFERENCES Part (id)');
		$this->addSql('ALTER TABLE MetaPartParameterCriteria ADD CONSTRAINT FK_6EE1D39219187357 FOREIGN KEY (siPrefix_id) REFERENCES SiPrefix (id)');
		$this->addSql('ALTER TABLE MetaPartParameterCriteria ADD CONSTRAINT FK_6EE1D392F8BD700D FOREIGN KEY (unit_id) REFERENCES Unit (id)');
		$this->addSql('ALTER TABLE Part ADD CONSTRAINT FK_E93DDFF812469DE2 FOREIGN KEY (category_id) REFERENCES PartCategory (id)');
		$this->addSql('ALTER TABLE Part ADD CONSTRAINT FK_E93DDFF851364C98 FOREIGN KEY (footprint_id) REFERENCES Footprint (id)');
		$this->addSql('ALTER TABLE Part ADD CONSTRAINT FK_E93DDFF8F7A36E87 FOREIGN KEY (partUnit_id) REFERENCES PartMeasurementUnit (id)');
		$this->addSql('ALTER TABLE Part ADD CONSTRAINT FK_E93DDFF873CD58AF FOREIGN KEY (storageLocation_id) REFERENCES StorageLocation (id)');
		$this->addSql('ALTER TABLE PartAttachment ADD CONSTRAINT FK_76D73D864CE34BEC FOREIGN KEY (part_id) REFERENCES Part (id)');
		$this->addSql('ALTER TABLE PartCategory ADD CONSTRAINT FK_131FB619727ACA70 FOREIGN KEY (parent_id) REFERENCES PartCategory (id) ON DELETE CASCADE');
		$this->addSql('ALTER TABLE PartDistributor ADD CONSTRAINT FK_FBA293844CE34BEC FOREIGN KEY (part_id) REFERENCES Part (id)');
		$this->addSql('ALTER TABLE PartDistributor ADD CONSTRAINT FK_FBA293842D863A58 FOREIGN KEY (distributor_id) REFERENCES Distributor (id)');
		$this->addSql('ALTER TABLE PartManufacturer ADD CONSTRAINT FK_F085878B4CE34BEC FOREIGN KEY (part_id) REFERENCES Part (id)');
		$this->addSql('ALTER TABLE PartManufacturer ADD CONSTRAINT FK_F085878BA23B42D FOREIGN KEY (manufacturer_id) REFERENCES Manufacturer (id)');
		$this->addSql('ALTER TABLE PartParameter ADD CONSTRAINT FK_A28A98594CE34BEC FOREIGN KEY (part_id) REFERENCES Part (id)');
		$this->addSql('ALTER TABLE PartParameter ADD CONSTRAINT FK_A28A9859F8BD700D FOREIGN KEY (unit_id) REFERENCES Unit (id)');
		$this->addSql('ALTER TABLE PartParameter ADD CONSTRAINT FK_A28A985919187357 FOREIGN KEY (siPrefix_id) REFERENCES SiPrefix (id)');
		$this->addSql('ALTER TABLE PartParameter ADD CONSTRAINT FK_A28A9859569AA479 FOREIGN KEY (minSiPrefix_id) REFERENCES SiPrefix (id)');
		$this->addSql('ALTER TABLE PartParameter ADD CONSTRAINT FK_A28A9859EFBC3F08 FOREIGN KEY (maxSiPrefix_id) REFERENCES SiPrefix (id)');
		$this->addSql('ALTER TABLE Project ADD CONSTRAINT FK_E00EE972A76ED395 FOREIGN KEY (user_id) REFERENCES User (id)');
		$this->addSql('ALTER TABLE ProjectAttachment ADD CONSTRAINT FK_44010C5B166D1F9C FOREIGN KEY (project_id) REFERENCES Project (id)');
		$this->addSql('ALTER TABLE ProjectPart ADD CONSTRAINT FK_B0B193364CE34BEC FOREIGN KEY (part_id) REFERENCES Part (id)');
		$this->addSql('ALTER TABLE ProjectPart ADD CONSTRAINT FK_B0B19336166D1F9C FOREIGN KEY (project_id) REFERENCES Project (id)');
		$this->addSql('ALTER TABLE ProjectRun ADD CONSTRAINT FK_574A3B5C166D1F9C FOREIGN KEY (project_id) REFERENCES Project (id)');
		$this->addSql('ALTER TABLE ProjectRunPart ADD CONSTRAINT FK_BF41064B1A221EF0 FOREIGN KEY (projectRun_id) REFERENCES ProjectRun (id)');
		$this->addSql('ALTER TABLE ProjectRunPart ADD CONSTRAINT FK_BF41064B4CE34BEC FOREIGN KEY (part_id) REFERENCES Part (id)');
		$this->addSql('ALTER TABLE ReportPart ADD CONSTRAINT FK_1BF0BD554BD2A4C0 FOREIGN KEY (report_id) REFERENCES Report (id)');
		$this->addSql('ALTER TABLE ReportPart ADD CONSTRAINT FK_1BF0BD554CE34BEC FOREIGN KEY (part_id) REFERENCES Part (id)');
		$this->addSql('ALTER TABLE ReportPart ADD CONSTRAINT FK_1BF0BD552D863A58 FOREIGN KEY (distributor_id) REFERENCES Distributor (id)');
		$this->addSql('ALTER TABLE ReportProject ADD CONSTRAINT FK_83B0909B4BD2A4C0 FOREIGN KEY (report_id) REFERENCES Report (id)');
		$this->addSql('ALTER TABLE ReportProject ADD CONSTRAINT FK_83B0909B166D1F9C FOREIGN KEY (project_id) REFERENCES Project (id)');
		$this->addSql('ALTER TABLE StatisticSnapshotUnit ADD CONSTRAINT FK_368BD669A16DD05F FOREIGN KEY (statisticSnapshot_id) REFERENCES StatisticSnapshot (id)');
		$this->addSql('ALTER TABLE StatisticSnapshotUnit ADD CONSTRAINT FK_368BD669F7A36E87 FOREIGN KEY (partUnit_id) REFERENCES PartMeasurementUnit (id)');
		$this->addSql('ALTER TABLE StockEntry ADD CONSTRAINT FK_E182997B4CE34BEC FOREIGN KEY (part_id) REFERENCES Part (id)');
		$this->addSql('ALTER TABLE StockEntry ADD CONSTRAINT FK_E182997BA76ED395 FOREIGN KEY (user_id) REFERENCES User (id)');
		$this->addSql('ALTER TABLE StorageLocation ADD CONSTRAINT FK_2C59071C12469DE2 FOREIGN KEY (category_id) REFERENCES StorageLocationCategory (id)');
		$this->addSql('ALTER TABLE StorageLocationCategory ADD CONSTRAINT FK_3E39FA47727ACA70 FOREIGN KEY (parent_id) REFERENCES StorageLocationCategory (id) ON DELETE CASCADE');
		$this->addSql('ALTER TABLE StorageLocationImage ADD CONSTRAINT FK_666717F073CD58AF FOREIGN KEY (storageLocation_id) REFERENCES StorageLocation (id)');
		$this->addSql('ALTER TABLE TipOfTheDayHistory ADD CONSTRAINT FK_3177BC2A76ED395 FOREIGN KEY (user_id) REFERENCES User (id)');
		$this->addSql('ALTER TABLE unit_siprefix ADD CONSTRAINT FK_E9E8D93F8BD700D FOREIGN KEY (unit_id) REFERENCES Unit (id) ON DELETE CASCADE');
		$this->addSql('ALTER TABLE unit_siprefix ADD CONSTRAINT FK_E9E8D939BE9F1F4 FOREIGN KEY (siprefix_id) REFERENCES SiPrefix (id) ON DELETE CASCADE');
		$this->addSql('ALTER TABLE User ADD CONSTRAINT FK_2DA17977A53A8AA FOREIGN KEY (provider_id) REFERENCES UserProvider (id)');
		$this->addSql('ALTER TABLE UserPreference ADD CONSTRAINT FK_922CE7A2A76ED395 FOREIGN KEY (user_id) REFERENCES User (id)');
	}

	public function postUp(Schema $schema): void
	{
		$manager = $this->container->get('doctrine')->getManager();

		$manager->persist((new FootprintCategory)
			->setName('Root Category')
			->setRoot(1)
			->setCategoryPath('Root Category'));
		$manager->persist((new PartCategory)
			->setName('Root Category')
			->setRoot(1)
			->setCategoryPath('Root Category'));
		$manager->persist((new StorageLocationCategory)
			->setName('Root Category')
			->setRoot(1)
			->setCategoryPath('Root Category'));

		$manager->persist((new PartMeasurementUnit)
			->setName('Pieces')
			->setShortName('pcs')
			->setDefault(true));

		$manager->persist(new SiPrefix('quetta', 'Q', 30, 10));
		$manager->persist(new SiPrefix('ronna', 'R', 27, 10));
		$manager->persist(new SiPrefix('yotta', 'Y', 24, 10));
		$manager->persist(new SiPrefix('zetta', 'Z', 21, 10));
		$manager->persist(new SiPrefix('exa', 'E', 18, 10));
		$manager->persist(new SiPrefix('peta', 'P', 15, 10));
		$manager->persist($tera = new SiPrefix('tera', 'T', 12, 10));
		$manager->persist($giga = new SiPrefix('giga', 'G', 9, 10));
		$manager->persist($mega = new SiPrefix('mega', 'M', 6, 10));
		$manager->persist($kilo = new SiPrefix('kilo', 'k', 3, 10));
		$manager->persist(new SiPrefix('hecto', 'h', 2, 10));
		$manager->persist(new SiPrefix('deca', 'da', 1, 10));
		$manager->persist($no = new SiPrefix('-', '', 0, 10));
		$manager->persist($deci = new SiPrefix('deci', 'd', -1, 10));
		$manager->persist($centi = new SiPrefix('centi', 'c', -2, 10));
		$manager->persist($milli = new SiPrefix('milli', 'm', -3, 10));
		$manager->persist($micro = new SiPrefix('micro', 'μ', -6, 10));
		$manager->persist($nano = new SiPrefix('nano', 'n', -9, 10));
		$manager->persist($pico = new SiPrefix('pico', 'p', -12, 10));
		$manager->persist(new SiPrefix('femto', 'f', -15, 10));
		$manager->persist(new SiPrefix('atto', 'a', -18, 10));
		$manager->persist(new SiPrefix('zepto', 'z', -21, 10));
		$manager->persist(new SiPrefix('yocto', 'y', -24, 10));
		$manager->persist(new SiPrefix('ronto', 'r', -27, 10));
		$manager->persist(new SiPrefix('quecto', 'q', -30, 10));
		$manager->persist(new SiPrefix('kibi', 'Ki', 1, 1024));
		$manager->persist(new SiPrefix('mebi', 'Mi', 2, 1024));
		$manager->persist(new SiPrefix('gibi', 'Gi', 3, 1024));
		$manager->persist(new SiPrefix('tebi', 'Ti', 4, 1024));
		$manager->persist(new SiPrefix('pebi', 'Pi', 5, 1024));
		$manager->persist(new SiPrefix('exbi', 'Ei', 6, 1024));
		$manager->persist(new SiPrefix('zebi', 'Zi', 7, 1024));
		$manager->persist(new SiPrefix('yobi', 'Yi', 8, 1024));

		$manager->persist((new Unit('Meter', 'm'))
			->addPrefix($kilo)
			->addPrefix($no)
			->addPrefix($deci)
			->addPrefix($centi)
			->addPrefix($milli)
			->addPrefix($micro)
			->addPrefix($nano)
		);
		$manager->persist((new Unit('Gram', 'g'))
			->addPrefix($kilo)
			->addPrefix($no)
			->addPrefix($milli)
		);
		$manager->persist((new Unit('Second', 's'))
			->addPrefix($no)
			->addPrefix($milli)
		);
		$manager->persist((new Unit('Kelvin', 'K'))
			->addPrefix($milli)
		);
		$manager->persist((new Unit('Mol', 'mol'))
			->addPrefix($milli)
		);
		$manager->persist((new Unit('Candela', 'cd'))
			->addPrefix($milli)
		);
		$manager->persist((new Unit('Ampere', 'A'))
			->addPrefix($kilo)
			->addPrefix($no)
			->addPrefix($milli)
			->addPrefix($micro)
			->addPrefix($nano)
			->addPrefix($pico)
		);
		$manager->persist((new Unit('Ohm', 'Ω'))
			->addPrefix($tera)
			->addPrefix($giga)
			->addPrefix($mega)
			->addPrefix($kilo)
			->addPrefix($no)
			->addPrefix($milli)
			->addPrefix($micro)
		);
		$manager->persist((new Unit('Volt', 'V'))
			->addPrefix($kilo)
			->addPrefix($no)
			->addPrefix($milli)
		);
		$manager->persist((new Unit('Hertz', 'Hz'))
			->addPrefix($tera)
			->addPrefix($giga)
			->addPrefix($kilo)
			->addPrefix($no)
			->addPrefix($milli)
		);
		$manager->persist((new Unit('Newton', 'N'))
			->addPrefix($kilo)
			->addPrefix($no)
		);
		$manager->persist((new Unit('Pascal', 'Pa'))
			->addPrefix($kilo)
			->addPrefix($no)
			->addPrefix($milli)
		);
		$manager->persist((new Unit('Joule', 'J'))
			->addPrefix($kilo)
			->addPrefix($no)
			->addPrefix($milli)
			->addPrefix($micro)
		);
		$manager->persist((new Unit('Watt', 'W'))
			->addPrefix($giga)
			->addPrefix($mega)
			->addPrefix($kilo)
			->addPrefix($no)
			->addPrefix($milli)
			->addPrefix($micro)
		);
		$manager->persist((new Unit('Coulomb', 'C'))
			->addPrefix($kilo)
			->addPrefix($no)
		);
		$manager->persist((new Unit('Farad', 'F'))
			->addPrefix($no)
			->addPrefix($milli)
			->addPrefix($micro)
			->addPrefix($nano)
			->addPrefix($pico)
		);
		$manager->persist((new Unit('Siemens', 'S'))
			->addPrefix($no)
			->addPrefix($milli)
		);
		$manager->persist((new Unit('Weber', 'Wb'))
			->addPrefix($no)
		);
		$manager->persist((new Unit('Tesla', 'T'))
			->addPrefix($no)
		);
		$manager->persist((new Unit('Henry', 'H'))
			->addPrefix($no)
			->addPrefix($milli)
			->addPrefix($micro)
		);
		$manager->persist((new Unit('Celsius', '°C'))
			->addPrefix($no)
		);
		$manager->persist((new Unit('Lumen', 'lm'))
			->addPrefix($no)
		);
		$manager->persist((new Unit('Lux', 'lx'))
			->addPrefix($no)
		);
		$manager->persist((new Unit('Becquerel', 'Bq'))
			->addPrefix($no)
		);
		$manager->persist((new Unit('Gray', 'Gy'))
			->addPrefix($no)
		);
		$manager->persist((new Unit('Sievert', 'Sv'))
			->addPrefix($no)
			->addPrefix($milli)
			->addPrefix($micro)
		);
		$manager->persist((new Unit('Katal', 'kat'))
			->addPrefix($no)
		);
		$manager->persist((new Unit('Ampere Hour', 'Ah'))
			->addPrefix($kilo)
			->addPrefix($no)
			->addPrefix($milli)
		);

		$manager->persist(new UserProvider(UserService::BUILTIN_PROVIDER, true));
		$manager->persist(new UserProvider(UserService::LDAP_PROVIDER, false));

		$manager->flush();
	}

	public function down(Schema $schema): void
	{
	}

	public function isTransactional(): bool
	{
		return false;
	}

	public function setContainer(ContainerInterface $container = null): void
	{
		$this->container = $container;
	}
}
