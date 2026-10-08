import { z } from 'zod'

import { Fraction } from './fraction'
import { ALL_CURRENCY_CODES, assertMinor, type AnyCurrency } from './money'

/**
 * The currencies a business keeps money in, and what each is worth.
 *
 * A business keeps its books in one currency, its base. Every other
 * currency it switches on has one number: its rate, a sentence of the kind
 * "1 X = so many Y". Y is the base ("1 $ = 12 650 so'm") or any other
 * currency the business has ("1 $ = 7,25 ¥") — where yuan are bought with
 * dollars, the yuan may be named against the dollar and follow it without
 * being typed again. No currency stands above the others: each says for
 * itself what its rate is written in.
 *
 * Nothing is rounded until the very end. The numbers that were typed are
 * kept as they are, and a sum is carried along the whole chain of them in
 * one step; a rate made up of two others ("1 ¥ ≈ 1 745 so'm") is only ever
 * shown. And a currency without a rate is worth nothing that can be named —
 * never one for one.
 */

/**
 * Which way a rate reads:
 * - `per` — "1 $ = 7,25 ¥": so many of it for one of the other;
 * - `in` — "1 ₽ = 135 so'm", "1 € = 1,08 $": one of it in so many of the other.
 */
export const RATE_WAYS = ['per', 'in'] as const
export type RateWay = (typeof RATE_WAYS)[number]

/** How a currency's rate is written: against which other currency, and which way round. */
export interface RateForm {
  against: AnyCurrency
  way: RateWay
}

/** A rate as it was written down. */
export interface WrittenRate extends RateForm {
  value: number
}

/**
 * The currencies from the dearest to the cheapest, roughly as the market
 * has them. Only for which way round a rate reads best — the dearer one
 * first, so the number is large: "1 $ = 12 650 so'm", not "1 so'm =
 * 0,000079 $". Never counted with.
 */
export const CURRENCY_STRENGTH: readonly AnyCurrency[] = [
  'GBP',
  'EUR',
  'USD',
  'AZN',
  'GEL',
  'BYN',
  'TMT',
  'AED',
  'CNY',
  'TJS',
  'TRY',
  'UAH',
  'KGS',
  'RUB',
  'KZT',
  'UZS',
]

/** Whether one of `a` is worth more than one of `b`, roughly: which way round a rate reads best. */
export const dearer = (a: AnyCurrency, b: AnyCurrency) => CURRENCY_STRENGTH.indexOf(a) < CURRENCY_STRENGTH.indexOf(b)

/**
 * How a currency's rate against another reads best: the dearer of the two
 * is the one ("1 $ = 12 650 so'm", "1 $ = 7,25 ¥"). A newly switched on
 * currency is written against the base so.
 */
export function usualRateForm(code: AnyCurrency, against: AnyCurrency): RateForm {
  return { against, way: dearer(code, against) ? 'in' : 'per' }
}

/** A rate reads "1 `one` = so many `of`". */
export function rateWording(code: AnyCurrency, form: RateForm): { one: AnyCurrency; of: AnyCurrency } {
  return form.way === 'per' ? { one: form.against, of: code } : { one: code, of: form.against }
}

/** The rates in force at one moment, each as it was written, and the currency they all come down to. */
export interface RateBook {
  base: AnyCurrency
  rates: Partial<Record<AnyCurrency, WrittenRate>>
}

/** A rate keeps six decimals: "0,010800" of a dollar for a rouble is still a rate. */
export const RATE_DECIMALS = 6

const exact = (value: number) => Fraction.parse(value.toFixed(RATE_DECIMALS))

/**
 * Whose rate is wanting before this currency can be valued: its own, or
 * that of one it is written against, further down. Currencies written
 * against each other in a ring are all wanting. Null when it can be valued.
 */
export function missingRate(code: AnyCurrency, book: RateBook): AnyCurrency | null {
  const seen = new Set<AnyCurrency>()
  for (let at = code; at !== book.base; at = (book.rates[at] as WrittenRate).against) {
    if (seen.has(at) || !book.rates[at]) {
      return at
    }
    seen.add(at)
  }
  return null
}

/**
 * What one of a currency is worth in the base, exactly: every rate on the
 * way down multiplied or divided in, none rounded. Null while a rate it
 * hangs on is wanting.
 */
export function baseWorth(code: AnyCurrency, book: RateBook): Fraction | null {
  if (missingRate(code, book)) {
    return null
  }
  let worth = Fraction.ONE
  for (let at = code; at !== book.base;) {
    const rate = book.rates[at] as WrittenRate
    worth = rate.way === 'in' ? worth.mul(exact(rate.value)) : worth.div(exact(rate.value))
    at = rate.against
  }
  return worth
}

/** What a sum of a currency is worth in the base's smallest coin, rounded once; null while it cannot be valued. */
export function worthInBase(amount: number, code: AnyCurrency, book: RateBook): number | null {
  const one = baseWorth(code, book)
  return one ? assertMinor(Number(Fraction.of(assertMinor(amount)).mul(one).toScaled(0))) : null
}

/**
 * A sum of one currency as so much of another, carried across in one step —
 * yuan to dollars does not stop at the base to be rounded on the way. Null
 * while either cannot be valued.
 */
export function exchange(amount: number, from: AnyCurrency, to: AnyCurrency, book: RateBook): number | null {
  if (from === to) {
    return assertMinor(amount)
  }
  const [gives, takes] = [baseWorth(from, book), baseWorth(to, book)]
  return gives && takes ? assertMinor(Number(Fraction.of(assertMinor(amount)).mul(gives).div(takes).toScaled(0))) : null
}

const rounded = (value: Fraction) => Number(value.toDecimalString(RATE_DECIMALS))

/**
 * The old base's rate once `next` is the base in its place — a change made
 * only before any money is written, so the rates are all there is to carry
 * over. Every other currency keeps its rate as it was written: one written
 * against the old base now hangs on it, and it on the new. The new base
 * must have a rate in the old book; null where it has none.
 */
export function rebase(book: RateBook, next: AnyCurrency): WrittenRate | null {
  const nextWorth = baseWorth(next, book)
  if (!nextWorth) {
    return null
  }
  // "1 tenge = 26,35 so'm", or "1 $ = 480 tenge" for a dollar business going over to tenge.
  const form = usualRateForm(book.base, next)
  return { ...form, value: rounded(form.way === 'per' ? nextWorth : Fraction.ONE.div(nextWorth)) }
}

/** What one of a currency is worth in the base, to show: "1744.83". Never to count with. */
export function shownWorth(code: AnyCurrency, book: RateBook, decimals = 2): string | null {
  return baseWorth(code, book)?.toDecimalString(decimals) ?? null
}

/**
 * Whether a currency may have its rate written against another: the other
 * must come down to the base without passing through this one, or the two
 * would only ever be worth each other.
 */
export function mayBeWrittenAgainst(
  code: AnyCurrency,
  against: AnyCurrency,
  forms: Partial<Record<AnyCurrency, RateForm>>,
  base: AnyCurrency,
): boolean {
  const seen = new Set<AnyCurrency>([code])
  for (let at = against; at !== base; at = (forms[at] as RateForm).against) {
    if (seen.has(at) || !forms[at]) {
      return false
    }
    seen.add(at)
  }
  return code !== base
}

/**
 * Every way a currency's rate may be written: against the base, or against
 * any other currency the business has that does not itself lean on it —
 * each the usual way round first, then the other.
 */
export function rateFormChoices(
  code: AnyCurrency,
  base: AnyCurrency,
  forms: Partial<Record<AnyCurrency, RateForm>>,
): RateForm[] {
  const others = (Object.keys(forms) as AnyCurrency[]).filter(
    (other) => other !== code && other !== base && mayBeWrittenAgainst(code, other, forms, base),
  )
  return [base, ...others].flatMap((against) => {
    const usual = usualRateForm(code, against)
    return [usual, { against, way: usual.way === 'in' ? ('per' as const) : ('in' as const) }]
  })
}

/** The rates in force as a screen was given them: what it values money by without asking again. */
export function bookOf(currencies: Pick<CurrenciesDto, 'base' | 'active'>): RateBook {
  const book: RateBook = { base: currencies.base, rates: {} }
  for (const { code, rate } of currencies.active) {
    if (rate) {
      book.rates[code] = { against: rate.against, way: rate.way, value: rate.value }
    }
  }
  return book
}

/**
 * A rate this far from the one before it, in percent, is more often a slip
 * of the hand than the market: "1 265" for "12 650". It is asked about
 * before it is taken.
 */
export const RATE_JUMP_PERCENT = 15

/** How far a new rate lies from the one before it, in percent of the one before. */
export const rateJump = (before: number, next: number) => (Math.abs(next - before) / before) * 100

/** Whether a new rate is to be asked about before it replaces the one before it. */
export const isRateJump = (before: number | null | undefined, next: number) =>
  !!before && rateJump(before, next) > RATE_JUMP_PERCENT

/** A rate left unchanged this many days is pointed out: it still counts, and may well be wrong. */
export const RATE_STALE_DAYS = 7

// ───────────────────────────── Contracts ─────────────────────────────

const currencyCode = z.enum(ALL_CURRENCY_CODES as [AnyCurrency, ...AnyCurrency[]])

const rateValue = z
  .number()
  .positive('Kursni kiriting')
  .max(1_000_000_000)
  .refine((value) => Math.abs(value * 10 ** RATE_DECIMALS - Math.round(value * 10 ** RATE_DECIMALS)) < 1e-6, {
    message: `Kursda ko‘pi bilan ${RATE_DECIMALS} ta kasr xona bo‘ladi`,
  })

export const rateFormSchema = z.object({ against: currencyCode, way: z.enum(RATE_WAYS) })

/** Switching a currency on, or changing how its rate is written. */
export const currencyInputSchema = z.object({
  code: currencyCode,
  /** Left out, it is written the usual way: against the base, the dearer of the two first. */
  form: rateFormSchema.optional(),
})
export type CurrencyInput = z.infer<typeof currencyInputSchema>

export const currencyCodeSchema = currencyCode

/** A currency's rate from today on. */
export const currencyRateInputSchema = z.object({
  value: rateValue,
  /** The screen asked, and the person said the rate is meant: one far from the last is taken only so. */
  confirmed: z.boolean().default(false),
})
export type CurrencyRateInput = z.infer<typeof currencyRateInputSchema>

export interface CurrencyRateDto extends WrittenRate {
  date: string
  setByName: string | null
}

export interface CurrencyDto {
  code: AnyCurrency
  /** The books are kept in it: it has no rate, and is never put away. */
  base: boolean
  /** How its rate is asked for; null for the base. */
  form: RateForm | null
  /** The rate in force: the last one set, on whatever day. */
  rate: CurrencyRateDto | null
  /** One of it in the base today, to show; null while a rate is wanting. */
  worth: string | null
  /** Whose rate is wanting. */
  missing: AnyCurrency | null
  /** The rate has stood unchanged for longer than `RATE_STALE_DAYS`. */
  stale: boolean
  /** Money is kept in it: it can be put away only once every such place is empty. */
  held: boolean
  /** The currencies whose rates are written against it: it stays while they are. */
  carries: AnyCurrency[]
}

export interface CurrenciesDto {
  base: AnyCurrency
  /** The base first, then the rest in the order they were switched on. */
  active: CurrencyDto[]
  /** What can still be switched on. */
  available: AnyCurrency[]
}

// ───────────────────────────── The base ─────────────────────────────

/** Why a business may no longer take another base: money has been written, or goods valued in it. */
export const BASE_LOCKS = ['money', 'stock', 'drafts'] as const
export type BaseLock = (typeof BASE_LOCKS)[number]

export const baseCurrencyInputSchema = z.object({ currency: currencyCode })
export type BaseCurrencyInput = z.infer<typeof baseCurrencyInputSchema>

/** What taking another base would do, for the screen to say before it is done. */
/** The currency costs are kept in beside the base, and whether it may still change: until goods are costed. */
export interface CostCurrencyDto {
  cost: AnyCurrency
  locked: BaseLock | null
}

export interface BaseCurrencyDto {
  base: AnyCurrency
  /** Null while it may still change. */
  locked: BaseLock | null
  /** Prices in the base now: carried across to the new one at the rates of the day. */
  prices: number
}
