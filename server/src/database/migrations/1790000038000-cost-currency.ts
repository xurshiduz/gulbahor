import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * What a business keeps its costs in beside its base: the columns named for
 * dollars (`cost_usd`, `goods_usd`…) hold this currency from now on, as those
 * named for so'm hold the base. A business that took dollars keeps its costs
 * in dollars, as it always has; any other keeps them in its base alone, and
 * those columns then hold the base again.
 *
 * It is chosen while nothing has been costed, and fixed from then on.
 */
export class CostCurrency1790000038000 implements MigrationInterface {
  name = 'CostCurrency1790000038000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organizations ADD COLUMN cost_currency text NOT NULL DEFAULT 'UZS' CHECK (cost_currency ~ '^[A-Z]{3}$');
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`
      UPDATE organizations o SET cost_currency = CASE
        WHEN o.base_currency <> 'USD' AND EXISTS (
          SELECT 1 FROM org_currencies c WHERE c.org_id = o.id AND c.code = 'USD' AND c.is_active
        ) THEN 'USD'
        ELSE o.base_currency
      END;
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE organizations DROP COLUMN cost_currency`)
  }
}
