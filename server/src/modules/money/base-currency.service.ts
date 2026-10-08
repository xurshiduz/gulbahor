import {
  cashSteps,
  CURRENCIES,
  DEFAULT_ORG_SETTINGS,
  DOLLAR,
  exchange,
  rebase,
  roundPrice,
  usualRateForm,
  type AnyCurrency,
  type BaseCurrencyDto,
  type BaseLock,
} from '@erp/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { OrgCurrency, Organization } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { ActorService } from '../auth/actor.service'
import { RealtimeService } from '../realtime/realtime.service'
import { wantingRate } from './agreed'
import { CurrenciesService } from './currencies.service'
import { LedgerService } from './ledger.service'

const LOCKED: Record<BaseLock, string> = {
  money: 'Pul yozuvi bor: asosiy valyuta endi o‘zgarmaydi',
  stock: 'Tovar kirimi bor: asosiy valyuta endi o‘zgarmaydi',
  drafts: 'Kirim qoralamalari bor: ularning kursi hozirgi asosiy valyutada. Avval o‘chiring yoki o‘tkazing',
}

/**
 * The currency a business keeps its books in, chosen until the first money
 * is written and fixed from then on.
 *
 * Before that there are no sums in the books to carry across, only what was
 * set up in the old base: price types and prices, loyalty thresholds, fixed
 * promotion prices, the debt limit. Those are carried at the day's rates and
 * prices rounded as the new currency is counted; a till's drawers, terminals
 * and the business's own accounts — all empty — simply take the new
 * currency. The old base stays as one currency more, with the rate it had
 * against the dollar; the dollar's rate is written afresh in the new base.
 */
@Injectable()
export class BaseCurrencyService {
  constructor(
    private readonly db: Db,
    private readonly ledger: LedgerService,
    private readonly currencies: CurrenciesService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly actors: ActorService,
  ) {}

  async state(actor: Actor): Promise<BaseCurrencyDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => this.stateIn(em, actor.orgId))
  }

  /** Takes another base. Only the owner: it decides what every sum of the business is in. */
  async change(actor: Actor, next: AnyCurrency): Promise<BaseCurrencyDto> {
    if (!actor.isOwner) {
      throw AppError.forbidden('Asosiy valyutani biznes egasi o‘zgartiradi')
    }
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.changeIn(em, actor, next)
      afterCommit(() => {
        // Every request after this one reckons in the new base.
        this.actors.invalidate()
        this.realtime.changed(actor.orgId, [
          'me',
          'money',
          'price-types',
          'products',
          'pricing',
          'customers',
          'promotions',
        ])
      })
      return this.stateIn(em, actor.orgId)
    })
  }

  /** The same, inside a transaction the caller already has: the first-run setup takes its base so. */
  async changeIn(
    em: EntityManager,
    actor: Pick<Actor, 'orgId' | 'userId' | 'name' | 'ip'>,
    next: AnyCurrency,
  ): Promise<void> {
    await em.query(`SELECT 1 FROM organizations WHERE id = $1 FOR UPDATE`, [actor.orgId])
    const org = await em.findOneByOrFail(Organization, { id: actor.orgId })
    const old = org.baseCurrency
    if (next === old) {
      return
    }
    const locked = await this.lock(em)
    if (locked) {
      throw AppError.conflict('BASE_LOCKED', LOCKED[locked])
    }

    const today = await this.ledger.today(em, actor.orgId)
    const book = await this.currencies.book(em, { orgId: actor.orgId, modules: org.modules }, today)
    // Dollars are beside the new base where the business had them, or where they were its base.
    const dollars = next !== DOLLAR && (org.modules.includes('usd') || old === DOLLAR)
    const rebased = rebase(book, next, dollars)
    const steps = cashSteps(next)
    const settings = { ...DEFAULT_ORG_SETTINGS, ...org.settings }

    // ── What was set up in the old base, carried across ──
    const prices: { id: string; amount: number }[] = await em.query(
      `SELECT id, amount::float8 AS amount FROM prices WHERE currency = $1`,
      [old],
    )
    const tiers: { id: string; amount: number }[] = await em.query(
      `SELECT id, from_amount::float8 AS amount FROM loyalty_tiers WHERE from_amount > 0`,
    )
    const promotions: { id: string; amount: number }[] = await em.query(
      `SELECT id, value::float8 AS amount FROM promotions WHERE kind = 'price'`,
    )
    if ((prices.length || tiers.length || promotions.length || settings.debtLimit > 0) && !rebased) {
      throw AppError.validation({ currency: wantingRate(book, next) ?? `${CURRENCIES[next].name} kursi qo‘yilmagan` })
    }
    const carried = (amount: number, rounded: boolean) => {
      const across = exchange(amount, old, next, book) as number
      return rounded ? roundPrice(across, { step: steps.price, ending: 0 }) : across
    }
    for (const price of prices) {
      await em.query(`UPDATE prices SET amount = $2, currency = $3 WHERE id = $1`, [
        price.id,
        carried(price.amount, true),
        next,
      ])
    }
    await em.query(`UPDATE price_types SET currency = $2, round_step = $3, round_ending = 0 WHERE currency = $1`, [
      old,
      next,
      steps.price,
    ])
    for (const tier of tiers) {
      await em.query(`UPDATE loyalty_tiers SET from_amount = $2 WHERE id = $1`, [tier.id, carried(tier.amount, true)])
    }
    for (const promotion of promotions) {
      await em.query(`UPDATE promotions SET value = $2 WHERE id = $1`, [promotion.id, carried(promotion.amount, true)])
    }

    // ── The accounts that hold the base, all empty yet ──
    // A till that has a drawer in the new currency already keeps that one.
    await em.query(
      `DELETE FROM accounts a WHERE a.kind = 'cash' AND a.currency = $1
         AND EXISTS (SELECT 1 FROM accounts b WHERE b.register_id = a.register_id AND b.kind = 'cash' AND b.currency = $2)`,
      [old, next],
    )
    await em.query(
      `UPDATE accounts a SET currency = $2,
         name = CASE WHEN a.kind = 'cash'
           THEN coalesce((SELECT r.name FROM registers r WHERE r.id = a.register_id) || ' (' || $3 || ')', a.name)
           ELSE a.name END
       WHERE a.currency = $1 AND a.kind IN ('cash', 'terminal', 'system')`,
      [old, next, next === DOLLAR ? 'dollar' : CURRENCIES[next].symbol],
    )

    // ── The rates: the dollar's in the new base, the old base as a currency beside it ──
    await em.query(`DELETE FROM exchange_rates`)
    if (dollars && rebased?.dollar) {
      await em.query(
        `INSERT INTO exchange_rates (org_id, rate_date, uzs_per_usd, set_by, set_by_name) VALUES ($1, $2, $3, $4, $5)`,
        [actor.orgId, today, rebased.dollar, actor.userId, actor.name],
      )
    }
    await em.delete(OrgCurrency, { code: next })
    // The old base stays beside the new one where there is something to it: a rate it had, or money places and
    // partners kept in it. A business that only just chose its base is not left with a currency it never had.
    const [{ held }]: { held: boolean }[] = await em.query(
      `SELECT EXISTS (SELECT 1 FROM accounts WHERE currency = $1) OR EXISTS (SELECT 1 FROM partners WHERE currency = $1)
         AS held`,
      [old],
    )
    if (old !== DOLLAR && (rebased?.old || held)) {
      await em.delete(OrgCurrency, { code: old })
      const form = rebased?.old ?? usualRateForm(old, next, dollars)
      await em.save(
        em.create(OrgCurrency, { orgId: actor.orgId, code: old, against: form.against, way: form.way, isActive: true }),
      )
      if (rebased?.old) {
        await em.query(
          `INSERT INTO currency_rates (org_id, code, rate_date, against, way, value, set_by, set_by_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (org_id, code, rate_date)
           DO UPDATE SET against = EXCLUDED.against, way = EXCLUDED.way, value = EXCLUDED.value`,
          [actor.orgId, old, today, rebased.old.against, rebased.old.way, rebased.old.value, actor.userId, actor.name],
        )
      }
    }

    const modules = [...org.modules.filter((key) => key !== 'usd'), ...(dollars ? ['usd'] : [])]
    await em.update(Organization, actor.orgId, {
      baseCurrency: next,
      modules,
      settings: {
        ...org.settings,
        changeRoundStep: steps.change,
        ...(settings.debtLimit > 0 ? { debtLimit: carried(settings.debtLimit, true) } : {}),
      },
    })
    await this.audit.record(em, actor.orgId, actor, {
      action: 'org.base_currency',
      entity: 'org',
      entityId: actor.orgId,
      summary: `Asosiy valyuta: ${CURRENCIES[old].name} → ${CURRENCIES[next].name}${
        prices.length ? `; ${prices.length} ta narx o‘tkazildi` : ''
      }`,
    })
  }

  /** Why the base can no longer change; null while it may. */
  private async lock(em: EntityManager): Promise<BaseLock | null> {
    const [row]: { money: boolean; stock: boolean; drafts: boolean }[] = await em.query(
      `SELECT EXISTS (SELECT 1 FROM ledger_lines) AS money,
              EXISTS (SELECT 1 FROM stock_movements) AS stock,
              EXISTS (SELECT 1 FROM receipts WHERE status = 'draft') AS drafts`,
    )
    return row.money ? 'money' : row.stock ? 'stock' : row.drafts ? 'drafts' : null
  }

  private async stateIn(em: EntityManager, orgId: string): Promise<BaseCurrencyDto> {
    const org = await em.findOneByOrFail(Organization, { id: orgId })
    const [{ prices }]: { prices: number }[] = await em.query(
      `SELECT count(*)::int AS prices FROM prices WHERE currency = $1`,
      [org.baseCurrency],
    )
    return { base: org.baseCurrency, locked: await this.lock(em), prices }
  }
}
