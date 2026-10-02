import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * Setting prices by rule and in bulk.
 *
 * A price type learns how its prices are rounded. `price_rules` say how far
 * above cost goods of a category, a brand or a season are sold, one markup
 * per price type. A change of many prices at once is a `price_revision`
 * with the before and after of every price it touched, so it can be read
 * later and put back.
 */
export class Pricing1790000005000 implements MigrationInterface {
  name = 'Pricing1790000005000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE price_types
        ADD COLUMN round_step bigint NOT NULL DEFAULT 0 CHECK (round_step >= 0),
        ADD COLUMN round_ending bigint NOT NULL DEFAULT 0 CHECK (round_ending >= 0),
        ADD CONSTRAINT price_types_rounding CHECK (round_ending = 0 OR round_ending < round_step);

      CREATE TABLE price_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
        brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
        season text CHECK (season IN ('ss', 'aw', 'all')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT price_rules_scope UNIQUE NULLS NOT DISTINCT (org_id, category_id, brand_id, season)
      );

      CREATE TABLE price_rule_markups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        rule_id uuid NOT NULL REFERENCES price_rules(id) ON DELETE CASCADE,
        price_type_id uuid NOT NULL REFERENCES price_types(id) ON DELETE CASCADE,
        base text NOT NULL CHECK (base IN ('cost', 'retail')),
        percent numeric(8, 2) NOT NULL CHECK (percent > -100),
        UNIQUE (rule_id, price_type_id)
      );

      CREATE TABLE price_revisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        number text NOT NULL,
        price_type_id uuid REFERENCES price_types(id) ON DELETE SET NULL,
        price_type_name text NOT NULL,
        summary text NOT NULL,
        note text,
        changed int NOT NULL,
        -- The revision this one put back.
        reverts_id uuid REFERENCES price_revisions(id) ON DELETE SET NULL,
        created_by uuid,
        created_by_name text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX price_revisions_org_number ON price_revisions (org_id, number);
      CREATE INDEX price_revisions_list ON price_revisions (org_id, created_at DESC);
      CREATE UNIQUE INDEX price_revisions_reverts ON price_revisions (reverts_id) WHERE reverts_id IS NOT NULL;

      CREATE TABLE price_revision_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        revision_id uuid NOT NULL REFERENCES price_revisions(id) ON DELETE CASCADE,
        price_type_id uuid NOT NULL REFERENCES price_types(id) ON DELETE CASCADE,
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
        location_id uuid REFERENCES locations(id) ON DELETE CASCADE,
        -- Null: there was no price before, or there is none after.
        old_amount bigint,
        new_amount bigint,
        currency text NOT NULL
      );
      CREATE INDEX price_revision_lines_revision ON price_revision_lines (revision_id);
      CREATE INDEX price_revision_lines_product ON price_revision_lines (product_id);

      CREATE TRIGGER price_rules_touch BEFORE UPDATE ON price_rules
        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
    `)

    for (const table of ['price_rules', 'price_rule_markups', 'price_revisions', 'price_revision_lines']) {
      await queryRunner.query(tenantPolicy(table))
    }

    // Prices in so'm are round thousands in every shop; a business changes this if it prices otherwise.
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`UPDATE price_types SET round_step = 100000 WHERE currency = 'UZS'`)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS price_revision_lines, price_revisions, price_rule_markups, price_rules CASCADE;
      ALTER TABLE price_types
        DROP CONSTRAINT IF EXISTS price_types_rounding,
        DROP COLUMN IF EXISTS round_step,
        DROP COLUMN IF EXISTS round_ending;
    `)
  }
}
