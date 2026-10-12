import { cashSteps, roundPrice, worthInBase, type AnyCurrency } from '@erp/core'
import { MigrationInterface, QueryRunner } from 'typeorm'

import { bookFrom, businessToday, ratesInForce } from '../../modules/money/rate-book'

/**
 * A price type no longer says what kind it is or what currency it is in
 * (KEYINGI-REJA, 16.18). The retail price and the floor are the system's own:
 * every business has one of each, neither put away. Every other type — wholesale among them — is plain `other`,
 * and a receipt line's wholesale price goes in with the other prices, under
 * the type it was for. Every price is in the base: one kept in another
 * currency is carried across at today's rates and rounded as the base is
 * counted; one in a currency with no rate, which the till could not sell
 * at, goes.
 *
 * Undone, the old kinds are allowed again but nothing is put back: the
 * wholesale types stay plain, the prices stay in the base.
 */
export class PlainPriceTypes1790000056000 implements MigrationInterface {
  name = 'PlainPriceTypes1790000056000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE price_types DROP CONSTRAINT price_types_till_kind, DROP CONSTRAINT price_types_kind_check;
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`
      UPDATE receipt_lines l
      SET other_prices = l.other_prices || jsonb_build_object(w.id::text, l.wholesale_price)
      FROM (
        SELECT DISTINCT ON (org_id) org_id, id FROM price_types WHERE kind = 'wholesale'
        ORDER BY org_id, is_active DESC, sort_order, name
      ) w
      WHERE w.org_id = l.org_id AND l.wholesale_price IS NOT NULL AND NOT l.other_prices ? w.id::text;

      UPDATE price_types SET kind = 'other' WHERE kind = 'wholesale';
      UPDATE price_types SET is_active = true, till_access = 'none', skips_floor = false WHERE kind = 'min';
    `)

    const floorless: { id: string; base: AnyCurrency }[] = await queryRunner.query(
      `SELECT o.id, o.base_currency AS base FROM organizations o
       WHERE NOT EXISTS (SELECT 1 FROM price_types t WHERE t.org_id = o.id AND t.kind = 'min')`,
    )
    for (const org of floorless) {
      await queryRunner.query(
        `INSERT INTO price_types (org_id, name, kind, currency, round_step, sort_order)
         SELECT $1,
           CASE WHEN bool_or(lower(name) = 'minimal') THEN 'Minimal narx' ELSE 'Minimal' END,
           'min', $2, $3, coalesce(max(sort_order), 0) + 1
         FROM price_types WHERE org_id = $1`,
        [org.id, org.base, cashSteps(org.base).price],
      )
    }
    const elsewhere: { id: string; base: AnyCurrency }[] = await queryRunner.query(
      `SELECT o.id, o.base_currency AS base FROM organizations o
       WHERE EXISTS (SELECT 1 FROM prices p WHERE p.org_id = o.id AND p.currency <> o.base_currency)
          OR EXISTS (SELECT 1 FROM price_types t WHERE t.org_id = o.id AND t.currency <> o.base_currency)`,
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
    for (const org of elsewhere) {
      await this.intoBase(queryRunner, org.id, org.base)
    }
    await queryRunner.query(`SELECT set_config('app.org_id', '', true)`)

    await queryRunner.query(`
      ALTER TABLE receipt_lines DROP COLUMN wholesale_price;
      ALTER TABLE price_types
        ADD CONSTRAINT price_types_kind_check CHECK (kind IN ('retail', 'min', 'other')),
        ADD CONSTRAINT price_types_till_kind CHECK (till_access = 'none' OR kind = 'other');
    `)
  }

  /**
   * One business's prices kept in another currency, and the sums of its rules for such a type, in its base.
   * A price in a currency with no rate today sold for nothing at the till — it had no price there — and goes;
   * so does a rule's sum in one, the rule left at cost or the retail price alone.
   */
  private async intoBase(queryRunner: QueryRunner, orgId: string, base: AnyCurrency): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.org_id', $1, true)`, [orgId])
    const em = queryRunner.manager
    const book = bookFrom(base, await ratesInForce(em, await businessToday(em)))
    const step = cashSteps(base).price

    const prices: { id: string; amount: number; currency: AnyCurrency }[] = await queryRunner.query(
      `SELECT id, amount::float8 AS amount, currency FROM prices WHERE currency <> $1`,
      [base],
    )
    for (const price of prices) {
      const worth = worthInBase(price.amount, price.currency, book)
      if (worth === null) {
        await queryRunner.query(`DELETE FROM prices WHERE id = $1`, [price.id])
      } else {
        await queryRunner.query(`UPDATE prices SET amount = $2, currency = $3 WHERE id = $1`, [
          price.id,
          roundPrice(worth, { step, ending: 0 }),
          base,
        ])
      }
    }

    const sums: { id: string; amount: number; base: string; currency: AnyCurrency }[] = await queryRunner.query(
      `SELECT m.id, m.amount::float8 AS amount, m.base, t.currency
       FROM price_rule_markups m JOIN price_types t ON t.id = m.price_type_id
       WHERE t.currency <> $1 AND m.amount <> 0`,
      [base],
    )
    for (const sum of sums) {
      const worth = worthInBase(sum.amount, sum.currency, book)
      if (worth === null) {
        await queryRunner.query(
          sum.base === 'fixed'
            ? `DELETE FROM price_rule_markups WHERE id = $1`
            : `UPDATE price_rule_markups SET amount = 0 WHERE id = $1`,
          [sum.id],
        )
      } else {
        const amount = sum.amount > 0 ? roundPrice(worth, { step, ending: 0 }) : worth
        await queryRunner.query(`UPDATE price_rule_markups SET amount = $2 WHERE id = $1`, [sum.id, amount])
      }
    }
    await queryRunner.query(
      `UPDATE price_types SET currency = $1, round_step = $2, round_ending = 0 WHERE currency <> $1`,
      [base, step],
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE price_types DROP CONSTRAINT price_types_till_kind, DROP CONSTRAINT price_types_kind_check;
      ALTER TABLE price_types
        ADD CONSTRAINT price_types_kind_check CHECK (kind IN ('retail', 'wholesale', 'min', 'other')),
        ADD CONSTRAINT price_types_till_kind CHECK (till_access = 'none' OR kind IN ('wholesale', 'other'));
      ALTER TABLE receipt_lines ADD COLUMN wholesale_price bigint;
    `)
  }
}
