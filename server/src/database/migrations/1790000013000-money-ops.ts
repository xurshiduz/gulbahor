import { STARTER_MONEY_CATEGORIES } from '@gulbahor/core'
import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * Expenses and other money in and out.
 *
 * `money_categories` say what money was for: rent, wages, lunch; or, the
 * other way, something earned on the side. One that is not `in_profit` is
 * the owner taking money out or putting it in, which is neither spent nor
 * earned. A `money_op` is one such sum leaving or coming in; each of its
 * lines is what went out of, or into, one of the business's accounts, with
 * the rate it was valued at and its worth in so'm.
 */
export class MoneyOps1790000013000 implements MigrationInterface {
  name = 'MoneyOps1790000013000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE money_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        kind text NOT NULL CHECK (kind IN ('expense', 'income')),
        name text NOT NULL,
        in_profit boolean NOT NULL DEFAULT true,
        is_active boolean NOT NULL DEFAULT true,
        sort_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX money_categories_name ON money_categories (org_id, kind, lower(name));

      CREATE TABLE money_ops (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        number text NOT NULL,
        -- Made by the screen for each document: the same one sent twice is made once.
        client_key uuid NOT NULL,
        kind text NOT NULL CHECK (kind IN ('expense', 'income')),
        status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
        category_id uuid NOT NULL REFERENCES money_categories(id) ON DELETE RESTRICT,
        -- What it comes to, in so'm.
        total bigint NOT NULL,
        done_at timestamptz NOT NULL DEFAULT now(),
        done_on date NOT NULL,
        created_by uuid,
        created_by_name text,
        paid_by text NOT NULL DEFAULT '',
        note text,
        cancelled_at timestamptz,
        cancelled_by uuid,
        cancelled_by_name text,
        cancel_reason text,
        search_key text NOT NULL DEFAULT ''
      );
      CREATE UNIQUE INDEX money_ops_org_number ON money_ops (org_id, number);
      CREATE UNIQUE INDEX money_ops_client_key ON money_ops (org_id, client_key);
      CREATE INDEX money_ops_list ON money_ops (org_id, done_at DESC);
      CREATE INDEX money_ops_category ON money_ops (category_id, done_on);
      CREATE INDEX money_ops_search ON money_ops USING gin (search_key gin_trgm_ops);

      CREATE TABLE money_op_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        op_id uuid NOT NULL REFERENCES money_ops(id) ON DELETE CASCADE,
        position int NOT NULL,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        currency text NOT NULL CHECK (currency IN ('UZS', 'USD')),
        amount bigint NOT NULL CHECK (amount > 0),
        -- So'm for a dollar; set only on a line in dollars.
        rate numeric(14, 2),
        -- The line's worth in so'm.
        base bigint NOT NULL,
        -- The till's shift, when the money went through a drawer: for its report.
        shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL
      );
      CREATE INDEX money_op_lines_op ON money_op_lines (op_id, position);
      CREATE INDEX money_op_lines_shift ON money_op_lines (shift_id);
    `)
    for (const table of ['money_categories', 'money_ops', 'money_op_lines']) {
      await queryRunner.query(tenantPolicy(table))
    }

    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    // Every business that is already here starts with the same kinds a new one does.
    await queryRunner.query(
      `INSERT INTO money_categories (org_id, kind, name, in_profit, sort_order)
       SELECT o.id, c.kind, c.name, c.in_profit, c.sort_order::int
       FROM organizations o
       CROSS JOIN unnest($1::text[], $2::text[], $3::boolean[]) WITH ORDINALITY AS c (kind, name, in_profit, sort_order)`,
      [
        STARTER_MONEY_CATEGORIES.map((category) => category.kind),
        STARTER_MONEY_CATEGORIES.map((category) => category.name),
        STARTER_MONEY_CATEGORIES.map((category) => category.inProfit),
      ],
    )
    // A shop's manager pays for the shop's small needs; whoever keeps the books writes them down and names them.
    await queryRunner.query(
      `UPDATE roles
       SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['money.ops']) ORDER BY 1)
       WHERE template_key IN ('store_manager', 'accountant')`,
    )
    await queryRunner.query(
      `UPDATE roles
       SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['money.categories']) ORDER BY 1)
       WHERE template_key = 'accountant'`,
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The accounts they were written to stay: the ledger still holds their entries.
    await queryRunner.query(`DROP TABLE IF EXISTS money_op_lines, money_ops, money_categories CASCADE`)
  }
}
