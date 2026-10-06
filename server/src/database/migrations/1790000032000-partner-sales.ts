import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A sale to a partner at the till. The sale names the partner; what of it
 * goes on their account is a payment of its own kind (`partner`), kept in
 * the currency of their account: `amount` is what it came to there, `base`
 * the part of the sale it stands for, `fx` what lay between that and the
 * day's rate. Goods brought back take their share off the account the same
 * way (`sale_return_payments`), at what the sale wrote, not at a new rate.
 *
 * A manager of a shop may sell to partners; a cashier needs a manager's word.
 */
export class PartnerSales1790000032000 implements MigrationInterface {
  name = 'PartnerSales1790000032000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales
        ADD COLUMN partner_id uuid REFERENCES partners(id) ON DELETE RESTRICT,
        ADD COLUMN partner_name text,
        ADD CONSTRAINT sales_customer_or_partner CHECK (customer_id IS NULL OR partner_id IS NULL);
      CREATE INDEX sales_partner ON sales (partner_id) WHERE partner_id IS NOT NULL;

      ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_method_check;
      ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal', 'exchange', 'debt', 'partner'));
      ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_currency_check;
      ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_currency_check CHECK (currency ~ '^[A-Z]{3}$');

      ALTER TABLE sale_return_payments DROP CONSTRAINT sale_return_payments_method_check;
      ALTER TABLE sale_return_payments ADD CONSTRAINT sale_return_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal', 'debt', 'partner'));
      ALTER TABLE sale_return_payments DROP CONSTRAINT sale_return_payments_currency_check;
      ALTER TABLE sale_return_payments ADD CONSTRAINT sale_return_payments_currency_check
        CHECK (currency ~ '^[A-Z]{3}$');
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM sale_return_payments WHERE method = 'partner';
      ALTER TABLE sale_return_payments DROP CONSTRAINT sale_return_payments_currency_check;
      ALTER TABLE sale_return_payments ADD CONSTRAINT sale_return_payments_currency_check
        CHECK (currency IN ('UZS', 'USD'));
      ALTER TABLE sale_return_payments DROP CONSTRAINT sale_return_payments_method_check;
      ALTER TABLE sale_return_payments ADD CONSTRAINT sale_return_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal', 'debt'));
      DELETE FROM sale_payments WHERE method = 'partner';
      ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_currency_check;
      ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_currency_check CHECK (currency IN ('UZS', 'USD'));
      ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_method_check;
      ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal', 'exchange', 'debt'));
      DROP INDEX sales_partner;
      ALTER TABLE sales DROP CONSTRAINT sales_customer_or_partner, DROP COLUMN partner_name, DROP COLUMN partner_id;
    `)
  }
}
