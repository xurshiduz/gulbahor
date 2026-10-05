import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * A customer's own discount.
 *
 * A group may take a percentage off everything its members buy. The loyalty
 * programme does the same by what a customer has bought so far: each step
 * (`loyalty_tiers`) is a sum and the percentage it earns. Whichever is more
 * comes off by itself at the till. A sale and each of its lines remember
 * how much of what came off was that, apart from what a cashier gave.
 */
export class CustomerDiscounts1790000019000 implements MigrationInterface {
  name = 'CustomerDiscounts1790000019000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customer_groups
        ADD COLUMN discount_percent numeric(5, 2) NOT NULL DEFAULT 0
          CHECK (discount_percent >= 0 AND discount_percent <= 100);

      CREATE TABLE loyalty_tiers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        -- Bought for this much or more, in so'm tiyin.
        from_amount bigint NOT NULL CHECK (from_amount >= 0),
        percent numeric(5, 2) NOT NULL CHECK (percent > 0 AND percent <= 100),
        UNIQUE (org_id, from_amount)
      );

      ALTER TABLE sales
        ADD COLUMN auto_discount bigint NOT NULL DEFAULT 0,
        ADD COLUMN auto_reason text;
      ALTER TABLE sale_lines ADD COLUMN auto_discount bigint NOT NULL DEFAULT 0;
    `)
    await queryRunner.query(tenantPolicy('loyalty_tiers'))
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sale_lines DROP COLUMN auto_discount;
      ALTER TABLE sales DROP COLUMN auto_discount, DROP COLUMN auto_reason;
      DROP TABLE IF EXISTS loyalty_tiers CASCADE;
      ALTER TABLE customer_groups DROP COLUMN discount_percent;
    `)
  }
}
