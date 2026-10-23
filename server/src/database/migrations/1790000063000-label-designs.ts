import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A business's own label designs, each element placed where it is wanted (P: the label designer). Kept apart from
 * the settings every session reads: a design carries its logo's dots, and only printing and the designer want them.
 */
export class LabelDesigns1790000063000 implements MigrationInterface {
  name = 'LabelDesigns1790000063000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE organizations ADD COLUMN label_designs jsonb NOT NULL DEFAULT '{"designs": [], "defaultId": null}'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE organizations DROP COLUMN label_designs`)
  }
}
