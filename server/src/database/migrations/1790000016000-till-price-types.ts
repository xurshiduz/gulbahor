import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A sale at another price than the retail one.
 *
 * A price type says who may sell at it at the till (`till_access`: nobody,
 * every cashier, those allowed to, or anyone with a manager's PIN) and
 * whether a sale at it may go under the floor (`skips_floor`: a family price
 * at cost is meant to). A sale remembers the price type it was made at.
 */
export class TillPriceTypes1790000016000 implements MigrationInterface {
  name = 'TillPriceTypes1790000016000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE price_types
        ADD COLUMN till_access text NOT NULL DEFAULT 'none'
          CHECK (till_access IN ('none', 'all', 'permitted', 'approval')),
        ADD COLUMN skips_floor boolean NOT NULL DEFAULT false;
      ALTER TABLE price_types ADD CONSTRAINT price_types_till_kind
        CHECK (till_access = 'none' OR kind IN ('wholesale', 'other'));
      ALTER TABLE sales
        ADD COLUMN price_type_id uuid REFERENCES price_types(id) ON DELETE SET NULL,
        ADD COLUMN price_type_name text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales DROP COLUMN price_type_id, DROP COLUMN price_type_name;
      ALTER TABLE price_types DROP CONSTRAINT price_types_till_kind;
      ALTER TABLE price_types DROP COLUMN till_access, DROP COLUMN skips_floor;
    `)
  }
}
