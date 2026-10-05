import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Agreed sums and whole card numbers.
 *
 * A line of money may settle what the two sides agreed rather than what the
 * day's rate makes of it; what lay between the two is kept on the line, in
 * so'm, more than nothing when the business came out ahead.
 *
 * A card is told from another by its number, so the whole of it is kept:
 * the last four digits name too many cards alike. These are the business's
 * own cards, the ones customers are told to pay to, not anybody's secret.
 */
export class MoneyPlaces1790000026000 implements MigrationInterface {
  name = 'MoneyPlaces1790000026000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE partner_payment_lines ADD COLUMN fx bigint NOT NULL DEFAULT 0;
      ALTER TABLE money_op_lines ADD COLUMN fx bigint NOT NULL DEFAULT 0;
      ALTER TABLE debt_payment_lines ADD COLUMN fx bigint NOT NULL DEFAULT 0;
      ALTER TABLE accounts ADD COLUMN card_number text CHECK (card_number ~ '^[0-9]{12,19}$');
      CREATE UNIQUE INDEX accounts_card_number ON accounts (org_id, card_number) WHERE card_number IS NOT NULL;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS accounts_card_number;
      ALTER TABLE accounts DROP COLUMN card_number;
      ALTER TABLE debt_payment_lines DROP COLUMN fx;
      ALTER TABLE money_op_lines DROP COLUMN fx;
      ALTER TABLE partner_payment_lines DROP COLUMN fx;
    `)
  }
}
