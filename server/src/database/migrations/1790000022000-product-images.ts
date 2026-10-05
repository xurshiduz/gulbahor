import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * A model's photographs.
 *
 * The files are kept on disk, three sizes to a photograph, under the
 * business and the photograph's id; here is only what is needed to find and
 * order them, and a blur a few hundred bytes long that stands in a
 * photograph's place while it loads. A photograph may belong to one colour.
 */
export class ProductImages1790000022000 implements MigrationInterface {
  name = 'ProductImages1790000022000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE product_images (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        -- The colour it shows; none for all of them.
        value_id uuid REFERENCES attribute_values(id) ON DELETE SET NULL,
        sort_order int NOT NULL DEFAULT 0,
        format text NOT NULL CHECK (format IN ('webp', 'jpeg')),
        -- Of the largest size.
        width int NOT NULL,
        height int NOT NULL,
        -- All three sizes together.
        bytes int NOT NULL,
        blur text NOT NULL,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX product_images_product ON product_images (product_id, sort_order);
    `)
    await queryRunner.query(tenantPolicy('product_images'))
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE product_images`)
  }
}
