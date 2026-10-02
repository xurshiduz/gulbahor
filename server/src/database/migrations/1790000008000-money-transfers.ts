import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * Money moved between accounts: a till's cash handed over to a safe, change
 * money brought to a till. A `money_transfer` is sent by one person and
 * confirmed by another; in between the money is in neither account but in
 * the ledger's "on its way" account. Refused or taken back, it returns to
 * the account it left.
 */
export class MoneyTransfers1790000008000 implements MigrationInterface {
  name = 'MoneyTransfers1790000008000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE money_transfers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        number text NOT NULL,
        -- Made by the screen for each transfer: the same one sent twice is made once.
        client_key uuid NOT NULL,
        status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'received', 'rejected', 'cancelled')),
        from_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        to_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        currency text NOT NULL CHECK (currency IN ('UZS', 'USD')),
        amount bigint NOT NULL CHECK (amount > 0),
        -- Its worth in so'm when it was sent: what the money on its way is carried at until it arrives.
        base bigint NOT NULL,
        -- The shifts whose drawers it left and entered, for their reports.
        from_shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL,
        to_shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL,
        sent_at timestamptz NOT NULL DEFAULT now(),
        sent_on date NOT NULL,
        sent_by uuid,
        sent_by_name text,
        decided_at timestamptz,
        decided_by uuid,
        decided_by_name text,
        note text,
        reason text,
        search_key text NOT NULL DEFAULT '',
        CHECK (from_account_id <> to_account_id)
      );
      CREATE UNIQUE INDEX money_transfers_org_number ON money_transfers (org_id, number);
      CREATE UNIQUE INDEX money_transfers_client_key ON money_transfers (org_id, client_key);
      CREATE INDEX money_transfers_list ON money_transfers (org_id, sent_at DESC);
      CREATE INDEX money_transfers_waiting ON money_transfers (to_account_id) WHERE status = 'sent';
      CREATE INDEX money_transfers_from_shift ON money_transfers (from_shift_id);
      CREATE INDEX money_transfers_to_shift ON money_transfers (to_shift_id);
      CREATE INDEX money_transfers_search ON money_transfers USING gin (search_key gin_trgm_ops);
    `)
    await queryRunner.query(tenantPolicy('money_transfers'))

    // A shop's manager takes the cash from its tills.
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(
      `UPDATE roles
       SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['money.collect']) ORDER BY 1)
       WHERE template_key = 'store_manager'`,
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS money_transfers CASCADE`)
  }
}
