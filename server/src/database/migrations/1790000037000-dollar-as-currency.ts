import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * The dollar is a currency like any other. It had a table of its own
 * (`exchange_rates`: units of the base for a dollar, one row a day) and a
 * module that switched it on (`usd`). A business that took dollars now has
 * them in its list of currencies, written in its base ("1 $ = 12 650 so'm"),
 * with every rate it ever set; one that only once set a rate keeps the rates,
 * with the dollar put away. A dollar business has nothing to carry: dollars
 * are its base.
 *
 * Undone, the dollar's rates written in the base go back to their table and
 * the module comes back where the dollar was switched on.
 */
export class DollarAsCurrency1790000037000 implements MigrationInterface {
  name = 'DollarAsCurrency1790000037000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`
      INSERT INTO org_currencies (org_id, code, against, way, is_active, created_at)
      SELECT o.id, 'USD', o.base_currency, 'in', 'usd' = ANY (o.modules), o.created_at
      FROM organizations o
      WHERE o.base_currency <> 'USD'
        AND ('usd' = ANY (o.modules) OR EXISTS (SELECT 1 FROM exchange_rates r WHERE r.org_id = o.id))
      ON CONFLICT (org_id, code) DO NOTHING;

      INSERT INTO currency_rates (org_id, code, rate_date, against, way, value, set_by, set_by_name, created_at)
      SELECT r.org_id, 'USD', r.rate_date, o.base_currency, 'in', r.uzs_per_usd, r.set_by, r.set_by_name, r.created_at
      FROM exchange_rates r JOIN organizations o ON o.id = r.org_id
      WHERE o.base_currency <> 'USD'
      ON CONFLICT (org_id, code, rate_date) DO NOTHING;

      UPDATE organizations SET modules = array_remove(modules, 'usd') WHERE 'usd' = ANY (modules);

      DROP TABLE exchange_rates;
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE exchange_rates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        rate_date date NOT NULL,
        uzs_per_usd numeric(14, 2) NOT NULL CHECK (uzs_per_usd > 0),
        set_by uuid,
        set_by_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (org_id, rate_date)
      );
    `)
    await queryRunner.query(tenantPolicy('exchange_rates'))
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`
      INSERT INTO exchange_rates (org_id, rate_date, uzs_per_usd, set_by, set_by_name, created_at)
      SELECT r.org_id, r.rate_date, round(r.value, 2), r.set_by, r.set_by_name, r.created_at
      FROM currency_rates r JOIN organizations o ON o.id = r.org_id
      WHERE r.code = 'USD' AND r.against = o.base_currency AND r.way = 'in';

      UPDATE organizations o SET modules = array_append(o.modules, 'usd')
      WHERE EXISTS (SELECT 1 FROM org_currencies c WHERE c.org_id = o.id AND c.code = 'USD' AND c.is_active);

      DELETE FROM org_currencies WHERE code = 'USD';
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }
}
