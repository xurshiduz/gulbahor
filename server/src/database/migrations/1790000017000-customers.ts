import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * The people who buy in the shops.
 *
 * A customer is known by their phone number, one to a business. A sale
 * remembers who it was made out to, by id and by name as it then was; what a
 * customer has bought is the sum of those sales.
 */
export class Customers1790000017000 implements MigrationInterface {
  name = 'Customers1790000017000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE customers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL,
        phone text NOT NULL,
        birthday date,
        gender text CHECK (gender IN ('female', 'male')),
        note text,
        -- The shop where they were first written down.
        location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
        is_active boolean NOT NULL DEFAULT true,
        search_key text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX customers_org_phone ON customers (org_id, phone);
      CREATE INDEX customers_search ON customers USING gin (search_key gin_trgm_ops);

      ALTER TABLE sales
        ADD COLUMN customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
        ADD COLUMN customer_name text;
      CREATE INDEX sales_customer ON sales (customer_id, sold_at) WHERE customer_id IS NOT NULL;
    `)
    await queryRunner.query(tenantPolicy('customers'))

    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    // A shop's manager keeps the shop's customers; whoever keeps the books looks at them.
    await queryRunner.query(
      `UPDATE roles
       SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['customers.view', 'customers.manage']) ORDER BY 1)
       WHERE template_key = 'store_manager'`,
    )
    await queryRunner.query(
      `UPDATE roles
       SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['customers.view']) ORDER BY 1)
       WHERE template_key = 'accountant'`,
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS sales_customer;
      ALTER TABLE sales DROP COLUMN customer_id, DROP COLUMN customer_name;
      DROP TABLE IF EXISTS customers CASCADE;
    `)
  }
}
