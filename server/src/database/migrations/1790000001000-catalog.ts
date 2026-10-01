import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * Goods. A model (`products`) has up to three axes, each an attribute such as
 * colour or a size scale, and one variant per combination of their values.
 * Everything that is counted, priced or sold points at a variant.
 */
const TENANT_TABLES = [
  'counters',
  'categories',
  'brands',
  'attributes',
  'attribute_values',
  'price_types',
  'products',
  'product_variants',
  'variant_barcodes',
  'prices',
]

const TOUCHED = [
  'categories',
  'brands',
  'attributes',
  'attribute_values',
  'price_types',
  'products',
  'product_variants',
]

/** What the ready-made roles gain with this version; businesses that already exist get the same. */
const ROLE_GRANTS: Record<string, string[]> = {
  manager: ['products.*'],
  accountant: ['products.view'],
  store_manager: ['products.view'],
  cashier: ['products.view'],
  seller: ['products.view'],
  warehouse: ['products.view', 'products.manage', 'products.references'],
  partners_manager: ['products.view'],
}

export class Catalog1790000001000 implements MigrationInterface {
  name = 'Catalog1790000001000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- Running numbers per business: article numbers, in-store barcodes, later document numbers.
      CREATE TABLE counters (
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        key text NOT NULL,
        value bigint NOT NULL DEFAULT 0,
        PRIMARY KEY (org_id, key)
      );

      CREATE TABLE categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        parent_id uuid REFERENCES categories(id) ON DELETE RESTRICT,
        name text NOT NULL,
        -- The axes a new model in this category starts with; NULL takes them from the parent.
        axis_ids uuid[],
        sort_order int NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX categories_org_parent_name
        ON categories (org_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
      CREATE INDEX categories_parent ON categories (parent_id);

      CREATE TABLE brands (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX brands_org_name ON brands (org_id, lower(name));

      CREATE TABLE attributes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL,
        kind text NOT NULL CHECK (kind IN ('color', 'size', 'other')),
        sort_order int NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX attributes_org_name ON attributes (org_id, lower(name));

      CREATE TABLE attribute_values (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        attribute_id uuid NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
        name text NOT NULL,
        hex text CHECK (hex ~ '^#[0-9A-F]{6}$'),
        sort_order int NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX attribute_values_name ON attribute_values (attribute_id, lower(name));

      CREATE TABLE price_types (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL,
        kind text NOT NULL CHECK (kind IN ('retail', 'wholesale', 'min', 'other')),
        currency text NOT NULL DEFAULT 'UZS' CHECK (currency IN ('UZS', 'USD')),
        sort_order int NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX price_types_org_name ON price_types (org_id, lower(name));
      -- The till sells at the retail price and refuses to go under the minimum: one of each.
      CREATE UNIQUE INDEX price_types_org_retail ON price_types (org_id) WHERE kind = 'retail';
      CREATE UNIQUE INDEX price_types_org_min ON price_types (org_id) WHERE kind = 'min';

      CREATE TABLE products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        sku text NOT NULL,
        name text NOT NULL,
        category_id uuid REFERENCES categories(id) ON DELETE RESTRICT,
        brand_id uuid REFERENCES brands(id) ON DELETE RESTRICT,
        gender text CHECK (gender IN ('men', 'women', 'unisex', 'boys', 'girls')),
        season text CHECK (season IN ('ss', 'aw', 'all')),
        collection_year int CHECK (collection_year BETWEEN 2000 AND 2100),
        material text,
        origin_country text,
        unit text NOT NULL DEFAULT 'pcs' CHECK (unit IN ('pcs', 'pair', 'set', 'kg', 'm')),
        weight_g int CHECK (weight_g >= 0),
        mxik_code text,
        description text,
        axis1_id uuid REFERENCES attributes(id) ON DELETE RESTRICT,
        axis2_id uuid REFERENCES attributes(id) ON DELETE RESTRICT,
        axis3_id uuid REFERENCES attributes(id) ON DELETE RESTRICT,
        -- The last number used in an automatic variant article ("1001-07").
        variant_seq int NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        search_key text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (axis2_id IS NULL OR axis1_id IS NOT NULL),
        CHECK (axis3_id IS NULL OR axis2_id IS NOT NULL)
      );
      CREATE UNIQUE INDEX products_org_sku ON products (org_id, lower(sku));
      CREATE INDEX products_search ON products USING gin (search_key gin_trgm_ops);
      CREATE INDEX products_category ON products (category_id);
      CREATE INDEX products_brand ON products (brand_id);

      CREATE TABLE product_variants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        -- One value per axis of the model, in the model's axis order.
        value1_id uuid REFERENCES attribute_values(id) ON DELETE RESTRICT,
        value2_id uuid REFERENCES attribute_values(id) ON DELETE RESTRICT,
        value3_id uuid REFERENCES attribute_values(id) ON DELETE RESTRICT,
        sku text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        search_key text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        -- Checked at commit, so one save may swap the values of two variants.
        CONSTRAINT product_variants_combination UNIQUE NULLS NOT DISTINCT (product_id, value1_id, value2_id, value3_id)
          DEFERRABLE INITIALLY DEFERRED
      );
      CREATE UNIQUE INDEX product_variants_org_sku ON product_variants (org_id, lower(sku));
      CREATE INDEX product_variants_search ON product_variants USING gin (search_key gin_trgm_ops);
      CREATE INDEX product_variants_value1 ON product_variants (value1_id);
      CREATE INDEX product_variants_value2 ON product_variants (value2_id);
      CREATE INDEX product_variants_value3 ON product_variants (value3_id);

      CREATE TABLE variant_barcodes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
        code text NOT NULL,
        sort_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT variant_barcodes_org_code UNIQUE (org_id, code) DEFERRABLE INITIALLY DEFERRED
      );
      CREATE INDEX variant_barcodes_variant ON variant_barcodes (variant_id);

      -- A price belongs to a model; a row naming a variant or a place overrides it there.
      CREATE TABLE prices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        price_type_id uuid NOT NULL REFERENCES price_types(id) ON DELETE RESTRICT,
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
        location_id uuid REFERENCES locations(id) ON DELETE CASCADE,
        amount bigint NOT NULL CHECK (amount >= 0),
        currency text NOT NULL CHECK (currency IN ('UZS', 'USD')),
        updated_by uuid,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT prices_scope UNIQUE NULLS NOT DISTINCT (price_type_id, product_id, variant_id, location_id)
      );
      CREATE INDEX prices_product ON prices (product_id);
      CREATE INDEX prices_variant ON prices (variant_id) WHERE variant_id IS NOT NULL;
    `)

    for (const table of TOUCHED) {
      await queryRunner.query(
        `CREATE TRIGGER ${table}_touch BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION touch_updated_at()`,
      )
    }
    for (const table of TENANT_TABLES) {
      await queryRunner.query(tenantPolicy(table))
    }

    // Businesses that already exist: this migration has no organization of its own to name.
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`
      INSERT INTO price_types (org_id, name, kind, currency, sort_order)
      SELECT o.id, t.name, t.kind, 'UZS', t.sort_order
      FROM organizations o
      CROSS JOIN (VALUES ('Chakana', 'retail', 1), ('Ulgurji', 'wholesale', 2), ('Minimal', 'min', 3)) AS t (name, kind, sort_order)
    `)
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
      DROP TABLE IF EXISTS prices, variant_barcodes, product_variants, products, price_types, attribute_values, attributes, brands, categories, counters CASCADE;
    `)
  }
}
