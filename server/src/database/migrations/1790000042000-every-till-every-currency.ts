import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Every till takes every currency its business keeps, as a new till does and
 * as a currency switched on reaches every till: those made before a currency
 * was switched on take it from now on. A till may still be told otherwise in
 * its own settings.
 *
 * A till's dollar drawer was named for dollars in words ("Kassa 1 (dollar)")
 * while every other currency's drawer bears its sign ("Kassa 1 (¥)"): the
 * dollar's is named by its sign too.
 *
 * Undone, the dollar drawers take back their word; what tills took stays.
 */
export class EveryTillEveryCurrency1790000042000 implements MigrationInterface {
  name = 'EveryTillEveryCurrency1790000042000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`
      UPDATE registers r SET currencies = r.currencies || coalesce((
        SELECT array_agg(c.code ORDER BY c.created_at)
        FROM org_currencies c JOIN organizations o ON o.id = c.org_id
        WHERE c.org_id = r.org_id AND c.is_active AND c.code <> o.base_currency AND NOT (c.code = ANY (r.currencies))
      ), '{}');

      UPDATE accounts SET name = left(name, length(name) - length(' (dollar)')) || ' ($)'
      WHERE register_id IS NOT NULL AND currency = 'USD' AND name LIKE '% (dollar)';
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`
      UPDATE accounts SET name = left(name, length(name) - length(' ($)')) || ' (dollar)'
      WHERE register_id IS NOT NULL AND currency = 'USD' AND name LIKE '% ($)';
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }
}
