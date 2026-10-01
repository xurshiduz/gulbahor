import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * Receiving goods and keeping count of them.
 *
 * Stock is a ledger. Every change of quantity or value is a row in
 * `stock_movements`, written once and never changed; `stock_balances` is
 * what those rows add up to, kept alongside so reading stock is cheap.
 * Goods are counted by batch (`stock_batches`): one line of one receipt, with
 * the cost that line ended up with, so what leaves can be costed first in,
 * first out.
 */
const TENANT_TABLES = [
  'partners',
  'receipts',
  'receipt_lines',
  'receipt_expenses',
  'stock_batches',
  'stock_balances',
  'stock_movements',
]

const CURRENCIES = `'UZS', 'USD', 'CNY', 'KGS', 'TRY', 'RUB', 'KZT', 'EUR', 'AED'`

const ROLE_GRANTS: Record<string, string[]> = {
  manager: ['receipts.*', 'stock.*', 'partners.*'],
  accountant: ['receipts.view', 'stock.*', 'partners.view'],
  store_manager: ['stock.view'],
  cashier: ['stock.view'],
  seller: ['stock.view'],
  warehouse: ['receipts.*', 'stock.view', 'partners.view'],
  partners_manager: ['stock.view', 'partners.*'],
}

export class Receiving1790000002000 implements MigrationInterface {
  name = 'Receiving1790000002000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- What suppliers call the model and who made it; both come on packing lists.
      ALTER TABLE products ADD COLUMN factory_code text, ADD COLUMN manufacturer text;

      -- Anyone the business trades with. A partner can be a supplier, a buyer, or both.
      CREATE TABLE partners (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL,
        phone text,
        is_supplier boolean NOT NULL DEFAULT false,
        is_buyer boolean NOT NULL DEFAULT false,
        note text,
        is_active boolean NOT NULL DEFAULT true,
        search_key text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX partners_org_name ON partners (org_id, lower(name));
      CREATE INDEX partners_search ON partners USING gin (search_key gin_trgm_ops);

      CREATE TABLE receipts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        number text NOT NULL,
        status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
        location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
        supplier_id uuid REFERENCES partners(id) ON DELETE RESTRICT,
        doc_date date NOT NULL,
        currency text NOT NULL CHECK (currency IN (${CURRENCIES})),
        -- Units of "currency" per dollar, and so'm per dollar, on the day of the receipt.
        usd_rate numeric(18, 6) NOT NULL CHECK (usd_rate > 0),
        uzs_rate numeric(18, 6) NOT NULL CHECK (uzs_rate > 0),
        extra_currency text NOT NULL DEFAULT 'USD' CHECK (extra_currency IN (${CURRENCIES})),
        note text,
        -- The file a receipt was imported from, so the same file is not taken in twice unnoticed.
        source_file text,
        source_hash text,
        total_qty numeric(14, 3) NOT NULL DEFAULT 0,
        goods bigint NOT NULL DEFAULT 0,
        goods_usd bigint NOT NULL DEFAULT 0,
        goods_uzs bigint NOT NULL DEFAULT 0,
        expenses_usd bigint NOT NULL DEFAULT 0,
        expenses_uzs bigint NOT NULL DEFAULT 0,
        cost_usd bigint NOT NULL DEFAULT 0,
        cost_uzs bigint NOT NULL DEFAULT 0,
        has_estimates boolean NOT NULL DEFAULT false,
        search_key text NOT NULL DEFAULT '',
        created_by uuid,
        created_by_name text,
        posted_at timestamptz,
        posted_by uuid,
        posted_by_name text,
        cancelled_at timestamptz,
        cancelled_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX receipts_org_number ON receipts (org_id, number);
      CREATE INDEX receipts_org_date ON receipts (org_id, doc_date DESC);
      CREATE INDEX receipts_search ON receipts USING gin (search_key gin_trgm_ops);

      CREATE TABLE receipt_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        receipt_id uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
        position int NOT NULL,
        variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        supplier_id uuid REFERENCES partners(id) ON DELETE RESTRICT,
        qty numeric(14, 3) NOT NULL CHECK (qty > 0),
        price bigint NOT NULL CHECK (price >= 0),
        extra bigint NOT NULL DEFAULT 0 CHECK (extra >= 0),
        retail_price bigint CHECK (retail_price >= 0),
        wholesale_price bigint CHECK (wholesale_price >= 0),
        -- Landed cost of the whole line; set when the receipt is posted.
        cost_usd bigint,
        cost_uzs bigint
      );
      CREATE INDEX receipt_lines_receipt ON receipt_lines (receipt_id, position);
      CREATE INDEX receipt_lines_variant ON receipt_lines (variant_id);

      CREATE TABLE receipt_expenses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        receipt_id uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
        position int NOT NULL,
        name text NOT NULL,
        amount bigint NOT NULL CHECK (amount >= 0),
        currency text NOT NULL CHECK (currency IN (${CURRENCIES})),
        basis text NOT NULL CHECK (basis IN ('value', 'quantity', 'weight')),
        is_estimate boolean NOT NULL DEFAULT false,
        amount_usd bigint,
        amount_uzs bigint
      );
      CREATE INDEX receipt_expenses_receipt ON receipt_expenses (receipt_id, position);

      CREATE TABLE stock_batches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        receipt_line_id uuid REFERENCES receipt_lines(id) ON DELETE RESTRICT,
        -- Oldest goes out first.
        received_on date NOT NULL,
        qty numeric(14, 3) NOT NULL CHECK (qty > 0),
        cost_usd bigint NOT NULL,
        cost_uzs bigint NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX stock_batches_variant ON stock_batches (variant_id, received_on);
      CREATE UNIQUE INDEX stock_batches_line ON stock_batches (receipt_line_id) WHERE receipt_line_id IS NOT NULL;

      -- What is where right now: the sum of the movements, kept for reading.
      CREATE TABLE stock_balances (
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
        batch_id uuid NOT NULL REFERENCES stock_batches(id) ON DELETE RESTRICT,
        variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        qty numeric(14, 3) NOT NULL CHECK (qty >= 0),
        cost_usd bigint NOT NULL,
        cost_uzs bigint NOT NULL,
        PRIMARY KEY (location_id, batch_id),
        -- Nothing on hand is worth nothing.
        CHECK (qty > 0 OR (cost_usd = 0 AND cost_uzs = 0))
      );
      CREATE INDEX stock_balances_variant ON stock_balances (variant_id, location_id) WHERE qty > 0;

      CREATE TABLE stock_movements (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        kind text NOT NULL,
        doc_date date NOT NULL,
        document_type text NOT NULL,
        document_id uuid NOT NULL,
        line_id uuid,
        -- NULL when value is added to or taken from goods that have already left: nothing is on hand to carry it.
        location_id uuid REFERENCES locations(id) ON DELETE RESTRICT,
        batch_id uuid NOT NULL REFERENCES stock_batches(id) ON DELETE RESTRICT,
        variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        qty numeric(14, 3) NOT NULL,
        cost_usd bigint NOT NULL,
        cost_uzs bigint NOT NULL,
        actor_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        -- Named, so later versions can add their own kinds of movement.
        CONSTRAINT stock_movements_kind CHECK (kind IN ('receipt', 'receipt_cancel', 'revalue'))
      );
      CREATE INDEX stock_movements_document ON stock_movements (document_type, document_id);
      CREATE INDEX stock_movements_variant ON stock_movements (variant_id, doc_date);
      CREATE INDEX stock_movements_batch ON stock_movements (batch_id);
    `)

    for (const table of ['partners', 'receipts']) {
      await queryRunner.query(
        `CREATE TRIGGER ${table}_touch BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION touch_updated_at()`,
      )
    }
    await queryRunner.query(
      `CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION forbid_change()`,
    )
    for (const table of TENANT_TABLES) {
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
      DROP TABLE IF EXISTS stock_movements, stock_balances, stock_batches, receipt_expenses, receipt_lines, receipts, partners CASCADE;
      ALTER TABLE products DROP COLUMN IF EXISTS factory_code, DROP COLUMN IF EXISTS manufacturer;
    `)
  }
}
