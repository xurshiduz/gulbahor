import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * What partners owe and are owed.
 *
 * Every partner gets a currency its account is kept in, and an account in
 * the money ledger (`accounts.kind = 'partner'`): its balance is what the
 * partner owes the business, negative when the business owes them. A
 * `partner_payment` is money changing hands with a partner; each of its
 * lines is one sum into or out of one of the business's accounts, with the
 * rate it was valued at and how much of the partner's account it settled.
 */
export class PartnerAccounts1790000010000 implements MigrationInterface {
  name = 'PartnerAccounts1790000010000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE partners ADD COLUMN currency text NOT NULL DEFAULT 'UZS' CHECK (currency IN ('UZS', 'USD'));

      ALTER TABLE accounts DROP CONSTRAINT accounts_kind_check;
      ALTER TABLE accounts ADD CONSTRAINT accounts_kind_check
        CHECK (kind IN ('cash', 'safe', 'card', 'terminal', 'bank', 'system', 'partner'));
      ALTER TABLE accounts ADD COLUMN partner_id uuid REFERENCES partners(id) ON DELETE RESTRICT;
      ALTER TABLE accounts ADD CONSTRAINT accounts_partner CHECK ((kind = 'partner') = (partner_id IS NOT NULL));
      CREATE UNIQUE INDEX accounts_of_partner ON accounts (partner_id) WHERE partner_id IS NOT NULL;

      CREATE TABLE partner_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        number text NOT NULL,
        -- Made by the screen for each payment: the same one sent twice is made once.
        client_key uuid NOT NULL,
        kind text NOT NULL CHECK (kind IN ('in', 'out', 'opening')),
        status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
        partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
        -- The currency of the partner's account when it was made, and how the partner's debt changed in it.
        currency text NOT NULL CHECK (currency IN ('UZS', 'USD')),
        change bigint NOT NULL,
        paid_at timestamptz NOT NULL DEFAULT now(),
        paid_on date NOT NULL,
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
      CREATE UNIQUE INDEX partner_payments_org_number ON partner_payments (org_id, number);
      CREATE UNIQUE INDEX partner_payments_client_key ON partner_payments (org_id, client_key);
      CREATE INDEX partner_payments_list ON partner_payments (org_id, paid_at DESC);
      CREATE INDEX partner_payments_partner ON partner_payments (partner_id, paid_at);
      CREATE INDEX partner_payments_search ON partner_payments USING gin (search_key gin_trgm_ops);

      CREATE TABLE partner_payment_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        payment_id uuid NOT NULL REFERENCES partner_payments(id) ON DELETE CASCADE,
        position int NOT NULL,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        currency text NOT NULL CHECK (currency IN ('UZS', 'USD')),
        amount bigint NOT NULL CHECK (amount > 0),
        -- So'm for a dollar; set only where one currency was changed into the other.
        rate numeric(14, 2),
        -- What the line settled on the partner's account, in the partner's currency.
        settled bigint NOT NULL,
        -- The till's shift, when the money went through a drawer: for its report.
        shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL
      );
      CREATE INDEX partner_payment_lines_payment ON partner_payment_lines (payment_id, position);
      CREATE INDEX partner_payment_lines_shift ON partner_payment_lines (shift_id);
    `)
    for (const table of ['partner_payments', 'partner_payment_lines']) {
      await queryRunner.query(tenantPolicy(table))
    }

    // Whoever keeps the books sees what partners owe.
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(
      `UPDATE roles
       SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['partners.debts']) ORDER BY 1)
       WHERE template_key = 'accountant'`,
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS partner_payment_lines, partner_payments CASCADE;
      DELETE FROM accounts WHERE kind = 'partner';
      DROP INDEX IF EXISTS accounts_of_partner;
      ALTER TABLE accounts DROP CONSTRAINT accounts_partner;
      ALTER TABLE accounts DROP COLUMN partner_id;
      ALTER TABLE accounts DROP CONSTRAINT accounts_kind_check;
      ALTER TABLE accounts ADD CONSTRAINT accounts_kind_check
        CHECK (kind IN ('cash', 'safe', 'card', 'terminal', 'bank', 'system'));
      ALTER TABLE partners DROP COLUMN currency;
    `)
  }
}
