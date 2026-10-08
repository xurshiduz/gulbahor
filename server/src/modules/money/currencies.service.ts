import {
  ALL_CURRENCY_CODES,
  CURRENCIES,
  isRateJump,
  mayBeWrittenAgainst,
  missingRate,
  RATE_STALE_DAYS,
  rateJump,
  rateWording,
  shownWorth,
  usualRateForm,
  type AnyCurrency,
  type CurrenciesDto,
  type CurrencyDto,
  type CurrencyRateDto,
  type CurrencyRateInput,
  type RateBook,
  type RateForm,
  type WrittenRate,
} from '@erp/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { CurrencyRate, OrgCurrency, Organization } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { ActorService } from '../auth/actor.service'
import { RealtimeService } from '../realtime/realtime.service'
import { LedgerService } from './ledger.service'
import { bookFrom, ratesInForce } from './rate-book'

const DAY = 86_400_000

const named = (code: AnyCurrency) => `${CURRENCIES[code].name} (${code})`

/** A rate as a person reads it: "1 $ = 7,25 ¥". */
const written = (code: AnyCurrency, rate: WrittenRate) => {
  const { one, of } = rateWording(code, rate)
  return `1 ${CURRENCIES[one].symbol} = ${String(rate.value).replace('.', ',')} ${CURRENCIES[of].symbol}`
}

const sameForm = (a: RateForm, b: RateForm) => a.against === b.against && a.way === b.way

/**
 * The currencies a business keeps beside its base, and the rate of each.
 *
 * The base has no rate. Every other currency — the dollar as much as the
 * yuan — is switched on from the list that is given, and has one number of
 * its own, written against the base or against another currency the
 * business has. Who has which is part of the session (`Actor.currencies`),
 * so a change is felt by the next request.
 */
@Injectable()
export class CurrenciesService {
  constructor(
    private readonly db: Db,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly actors: ActorService,
  ) {}

  async list(actor: Actor): Promise<CurrenciesDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => this.rows(em, actor))
  }

  /** Switches a currency on, or changes the way its rate is written. Its rates so far stay as they were written. */
  async enable(actor: Actor, code: AnyCurrency, form?: RateForm): Promise<CurrenciesDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.enableIn(em, actor, code, form)
      afterCommit(() => this.changed(actor.orgId))
      return this.rows(em, actor)
    })
  }

  /** The same, inside a transaction the caller already has: the first-run setup switches its currencies on so. */
  async enableIn(
    em: EntityManager,
    actor: Pick<Actor, 'orgId' | 'userId' | 'name' | 'ip'>,
    code: AnyCurrency,
    form?: RateForm,
  ): Promise<void> {
    const base = await this.base(em, actor.orgId)
    if (code === base) {
      throw AppError.validation({ code: 'Bu asosiy valyuta: uning kursi bo‘lmaydi' })
    }
    const before = await em.findOneBy(OrgCurrency, { code })
    const next = form ?? (before ? { against: before.against, way: before.way } : usualRateForm(code, base))
    const others = await em.find(OrgCurrency, { where: { isActive: true } })
    if (!mayBeWrittenAgainst(code, next.against, forms(others, code), base)) {
      throw AppError.validation({
        form: `Kursni ${CURRENCIES[next.against].name} bilan yozib bo‘lmaydi: u yoqilmagan yoki o‘zi shu valyutaga bog‘langan`,
      })
    }
    if (before) {
      await em.update(OrgCurrency, before.id, { isActive: true, ...next })
    } else {
      await em.save(em.create(OrgCurrency, { orgId: actor.orgId, code, ...next, isActive: true }))
    }
    if (!before?.isActive || !sameForm(before, next)) {
      await this.audit.record(em, actor.orgId, actor, {
        action: before?.isActive ? 'currency.update' : 'currency.enable',
        entity: 'currency',
        summary: named(code),
        changes: before?.isActive ? { form: [wording(code, before), wording(code, next)] } : null,
      })
    }
  }

  /**
   * Puts a currency away: it is offered nowhere any more, and everything
   * written in it stays readable. Not while money is still kept in it, nor
   * while prices are set in it, nor while another currency's rate is written
   * against it.
   */
  async disable(actor: Actor, code: AnyCurrency): Promise<CurrenciesDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const mine = await this.find(em, code)
      const leaning = await em.find(OrgCurrency, { where: { isActive: true, against: code } })
      if (leaning.length) {
        const names = leaning.map((currency) => CURRENCIES[currency.code].name).join(', ')
        throw AppError.conflict(
          'CURRENCY_CARRIES',
          `${names} kursi ${CURRENCIES[code].name} bilan yozilgan. Avval uning yozilishini o‘zgartiring`,
        )
      }
      const held: { name: string }[] = await em.query(
        `SELECT name FROM accounts WHERE currency = $1 AND balance <> 0 AND kind <> 'system' ORDER BY name LIMIT 5`,
        [code],
      )
      if (held.length) {
        throw AppError.conflict(
          'CURRENCY_HELD',
          `${CURRENCIES[code].name} hali ishlatilmoqda: ${held.map((account) => account.name).join(', ')}. Avval shu hisoblarni bo‘shating`,
        )
      }
      const [{ cost }]: { cost: AnyCurrency }[] = await em.query(
        `SELECT cost_currency AS cost FROM organizations WHERE id = $1`,
        [actor.orgId],
      )
      if (cost === code) {
        throw AppError.conflict(
          'CURRENCY_COST',
          `Tannarx ${CURRENCIES[code].name}da yuritiladi: bu valyuta o‘chirib qo‘yilmaydi`,
        )
      }
      const priced: { name: string }[] = await em.query(
        `SELECT name FROM price_types WHERE currency = $1 AND is_active ORDER BY sort_order, name LIMIT 5`,
        [code],
      )
      if (priced.length) {
        throw AppError.conflict(
          'CURRENCY_PRICED',
          `Narxlar ${CURRENCIES[code].name}da: ${priced.map((type) => type.name).join(', ')}. Avval narx turining valyutasini o‘zgartiring`,
        )
      }
      await em.update(OrgCurrency, mine.id, { isActive: false })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'currency.disable',
        entity: 'currency',
        summary: named(code),
      })
      afterCommit(() => this.changed(actor.orgId))
      return this.rows(em, actor)
    })
  }

  /** Sets a currency's rate from today on, written the way the business writes it. */
  async setRate(actor: Actor, code: AnyCurrency, input: CurrencyRateInput): Promise<CurrenciesDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const mine = await this.find(em, code)
      const today = await this.ledger.today(em, actor.orgId)
      const before = (await ratesInForce(em, today)).get(code)
      // Written another way since, the two numbers are not to be set side by side.
      if (!input.confirmed && before && sameForm(before, mine) && isRateJump(before.value, input.value)) {
        throw rateJumpError(before.value, input.value)
      }
      const next: WrittenRate = { against: mine.against, way: mine.way, value: input.value }
      await em.query(
        `INSERT INTO currency_rates (org_id, code, rate_date, against, way, value, set_by, set_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (org_id, code, rate_date)
         DO UPDATE SET against = EXCLUDED.against, way = EXCLUDED.way, value = EXCLUDED.value,
           set_by = EXCLUDED.set_by, set_by_name = EXCLUDED.set_by_name`,
        [actor.orgId, code, today, next.against, next.way, next.value, actor.userId, actor.name],
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'rate.set',
        entity: 'rate',
        summary: `${today}: ${written(code, next)}`,
        changes: before ? { [code]: [written(code, before), written(code, next)] } : null,
      })
      // The tills count by the rates too.
      afterCommit(() => this.realtime.changed(actor.orgId, ['money', 'pos']))
      return this.rows(em, actor)
    })
  }

  async history(actor: Actor, code: AnyCurrency): Promise<CurrencyRateDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const rates = await em.find(CurrencyRate, { where: { code }, order: { rateDate: 'DESC' }, take: 60 })
      return rates.map((rate) => ({
        date: rate.rateDate,
        against: rate.against,
        way: rate.way,
        value: rate.value,
        setByName: rate.setByName,
      }))
    })
  }

  /**
   * The rates in force on a day: the last one each currency was given on or
   * before it. Whatever values money on that day takes them from here.
   */
  async book(em: EntityManager, actor: Pick<Actor, 'orgId'>, date: string): Promise<RateBook> {
    return bookFrom(await this.base(em, actor.orgId), await ratesInForce(em, date))
  }

  /** The currencies money may be kept in: the base and those switched on. */
  async kept(em: EntityManager, actor: Pick<Actor, 'orgId'>): Promise<AnyCurrency[]> {
    const mine = await em.find(OrgCurrency, { where: { isActive: true }, order: { createdAt: 'ASC' } })
    return [await this.base(em, actor.orgId), ...mine.map((currency) => currency.code)]
  }

  /** Who has which currencies is read with the session; screens hear of it as a change to the business. */
  private changed(orgId: string) {
    this.actors.invalidate()
    this.realtime.changed(orgId, ['money', 'me'])
  }

  private async base(em: EntityManager, orgId: string): Promise<AnyCurrency> {
    return (await em.findOneByOrFail(Organization, { id: orgId })).baseCurrency
  }

  private async find(em: EntityManager, code: AnyCurrency): Promise<OrgCurrency> {
    const mine = await em.findOneBy(OrgCurrency, { code, isActive: true })
    if (!mine) {
      throw AppError.notFound('Bu valyuta yoqilmagan')
    }
    return mine
  }

  private async rows(em: EntityManager, actor: Actor): Promise<CurrenciesDto> {
    const base = await this.base(em, actor.orgId)
    const today = await this.ledger.today(em, actor.orgId)
    const mine = await em.find(OrgCurrency, { where: { isActive: true }, order: { createdAt: 'ASC' } })
    const rates = await ratesInForce(em, today)
    const book = bookFrom(base, rates)
    const keeping: { currency: AnyCurrency }[] = await em.query(
      `SELECT DISTINCT currency FROM accounts WHERE balance <> 0 AND kind <> 'system'`,
    )
    const held = new Set(keeping.map((row) => row.currency))
    const stale = (date: string | undefined) => !!date && (Date.parse(today) - Date.parse(date)) / DAY > RATE_STALE_DAYS

    const row = (code: AnyCurrency, part: Pick<CurrencyDto, 'base' | 'form' | 'rate'>): CurrencyDto => ({
      code,
      ...part,
      worth: part.base ? null : shownWorth(code, book),
      missing: missingRate(code, book),
      stale: stale(part.rate?.date),
      held: held.has(code),
      carries: mine.filter((currency) => currency.against === code).map((currency) => currency.code),
    })

    const active: CurrencyDto[] = [
      row(base, { base: true, form: null, rate: null }),
      ...mine.map((currency) =>
        row(currency.code, {
          base: false,
          form: { against: currency.against, way: currency.way },
          rate: rates.get(currency.code) ?? null,
        }),
      ),
    ]
    const taken = new Set<AnyCurrency>([base, ...mine.map((currency) => currency.code)])
    return { base, active, available: ALL_CURRENCY_CODES.filter((code) => !taken.has(code)) }
  }
}

/** How each currency a business has is written; one may be left out, to be judged afresh. */
function forms(mine: OrgCurrency[], except?: AnyCurrency): Partial<Record<AnyCurrency, RateForm>> {
  const forms: Partial<Record<AnyCurrency, RateForm>> = {}
  for (const currency of mine) {
    if (currency.code !== except) {
      forms[currency.code] = { against: currency.against, way: currency.way }
    }
  }
  return forms
}

/** The way a rate is written, in words a history line can hold: "1 $ = … ¥". */
const wording = (code: AnyCurrency, form: RateForm) => {
  const { one, of } = rateWording(code, form)
  return `1 ${CURRENCIES[one].symbol} = … ${CURRENCIES[of].symbol}`
}

/** A rate far from the last is not refused, only asked about: the screen sends it again, confirmed. */
export function rateJumpError(before: number, next: number): AppError {
  const far = Math.round(rateJump(before, next))
  const was = String(before).replace('.', ',')
  return AppError.conflict(
    'RATE_JUMP',
    `Kurs oldingisidan ${far}% farq qiladi (oldingisi ${was}). Xato terilmagan bo‘lsa, tasdiqlang`,
  )
}
