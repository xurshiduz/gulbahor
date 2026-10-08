import {
  ALL_CURRENCY_CODES,
  CURRENCIES,
  DOLLAR,
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
  type RateWay,
  type WrittenRate,
} from '@erp/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { CurrencyRate, OrgCurrency, Organization } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'
import { LedgerService } from './ledger.service'

const DAY = 86_400_000

const named = (code: AnyCurrency) => `${CURRENCIES[code].name} (${code})`

/** A rate as a person reads it: "1 $ = 7,25 ¥". */
const written = (code: AnyCurrency, rate: WrittenRate) => {
  const { one, of } = rateWording(code, rate)
  return `1 ${CURRENCIES[one].symbol} = ${String(rate.value).replace('.', ',')} ${CURRENCIES[of].symbol}`
}

const sameForm = (a: RateForm, b: RateForm) => a.against === b.against && a.way === b.way

/** What a business reckons in: its base, and whether it keeps dollars at its tills. */
interface Setup {
  base: AnyCurrency
  dollars: boolean
}

/**
 * The currencies a business keeps beside its base, and the rate of each.
 *
 * The base has no rate. The dollar, where the business has dollars at all,
 * is always there and its rate is the one the tills have always used
 * (`exchange_rates`); every other currency is switched on from the list
 * that is given, and has one number of its own, written against the base
 * or against another currency the business has.
 */
@Injectable()
export class CurrenciesService {
  constructor(
    private readonly db: Db,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(actor: Actor): Promise<CurrenciesDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => this.rows(em, actor))
  }

  /** Switches a currency on, or changes the way its rate is written. Its rates so far stay as they were written. */
  async enable(actor: Actor, code: AnyCurrency, form?: RateForm): Promise<CurrenciesDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const setup = await this.setup(em, actor)
      if (code === setup.base) {
        throw AppError.validation({ code: 'Bu asosiy valyuta: uning kursi bo‘lmaydi' })
      }
      if (code === DOLLAR) {
        throw AppError.validation({
          code: setup.dollars
            ? 'Dollar ro‘yxatda doim bor'
            : 'Dollar «Dollar bilan ishlash» moduli bilan yoqiladi: Sozlamalar → Biznes',
        })
      }
      const before = await em.findOneBy(OrgCurrency, { code })
      const next =
        form ?? (before ? { against: before.against, way: before.way } : usualRateForm(code, setup.base, setup.dollars))
      const others = await em.find(OrgCurrency, { where: { isActive: true } })
      if (!mayBeWrittenAgainst(code, next.against, this.forms(others, setup, code), setup.base)) {
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
      afterCommit(() => this.realtime.changed(actor.orgId, ['money']))
      return this.rows(em, actor)
    })
  }

  /**
   * Puts a currency away: it is offered nowhere any more, and everything
   * written in it stays readable. Not while money is still kept in it, nor
   * while another currency's rate is written against it.
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
      await em.update(OrgCurrency, mine.id, { isActive: false })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'currency.disable',
        entity: 'currency',
        summary: named(code),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['money']))
      return this.rows(em, actor)
    })
  }

  /** Sets a currency's rate from today on, written the way the business writes it. */
  async setRate(actor: Actor, code: AnyCurrency, input: CurrencyRateInput): Promise<CurrenciesDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const mine = await this.find(em, code)
      const today = await this.ledger.today(em, actor.orgId)
      const before = (await this.inForce(em, today)).get(code)
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
      afterCommit(() => this.realtime.changed(actor.orgId, ['money']))
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
  async book(em: EntityManager, actor: Pick<Actor, 'orgId' | 'modules'>, date: string): Promise<RateBook> {
    const setup = await this.setup(em, actor)
    const book: RateBook = { base: setup.base, rates: {} }
    for (const [code, rate] of await this.inForce(em, date)) {
      book.rates[code] = { against: rate.against, way: rate.way, value: rate.value }
    }
    const dollar = setup.dollars ? await this.ledger.rate(em, date) : null
    if (dollar) {
      book.rates[DOLLAR] = { against: setup.base, way: 'in', value: dollar.uzsPerUsd }
    }
    return book
  }

  /** The currencies money may be kept in: the base, the dollar where the business has dollars, and what it switched on. */
  async kept(em: EntityManager, actor: Pick<Actor, 'orgId' | 'modules'>): Promise<AnyCurrency[]> {
    const setup = await this.setup(em, actor)
    const mine = await em.find(OrgCurrency, { where: { isActive: true }, order: { createdAt: 'ASC' } })
    return [setup.base, ...(setup.dollars ? [DOLLAR] : []), ...mine.map((currency) => currency.code)]
  }

  private async setup(em: EntityManager, actor: Pick<Actor, 'orgId' | 'modules'>): Promise<Setup> {
    const org = await em.findOneByOrFail(Organization, { id: actor.orgId })
    return { base: org.baseCurrency, dollars: org.baseCurrency !== DOLLAR && actor.modules.includes('usd') }
  }

  /** How each currency a business has is written, the dollar among them; one may be left out, to be judged afresh. */
  private forms(mine: OrgCurrency[], setup: Setup, except?: AnyCurrency): Partial<Record<AnyCurrency, RateForm>> {
    const forms: Partial<Record<AnyCurrency, RateForm>> = {}
    if (setup.dollars) {
      forms[DOLLAR] = { against: setup.base, way: 'in' }
    }
    for (const currency of mine) {
      if (currency.code !== except) {
        forms[currency.code] = { against: currency.against, way: currency.way }
      }
    }
    return forms
  }

  /** The last rate of each currency on or before a day, of those still switched on. */
  private async inForce(em: EntityManager, date: string): Promise<Map<AnyCurrency, CurrencyRateDto>> {
    const rows: {
      code: AnyCurrency
      rate_date: string
      against: AnyCurrency
      way: RateWay
      value: string
      set_by_name: string | null
    }[] = await em.query(
      `SELECT DISTINCT ON (r.code) r.code, r.rate_date::text, r.against, r.way, r.value, r.set_by_name
       FROM currency_rates r JOIN org_currencies c ON c.org_id = r.org_id AND c.code = r.code AND c.is_active
       WHERE r.rate_date <= $1 ORDER BY r.code, r.rate_date DESC`,
      [date],
    )
    return new Map(
      rows.map((row) => [
        row.code,
        {
          date: row.rate_date,
          against: row.against,
          way: row.way,
          value: Number(row.value),
          setByName: row.set_by_name,
        },
      ]),
    )
  }

  private async find(em: EntityManager, code: AnyCurrency): Promise<OrgCurrency> {
    const mine = await em.findOneBy(OrgCurrency, { code, isActive: true })
    if (!mine) {
      throw AppError.notFound('Bu valyuta yoqilmagan')
    }
    return mine
  }

  private async rows(em: EntityManager, actor: Actor): Promise<CurrenciesDto> {
    const setup = await this.setup(em, actor)
    const today = await this.ledger.today(em, actor.orgId)
    const mine = await em.find(OrgCurrency, { where: { isActive: true }, order: { createdAt: 'ASC' } })
    const rates = await this.inForce(em, today)
    const dollar = setup.dollars ? await this.ledger.rate(em, today) : null
    const book: RateBook = { base: setup.base, rates: {} }
    for (const [code, rate] of rates) {
      book.rates[code] = { against: rate.against, way: rate.way, value: rate.value }
    }
    if (dollar) {
      book.rates[DOLLAR] = { against: setup.base, way: 'in', value: dollar.uzsPerUsd }
    }
    const keeping: { currency: AnyCurrency }[] = await em.query(
      `SELECT DISTINCT currency FROM accounts WHERE balance <> 0 AND kind <> 'system'`,
    )
    const held = new Set(keeping.map((row) => row.currency))
    const stale = (date: string | undefined) => !!date && (Date.parse(today) - Date.parse(date)) / DAY > RATE_STALE_DAYS

    const row = (code: AnyCurrency, part: Pick<CurrencyDto, 'base' | 'fixed' | 'form' | 'rate'>): CurrencyDto => ({
      code,
      ...part,
      worth: part.base ? null : shownWorth(code, book),
      missing: missingRate(code, book),
      stale: stale(part.rate?.date),
      held: held.has(code),
      carries: mine.filter((currency) => currency.against === code).map((currency) => currency.code),
    })

    const active: CurrencyDto[] = [row(setup.base, { base: true, fixed: true, form: null, rate: null })]
    if (setup.dollars) {
      const form: RateForm = { against: setup.base, way: 'in' }
      active.push(
        row(DOLLAR, {
          base: false,
          fixed: true,
          form,
          rate: dollar ? { ...form, value: dollar.uzsPerUsd, date: dollar.date, setByName: dollar.setByName } : null,
        }),
      )
    }
    for (const currency of mine) {
      active.push(
        row(currency.code, {
          base: false,
          fixed: false,
          form: { against: currency.against, way: currency.way },
          rate: rates.get(currency.code) ?? null,
        }),
      )
    }
    const taken = new Set<AnyCurrency>([setup.base, DOLLAR, ...mine.map((currency) => currency.code)])
    return { base: setup.base, active, available: ALL_CURRENCY_CODES.filter((code) => !taken.has(code)) }
  }
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
