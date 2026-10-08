import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * What a person may do beside what their roles give: a trusted cashier who
 * may sell on credit, without a role of their own for it. A person's
 * permissions are their roles' and these together.
 */
export class ExtraPermissions1790000036000 implements MigrationInterface {
  name = 'ExtraPermissions1790000036000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN extra_permissions text[] NOT NULL DEFAULT '{}'`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN extra_permissions`)
  }
}
