import { CURRENCIES } from '@erp/core'
import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A till's drawers are cash accounts in it, one to a currency, and what the
 * till takes cash in is what drawers it has in use. Drawers were made the
 * first time a till's money went through them; now every till has one for its
 * base and for each currency it takes, and `registers.currencies` is read
 * from them.
 *
 * Undone, the drawers made here stay: they are empty accounts.
 */
export class TillDrawers1790000043000 implements MigrationInterface {
  name = 'TillDrawers1790000043000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    const missing: { register_id: string; org_id: string; name: string; location_id: string; currency: string }[] =
      await queryRunner.query(`
        SELECT r.id AS register_id, r.org_id, r.name, r.location_id, c.currency
        FROM registers r JOIN organizations o ON o.id = r.org_id
        CROSS JOIN LATERAL unnest(array_prepend(o.base_currency, r.currencies)) AS c(currency)
        WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.register_id = r.id AND a.currency = c.currency)
      `)
    for (const drawer of missing) {
      const sign = CURRENCIES[drawer.currency as keyof typeof CURRENCIES]?.symbol ?? drawer.currency
      await queryRunner.query(
        `INSERT INTO accounts (org_id, kind, name, currency, location_id, location_ids, register_id, balance, is_active)
         VALUES ($1, 'cash', $2, $3, $4, ARRAY[$4]::uuid[], $5, 0, true)`,
        [drawer.org_id, `${drawer.name} (${sign})`, drawer.currency, drawer.location_id, drawer.register_id],
      )
    }
    await queryRunner.query(`
      UPDATE registers r SET currencies = coalesce((
        SELECT array_agg(a.currency ORDER BY a.created_at, a.currency)
        FROM accounts a JOIN organizations o ON o.id = a.org_id
        WHERE a.register_id = r.id AND a.kind = 'cash' AND a.is_active AND a.currency <> o.base_currency
      ), '{}');
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(): Promise<void> {
    // The drawers are accounts like any: nothing to take back.
  }
}
