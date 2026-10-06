import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * The price a partner buys at: a wholesale buyer is sold at the wholesale
 * price, without anyone at the till having to pick it. Gone with its price
 * type, the partner buys at the retail price again.
 */
export class PartnerPriceType1790000033000 implements MigrationInterface {
  name = 'PartnerPriceType1790000033000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE partners ADD COLUMN price_type_id uuid REFERENCES price_types(id) ON DELETE SET NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE partners DROP COLUMN price_type_id`)
  }
}
