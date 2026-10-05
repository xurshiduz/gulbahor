import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Reports.
 *
 * They read what is already written, so there are no tables of their own:
 * only who may open them, and an index for each thing they ask of the
 * sales — the business's day a receipt or a return fell on.
 */
export class Reports1790000025000 implements MigrationInterface {
  name = 'Reports1790000025000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX sales_day ON sales (org_id, sold_on);
      CREATE INDEX sale_returns_day ON sale_returns (org_id, returned_on);
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    // Whoever runs the business or keeps its books reads every report; a shop's manager reads how the shop sells.
    await queryRunner.query(
      `UPDATE roles
       SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['reports.*']) ORDER BY 1)
       WHERE template_key IN ('manager', 'accountant')`,
    )
    await queryRunner.query(
      `UPDATE roles
       SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['reports.sales']) ORDER BY 1)
       WHERE template_key = 'store_manager'`,
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS sale_returns_day;
      DROP INDEX IF EXISTS sales_day;
    `)
  }
}
