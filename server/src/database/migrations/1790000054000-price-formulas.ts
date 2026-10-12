import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A price rule says more than "so many percent over cost" (KEYINGI-REJA,
 * 16.4): a sum may stand beside the percentage — "cost + 20% + 5 000" — and a
 * rule may name the price outright (`fixed`). The rule with no category, brand
 * or season is each price type's own way of being worked out.
 */
export class PriceFormulas1790000054000 implements MigrationInterface {
  name = 'PriceFormulas1790000054000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE price_rule_markups DROP CONSTRAINT price_rule_markups_base_check;
      ALTER TABLE price_rule_markups
        ADD COLUMN amount bigint NOT NULL DEFAULT 0,
        ADD CONSTRAINT price_rule_markups_base_check CHECK (base IN ('cost', 'retail', 'fixed')),
        ADD CONSTRAINT price_rule_markups_fixed CHECK (base <> 'fixed' OR (amount > 0 AND percent = 0));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    const [{ made }]: { made: number }[] = await queryRunner.query(
      `SELECT count(*)::int AS made FROM price_rule_markups WHERE base = 'fixed' OR amount <> 0`,
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
    if (made) {
      throw new Error(`Summali yoki belgilangan narxli qoidalar bor (${made} ta): ular eski tuzilishga sig‘maydi.`)
    }
    await queryRunner.query(`
      ALTER TABLE price_rule_markups
        DROP CONSTRAINT price_rule_markups_fixed,
        DROP CONSTRAINT price_rule_markups_base_check,
        DROP COLUMN amount;
      ALTER TABLE price_rule_markups ADD CONSTRAINT price_rule_markups_base_check CHECK (base IN ('cost', 'retail'));
    `)
  }
}
