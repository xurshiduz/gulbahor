import { z } from 'zod'

import { baseWorth, exchange, worthInBase, type RateBook } from './currencies'
import type { AnyCurrency } from './money'
import type { AccountDto } from './pos'
import type { PartnerDto } from './purchasing'
import { idSchema, listQuerySchema, optionalText, requiredText } from './schemas'

/**
 * What a partner owes and is owed, and the money that settles it.
 *
 * Every partner has one account, kept in one currency. Money may come in
 * any way and in any currency the business keeps: each line of a payment
 * says what went into (or out of) one of the business's accounts, in that
 * account's own currency, and how much of the partner's account that
 * settles.
 *
 * The two sums are a pair. Left alone, the second follows from the first at
 * the day's rate. But the two sides may agree otherwise — "take these 100
 * dollars for 1 200 000" — and then both stand as they were said: the money
 * is what was handed over, the account moves by what was agreed, and what
 * lies between them at the day's rate is written down as an exchange
 * difference instead of being hidden in either.
 */

/**
 * The rates a line of money is valued by: the whole book of them, or —
 * where only so'm and dollars ever meet — just the dollar's, in so'm.
 */
export type Rates = RateBook | number | null

/** A book made of the one rate there is, where that is all that was given. */
export const ratesOf = (rates: Rates): RateBook =>
  typeof rates === 'number' || rates === null
    ? { base: 'UZS', rates: rates ? { USD: { against: 'UZS', way: 'in', value: rates } } : {} }
    : rates

/** What a sum is worth in the base; it is asked only where the rate is known to be there. */
function valued(amount: number, currency: AnyCurrency, book: RateBook): number {
  const worth = worthInBase(amount, currency, book)
  if (worth === null) {
    throw new RangeError(`A rate is needed to value ${currency}`)
  }
  return worth
}

export interface Settled {
  /** How much of the partner's account the money settles, in the partner's currency. */
  settled: number
  /** The money's worth in the base. */
  cashBase: number
  /** What was settled, in the base. */
  partnerBase: number
  /** What rounding to the smallest coin left between the two: it goes to the exchange-difference account. */
  fx: number
}

/**
 * What `amount` of an account's currency settles on a partner's account.
 * It is carried across at the day's rates in one step and comes out to the
 * smallest coin of the partner's currency; what that coin does not cover is
 * not lost but written down as an exchange difference.
 */
export function settledFor(
  amount: number,
  accountCurrency: AnyCurrency,
  partnerCurrency: AnyCurrency,
  rates: Rates,
): Settled {
  const book = ratesOf(rates)
  const cashBase = valued(amount, accountCurrency, book)
  if (accountCurrency === partnerCurrency) {
    return { settled: amount, cashBase, partnerBase: cashBase, fx: 0 }
  }
  const settled = exchange(amount, accountCurrency, partnerCurrency, book)
  if (settled === null) {
    throw new RangeError(`A rate is needed to value ${partnerCurrency}`)
  }
  const partnerBase = valued(settled, partnerCurrency, book)
  return { settled, cashBase, partnerBase, fx: cashBase - partnerBase }
}

/** How a rate between two currencies reads: one of the dearer is so many of the cheaper — "1 $ = 12 650 so'm", "1 $ = 7,25 ¥". */
export interface Pair {
  one: AnyCurrency
  of: AnyCurrency
}

/** The two as a rate names them; null where they are one currency, or either cannot be valued. */
export function pairOf(a: AnyCurrency, b: AnyCurrency, rates: Rates): Pair | null {
  const book = ratesOf(rates)
  const [first, second] = [baseWorth(a, book), baseWorth(b, book)]
  if (a === b || !first || !second) {
    return null
  }
  return first.sub(second).isNegative() ? { one: b, of: a } : { one: a, of: b }
}

/** A rate is shown to the tiyin where it runs to hundreds, and to four places where it is a handful. */
const shown = (value: number) => {
  const places = value >= 100 ? 100 : 10_000
  return Math.round(value * places) / places
}

/** The day's rate between two currencies, as it reads; null where there is none to speak of. */
export function dayPairRate(a: AnyCurrency, b: AnyCurrency, rates: Rates): (Pair & { value: number }) | null {
  const book = ratesOf(rates)
  const pair = pairOf(a, b, book)
  if (!pair) {
    return null
  }
  const [one, of] = [baseWorth(pair.one, book), baseWorth(pair.of, book)]
  return one && of ? { ...pair, value: shown(one.div(of).toNumber()) } : null
}

/**
 * A book for one pair alone, at a rate of its own: what a person who sets
 * rates typed for a line. Only what one currency makes of the other can be
 * read from it — its base is the cheaper of the two, not the business's.
 */
export const pairBook = (pair: Pair, value: number): RateBook => ({
  base: pair.of,
  rates: { [pair.one]: { against: pair.of, way: 'in', value } },
})

/** A line of money as it goes into the books. */
export interface LineWorth extends Settled {
  /** What the two sums make between them, read as their `pair` reads; null where no currency is changed. */
  rate: number | null
  /** The second sum was agreed, not left to the day's rate. */
  agreed: boolean
  /** How that rate reads; null where no currency is changed. */
  pair: Pair | null
  /** What rounding to the smallest coin can leave between the two sums, in the base: nobody's agreement. */
  slack: number
}

/**
 * The rate two sums of a pair make between them, read as the pair reads.
 * Without a pair the two are so'm and dollars, and it is so'm for a dollar.
 * Null when it cannot be said.
 */
export function pairRate(
  amount: number,
  accountCurrency: AnyCurrency,
  settled: number,
  pair?: Pair | null,
): number | null {
  const accountIsOne = pair ? pair.one === accountCurrency : accountCurrency !== 'UZS'
  const [ones, ofs] = accountIsOne ? [amount, settled] : [settled, amount]
  return ones > 0 && ofs > 0 ? shown(ofs / ones) : null
}

/** The smallest coin of a currency, in the base's. */
const coin = (currency: AnyCurrency, book: RateBook) => Math.ceil(baseWorth(currency, book)?.toNumber() ?? 0)

/**
 * A line of money against an account kept in `targetCurrency`, with what it
 * is to settle either left to the day's rate or agreed.
 *
 * The money is always valued at the day's rate: a dollar in the drawer is
 * worth what the day says, whatever was agreed across the counter. An
 * agreed sum moves the other account by exactly that sum; what lies between
 * the two in the base is the exchange difference (`fx`: more than nothing
 * when the money was worth more than what it settled).
 */
export function settleLine(
  amount: number,
  accountCurrency: AnyCurrency,
  targetCurrency: AnyCurrency,
  rates: Rates,
  agreed?: number | null,
): LineWorth {
  const book = ratesOf(rates)
  const plain = settledFor(amount, accountCurrency, targetCurrency, book)
  if (accountCurrency === targetCurrency) {
    return { ...plain, rate: null, agreed: false, pair: null, slack: 0 }
  }
  const day = dayPairRate(accountCurrency, targetCurrency, book)
  const pair = day ? { one: day.one, of: day.of } : null
  const slack = Math.max(coin(accountCurrency, book), coin(targetCurrency, book))
  if (!agreed || agreed === plain.settled) {
    return { ...plain, rate: day?.value ?? null, agreed: false, pair, slack }
  }
  const partnerBase = valued(agreed, targetCurrency, book)
  return {
    settled: agreed,
    cashBase: plain.cashBase,
    partnerBase,
    fx: plain.cashBase - partnerBase,
    rate: pairRate(amount, accountCurrency, agreed, pair),
    agreed: true,
    pair,
    slack,
  }
}

/** How far what a line settles lies from what its money is worth at the day's rate, in percent to one decimal. */
export function rateGap(worth: Pick<Settled, 'cashBase' | 'partnerBase'>): number {
  return worth.cashBase > 0
    ? Math.round((Math.abs(worth.cashBase - worth.partnerBase) * 1000) / worth.cashBase) / 10
    : 0
}

/**
 * Whether an agreed sum strays from the day's rate by more than the
 * business lets anyone agree to: past that it takes someone who may set
 * rates. Either way counts — a partner short-changed by a slip of the
 * finger is as wrong as one overpaid. What rounding to the smallest coin
 * leaves is nobody's agreement and never counts.
 */
export function straysFromRate(
  worth: Pick<Settled, 'cashBase' | 'partnerBase'> & { slack?: number },
  limitPercent: number,
  uzsPerUsd?: number | null,
): boolean {
  const gap = Math.abs(worth.cashBase - worth.partnerBase)
  // Where the line does not say, the two are so'm and dollars: a cent is worth as many tiyin as a dollar is worth so'm.
  const slack = worth.slack ?? Math.ceil(uzsPerUsd ?? 0)
  return gap > slack && gap * 100 > worth.cashBase * limitPercent
}

/**
 * The other way round, for the second of the paired fields: what has to be
 * handed over in an account's currency to settle so much of a partner's
 * account. The answer is then run through `settledFor`, which has the last
 * word on what it settles.
 */
export function amountFor(
  settled: number,
  accountCurrency: AnyCurrency,
  partnerCurrency: AnyCurrency,
  rates: Rates,
): number {
  if (accountCurrency === partnerCurrency) {
    return settled
  }
  const amount = exchange(settled, partnerCurrency, accountCurrency, ratesOf(rates))
  if (amount === null) {
    throw new RangeError('A rate is needed to change one currency into the other')
  }
  return amount
}

/** A place a payment can go through, and whether it can right now. */
export interface PaymentAccountDto extends AccountDto {
  /** A till's drawer takes money only while its shift is open; every other place always does. */
  open: boolean
  /**
   * The till whose drawer this is: its name, whether it is its shop's main
   * till, and whether the person asking has its shift open. Null for a place
   * that is no till's.
   */
  till: { name: string; main: boolean; mine: boolean } | null
}

/** A till a person may pay through, as the window that asks "which till?" needs it. */
export interface PayTill {
  id: string
  name: string
  locationName: string | null
  main: boolean
  mine: boolean
  open: boolean
}

/** The tills among the places a person may pay through, in the order the places came. */
export function tillsOf(accounts: PaymentAccountDto[]): PayTill[] {
  const tills = new Map<string, PayTill>()
  for (const account of accounts) {
    if (account.registerId && account.till && !tills.has(account.registerId)) {
      tills.set(account.registerId, {
        id: account.registerId,
        name: account.till.name,
        locationName: account.locationName,
        main: account.till.main,
        mine: account.till.mine,
        open: account.open,
      })
    }
  }
  return [...tills.values()]
}

/**
 * The till a payment opens on when nobody has said which: the one this
 * computer sells at; else the one whose shift this person has open; else the
 * one chosen here last; else a shop's main till, one with its shift open
 * before one without; else the first there is.
 */
export function defaultTill(tills: PayTill[], here: string | null, last: string | null): string | null {
  const known = (id: string | null) => tills.find((till) => till.id === id)
  return (
    (
      known(here) ??
      tills.find((till) => till.mine) ??
      known(last) ??
      tills.find((till) => till.main && till.open) ??
      tills.find((till) => till.main) ??
      tills[0] ??
      null
    )?.id ?? null
  )
}

// ───────────────────────────── Payments ─────────────────────────────

/** `in`: the partner pays the business. `out`: the business pays the partner. `opening`: what stood between them before the books began. */
export const PARTNER_PAYMENT_KINDS = ['in', 'out', 'opening'] as const
export type PartnerPaymentKind = (typeof PARTNER_PAYMENT_KINDS)[number]

export const PARTNER_PAYMENT_KIND_LABELS: Record<PartnerPaymentKind, string> = {
  in: 'Hamkordan to‘lov',
  out: 'Hamkorga to‘lov',
  opening: 'Boshlang‘ich qoldiq',
}

export const PARTNER_PAYMENT_STATUSES = ['posted', 'cancelled'] as const
export type PartnerPaymentStatus = (typeof PARTNER_PAYMENT_STATUSES)[number]

export const PARTNER_PAYMENT_STATUS_LABELS: Record<PartnerPaymentStatus, string> = {
  posted: 'O‘tkazilgan',
  cancelled: 'Bekor qilingan',
}

const moneySchema = z.number().int().min(0).max(1_000_000_000_000_00)
const positive = moneySchema.refine((value) => value > 0, { message: 'Summani kiriting' })

export const partnerPaymentLineSchema = z.object({
  /** The till's drawer, the safe, the card or the bank account the money went into, or came out of. */
  accountId: idSchema,
  /** In that account's currency. */
  amount: positive,
  /**
   * What the line settles on the partner's account, in the partner's currency, when that was agreed and
   * not left to the day's rate. Counts only where the account is in another currency than the partner's.
   */
  settled: positive.nullish().transform((value) => value ?? null),
})
export type PartnerPaymentLineInput = z.infer<typeof partnerPaymentLineSchema>

export const partnerPaymentInputSchema = z.object({
  /** Made by the screen for each payment: sent twice, it is still made once. */
  clientKey: z.uuid(),
  partnerId: idSchema,
  kind: z.enum(['in', 'out']),
  lines: z.array(partnerPaymentLineSchema).min(1, 'To‘lovni kiriting').max(10),
  /** What the screen showed as settled on the partner's account: if the rate has changed since, the payment is refused. */
  settled: moneySchema,
  note: optionalText(300),
})
export type PartnerPaymentInput = z.infer<typeof partnerPaymentInputSchema>

/** What stood between the business and a partner before the books began. */
export const partnerOpeningInputSchema = z.object({
  clientKey: z.uuid(),
  partnerId: idSchema,
  /** Who owes: the partner, or the business. */
  owes: z.enum(['partner', 'us']),
  /** In the currency of the partner's account. */
  amount: positive,
  note: optionalText(300),
})
export type PartnerOpeningInput = z.infer<typeof partnerOpeningInputSchema>

export const partnerPaymentCancelSchema = z.object({ reason: requiredText(200) })

export const partnerPaymentListQuerySchema = listQuerySchema.extend({
  status: z.enum(['all', ...PARTNER_PAYMENT_STATUSES]).default('all'),
  kind: z.enum(PARTNER_PAYMENT_KINDS).optional(),
  partnerId: idSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})
export type PartnerPaymentListQuery = z.infer<typeof partnerPaymentListQuerySchema>

export interface PartnerPaymentLineDto {
  accountId: string
  accountName: string
  currency: AnyCurrency
  amount: number
  /** So'm for a dollar; null when no currency was changed. */
  rate: number | null
  /** What the line settled, in the partner's currency. */
  settled: number
  /** What the rate gave the business (+) or cost it (−) on this line, in so'm. */
  fx: number
}

export interface PartnerPaymentDto {
  id: string
  number: string
  kind: PartnerPaymentKind
  status: PartnerPaymentStatus
  partnerId: string
  partnerName: string
  /** The currency of the partner's account. */
  currency: AnyCurrency
  /** How the partner's debt changed: less after they paid, more after they were paid; an opening balance either way. */
  change: number
  paidAt: string
  createdByName: string | null
  note: string | null
  cancelledAt: string | null
  cancelledByName: string | null
  cancelReason: string | null
  /** How the money came or went, in words: "Kassa 1 (so'm), Seyf $". */
  paidBy: string
  lines: PartnerPaymentLineDto[]
}

// ───────────────────────────── The account ─────────────────────────────

export interface PartnerStatementLine {
  at: string
  /**
   * What happened: a payment's kind, `receipt` for goods received from them,
   * `sale` for goods sold to them on their account, `sale_return` for such
   * goods brought back, or `cancel` for any of it taken back.
   */
  kind: PartnerPaymentKind | 'receipt' | 'sale' | 'sale_return' | 'cancel'
  /** The document behind it: a payment, a receipt of goods, a sale at the till or a return to it. */
  source: 'payment' | 'receipt' | 'sale' | 'sale_return'
  number: string | null
  documentId: string | null
  /** How the partner's debt changed, in the partner's currency. */
  change: number
  /** What the partner owed after it; negative when the business owed them. */
  balance: number
  note: string | null
}

/** A partner's account from its first entry: every change and what was owed after each. */
export interface PartnerStatementDto {
  partner: PartnerDto
  lines: PartnerStatementLine[]
  /** What the partner owes now; negative when the business owes them. */
  balance: number
}
