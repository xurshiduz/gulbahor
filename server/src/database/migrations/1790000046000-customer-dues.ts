import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * Debts are the customer's account (KEYINGI-REJA, 16.3). A sale left owing
 * no longer has a book of its own (`customer_debts`, `debt_payments`): what
 * it puts on the customer's account is a payment by `account`, and the day
 * the debt it adds falls due is a row here, apart from the immutable payment
 * so that the day can be moved. An opening balance may have a day too. What
 * is owed, overdue or next due is read from the account against these days.
 *
 * `sale_payments.prepaid` keeps what of a sale on account the customer's own
 * money there (haqi) covered: that part was never lent.
 *
 * Old retail debts are not carried over: a business that has any is refused
 * and asked to settle them first. Sales already on an account get a row with
 * no day.
 */
export class CustomerDues1790000046000 implements MigrationInterface {
  name = 'CustomerDues1790000046000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    const [{ debts, payments }]: { debts: number; payments: number }[] = await queryRunner.query(
      `SELECT (SELECT count(*) FROM customer_debts)::int AS debts, (SELECT count(*) FROM debt_payments)::int AS payments`,
    )
    if (debts || payments) {
      throw new Error(
        `Chakana qarz yozuvlari bor (${debts} ta qarz, ${payments} ta to‘lov): ular mijoz hisobiga ko‘chirilmaydi. ` +
          'Avval qarzlarni yoping yoki bazaning nusxasida qo‘lda ko‘chiring.',
      )
    }
    await queryRunner.query(`
      CREATE TABLE customer_dues (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        -- What added the debt: a sale on account, or an opening balance.
        sale_id uuid REFERENCES sales(id) ON DELETE RESTRICT,
        payment_id uuid REFERENCES customer_payments(id) ON DELETE RESTRICT,
        -- Null: never falls due.
        due_date date,
        changed_by uuid,
        changed_by_name text,
        changed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (num_nonnulls(sale_id, payment_id) = 1)
      );
      CREATE UNIQUE INDEX customer_dues_sale ON customer_dues (sale_id) WHERE sale_id IS NOT NULL;
      CREATE UNIQUE INDEX customer_dues_payment ON customer_dues (payment_id) WHERE payment_id IS NOT NULL;
      CREATE INDEX customer_dues_customer ON customer_dues (customer_id);

      ALTER TABLE sale_payments ADD COLUMN prepaid bigint NOT NULL DEFAULT 0;
      ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_prepaid CHECK (prepaid >= 0 AND prepaid <= amount);
      ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_method_check;
      ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal', 'exchange', 'account'));
      ALTER TABLE sale_return_payments DROP CONSTRAINT sale_return_payments_method_check;
      ALTER TABLE sale_return_payments ADD CONSTRAINT sale_return_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal', 'account'));

      -- What was sold on an account before had no day: it stays so.
      INSERT INTO customer_dues (org_id, customer_id, sale_id, due_date)
      SELECT s.org_id, s.customer_id, s.id, NULL
      FROM sales s
      WHERE s.status = 'completed' AND s.customer_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM sale_payments p WHERE p.sale_id = s.id AND p.method = 'account');

      DROP TABLE debt_payment_parts;
      DROP TABLE debt_payment_lines;
      DROP TABLE debt_payments;
      DROP TABLE customer_debts;
    `)
    await queryRunner.query(tenantPolicy('customer_dues'))
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    const [{ used }]: { used: boolean }[] = await queryRunner.query(`
      SELECT EXISTS (SELECT 1 FROM customer_dues WHERE due_date IS NOT NULL OR payment_id IS NOT NULL)
          OR EXISTS (SELECT 1 FROM sale_payments WHERE prepaid > 0) AS used
    `)
    if (used) {
      throw new Error('Mijoz hisobiga muddatli qarz yozilgan: migratsiyani qaytarib bo‘lmaydi')
    }
    await queryRunner.query(`
      DROP TABLE customer_dues;
      ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_prepaid;
      ALTER TABLE sale_payments DROP COLUMN prepaid;
      ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_method_check;
      ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal', 'exchange', 'debt', 'account'));
      ALTER TABLE sale_return_payments DROP CONSTRAINT sale_return_payments_method_check;
      ALTER TABLE sale_return_payments ADD CONSTRAINT sale_return_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal', 'debt', 'account'));

      CREATE TABLE customer_debts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
        location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
        amount bigint NOT NULL CHECK (amount > 0),
        paid bigint NOT NULL DEFAULT 0 CHECK (paid >= 0),
        returned bigint NOT NULL DEFAULT 0 CHECK (returned >= 0),
        due_date date NOT NULL,
        cancelled boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (paid + returned <= amount)
      );
      CREATE UNIQUE INDEX customer_debts_sale ON customer_debts (sale_id);
      CREATE INDEX customer_debts_customer ON customer_debts (customer_id, due_date);
      CREATE INDEX customer_debts_owed ON customer_debts (org_id, due_date)
        WHERE NOT cancelled AND paid + returned < amount;

      CREATE TABLE debt_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        number text NOT NULL,
        client_key uuid NOT NULL,
        status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
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
        currency text NOT NULL CONSTRAINT debt_payment_lines_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
        amount bigint NOT NULL CHECK (amount > 0),
        rate numeric(18, 6),
        base bigint NOT NULL,
        shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL,
        fx bigint NOT NULL DEFAULT 0
      );
      CREATE INDEX debt_payment_lines_payment ON debt_payment_lines (payment_id, position);
      CREATE INDEX debt_payment_lines_shift ON debt_payment_lines (shift_id);

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
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }
}
