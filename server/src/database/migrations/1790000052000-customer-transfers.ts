import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * What stands to one customer's good, carried to another's account
 * (KEYINGI-REJA, 17.5): one pays for another; a buyer's debt is set against
 * what the business owes a supplier; a payment written to the wrong person
 * is put right. One document (`transfer`) with the customer it leaves and
 * the one it enters (`to_customer_id`), each in a currency of their own —
 * as an exchange inside one customer's accounts is, but between two people.
 */
export class CustomerTransfers1790000052000 implements MigrationInterface {
  name = 'CustomerTransfers1790000052000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customer_payments DROP CONSTRAINT customer_payments_kind_check;
      ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_kind_check
        CHECK (kind IN ('in', 'out', 'opening', 'adjust', 'exchange', 'transfer'));

      ALTER TABLE customer_payments
        ADD COLUMN to_customer_id uuid REFERENCES customers(id) ON DELETE RESTRICT;
      CREATE INDEX customer_payments_to_customer ON customer_payments (to_customer_id)
        WHERE to_customer_id IS NOT NULL;

      ALTER TABLE customer_payments DROP CONSTRAINT customer_payments_exchange;
      ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_exchange CHECK (
        (kind IN ('exchange', 'transfer')) = (to_currency IS NOT NULL)
        AND (to_currency IS NULL) = (to_amount IS NULL)
        AND (to_currency IS NULL OR (to_currency ~ '^[A-Z]{3}$' AND to_amount > 0))
        -- Within one customer's accounts the two currencies differ; between two customers they need not.
        AND (kind <> 'exchange' OR to_currency <> currency)
        AND (fx = 0 OR kind IN ('exchange', 'transfer'))
        AND (kind = 'transfer') = (to_customer_id IS NOT NULL)
        AND (to_customer_id IS NULL OR to_customer_id <> customer_id)
      );
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    const [{ made }]: { made: number }[] = await queryRunner.query(
      `SELECT count(*)::int AS made FROM customer_payments WHERE kind = 'transfer'`,
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
    if (made) {
      throw new Error(`Mijozlar orasidagi o‘tkazmalar bor (${made} ta): ular eski tuzilishga sig‘maydi.`)
    }
    await queryRunner.query(`
      ALTER TABLE customer_payments DROP CONSTRAINT customer_payments_exchange;
      ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_exchange CHECK (
        (kind = 'exchange') = (to_currency IS NOT NULL)
        AND (to_currency IS NULL) = (to_amount IS NULL)
        AND (to_currency IS NULL OR (to_currency ~ '^[A-Z]{3}$' AND to_currency <> currency AND to_amount > 0))
        AND (fx = 0 OR kind = 'exchange')
      );
      DROP INDEX customer_payments_to_customer;
      ALTER TABLE customer_payments DROP COLUMN to_customer_id;
      ALTER TABLE customer_payments DROP CONSTRAINT customer_payments_kind_check;
      ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_kind_check
        CHECK (kind IN ('in', 'out', 'opening', 'adjust', 'exchange'));
    `)
  }
}
