import { MigrationInterface, QueryRunner } from 'typeorm'

const NEW_KEYS = ['customers.suppliers', 'customers.receive', 'customers.pay_out', 'customers.adjust']

/**
 * A customer's card grows what the one customer book needs (KEYINGI-REJA, 16.2): the phone becomes optional, and
 * a customer has a main currency, their own price, the supplier mark and their terms — credit, the days a debt is
 * given, the days a return is taken.
 *
 * The customers group of permissions grows too. A role that held all of it without the partners' group (the
 * store manager) is first given the keys it had, so that it does not silently gain the new ones: paying out,
 * suppliers' accounts, adjusting. Whoever took payments on retail debts may still take them.
 */
export class CustomerCard1790000044000 implements MigrationInterface {
  name = 'CustomerCard1790000044000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX customers_org_phone;
      ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL;
      CREATE UNIQUE INDEX customers_org_phone ON customers (org_id, phone) WHERE phone IS NOT NULL;
      ALTER TABLE customers
        ADD COLUMN currency text,
        ADD COLUMN price_type_id uuid REFERENCES price_types(id) ON DELETE SET NULL,
        ADD COLUMN is_supplier boolean NOT NULL DEFAULT false,
        ADD COLUMN credit text NOT NULL DEFAULT 'default'
          CONSTRAINT customers_credit CHECK (credit IN ('default', 'none', 'limit', 'unlimited')),
        ADD COLUMN credit_limit bigint,
        ADD COLUMN due_days int CONSTRAINT customers_due_days CHECK (due_days BETWEEN 1 AND 3650),
        ADD COLUMN no_due boolean NOT NULL DEFAULT false,
        ADD COLUMN return_days int CONSTRAINT customers_return_days CHECK (return_days BETWEEN 0 AND 3650),
        ADD CONSTRAINT customers_credit_limit CHECK ((credit = 'limit') = (credit_limit IS NOT NULL AND credit_limit > 0)),
        ADD CONSTRAINT customers_no_due CHECK (NOT (no_due AND due_days IS NOT NULL));
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(
      `UPDATE customers c SET currency = o.base_currency FROM organizations o WHERE o.id = c.org_id`,
    )
    await queryRunner.query(`
      ALTER TABLE customers ALTER COLUMN currency SET NOT NULL,
        ADD CONSTRAINT customers_currency CHECK (currency ~ '^[A-Z]{3}$');
    `)
    await queryRunner.query(
      `UPDATE roles SET permissions = ARRAY(
         SELECT DISTINCT unnest(array_remove(permissions, 'customers.*')
           || ARRAY['customers.view', 'customers.manage', 'customers.debts', 'customers.receive']) ORDER BY 1)
       WHERE 'customers.*' = ANY (permissions) AND NOT ('partners.*' = ANY (permissions))`,
    )
    await queryRunner.query(
      `UPDATE roles SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['customers.receive']) ORDER BY 1)
       WHERE 'customers.debts' = ANY (permissions)`,
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    const [{ phoneless }]: { phoneless: number }[] = await queryRunner.query(
      `SELECT count(*)::int AS phoneless FROM customers WHERE phone IS NULL`,
    )
    if (phoneless) {
      throw new Error(`${phoneless} ta mijozning telefoni yo‘q: qaytarib bo‘lmaydi`)
    }
    await queryRunner.query(
      `UPDATE users SET extra_permissions = ARRAY(SELECT unnest(extra_permissions) EXCEPT SELECT unnest($1::text[]))
       WHERE extra_permissions && $1::text[]`,
      [NEW_KEYS],
    )
    await queryRunner.query(
      `UPDATE roles SET permissions = ARRAY(SELECT unnest(permissions) EXCEPT SELECT unnest($1::text[]) ORDER BY 1)
       WHERE permissions && $1::text[]`,
      [NEW_KEYS],
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
    await queryRunner.query(`
      ALTER TABLE customers
        DROP CONSTRAINT customers_no_due, DROP CONSTRAINT customers_credit_limit, DROP CONSTRAINT customers_currency,
        DROP COLUMN return_days, DROP COLUMN no_due, DROP COLUMN due_days, DROP COLUMN credit_limit,
        DROP COLUMN credit, DROP COLUMN is_supplier, DROP COLUMN price_type_id, DROP COLUMN currency;
      DROP INDEX customers_org_phone;
      ALTER TABLE customers ALTER COLUMN phone SET NOT NULL;
      CREATE UNIQUE INDEX customers_org_phone ON customers (org_id, phone);
    `)
  }
}
