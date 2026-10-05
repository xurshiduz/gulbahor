import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * What customers owe.
 *
 * A sale may leave part of its total owing: that part is a payment of the
 * sale by the method `debt`, into the ledger's `receivables` account, and a
 * row here that says who owes it, for which receipt, and by when. Money
 * brought later (`debt_payments`, into the accounts of `debt_payment_lines`)
 * is shared out over the customer's debts, the oldest due first
 * (`debt_payment_parts`). Goods brought back come off the debt of their
 * receipt (`returned`) before any money is handed back.
 */
export class CustomerDebts1790000024000 implements MigrationInterface {
  name = 'CustomerDebts1790000024000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_method_check;
      ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal', 'exchange', 'debt'));
      ALTER TABLE sale_return_payments DROP CONSTRAINT sale_return_payments_method_check;
      ALTER TABLE sale_return_payments ADD CONSTRAINT sale_return_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal', 'debt'));

      CREATE TABLE customer_debts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        -- The receipt that made it: one debt to a receipt.
        sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
        location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
        -- What was lent; what has come back as money; what goods brought back took off. In so'm.
        amount bigint NOT NULL CHECK (amount > 0),
        paid bigint NOT NULL DEFAULT 0 CHECK (paid >= 0),
        returned bigint NOT NULL DEFAULT 0 CHECK (returned >= 0),
        due_date date NOT NULL,
        -- The receipt was undone: nothing is owed and nothing ever was.
        cancelled boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (paid + returned <= amount)
      );
      CREATE UNIQUE INDEX customer_debts_sale ON customer_debts (sale_id);
      CREATE INDEX customer_debts_customer ON customer_debts (customer_id, due_date);
      -- What is still owed is asked for all the time: by the till, by the list of debts.
      CREATE INDEX customer_debts_owed ON customer_debts (org_id, due_date)
        WHERE NOT cancelled AND paid + returned < amount;

      CREATE TABLE debt_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        number text NOT NULL,
        -- Made by the screen for each payment: the same one sent twice is taken once.
        client_key uuid NOT NULL,
        status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        -- What it comes to, in so'm.
        total bigint NOT NULL CHECK (total > 0),
        paid_at timestamptz NOT NULL DEFAULT now(),
        paid_on date NOT NULL,
        paid_by text NOT NULL DEFAULT '',
        created_by uuid,
        created_by_name text,
        note text,
        cancelled_at timestamptz,
        cancelled_by uuid,
        cancelled_by_name text,
        cancel_reason text
      );
      CREATE UNIQUE INDEX debt_payments_org_number ON debt_payments (org_id, number);
      CREATE UNIQUE INDEX debt_payments_client_key ON debt_payments (org_id, client_key);
      CREATE INDEX debt_payments_list ON debt_payments (org_id, paid_at DESC);
      CREATE INDEX debt_payments_customer ON debt_payments (customer_id, paid_at DESC);

      CREATE TABLE debt_payment_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        payment_id uuid NOT NULL REFERENCES debt_payments(id) ON DELETE CASCADE,
        position int NOT NULL,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        currency text NOT NULL CHECK (currency IN ('UZS', 'USD')),
        amount bigint NOT NULL CHECK (amount > 0),
        -- So'm for a dollar; set only on a line in dollars.
        rate numeric(14, 2),
        -- The line's worth in so'm.
        base bigint NOT NULL,
        -- The till's shift, when the money went into a drawer: for its report.
        shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL
      );
      CREATE INDEX debt_payment_lines_payment ON debt_payment_lines (payment_id, position);
      CREATE INDEX debt_payment_lines_shift ON debt_payment_lines (shift_id);

      -- How much of a payment went to which debt.
      CREATE TABLE debt_payment_parts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        payment_id uuid NOT NULL REFERENCES debt_payments(id) ON DELETE CASCADE,
        debt_id uuid NOT NULL REFERENCES customer_debts(id) ON DELETE RESTRICT,
        amount bigint NOT NULL CHECK (amount > 0)
      );
      CREATE INDEX debt_payment_parts_payment ON debt_payment_parts (payment_id);
      CREATE INDEX debt_payment_parts_debt ON debt_payment_parts (debt_id);
    `)
    for (const table of ['customer_debts', 'debt_payments', 'debt_payment_lines', 'debt_payment_parts']) {
      await queryRunner.query(tenantPolicy(table))
    }

    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    // A shop's manager may lend where a cashier may not, and keeps the shop's debts; whoever keeps the books sees them.
    await queryRunner.query(
      `UPDATE roles
       SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['pos.debt', 'customers.debts']) ORDER BY 1)
       WHERE template_key = 'store_manager'`,
    )
    await queryRunner.query(
      `UPDATE roles
       SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['customers.debts']) ORDER BY 1)
       WHERE template_key = 'accountant'`,
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE debt_payment_parts;
      DROP TABLE debt_payment_lines;
      DROP TABLE debt_payments;
      DROP TABLE customer_debts;
      DELETE FROM sale_return_payments WHERE method = 'debt';
      DELETE FROM sale_payments WHERE method = 'debt';
      ALTER TABLE sale_return_payments DROP CONSTRAINT sale_return_payments_method_check;
      ALTER TABLE sale_return_payments ADD CONSTRAINT sale_return_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal'));
      ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_method_check;
      ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal', 'exchange'));
    `)
  }
}
