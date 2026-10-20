import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * Goods set aside for a customer ("Band qilish"; YOL-XARITA, K1).
 *
 * A hold moves nothing in the stock ledger: the goods stay in the shop and in
 * its count. What it does is promise them — while it stands (`active`), its
 * lines are taken off what the shop has to sell, send or write off
 * (`StockService.pick`). Taken, it points at the sale it became; released,
 * the goods are anyone's again. It moves no money either: what a customer
 * leaves towards it is an ordinary payment onto their balance.
 */
export class Holds1790000060000 implements MigrationInterface {
  name = 'Holds1790000060000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE holds (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        number text NOT NULL,
        client_key uuid NOT NULL,
        status text NOT NULL CHECK (status IN ('active', 'taken', 'released')),
        location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        customer_name text NOT NULL,
        price_type_id uuid REFERENCES price_types(id) ON DELETE SET NULL,
        due_date date NOT NULL,
        note text,
        total bigint NOT NULL DEFAULT 0,
        total_qty numeric(14, 3) NOT NULL DEFAULT 0,
        sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
        search_key text NOT NULL DEFAULT '',
        created_by uuid,
        created_by_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        closed_by uuid,
        closed_by_name text,
        closed_at timestamptz,
        CONSTRAINT holds_number UNIQUE (org_id, number),
        CONSTRAINT holds_client_key UNIQUE (org_id, client_key),
        CONSTRAINT holds_closed CHECK ((status = 'active') = (closed_at IS NULL))
      );
      CREATE INDEX holds_standing ON holds (org_id, location_id) WHERE status = 'active';
      CREATE INDEX holds_by_customer ON holds (org_id, customer_id, created_at DESC);

      CREATE TABLE hold_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        hold_id uuid NOT NULL REFERENCES holds(id) ON DELETE CASCADE,
        position int NOT NULL,
        variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        qty numeric(14, 3) NOT NULL CHECK (qty > 0),
        price bigint NOT NULL DEFAULT 0
      );
      CREATE INDEX hold_lines_hold ON hold_lines (hold_id, position);
      CREATE INDEX hold_lines_variant ON hold_lines (org_id, variant_id);
    `)
    await queryRunner.query(tenantPolicy('holds'))
    await queryRunner.query(tenantPolicy('hold_lines'))
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE hold_lines; DROP TABLE holds;`)
  }
}
