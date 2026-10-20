import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * The RFID tags a stock document has already counted. Kept with the document
 * rather than on the screen: a draft saved and opened again, or counted from
 * a second device, must not count the same piece twice.
 */
export class StockDocTags1790000061000 implements MigrationInterface {
  name = 'StockDocTags1790000061000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE stock_documents ADD COLUMN tags text[] NOT NULL DEFAULT '{}'`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE stock_documents DROP COLUMN tags`)
  }
}
