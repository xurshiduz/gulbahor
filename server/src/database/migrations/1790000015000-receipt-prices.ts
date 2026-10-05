import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A receipt sets a price for every price type.
 *
 * A line already carries the retail and the wholesale price to put on its
 * model. `other_prices` holds the same for every other price type the
 * business keeps, by the price type's id: the floor, a family price, a
 * second wholesale one.
 */
export class ReceiptPrices1790000015000 implements MigrationInterface {
  name = 'ReceiptPrices1790000015000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE receipt_lines ADD COLUMN other_prices jsonb NOT NULL DEFAULT '{}'`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE receipt_lines DROP COLUMN other_prices`)
  }
}
