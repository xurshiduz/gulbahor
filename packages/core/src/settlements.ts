import { z } from 'zod'

import type { CurrencyCode } from './money'
import { fromBase, rateSchema, toBase, type AccountDto } from './pos'
import type { PartnerDto } from './purchasing'
import { idSchema, listQuerySchema, optionalText, requiredText } from './schemas'

/**
 * What a partner owes and is owed, and the money that settles it.
 *
 * Every partner has one account, kept in so'm or in dollars. Money may come
 * in any way and in either currency: each line of a payment says what went
 * into (or out of) one of the business's accounts, in that account's own
 * currency, and the system works out from the rate how much of the
 * partner's account that settles. Nobody types the settled sum.
 */

export interface Settled {
  /** How much of the partner's account the money settles, in the partner's currency. */
  settled: number
  /** The money's worth in so'm. */
  cashBase: number
  /** What was settled, in so'm. */
  partnerBase: number
  /** The tiyin between the two, left by rounding to a whole cent: it goes to the exchange-difference account. */
  fx: number
}

/**
 * What `amount` of an account's currency settles on a partner's account.
 * So'm against a dollar account are worth dollars to the cent at the rate;
 * the so'm that a whole cent does not cover are not lost but written down
 * as an exchange difference.
 */
export function settledFor(
  amount: number,
  accountCurrency: CurrencyCode,
  partnerCurrency: CurrencyCode,
  uzsPerUsd: number | null,
): Settled {
  const cashBase = toBase(amount, accountCurrency, uzsPerUsd)
  if (accountCurrency === partnerCurrency) {
    return { settled: amount, cashBase, partnerBase: cashBase, fx: 0 }
  }
  if (partnerCurrency === 'UZS') {
    // Dollars against a so'm account: worth their so'm, exactly.
    return { settled: cashBase, cashBase, partnerBase: cashBase, fx: 0 }
  }
  if (!uzsPerUsd) {
    throw new RangeError("A rate is needed to settle a dollar account with so'm")
  }
  const settled = fromBase(amount, uzsPerUsd)
  const partnerBase = toBase(settled, 'USD', uzsPerUsd)
  return { settled, cashBase, partnerBase, fx: cashBase - partnerBase }
}

/**
 * The other way round, for the second of the paired fields: what has to be
 * handed over in an account's currency to settle so much of a partner's
 * account. The answer is then run through `settledFor`, which has the last
 * word on what it settles.
 */
export function amountFor(
  settled: number,
  accountCurrency: CurrencyCode,
  partnerCurrency: CurrencyCode,
  uzsPerUsd: number | null,
): number {
  if (accountCurrency === partnerCurrency) {
    return settled
  }
  if (!uzsPerUsd) {
    throw new RangeError('A rate is needed to change one currency into the other')
  }
  return accountCurrency === 'UZS' ? toBase(settled, 'USD', uzsPerUsd) : fromBase(settled, uzsPerUsd)
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
  in: "Hamkordan to'lov",
  out: "Hamkorga to'lov",
  opening: "Boshlang'ich qoldiq",
}

export const PARTNER_PAYMENT_STATUSES = ['posted', 'cancelled'] as const
export type PartnerPaymentStatus = (typeof PARTNER_PAYMENT_STATUSES)[number]

export const PARTNER_PAYMENT_STATUS_LABELS: Record<PartnerPaymentStatus, string> = {
  posted: "O'tkazilgan",
  cancelled: 'Bekor qilingan',
}

const moneySchema = z.number().int().min(0).max(1_000_000_000_000_00)
const positive = moneySchema.refine((value) => value > 0, { message: 'Summani kiriting' })

export const partnerPaymentLineSchema = z.object({
  /** The till's drawer, the safe, the card or the bank account the money went into, or came out of. */
  accountId: idSchema,
  /** In that account's currency. */
  amount: positive,
  /** So'm for a dollar, when it is not the day's rate: only for those allowed to set rates. */
  rate: rateSchema.nullish().transform((value) => value ?? null),
})
export type PartnerPaymentLineInput = z.infer<typeof partnerPaymentLineSchema>

export const partnerPaymentInputSchema = z.object({
  /** Made by the screen for each payment: sent twice, it is still made once. */
  clientKey: z.uuid(),
  partnerId: idSchema,
  kind: z.enum(['in', 'out']),
  lines: z.array(partnerPaymentLineSchema).min(1, "To'lovni kiriting").max(10),
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
  currency: CurrencyCode
  amount: number
  /** So'm for a dollar; null when no currency was changed. */
  rate: number | null
  /** What the line settled, in the partner's currency. */
  settled: number
}

export interface PartnerPaymentDto {
  id: string
  number: string
  kind: PartnerPaymentKind
  status: PartnerPaymentStatus
  partnerId: string
  partnerName: string
  /** The currency of the partner's account. */
  currency: CurrencyCode
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
  /** What happened: a payment's kind, `receipt` for goods received from them, or `cancel` for either taken back. */
  kind: PartnerPaymentKind | 'receipt' | 'cancel'
  /** The document behind it: a payment, or a receipt of goods. */
  source: 'payment' | 'receipt'
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
