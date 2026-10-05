import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Promotions that look at the whole cart.
 *
 * `pair`: of every two pieces taken the cheaper is so much off ("1+1").
 * `quantity`: so much off once `min_qty` pieces are taken.
 */
export class CartPromotions1790000021000 implements MigrationInterface {
  name = 'CartPromotions1790000021000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE promotions DROP CONSTRAINT promotions_kind_check;
      ALTER TABLE promotions ADD CONSTRAINT promotions_kind_check
        CHECK (kind IN ('percent', 'price', 'pair', 'quantity'));
      ALTER TABLE promotions ADD COLUMN min_qty int CHECK (min_qty >= 2);
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM promotions WHERE kind IN ('pair', 'quantity');
      ALTER TABLE promotions DROP COLUMN min_qty;
      ALTER TABLE promotions DROP CONSTRAINT promotions_kind_check;
      ALTER TABLE promotions ADD CONSTRAINT promotions_kind_check CHECK (kind IN ('percent', 'price'));
    `)
  }
}
