import { z } from 'zod'

import { Fraction } from './fraction'
import { ALL_CURRENCY_CODES, assertMinor, type AnyCurrency } from './money'

/**
 * The currencies a business keeps money in, and what each is worth.
 *
 * A business keeps its books in one currency, its base. Every other
 * currency it switches on has one number: its rate, a sentence of the kind
 * "1 X = so many Y". Y is the base ("1 ₽ = 135 so'm") or another currency
 * the business has ("1 $ = 7,25 ¥") — yuan are bought with dollars, so the
 * yuan is named against the dollar and follows it without being typed
 * again. There is no setting above the currencies that says which is the
 * go-between: each currency says for itself what its rate is written in.
 *
 * Nothing is rounded until the very end. The numbers that were typed are
 * kept as they are, and a sum is carried along the whole chain of them in
 * one step; a rate made up of two others ("1 ¥ ≈ 1 745 so'm") is only ever
 * shown. And a currency without a rate is worth nothing that can be named —
 * never one for one.
 */

/** What most currencies are named against, wherever a business has dollars at all. */
export const DOLLAR: AnyCurrency = 'USD'

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

/** Dearer than the dollar, and so named the other way about. */
const NAMED_IN_DOLLARS: AnyCurrency[] = ['EUR', 'GBP']

/**
 * The way a newly switched on currency's rate is asked for. Where the
 * business has dollars, against the dollar, as the market names it; where
 * it has none, straight in the base.
 */
export function usualRateForm(code: AnyCurrency, base: AnyCurrency, dollars: boolean): RateForm {
  const throughDollar = code !== DOLLAR && (dollars || base === DOLLAR)
  if (!throughDollar) {
    return { against: base, way: 'in' }
  }
  return { against: DOLLAR, way: NAMED_IN_DOLLARS.includes(code) ? 'in' : 'per' }
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
  /** Left out, it is written the usual way: against the dollar where the business has dollars. */
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
  /** The tills count in it beside the base: its rate is the one they use, set where it always was, and it stays. */
  fixed: boolean
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
