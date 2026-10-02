import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * Returns and exchanges.
 *
 * A `sale_return` takes goods back against the receipt that sold them. Its
 * lines point at the sale's lines, and the sale keeps count of what has come
 * back of each (`returned_qty`, `returned_total`), down to the pieces of
 * batches it took (`sale_items.returned_*`), so nothing comes back twice and
 * the goods return to stock at what they cost. The money goes back through
 * `sale_return_payments`, or towards a new sale (`exchange_sale_id`), which
 * is then paid with the `exchange` method.
 */
const KINDS_BEFORE = `'receipt', 'receipt_cancel', 'revalue', 'transfer', 'transfer_cancel', 'transfer_loss', 'writeoff', 'writeoff_cancel', 'count', 'sale', 'sale_void'`
const KINDS = `${KINDS_BEFORE}, 'sale_return'`

export class Returns1790000007000 implements MigrationInterface {
  name = 'Returns1790000007000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind;
      ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind CHECK (kind IN (${KINDS}));

      ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_method_check;
      ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal', 'exchange'));

      ALTER TABLE sales ADD COLUMN returned_total bigint NOT NULL DEFAULT 0;
      ALTER TABLE sale_lines
        ADD COLUMN returned_qty numeric(14, 3) NOT NULL DEFAULT 0,
        ADD COLUMN returned_total bigint NOT NULL DEFAULT 0,
        ADD CONSTRAINT sale_lines_returned CHECK (returned_qty >= 0 AND returned_qty <= qty AND returned_total <= total);
      ALTER TABLE sale_items
        ADD COLUMN returned_qty numeric(14, 3) NOT NULL DEFAULT 0,
        ADD COLUMN returned_usd bigint NOT NULL DEFAULT 0,
        ADD COLUMN returned_uzs bigint NOT NULL DEFAULT 0,
        ADD CONSTRAINT sale_items_returned CHECK (returned_qty >= 0 AND returned_qty <= qty);

      CREATE TABLE sale_returns (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        number text NOT NULL,
        -- Made by the till for each return: the same return sent twice is made once.
        client_key uuid NOT NULL,
        sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
        shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
        register_id uuid NOT NULL REFERENCES registers(id) ON DELETE RESTRICT,
        location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
        returned_at timestamptz NOT NULL DEFAULT now(),
        returned_on date NOT NULL,
        cashier_id uuid,
        cashier_name text,
        qty numeric(14, 3) NOT NULL,
        -- What the goods brought back were worth, and how much of that went towards goods taken instead.
        total bigint NOT NULL,
        exchange_total bigint NOT NULL DEFAULT 0,
        exchange_sale_id uuid REFERENCES sales(id) ON DELETE RESTRICT,
        rounding bigint NOT NULL DEFAULT 0,
        uzs_per_usd numeric(14, 2),
        late boolean NOT NULL DEFAULT false,
        reason text,
        search_key text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (exchange_total >= 0 AND exchange_total <= total)
      );
      CREATE UNIQUE INDEX sale_returns_org_number ON sale_returns (org_id, number);
      CREATE UNIQUE INDEX sale_returns_client_key ON sale_returns (org_id, client_key);
      CREATE INDEX sale_returns_list ON sale_returns (org_id, returned_at DESC);
      CREATE INDEX sale_returns_sale ON sale_returns (sale_id);
      CREATE INDEX sale_returns_shift ON sale_returns (shift_id);
      CREATE INDEX sale_returns_search ON sale_returns USING gin (search_key gin_trgm_ops);

      CREATE TABLE sale_return_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        return_id uuid NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
        position int NOT NULL,
        sale_line_id uuid NOT NULL REFERENCES sale_lines(id) ON DELETE RESTRICT,
        variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        qty numeric(14, 3) NOT NULL CHECK (qty > 0),
        total bigint NOT NULL CHECK (total >= 0),
        cost_usd bigint NOT NULL DEFAULT 0,
        cost_uzs bigint NOT NULL DEFAULT 0,
        unit_id uuid REFERENCES rfid_units(id) ON DELETE SET NULL
      );
      CREATE INDEX sale_return_lines_return ON sale_return_lines (return_id, position);
      CREATE INDEX sale_return_lines_line ON sale_return_lines (sale_line_id);

      CREATE TABLE sale_return_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        return_id uuid NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
        position int NOT NULL,
        method text NOT NULL CHECK (method IN ('cash', 'card', 'terminal')),
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        currency text NOT NULL CHECK (currency IN ('UZS', 'USD')),
        amount bigint NOT NULL CHECK (amount > 0),
        base bigint NOT NULL,
        reference text
      );
      CREATE INDEX sale_return_payments_return ON sale_return_payments (return_id, position);
    `)

    for (const table of ['sale_returns', 'sale_return_lines', 'sale_return_payments']) {
      await queryRunner.query(tenantPolicy(table))
    }

    // A cashier takes goods back; taking them back late is for those who already hold every till right.
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(
      `UPDATE roles
       SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['pos.return']) ORDER BY 1)
       WHERE template_key = 'cashier'`,
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS sale_return_payments, sale_return_lines, sale_returns CASCADE;
      ALTER TABLE sale_items
        DROP CONSTRAINT sale_items_returned,
        DROP COLUMN returned_qty, DROP COLUMN returned_usd, DROP COLUMN returned_uzs;
      ALTER TABLE sale_lines
        DROP CONSTRAINT sale_lines_returned, DROP COLUMN returned_qty, DROP COLUMN returned_total;
      ALTER TABLE sales DROP COLUMN returned_total;
      DELETE FROM sale_payments WHERE method = 'exchange';
      ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_method_check;
      ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal'));
      DELETE FROM stock_movements WHERE kind = 'sale_return';
      ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind;
      ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind CHECK (kind IN (${KINDS_BEFORE}));
    `)
  }
}
