import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * Promotions.
 *
 * A promotion makes some goods cheaper in some shops from one day to
 * another: by a percentage, or by setting one price for every piece. It may
 * ask for a code. A sale line remembers the promotion that took money off it
 * and how much, and the sale the code the customer said.
 */
export class Promotions1790000020000 implements MigrationInterface {
  name = 'Promotions1790000020000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE promotions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL,
        kind text NOT NULL CHECK (kind IN ('percent', 'price')),
        -- A percentage, or a price for one piece in so'm tiyin.
        value numeric(18, 2) NOT NULL CHECK (value > 0),
        starts_on date NOT NULL,
        ends_on date,
        -- Empty: every shop.
        location_ids uuid[] NOT NULL DEFAULT '{}',
        -- What it covers; with all four empty, everything.
        product_ids uuid[] NOT NULL DEFAULT '{}',
        category_ids uuid[] NOT NULL DEFAULT '{}',
        brand_ids uuid[] NOT NULL DEFAULT '{}',
        seasons text[] NOT NULL DEFAULT '{}',
        stackable boolean NOT NULL DEFAULT false,
        code text,
        is_active boolean NOT NULL DEFAULT true,
        created_by uuid,
        created_by_name text,
        search_key text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (ends_on IS NULL OR ends_on >= starts_on)
      );
      CREATE UNIQUE INDEX promotions_code ON promotions (org_id, code) WHERE code IS NOT NULL;
      CREATE INDEX promotions_running ON promotions (org_id, starts_on, ends_on) WHERE is_active;

      ALTER TABLE sale_lines
        ADD COLUMN promotion_id uuid REFERENCES promotions(id) ON DELETE SET NULL,
        ADD COLUMN promotion_name text,
        ADD COLUMN promo_discount bigint NOT NULL DEFAULT 0;
      CREATE INDEX sale_lines_promotion ON sale_lines (promotion_id) WHERE promotion_id IS NOT NULL;
      ALTER TABLE sales ADD COLUMN promo_code text;
    `)
    await queryRunner.query(tenantPolicy('promotions'))

    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    // A shop's manager and whoever keeps the books see what is running.
    await queryRunner.query(
      `UPDATE roles
       SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['promotions.view']) ORDER BY 1)
       WHERE template_key IN ('store_manager', 'accountant')`,
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales DROP COLUMN promo_code;
      DROP INDEX IF EXISTS sale_lines_promotion;
      ALTER TABLE sale_lines DROP COLUMN promotion_id, DROP COLUMN promotion_name, DROP COLUMN promo_discount;
      DROP TABLE IF EXISTS promotions CASCADE;
    `)
  }
}
