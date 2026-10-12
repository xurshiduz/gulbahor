import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A receipt may say how its own goods are priced (KEYINGI-REJA, 16.4 and
 * 16.20): a formula typed into a line's price field ("30%", "ch −15%") in
 * place of a sum, and — for the receipt as a whole, by price type — a formula
 * of its own in place of the rules, "set none here", or "for the goods that
 * have a price too". Both are worked out when the receipt is posted, of what
 * its goods cost.
 */
export class ReceiptPriceFormulas1790000057000 implements MigrationInterface {
  name = 'ReceiptPriceFormulas1790000057000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE receipt_lines ADD COLUMN price_formulas jsonb NOT NULL DEFAULT '{}';
      ALTER TABLE receipts ADD COLUMN pricing jsonb NOT NULL DEFAULT '{}';
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE receipts DROP COLUMN pricing;
      ALTER TABLE receipt_lines DROP COLUMN price_formulas;
    `)
  }
}
