import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * Customer groups and tags.
 *
 * A group gives its members rules: the price type they buy at, a reminder
 * the till shows, and what is not done for them. A customer may be in
 * several. Tags are marks on the customer for finding and for mailings, and
 * give no rules.
 */
export class CustomerGroups1790000018000 implements MigrationInterface {
  name = 'CustomerGroups1790000018000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE customer_groups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL,
        price_type_id uuid REFERENCES price_types(id) ON DELETE SET NULL,
        reminder text,
        no_debt boolean NOT NULL DEFAULT false,
        no_layaway boolean NOT NULL DEFAULT false,
        no_exchange boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        sort_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX customer_groups_name ON customer_groups (org_id, lower(name));

      CREATE TABLE customer_group_members (
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        group_id uuid NOT NULL REFERENCES customer_groups(id) ON DELETE CASCADE,
        PRIMARY KEY (customer_id, group_id)
      );
      CREATE INDEX customer_group_members_group ON customer_group_members (group_id);

      ALTER TABLE customers ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
      CREATE INDEX customers_tags ON customers USING gin (tags);
    `)
    for (const table of ['customer_groups', 'customer_group_members']) {
      await queryRunner.query(tenantPolicy(table))
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customers DROP COLUMN tags;
      DROP TABLE IF EXISTS customer_group_members, customer_groups CASCADE;
    `)
  }
}
