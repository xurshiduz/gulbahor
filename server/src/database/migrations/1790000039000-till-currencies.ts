import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A till takes cash in the currencies it is given, not in the base and
 * dollars alone. `registers.currencies` is what it takes beside the base: a
 * till that has held dollars keeps taking them.
 *
 * Change handed back in another currency is that currency's (`change_currency`),
 * so many of its coins (`change_other`, once `change_usd`), and worth so much
 * in the base when it went (`change_other_base`): what reports and the shift
 * count by, with no rate to look up afterwards.
 */
export class TillCurrencies1790000039000 implements MigrationInterface {
  name = 'TillCurrencies1790000039000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE registers ADD COLUMN currencies text[] NOT NULL DEFAULT '{}';
      ALTER TABLE sales RENAME COLUMN change_usd TO change_other;
      ALTER TABLE sales ADD COLUMN change_currency text CHECK (change_currency ~ '^[A-Z]{3}$');
      ALTER TABLE sales ADD COLUMN change_other_base bigint NOT NULL DEFAULT 0;
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`
      UPDATE registers r SET currencies = coalesce((
        SELECT array_agg(DISTINCT a.currency ORDER BY a.currency)
        FROM accounts a JOIN organizations o ON o.id = a.org_id
        WHERE a.register_id = r.id AND a.kind = 'cash' AND a.currency <> o.base_currency
      ), '{}');

      UPDATE sales SET change_currency = 'USD', change_other_base = round(change_other * coalesce(uzs_per_usd, 0))
      WHERE change_other <> 0;
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales DROP COLUMN change_other_base;
      ALTER TABLE sales DROP COLUMN change_currency;
      ALTER TABLE sales RENAME COLUMN change_other TO change_usd;
      ALTER TABLE registers DROP COLUMN currencies;
    `)
  }
}
