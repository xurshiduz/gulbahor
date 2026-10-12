import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A cart sold at a price type — a customer's own, or one the cashier picked —
 * may hold goods that have no price of that type (KEYINGI-REJA, 16.4). Such a
 * line is sold at what the type's formula makes of it, or, with no formula, at
 * the retail price; the receipt keeps which, so that a reprint says the same.
 */
export class SaleLinePriceFrom1790000055000 implements MigrationInterface {
  name = 'SaleLinePriceFrom1790000055000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sale_lines
        ADD COLUMN price_from text CHECK (price_from IN ('formula', 'retail'));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sale_lines DROP COLUMN price_from;`)
  }
}
