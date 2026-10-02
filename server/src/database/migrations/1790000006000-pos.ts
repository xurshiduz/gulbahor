import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * The till and the money under it.
 *
 * `accounts` are where money is: a till's cash in each currency, a card, a
 * terminal's money on its way to the bank, and the business's own accounts
 * for what money came from or went to (sales, rounding, a short count).
 * `ledger_entries` with their `ledger_lines` are the only way a balance
 * changes: every entry moves money between accounts and its lines, valued
 * in so'm, add up to nothing. The database refuses an entry that does not.
 *
 * A `shift` is one cashier's time at one till, opened and closed by counting
 * the drawer. A `sale` belongs to a shift, takes its goods out of stock
 * oldest batch first and remembers which pieces it took.
 */
const ROLE_GRANTS: Record<string, string[]> = {
  manager: ['pos.*', 'sales.*', 'money.*'],
  accountant: ['sales.*', 'money.view', 'money.rates'],
  store_manager: ['pos.*', 'sales.*'],
  cashier: ['pos.sell'],
}

const KINDS_BEFORE = `'receipt', 'receipt_cancel', 'revalue', 'transfer', 'transfer_cancel', 'transfer_loss', 'writeoff', 'writeoff_cancel', 'count'`
const KINDS = `${KINDS_BEFORE}, 'sale', 'sale_void'`

export class Pos1790000006000 implements MigrationInterface {
  name = 'Pos1790000006000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind;
      ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind CHECK (kind IN (${KINDS}));

      CREATE TABLE exchange_rates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        rate_date date NOT NULL,
        uzs_per_usd numeric(14, 2) NOT NULL CHECK (uzs_per_usd > 0),
        set_by uuid,
        set_by_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (org_id, rate_date)
      );

      CREATE TABLE registers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
        name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX registers_name ON registers (org_id, location_id, lower(name));

      CREATE TABLE accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        kind text NOT NULL CHECK (kind IN ('cash', 'safe', 'card', 'terminal', 'bank', 'system')),
        system_key text,
        name text NOT NULL,
        currency text NOT NULL DEFAULT 'UZS' CHECK (currency IN ('UZS', 'USD')),
        location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
        register_id uuid REFERENCES registers(id) ON DELETE CASCADE,
        last4 text,
        bank text,
        -- Kept in step with the ledger by the same transaction that writes it.
        balance bigint NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK ((kind = 'system') = (system_key IS NOT NULL)),
        CHECK ((kind = 'cash') = (register_id IS NOT NULL))
      );
      CREATE UNIQUE INDEX accounts_system ON accounts (org_id, system_key) WHERE system_key IS NOT NULL;
      CREATE UNIQUE INDEX accounts_till ON accounts (register_id, currency) WHERE register_id IS NOT NULL;

      CREATE TABLE ledger_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        entry_date date NOT NULL,
        kind text NOT NULL,
        document_type text,
        document_id uuid,
        shift_id uuid,
        note text,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX ledger_entries_date ON ledger_entries (org_id, entry_date);
      CREATE INDEX ledger_entries_document ON ledger_entries (document_type, document_id);

      CREATE TABLE ledger_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        entry_id uuid NOT NULL REFERENCES ledger_entries(id) ON DELETE CASCADE,
        position int NOT NULL,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        -- In the account's own currency, and what that is worth in so'm.
        amount bigint NOT NULL,
        base bigint NOT NULL
      );
      CREATE INDEX ledger_lines_entry ON ledger_lines (entry_id);
      CREATE INDEX ledger_lines_account ON ledger_lines (account_id);

      -- Money does not appear from nowhere: at commit, the lines of every entry must add up to nothing.
      CREATE FUNCTION ledger_entry_balanced() RETURNS trigger AS $$
      BEGIN
        IF (SELECT coalesce(sum(base), 0) FROM ledger_lines WHERE entry_id = NEW.entry_id) <> 0 THEN
          RAISE EXCEPTION 'ledger entry % does not balance', NEW.entry_id USING ERRCODE = '23514';
        END IF;
        RETURN NULL;
      END
      $$ LANGUAGE plpgsql;
      CREATE CONSTRAINT TRIGGER ledger_lines_balanced AFTER INSERT ON ledger_lines
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_entry_balanced();

      CREATE TABLE shifts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        number text NOT NULL,
        register_id uuid NOT NULL REFERENCES registers(id) ON DELETE RESTRICT,
        location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
        status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        opened_by uuid,
        opened_by_name text,
        opened_at timestamptz NOT NULL DEFAULT now(),
        opening_uzs bigint NOT NULL,
        opening_usd bigint NOT NULL DEFAULT 0,
        closed_by uuid,
        closed_by_name text,
        closed_at timestamptz,
        counted_uzs bigint,
        counted_usd bigint,
        expected_uzs bigint,
        expected_usd bigint,
        diff_uzs bigint,
        diff_usd bigint,
        note text
      );
      CREATE UNIQUE INDEX shifts_org_number ON shifts (org_id, number);
      CREATE UNIQUE INDEX shifts_one_open ON shifts (register_id) WHERE status = 'open';
      CREATE INDEX shifts_list ON shifts (org_id, opened_at DESC);

      CREATE TABLE sales (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        number text NOT NULL,
        -- Made by the till for each sale: the same sale sent twice is made once.
        client_key uuid NOT NULL,
        shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
        register_id uuid NOT NULL REFERENCES registers(id) ON DELETE RESTRICT,
        location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
        status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided')),
        sold_at timestamptz NOT NULL DEFAULT now(),
        -- The business's day the sale fell on, which is not the server's.
        sold_on date NOT NULL,
        cashier_id uuid,
        cashier_name text,
        seller_id uuid,
        seller_name text,
        qty numeric(14, 3) NOT NULL,
        subtotal bigint NOT NULL,
        discount bigint NOT NULL DEFAULT 0,
        total bigint NOT NULL,
        uzs_per_usd numeric(14, 2),
        change_uzs bigint NOT NULL DEFAULT 0,
        change_usd bigint NOT NULL DEFAULT 0,
        rounding bigint NOT NULL DEFAULT 0,
        cost_usd bigint NOT NULL DEFAULT 0,
        cost_uzs bigint NOT NULL DEFAULT 0,
        paid_by text NOT NULL DEFAULT '',
        note text,
        search_key text NOT NULL DEFAULT '',
        voided_at timestamptz,
        voided_by uuid,
        voided_by_name text,
        void_reason text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX sales_org_number ON sales (org_id, number);
      CREATE UNIQUE INDEX sales_client_key ON sales (org_id, client_key);
      CREATE INDEX sales_list ON sales (org_id, sold_at DESC);
      CREATE INDEX sales_shift ON sales (shift_id);
      CREATE INDEX sales_search ON sales USING gin (search_key gin_trgm_ops);

      CREATE TABLE sale_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        position int NOT NULL,
        variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        qty numeric(14, 3) NOT NULL CHECK (qty > 0),
        price bigint NOT NULL CHECK (price >= 0),
        discount bigint NOT NULL DEFAULT 0 CHECK (discount >= 0),
        total bigint NOT NULL CHECK (total >= 0),
        cost_usd bigint NOT NULL DEFAULT 0,
        cost_uzs bigint NOT NULL DEFAULT 0,
        unit_id uuid REFERENCES rfid_units(id) ON DELETE SET NULL
      );
      CREATE INDEX sale_lines_sale ON sale_lines (sale_id, position);
      CREATE INDEX sale_lines_variant ON sale_lines (variant_id);

      -- The pieces of batches a line took, so a void puts back exactly those.
      CREATE TABLE sale_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        line_id uuid NOT NULL REFERENCES sale_lines(id) ON DELETE CASCADE,
        position int NOT NULL,
        batch_id uuid NOT NULL REFERENCES stock_batches(id) ON DELETE RESTRICT,
        variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        qty numeric(14, 3) NOT NULL CHECK (qty > 0),
        cost_usd bigint NOT NULL,
        cost_uzs bigint NOT NULL
      );
      CREATE INDEX sale_items_sale ON sale_items (sale_id);

      CREATE TABLE sale_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        position int NOT NULL,
        method text NOT NULL CHECK (method IN ('cash', 'card', 'terminal')),
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        currency text NOT NULL CHECK (currency IN ('UZS', 'USD')),
        amount bigint NOT NULL CHECK (amount > 0),
        base bigint NOT NULL,
        reference text
      );
      CREATE INDEX sale_payments_sale ON sale_payments (sale_id, position);

      ALTER TABLE rfid_units DROP CONSTRAINT rfid_units_status;
      ALTER TABLE rfid_units ADD CONSTRAINT rfid_units_status CHECK (status IN ('ready', 'in_stock', 'sold', 'void'));
      ALTER TABLE rfid_units ADD COLUMN sale_id uuid REFERENCES sales(id) ON DELETE SET NULL;

      CREATE TRIGGER registers_touch BEFORE UPDATE ON registers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
      CREATE TRIGGER accounts_touch BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
    `)

    for (const table of [
      'exchange_rates',
      'registers',
      'accounts',
      'ledger_entries',
      'ledger_lines',
      'shifts',
      'sales',
      'sale_lines',
      'sale_items',
      'sale_payments',
    ]) {
      await queryRunner.query(tenantPolicy(table))
    }

    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    for (const [templateKey, permissions] of Object.entries(ROLE_GRANTS)) {
      await queryRunner.query(
        `UPDATE roles
         SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || $2::text[]) ORDER BY 1)
         WHERE template_key = $1`,
        [templateKey, permissions],
      )
    }
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rfid_units DROP COLUMN IF EXISTS sale_id;
      UPDATE rfid_units SET status = 'in_stock' WHERE status = 'sold';
      ALTER TABLE rfid_units DROP CONSTRAINT rfid_units_status;
      ALTER TABLE rfid_units ADD CONSTRAINT rfid_units_status CHECK (status IN ('ready', 'in_stock', 'void'));
      DROP TABLE IF EXISTS sale_payments, sale_items, sale_lines, sales, shifts, ledger_lines, ledger_entries,
        accounts, registers, exchange_rates CASCADE;
      DROP FUNCTION IF EXISTS ledger_entry_balanced();
      DELETE FROM stock_movements WHERE kind IN ('sale', 'sale_void');
      ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind;
      ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind CHECK (kind IN (${KINDS_BEFORE}));
    `)
  }
}
