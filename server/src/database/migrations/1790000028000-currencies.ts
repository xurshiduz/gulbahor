import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * The currencies a business switches on, and the rate of each.
 *
 * `org_currencies` is what a business keeps beside its base, and how the
 * rate of each is written: against which other currency, and which way
 * round ("1 $ = 7,25 ¥" or "1 ₽ = 135 so'm"). The base is not here — it has
 * no rate — and neither is the dollar the tills count in: its rate goes on
 * living in `exchange_rates`, where every sale has always found it.
 *
 * `currency_rates` is a rate from a day on, kept whole — both currencies
 * and the way round — as it was written that day. A currency whose rate is
 * later written another way still has a past that reads as it was meant.
 *
 * Nothing is kept in these currencies yet; this is the list and the rates.
 * A currency put away stays in its row, and so do its rates.
 *
 * The list of currencies itself grew, so the receipts no longer name each
 * code they take: what a currency is, the application says.
 */
const CODE = `~ '^[A-Z]{3}$'`
const OLD_CODES = `'UZS', 'USD', 'CNY', 'KGS', 'TRY', 'RUB', 'KZT', 'EUR', 'AED'`

const RECEIPT_CHECKS: [table: string, column: string][] = [
  ['receipts', 'currency'],
  ['receipts', 'extra_currency'],
  ['receipt_expenses', 'currency'],
]

export class Currencies1790000028000 implements MigrationInterface {
  name = 'Currencies1790000028000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE org_currencies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        code text NOT NULL CHECK (code ${CODE}),
        against text NOT NULL CHECK (against ${CODE}),
        way text NOT NULL CHECK (way IN ('per', 'in')),
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (org_id, code),
        CHECK (code <> against)
      );

      CREATE TABLE currency_rates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        code text NOT NULL,
        rate_date date NOT NULL,
        against text NOT NULL CHECK (against ${CODE}),
        way text NOT NULL CHECK (way IN ('per', 'in')),
        value numeric(18, 6) NOT NULL CHECK (value > 0),
        set_by uuid,
        set_by_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (org_id, code, rate_date),
        FOREIGN KEY (org_id, code) REFERENCES org_currencies (org_id, code) ON DELETE CASCADE
      );
    `)
    for (const table of ['org_currencies', 'currency_rates']) {
      await queryRunner.query(tenantPolicy(table))
    }
    for (const [table, column] of RECEIPT_CHECKS) {
      await queryRunner.query(`
        ALTER TABLE ${table} DROP CONSTRAINT ${table}_${column}_check;
        ALTER TABLE ${table} ADD CONSTRAINT ${table}_${column}_check CHECK (${column} ${CODE});
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of RECEIPT_CHECKS) {
      await queryRunner.query(`
        ALTER TABLE ${table} DROP CONSTRAINT ${table}_${column}_check;
        ALTER TABLE ${table} ADD CONSTRAINT ${table}_${column}_check CHECK (${column} IN (${OLD_CODES}));
      `)
    }
    await queryRunner.query(`
      DROP TABLE IF EXISTS currency_rates;
      DROP TABLE IF EXISTS org_currencies;
    `)
  }
}
