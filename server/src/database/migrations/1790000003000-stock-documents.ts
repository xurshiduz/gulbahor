import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * Transfers, write-offs and counts: one kind of document with three uses,
 * since each is a place, a date and a list of quantities by variant.
 *
 * Goods in a transfer that has been sent and not yet received are on hand in
 * a place of their own, "on the way" (`locations.kind = 'transit'`), one per
 * business. Everything the business owns is therefore always in
 * `stock_balances`, and a late bill finds goods on the road like any others.
 */
const ROLE_GRANTS: Record<string, string[]> = {
  manager: ['transfers.*', 'writeoffs.*', 'counts.*'],
  accountant: ['transfers.view', 'writeoffs.view', 'counts.view'],
  store_manager: ['transfers.*', 'writeoffs.view', 'writeoffs.manage', 'counts.view', 'counts.manage'],
  warehouse: ['transfers.*', 'writeoffs.view', 'writeoffs.manage', 'counts.view', 'counts.manage'],
}

const KINDS_BEFORE = `'receipt', 'receipt_cancel', 'revalue'`
const KINDS = `${KINDS_BEFORE}, 'transfer', 'transfer_cancel', 'transfer_loss', 'writeoff', 'writeoff_cancel', 'count'`

export class StockDocuments1790000003000 implements MigrationInterface {
  name = 'StockDocuments1790000003000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE locations DROP CONSTRAINT locations_kind_check;
      ALTER TABLE locations ADD CONSTRAINT locations_kind_check
        CHECK (kind IN ('store', 'warehouse', 'mixed', 'zone', 'transit'));
      CREATE UNIQUE INDEX locations_org_transit ON locations (org_id) WHERE kind = 'transit';

      ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind;
      ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind CHECK (kind IN (${KINDS}));

      CREATE TABLE stock_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        kind text NOT NULL CHECK (kind IN ('transfer', 'writeoff', 'count')),
        number text NOT NULL,
        status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'posted', 'cancelled')),
        location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
        to_location_id uuid REFERENCES locations(id) ON DELETE RESTRICT,
        doc_date date NOT NULL,
        reason text CHECK (reason IN ('defect', 'loss', 'theft', 'sample', 'other')),
        full_count boolean NOT NULL DEFAULT false,
        note text,
        total_qty numeric(14, 3) NOT NULL DEFAULT 0,
        -- A transfer: how many did not arrive. A count: found minus expected, signed.
        diff_qty numeric(14, 3),
        -- Value moved, written off or adjusted; set when the document is carried out.
        cost_usd bigint,
        cost_uzs bigint,
        search_key text NOT NULL DEFAULT '',
        created_by uuid,
        created_by_name text,
        sent_at timestamptz,
        posted_at timestamptz,
        posted_by uuid,
        posted_by_name text,
        cancelled_at timestamptz,
        cancelled_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK ((kind = 'transfer') = (to_location_id IS NOT NULL)),
        CHECK (status <> 'sent' OR kind = 'transfer')
      );
      CREATE UNIQUE INDEX stock_documents_org_number ON stock_documents (org_id, number);
      CREATE INDEX stock_documents_list ON stock_documents (org_id, kind, created_at DESC);
      CREATE INDEX stock_documents_search ON stock_documents USING gin (search_key gin_trgm_ops);

      CREATE TABLE stock_document_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        document_id uuid NOT NULL REFERENCES stock_documents(id) ON DELETE CASCADE,
        position int NOT NULL,
        variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        qty numeric(14, 3) NOT NULL CHECK (qty >= 0),
        received_qty numeric(14, 3) CHECK (received_qty >= 0),
        expected_qty numeric(14, 3),
        cost_usd bigint,
        cost_uzs bigint,
        UNIQUE (document_id, variant_id)
      );
      CREATE INDEX stock_document_lines_document ON stock_document_lines (document_id, position);
      CREATE INDEX stock_document_lines_variant ON stock_document_lines (variant_id);

      -- The pieces of batches a line took out, so they can be moved on or put back as themselves.
      CREATE TABLE stock_document_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        document_id uuid NOT NULL REFERENCES stock_documents(id) ON DELETE CASCADE,
        line_id uuid NOT NULL REFERENCES stock_document_lines(id) ON DELETE CASCADE,
        position int NOT NULL,
        batch_id uuid NOT NULL REFERENCES stock_batches(id) ON DELETE RESTRICT,
        variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        qty numeric(14, 3) NOT NULL CHECK (qty > 0),
        cost_usd bigint NOT NULL,
        cost_uzs bigint NOT NULL
      );
      CREATE INDEX stock_document_items_line ON stock_document_items (line_id, position);

      CREATE TRIGGER stock_documents_touch BEFORE UPDATE ON stock_documents
        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
    `)

    for (const table of ['stock_documents', 'stock_document_lines', 'stock_document_items']) {
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
      DROP TABLE IF EXISTS stock_document_items, stock_document_lines, stock_documents CASCADE;
      ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind;
      ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind CHECK (kind IN (${KINDS_BEFORE}));
      DROP INDEX IF EXISTS locations_org_transit;
      ALTER TABLE locations DROP CONSTRAINT locations_kind_check;
      ALTER TABLE locations ADD CONSTRAINT locations_kind_check CHECK (kind IN ('store', 'warehouse', 'mixed', 'zone'));
    `)
  }
}
