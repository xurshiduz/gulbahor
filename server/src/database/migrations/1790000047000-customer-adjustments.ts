import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * More ways of putting a customer's account right (KEYINGI-REJA, 16.3):
 *
 * - `adjust` — the account moved with no money moving, against a kind of
 *   expense or income (a hopeless debt given up, a supplier's bonus);
 * - `exchange` — what stands in one of the customer's currencies carried
 *   into another of theirs, with what entered and what the rate made of it;
 * - `forgiven` — the small remainder of a debt let go as a payment is taken;
 * - whose word let a payment out of a drawer through at the till.
 *
 * Every business gets the expense "Umidsiz qarzlar" to give a debt up under.
 */
export class CustomerAdjustments1790000047000 implements MigrationInterface {
  name = 'CustomerAdjustments1790000047000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`
      ALTER TABLE customer_payments DROP CONSTRAINT customer_payments_kind_check;
      ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_kind_check
        CHECK (kind IN ('in', 'out', 'opening', 'adjust', 'exchange'));

      ALTER TABLE customer_payments
        ADD COLUMN category_id uuid REFERENCES money_categories(id) ON DELETE RESTRICT,
        ADD COLUMN forgiven bigint NOT NULL DEFAULT 0,
        ADD COLUMN to_currency text,
        ADD COLUMN to_amount bigint,
        ADD COLUMN fx bigint NOT NULL DEFAULT 0,
        ADD COLUMN approved_by uuid,
        ADD COLUMN approved_by_name text;

      ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_category
        CHECK ((kind = 'adjust') = (category_id IS NOT NULL));
      ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_forgiven
        CHECK (forgiven >= 0 AND (forgiven = 0 OR kind = 'in'));
      ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_exchange CHECK (
        (kind = 'exchange') = (to_currency IS NOT NULL)
        AND (to_currency IS NULL) = (to_amount IS NULL)
        AND (to_currency IS NULL OR (to_currency ~ '^[A-Z]{3}$' AND to_currency <> currency AND to_amount > 0))
        AND (fx = 0 OR kind = 'exchange')
      );

      INSERT INTO money_categories (org_id, kind, name, in_profit, is_active, sort_order)
      SELECT o.id, 'expense', 'Umidsiz qarzlar', true, true,
             (SELECT coalesce(max(c.sort_order), 0) + 1 FROM money_categories c WHERE c.org_id = o.id)
      FROM organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM money_categories c
        WHERE c.org_id = o.id AND c.kind = 'expense' AND lower(c.name) = lower('Umidsiz qarzlar')
      );
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    const [{ made }]: { made: number }[] = await queryRunner.query(
      `SELECT count(*)::int AS made FROM customer_payments
       WHERE kind IN ('adjust', 'exchange') OR forgiven <> 0`,
    )
    if (made) {
      throw new Error(
        `Hisob tuzatish, almashtirish yoki kechilgan qoldiq yozuvlari bor (${made} ta): ular eski tuzilishga sig‘maydi.`,
      )
    }
    await queryRunner.query(`
      ALTER TABLE customer_payments DROP CONSTRAINT customer_payments_exchange;
      ALTER TABLE customer_payments DROP CONSTRAINT customer_payments_forgiven;
      ALTER TABLE customer_payments DROP CONSTRAINT customer_payments_category;
      ALTER TABLE customer_payments
        DROP COLUMN approved_by_name,
        DROP COLUMN approved_by,
        DROP COLUMN fx,
        DROP COLUMN to_amount,
        DROP COLUMN to_currency,
        DROP COLUMN forgiven,
        DROP COLUMN category_id;
      ALTER TABLE customer_payments DROP CONSTRAINT customer_payments_kind_check;
      ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_kind_check
        CHECK (kind IN ('in', 'out', 'opening'));
      -- The expense stays where it was used; where it was not, it goes with what brought it.
      DELETE FROM money_categories c
      WHERE c.kind = 'expense' AND c.name = 'Umidsiz qarzlar'
        AND NOT EXISTS (SELECT 1 FROM money_ops o WHERE o.category_id = c.id);
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }
}
