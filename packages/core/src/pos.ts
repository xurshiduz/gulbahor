import { z } from 'zod'

import { saleDebtSchema } from './debts'
import type { ImageThumb } from './images'
import { allocateExact, roundToStep, type CurrencyCode } from './money'
import type { PromoOffer } from './promotions'
import { idSchema, listQuerySchema, optionalText, pinSchema, requiredText } from './schemas'

/**
 * The till: where money is kept, the shift a cashier works, and the sale.
 *
 * Money lives in accounts: a till's cash in so'm, its cash in dollars, a
 * card, a terminal's money on its way to the bank. Every movement is written
 * twice, out of one account and into another, so nothing appears from
 * nowhere. A sale is reckoned in so'm; a dollar handed over is worth what the
 * day's rate says, and stays a dollar in the till.
 */

// ───────────────────────────── Accounts ─────────────────────────────

/** `system` accounts are the other side of money that came from or went to no place: sales, rounding, a count that came out short. */
export const ACCOUNT_KINDS = ['cash', 'safe', 'card', 'terminal', 'bank', 'system', 'partner'] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  cash: 'Kassa (naqd)',
  safe: 'Seyf',
  card: 'Plastik karta',
  terminal: 'Bank terminali',
  bank: 'Bank hisob raqami',
  system: 'Ichki hisob',
  // What a partner owes the business; negative when the business owes them.
  partner: 'Hamkor hisobi',
}

export const SYSTEM_ACCOUNTS = [
  'sales',
  'rounding',
  'fx',
  'cash_diff',
  'opening',
  'exchange',
  'transit',
  'purchases',
  'expenses',
  'other_income',
  'owner',
  'receivables',
] as const
export type SystemAccount = (typeof SYSTEM_ACCOUNTS)[number]

export const SYSTEM_ACCOUNT_LABELS: Record<SystemAccount, string> = {
  sales: 'Savdo tushumi',
  rounding: 'Yaxlitlash farqi',
  fx: 'Kurs farqi',
  cash_diff: 'Kassa farqi (kamomad va ortiqcha)',
  opening: "Boshlang'ich qoldiq",
  // What customers owe for goods sold on credit.
  receivables: 'Mijozlar qarzi',
  // What goods brought back were worth, on its way to the goods taken instead; empty between exchanges.
  exchange: 'Almashtirish',
  // Money that has left one account and is not yet confirmed in the other.
  transit: "Yo'ldagi pul",
  // What goods received from suppliers were worth: the other side of what the business owes them for those goods.
  purchases: 'Tovar xaridi',
  // What was spent on running the business, and what it earned otherwise than by selling goods.
  expenses: 'Xarajatlar',
  other_income: 'Boshqa daromad',
  // What the owner took out of the business, less what they put into it: neither spent nor earned.
  owner: 'Egasi bilan hisob',
}

/** The accounts a person sets up; a till's own cash is made with the till. */
export const PAYMENT_ACCOUNT_KINDS = ['card', 'terminal', 'safe', 'bank'] as const
export type PaymentAccountKind = (typeof PAYMENT_ACCOUNT_KINDS)[number]

/** The kinds of account that may serve several shops at once. */
export const SHARED_ACCOUNT_KINDS: readonly PaymentAccountKind[] = ['card', 'bank']

export const accountInputSchema = z
  .object({
    kind: z.enum(PAYMENT_ACCOUNT_KINDS),
    name: requiredText(60),
    /** What it holds. A safe or a bank account may hold dollars; cards and terminals are in so'm. */
    currency: z.enum(['UZS', 'USD']).default('UZS'),
    /** The shop it belongs to; none for one shared by all. */
    locationId: idSchema.nullish().transform((value) => value ?? null),
    /**
     * The shops it serves, when there are several: a card may take money at some of the shops and not at
     * the others. Left empty, `locationId` says it all.
     */
    locationIds: z.array(idSchema).max(200).default([]),
    /** A card's last four digits: what bank messages and receipts call it by. */
    last4: z
      .string()
      .trim()
      .regex(/^\d{4}$/, 'Oxirgi 4 ta raqam')
      .nullish()
      .transform((value) => value || null),
    bank: optionalText(60),
  })
  .superRefine((account, context) => {
    if (account.currency !== 'UZS' && (account.kind === 'card' || account.kind === 'terminal')) {
      context.addIssue({ code: 'custom', path: ['currency'], message: "Karta va terminal faqat so'mda" })
    }
    // A terminal and a safe stand in one place; a card and a bank account go wherever their owner does.
    if (new Set(account.locationIds).size > 1 && !SHARED_ACCOUNT_KINDS.includes(account.kind)) {
      context.addIssue({
        code: 'custom',
        path: ['locationIds'],
        message: "Terminal va seyf bitta do'konda turadi",
      })
    }
  })
export type AccountInput = z.infer<typeof accountInputSchema>

/** The shops an account's form names, whichever of the two fields it used: none means every shop. */
export const accountShops = (input: Pick<AccountInput, 'locationId' | 'locationIds'>): string[] =>
  input.locationIds.length ? [...new Set(input.locationIds)] : input.locationId ? [input.locationId] : []

export interface AccountDto {
  id: string
  kind: AccountKind
  name: string
  currency: CurrencyCode
  /** The one shop it belongs to; null when it serves every shop, or several. */
  locationId: string | null
  locationName: string | null
  /** The shops it serves; empty for every shop. */
  locationIds: string[]
  locationNames: string[]
  registerId: string | null
  last4: string | null
  bank: string | null
  /** In the account's own currency; null for a person who may not see balances. */
  balance: number | null
  isActive: boolean
}

export const registerInputSchema = z.object({ name: requiredText(60), locationId: idSchema })
export type RegisterInput = z.infer<typeof registerInputSchema>

export interface RegisterDto {
  id: string
  name: string
  locationId: string
  locationName: string
  isActive: boolean
  /** The shop's main till: where its money is taken from and put when nobody says which. One to a shop. */
  isMain: boolean
  /** The shift open on it now. */
  shift: { id: string; number: string; openedAt: string; openedByName: string | null } | null
}

// ───────────────────────────── Rates ─────────────────────────────

export const rateSchema = z
  .number()
  .positive()
  .max(1_000_000)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: "Kursda ko'pi bilan 2 ta kasr xona bo'ladi",
  })

export const rateInputSchema = z.object({ date: z.iso.date(), uzsPerUsd: rateSchema })
export type RateInput = z.infer<typeof rateInputSchema>

export interface RateDto {
  date: string
  /** So'm for one dollar. */
  uzsPerUsd: number
  setByName: string | null
}

/** What `amount` of a currency is worth in so'm tiyin at a rate of so'm per dollar. */
export function toBase(amount: number, currency: CurrencyCode, uzsPerUsd: number | null): number {
  if (currency === 'UZS') {
    return amount
  }
  if (!uzsPerUsd) {
    throw new RangeError('A rate is needed to value dollars')
  }
  const negative = amount < 0
  const scaled = BigInt(Math.abs(amount)) * BigInt(Math.round(uzsPerUsd * 100))
  const rounded = Number((scaled + 50n) / 100n)
  return negative ? -rounded : rounded
}

/** How many cents so'm tiyin come to, rounded half up. */
export function fromBase(base: number, uzsPerUsd: number): number {
  const rate = BigInt(Math.round(uzsPerUsd * 100))
  return Number((BigInt(Math.abs(base)) * 200n + rate) / (rate * 2n)) * (base < 0 ? -1 : 1)
}

// ───────────────────────────── The sale ─────────────────────────────

/** How a customer hands money over at the till, and how it is handed back. */
export const TENDER_METHODS = ['cash', 'card', 'terminal'] as const
export type TenderMethod = (typeof TENDER_METHODS)[number]

/** What a sale can be paid with: money, or `exchange`: what goods brought back were worth, put towards new ones. */
export const PAYMENT_METHODS = [...TENDER_METHODS, 'exchange', 'debt'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Naqd',
  card: 'Kartaga',
  terminal: 'Terminal',
  exchange: 'Almashtirish',
  debt: 'Qarzga',
}

/**
 * A payment as a receipt names it: how it was paid and, where the money went
 * to one of several places (a card, a terminal), which. Cash has one drawer
 * and a debt has no place at all.
 */
export function paymentLabel(payment: { method: PaymentMethod; accountName: string }): string {
  const label = PAYMENT_METHOD_LABELS[payment.method]
  return payment.method === 'cash' || payment.method === 'debt' ? label : `${label} · ${payment.accountName}`
}

export interface CartLine {
  /** One unit, in so'm tiyin. */
  price: number
  qty: number
  /** Taken off this line as a whole. */
  discount: number
  /**
   * Taken off by itself before anything a cashier gives: the customer's own discount. A cashier's
   * discount is then counted from what is left, and against the cashier's limit only that is held.
   */
  auto?: number
}

const QTY_SCALE = 1000n

/** `price × qty`, exactly, rounded half up. */
export function gross(price: number, qty: number): number {
  return Number((BigInt(price) * BigInt(Math.round(qty * 1000)) * 2n + QTY_SCALE) / (QTY_SCALE * 2n))
}

export interface SaleTotals {
  subtotal: number
  /** Everything that came off: what came off by itself, line discounts and the discount on the whole sale. */
  discount: number
  /** The part of it that came off by itself: the customer's own discount. */
  auto: number
  total: number
  /** Each line after everything that came off it, with the part that came off by itself. */
  lines: { gross: number; discount: number; auto: number; total: number }[]
}

/** What a customer's percentage takes off a line worth `gross`, to the tiyin. */
export function customerOff(gross: number, percent: number): number {
  return percent > 0 ? Number((BigInt(gross) * BigInt(Math.round(percent * 100)) + 5000n) / 10000n) : 0
}

/** Whether what the cashier gave of their own accord is over the limit they may give alone. */
export function overDiscountLimit(totals: SaleTotals, limitPercent: number): boolean {
  return (totals.discount - totals.auto) * 100 > (totals.subtotal - totals.auto) * limitPercent
}

/**
 * What a cart comes to. A discount on the whole sale is shared out over the
 * lines by what each is worth, to the tiyin, so the lines always add up to
 * the total and a later return of one line knows what was paid for it.
 */
export function saleTotals(cart: readonly CartLine[], saleDiscount: number): SaleTotals {
  const own = cart.map((line) => {
    const value = gross(line.price, line.qty)
    const auto = Math.min(Math.max(0, line.auto ?? 0), value)
    return { gross: value, auto, discount: Math.min(line.discount, value - auto) }
  })
  const after = own.map((line) => line.gross - line.auto - line.discount)
  const left = after.reduce((sum, value) => sum + value, 0)
  const shared = allocateExact(
    Math.min(Math.max(0, saleDiscount), left),
    after.map((value) => BigInt(value)),
  )
  const lines = own.map((line, index) => ({
    gross: line.gross,
    discount: line.auto + line.discount + shared[index],
    auto: line.auto,
    total: line.gross - line.auto - line.discount - shared[index],
  }))
  const subtotal = lines.reduce((sum, line) => sum + line.gross, 0)
  const discount = lines.reduce((sum, line) => sum + line.discount, 0)
  const auto = lines.reduce((sum, line) => sum + line.auto, 0)
  return { subtotal, discount, auto, total: subtotal - discount, lines }
}

export interface Tender {
  method: TenderMethod
  currency: CurrencyCode
  /** In the tender's own currency. */
  amount: number
  /**
   * What it is taken for, in so'm, when that was agreed with the customer
   * and is not what the day's rate makes it: "call the 50 dollars 600 000".
   */
  value?: number | null
}

/** What a tender counts for against the sum, in so'm: what was agreed, or what the day's rate makes it. */
export function worthOf(tender: Tender, uzsPerUsd: number | null): number {
  return tender.value ?? toBase(tender.amount, tender.currency, uzsPerUsd)
}

/**
 * What taking money for an agreed worth leaves the shop with (+) or costs it
 * (−) against the day's rate: the drawer holds the notes at the rate, the
 * sale was paid with what was agreed, and the difference is the rate's.
 */
export function rateGain(tender: Tender, uzsPerUsd: number | null): number {
  return toBase(tender.amount, tender.currency, uzsPerUsd) - worthOf(tender, uzsPerUsd)
}

/**
 * Whether money was taken for more than the limit allows over what the rate
 * makes it. Each tender stands for itself: a gain on one does not pay for a
 * loss on another.
 */
export function overRateLoss(tenders: readonly Tender[], uzsPerUsd: number | null, limitPercent: number): boolean {
  return tenders.some((tender) => {
    const loss = -rateGain(tender, uzsPerUsd)
    return loss > 0 && loss * 100 > toBase(tender.amount, tender.currency, uzsPerUsd) * limitPercent
  })
}

/**
 * What a line may not be sold under: the thing's floor for that many. A floor
 * set above the price itself is a slip in the price list and holds nothing
 * back; null when the thing has no floor.
 */
export function floorOf(price: number, minPrice: number | null | undefined, qty: number): number | null {
  return minPrice === null || minPrice === undefined ? null : gross(Math.min(minPrice, price), qty)
}

/**
 * The lines that end up under their floor, by what is paid for each after its
 * own discount and its share of the sale's: that is what the receipt will say
 * the thing went for, and what a return of it gives back.
 */
export function belowFloor(
  lines: readonly { price: number; minPrice?: number | null; qty: number }[],
  totals: SaleTotals,
): number[] {
  return lines.flatMap((line, index) => {
    const floor = floorOf(line.price, line.minPrice, line.qty)
    return floor !== null && totals.lines[index].total < floor ? [index] : []
  })
}

export type SettleProblem =
  /** Dollars were tendered and no rate is set. */
  | 'rate'
  /** Cards and the terminal took more than the sale comes to: they cannot give change. */
  | 'non_cash_over'

export interface Settlement {
  /** Everything tendered, in so'm. */
  paid: number
  /** Still to pay, in so'm; 0 once covered. */
  due: number
  /** The same in cents, rounded up to a whole cent; null without a rate. */
  dueUsd: number | null
  /** To hand back in so'm. */
  changeUzs: number
  /** To hand back in dollars, in cents: whole dollars only, a till keeps no coins. */
  changeUsd: number
  /** Both together, in so'm. */
  changeBase: number
  /** What rounding the change left with the shop (+) or cost it (−), in so'm. */
  rounding: number
  problem: SettleProblem | null
}

export interface SettleOptions {
  uzsPerUsd: number | null
  changeCurrency: CurrencyCode
  /** Change in so'm is given in steps of this: there is no smaller note in the till. */
  roundStep: number
}

/** What has been paid against a total, what is left, and the change. */
export function settle(total: number, tenders: readonly Tender[], options: SettleOptions): Settlement {
  const { uzsPerUsd, roundStep } = options
  const none = { paid: 0, due: total, dueUsd: null, changeUzs: 0, changeUsd: 0, changeBase: 0, rounding: 0 }
  if (tenders.some((tender) => tender.currency === 'USD') && !uzsPerUsd) {
    return { ...none, problem: 'rate' }
  }
  const worth = tenders.map((tender) => worthOf(tender, uzsPerUsd))
  const paid = worth.reduce((sum, value) => sum + value, 0)
  const nonCash = tenders.reduce((sum, tender, index) => sum + (tender.method === 'cash' ? 0 : worth[index]), 0)
  const dueUsd = (due: number) => (uzsPerUsd ? Math.ceil((due * 100) / Math.round(uzsPerUsd * 100)) : null)

  if (nonCash > total) {
    return { ...none, paid, due: 0, dueUsd: dueUsd(0), problem: 'non_cash_over' }
  }
  if (paid <= total) {
    const due = total - paid
    return { ...none, paid, due, dueUsd: dueUsd(due), problem: null }
  }

  const over = paid - total
  // Change asked for in dollars is whole dollars; what is left of it is given in so'm, like any other change.
  const dollar = options.changeCurrency === 'USD' && uzsPerUsd ? toBase(100, 'USD', uzsPerUsd) : 0
  const changeUsd = dollar ? Math.floor(over / dollar) * 100 : 0
  const inDollars = changeUsd ? toBase(changeUsd, 'USD', uzsPerUsd) : 0
  const changeUzs = roundToStep(over - inDollars, roundStep)
  const changeBase = inDollars + changeUzs
  return {
    paid,
    due: 0,
    dueUsd: dueUsd(0),
    changeUzs,
    changeUsd,
    changeBase,
    rounding: over - changeBase,
    problem: null,
  }
}

const amountSchema = z.number().int().min(0).max(1_000_000_000_000_00)

const quantitySchema = z
  .number()
  .positive()
  .max(1_000_000)
  .refine((qty) => Math.abs(qty * 1000 - Math.round(qty * 1000)) < 1e-6, {
    message: "Miqdorda ko'pi bilan 3 ta kasr xona bo'ladi",
  })

export const saleLineInputSchema = z.object({
  variantId: idSchema,
  qty: quantitySchema,
  discount: amountSchema.default(0),
  /** The tag read at the till: that very piece is sold. */
  epc: z
    .string()
    .regex(/^[0-9A-F]{24}$/)
    .nullish()
    .transform((value) => value ?? null),
})
export type SaleLineInput = z.infer<typeof saleLineInputSchema>

export const salePaymentInputSchema = z
  .object({
    method: z.enum(TENDER_METHODS),
    /** The card or the terminal; cash goes to the till's own drawer. */
    accountId: idSchema.nullish().transform((value) => value ?? null),
    currency: z.enum(['UZS', 'USD']).default('UZS'),
    amount: amountSchema.refine((value) => value > 0, { message: 'Summani kiriting' }),
    /** Dollars taken for an agreed worth in so'm; left out, they are worth what the day's rate makes them. */
    value: amountSchema
      .refine((value) => value > 0, { message: 'Summani kiriting' })
      .nullish()
      .transform((value) => value ?? null),
    /** A terminal slip's number (last digits), or a note. */
    reference: optionalText(40),
  })
  .superRefine((payment, context) => {
    if (payment.value !== null && payment.currency !== 'USD') {
      context.addIssue({ code: 'custom', path: ['value'], message: 'Kelishilgan qiymat faqat dollar uchun yoziladi' })
    }
    if (payment.method !== 'cash' && !payment.accountId) {
      context.addIssue({ code: 'custom', path: ['accountId'], message: 'Karta yoki terminalni tanlang' })
    }
    if (payment.method !== 'cash' && payment.currency !== 'UZS') {
      context.addIssue({ code: 'custom', path: ['currency'], message: "Karta va terminal faqat so'mda" })
    }
  })
export type SalePaymentInput = z.infer<typeof salePaymentInputSchema>

/**
 * A manager's word for what the cashier may not do alone: a discount over the
 * limit, goods taken back late, money handed back otherwise than it was
 * paid. The manager stands at the till and types their PIN; it is checked
 * with the deed and never kept.
 */
export const approvalSchema = z.object({ userId: idSchema, pin: pinSchema })
export type ApprovalInput = z.infer<typeof approvalSchema>

const approvalField = approvalSchema.nullish().transform((value) => value ?? null)

/** The word a customer said to get a promotion that asks for one: read without regard to case. */
export const promoCodeSchema = z
  .string()
  .trim()
  .max(30)
  .nullish()
  .transform((value) => (value ? value.toUpperCase() : null))

/** A tagged piece is one piece, and is on a sale once. */
function taggedOnce(sale: { lines: SaleLineInput[] }, context: z.RefinementCtx) {
  const tags = new Set<string>()
  sale.lines.forEach((line, index) => {
    if (!line.epc) {
      return
    }
    if (line.qty !== 1) {
      context.addIssue({ code: 'custom', path: ['lines', index, 'qty'], message: 'RFID dona bittadan sotiladi' })
    }
    if (tags.has(line.epc)) {
      context.addIssue({ code: 'custom', path: ['lines', index, 'epc'], message: 'Bu dona chekda bor' })
    }
    tags.add(line.epc)
  })
}

export const saleInputSchema = z
  .object({
    /** Made by the till for each sale: sent twice, the sale is still made once. */
    clientKey: z.uuid(),
    registerId: idSchema,
    /** Who served the customer, when it was not the cashier. */
    sellerId: idSchema.nullish().transform((value) => value ?? null),
    /** Who is buying, when they are on the books. */
    customerId: idSchema.nullish().transform((value) => value ?? null),
    /** The price type the whole sale is made at, when it is not the retail one: wholesale, a family price. */
    priceTypeId: idSchema.nullish().transform((value) => value ?? null),
    promoCode: promoCodeSchema,
    lines: z.array(saleLineInputSchema).min(1, "Chekda kamida bitta tovar bo'lishi kerak").max(300),
    /** Off the whole sale, on top of what each line has. */
    discount: amountSchema.default(0),
    payments: z.array(salePaymentInputSchema).max(10).default([]),
    /** What of it the customer is to pay later, and by when. The rest is paid now. */
    debt: saleDebtSchema.nullish().transform((value) => value ?? null),
    /** `USD`: hand back whole dollars first, the rest in so'm. */
    changeCurrency: z.enum(['UZS', 'USD']).default('UZS'),
    /** What the till showed as the total: if prices have changed since, the sale is refused rather than made at another sum. */
    total: amountSchema,
    note: optionalText(300),
    approval: approvalField,
  })
  .superRefine(taggedOnce)
  .superRefine((sale, context) => {
    if (!sale.payments.length && !sale.debt) {
      context.addIssue({ code: 'custom', path: ['payments'], message: "To'lovni kiriting" })
    }
    if (sale.debt && !sale.customerId) {
      context.addIssue({ code: 'custom', path: ['customerId'], message: 'Qarzga sotish uchun mijozni tanlang' })
    }
  })
export type SaleInput = z.infer<typeof saleInputSchema>

export const SALE_STATUSES = ['completed', 'voided'] as const
export type SaleStatus = (typeof SALE_STATUSES)[number]

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  completed: 'Sotilgan',
  voided: 'Bekor qilingan',
}

export const saleVoidSchema = z.object({ reason: requiredText(200) })
export type SaleVoidInput = z.infer<typeof saleVoidSchema>

export const saleListQuerySchema = listQuerySchema.extend({
  status: z.enum(['all', ...SALE_STATUSES]).default('all'),
  locationId: idSchema.optional(),
  shiftId: idSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})
export type SaleListQuery = z.infer<typeof saleListQuerySchema>

export interface SaleListItemDto {
  id: string
  number: string
  status: SaleStatus
  soldAt: string
  locationName: string
  registerName: string
  cashierName: string | null
  sellerName: string | null
  qty: number
  discount: number
  total: number
  /** What the goods cost; null for a person who may not see cost. */
  costUzs: number | null
  /** How it was paid, in words: "Naqd, Terminal". */
  paidBy: string
  /** What has come back of it since, in so'm. */
  returnedTotal: number
  /** The price type it was sold at, when that was not the retail one: "Oila". */
  priceTypeName: string | null
  /** Who bought, when they were on the books. */
  customerId: string | null
  customerName: string | null
  /** What came off by itself (promotions and the customer's own discount), and why: "Yozgi aksiya, Sodiqlik 7%". */
  autoDiscount: number
  autoReason: string | null
  /** The promotion code the customer said. */
  promoCode: string | null
}

export interface SaleLineDto {
  id: string
  variantId: string
  productName: string
  /** "Qora, M" */
  label: string
  sku: string
  qty: number
  price: number
  /** Everything that came off the line. */
  discount: number
  /** The part of it that came off by itself: a promotion, the customer's own discount, or both. */
  autoDiscount: number
  /** The promotion that took part in it, and how much of it was the promotion's. */
  promotionName: string | null
  promoDiscount: number
  total: number
  epc: string | null
  /** How many of them have been brought back, and what those were worth. */
  returnedQty: number
  returnedTotal: number
}

export interface SalePaymentDto {
  method: PaymentMethod
  accountName: string
  currency: CurrencyCode
  amount: number
  /** What it paid of the sale, in so'm: its worth at the sale's rate, or what was agreed. */
  base: number
  /** Taken for an agreed worth: what that left the shop with (+) or cost it (−) against the rate. */
  fx: number
  reference: string | null
}

export interface SaleDto extends Omit<SaleListItemDto, 'paidBy' | 'qty'> {
  shiftId: string
  shiftNumber: string
  /** Where the shop is and how to call it, for the receipt. */
  locationAddress: string | null
  locationPhone: string | null
  subtotal: number
  /** So'm for a dollar when the sale was made; null when none was set. */
  uzsPerUsd: number | null
  /** Handed back in so'm, and in dollars (cents). */
  changeUzs: number
  changeUsd: number
  rounding: number
  /** What of it was left owing, by when it is to be paid, and what is still owed. Null for a sale paid in full. */
  debt: { amount: number; left: number; dueDate: string } | null
  note: string | null
  voidedAt: string | null
  voidedByName: string | null
  voidReason: string | null
  /** Who allowed a discount over the limit, when the cashier could not. */
  approvedByName: string | null
  lines: SaleLineDto[]
  payments: SalePaymentDto[]
  /** The returns made against it. */
  returns: { id: string; number: string; returnedAt: string; total: number }[]
}

// ───────────────────────────── Returns ─────────────────────────────

/**
 * A return takes goods back against the receipt they were sold on, and only
 * what that receipt sold. Their value is what was paid for them, discounts
 * taken off. It is handed back the way it was paid, or put towards other
 * goods taken instead (an exchange): then only the difference changes hands.
 */

/**
 * What so many of a sold line are worth coming back. The last of them take
 * all that is left, so the parts add up to what was paid, to the tiyin.
 */
export function returnShare(
  line: { qty: number; total: number; returnedQty: number; returnedTotal: number },
  qty: number,
): number {
  const sold = Math.round(line.qty * 1000)
  const left = sold - Math.round(line.returnedQty * 1000)
  const asked = Math.round(qty * 1000)
  const remaining = line.total - line.returnedTotal
  if (asked >= left) {
    return remaining
  }
  const share = Number((BigInt(line.total) * BigInt(asked) * 2n + BigInt(sold)) / (BigInt(sold) * 2n))
  return Math.min(share, remaining)
}

export interface RefundSettlement {
  /** Handed back, in so'm. */
  paid: number
  /** Still to hand back; 0 once covered. */
  due: number
  /** What rounding the cash left with the shop (+) or cost it (−), in so'm. */
  rounding: number
  problem:
    /** Dollars are handed back and no rate is set. */
    | 'rate'
    /** More is handed back than is owed. */
    | 'over'
    | null
}

/**
 * Money handed back against what a customer is owed. So'm cash may be the
 * rest of it rounded to the till's step, as change is; nothing else may
 * differ from the sum.
 */
export function settleRefund(
  due: number,
  refunds: readonly Tender[],
  options: { uzsPerUsd: number | null; roundStep: number },
): RefundSettlement {
  if (refunds.some((refund) => refund.currency === 'USD') && !options.uzsPerUsd) {
    return { paid: 0, due, rounding: 0, problem: 'rate' }
  }
  const worth = refunds.map((refund) => toBase(refund.amount, refund.currency, options.uzsPerUsd))
  const paid = worth.reduce((sum, value) => sum + value, 0)
  const cash = refunds.reduce(
    (sum, refund, index) => sum + (refund.method === 'cash' && refund.currency === 'UZS' ? worth[index] : 0),
    0,
  )
  const forCash = due - (paid - cash)
  if (forCash < 0) {
    return { paid, due: 0, rounding: 0, problem: 'over' }
  }
  if (cash === forCash || cash === roundToStep(forCash, options.roundStep)) {
    return { paid, due: 0, rounding: forCash - cash, problem: null }
  }
  if (paid > due) {
    return { paid, due: 0, rounding: 0, problem: 'over' }
  }
  return { paid, due: due - paid, rounding: 0, problem: null }
}

export const returnLineInputSchema = z.object({ saleLineId: idSchema, qty: quantitySchema })
export type ReturnLineInput = z.infer<typeof returnLineInputSchema>

/** The goods taken instead of the ones brought back: a sale, paid first with what came back. */
export const exchangeInputSchema = z
  .object({
    sellerId: idSchema.nullish().transform((value) => value ?? null),
    /** Who is taking them, when they are on the books: the one who brought the others back, as a rule. */
    customerId: idSchema.nullish().transform((value) => value ?? null),
    /** The price type the goods are taken at, when it is not the retail one. */
    priceTypeId: idSchema.nullish().transform((value) => value ?? null),
    promoCode: promoCodeSchema,
    lines: z.array(saleLineInputSchema).min(1).max(300),
    discount: amountSchema.default(0),
    /** For the difference, when the new goods are worth more. */
    payments: z.array(salePaymentInputSchema).max(10).default([]),
    changeCurrency: z.enum(['UZS', 'USD']).default('UZS'),
    total: amountSchema,
  })
  .superRefine(taggedOnce)
export type ExchangeInput = z.infer<typeof exchangeInputSchema>

export const returnInputSchema = z
  .object({
    /** Made by the till for each return: sent twice, it is still made once. */
    clientKey: z.uuid(),
    registerId: idSchema,
    saleId: idSchema,
    lines: z.array(returnLineInputSchema).min(1, 'Qaytariladigan tovarni tanlang').max(300),
    reason: optionalText(200),
    /** How the money goes back. Empty when all of it goes towards the goods taken instead. */
    refunds: z.array(salePaymentInputSchema).max(10).default([]),
    exchange: exchangeInputSchema.nullish().transform((value) => value ?? null),
    /** What the till showed as the value coming back: if the receipt has changed since, the return is refused. */
    total: amountSchema,
    /** For the return, and for the goods taken instead when their discount needs it too. */
    approval: approvalField,
  })
  .superRefine((input, context) => {
    const seen = new Set<string>()
    input.lines.forEach((line, index) => {
      if (seen.has(line.saleLineId)) {
        context.addIssue({
          code: 'custom',
          path: ['lines', index, 'saleLineId'],
          message: 'Bu qator ikki marta yozilgan',
        })
      }
      seen.add(line.saleLineId)
    })
  })
export type ReturnInput = z.infer<typeof returnInputSchema>

export const returnLookupSchema = z.object({ code: z.string().trim().min(1).max(64) })

export const returnListQuerySchema = listQuerySchema.extend({
  locationId: idSchema.optional(),
  shiftId: idSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})
export type ReturnListQuery = z.infer<typeof returnListQuerySchema>

export interface ReturnListItemDto {
  id: string
  number: string
  returnedAt: string
  saleId: string
  saleNumber: string
  locationName: string
  registerName: string
  cashierName: string | null
  qty: number
  /** What the goods brought back were worth, in so'm. */
  total: number
  /** How much of it went towards goods taken instead. */
  exchangeTotal: number
  exchangeSaleId: string | null
  exchangeSaleNumber: string | null
  /** Made after the return period was over. */
  late: boolean
  reason: string | null
  /** Who allowed it, when it was late or the money went back otherwise than it was paid. */
  approvedByName: string | null
}

export interface ReturnDto extends ReturnListItemDto {
  shiftNumber: string
  rounding: number
  uzsPerUsd: number | null
  lines: {
    id: string
    productName: string
    label: string
    sku: string
    qty: number
    total: number
    epc: string | null
  }[]
  /** The money handed back. */
  refunds: SalePaymentDto[]
}

/** A receipt as the till sees it when goods are brought back. */
export interface ReturnableDto {
  sale: SaleDto
  /** The line the scanned tag is on, when the receipt was found by a tag. */
  lineId: string | null
  /** The return period is over. */
  late: boolean
  /** How many days the shop takes goods back for; 0 for no limit. */
  returnDays: number
  /** This person may take goods back late, and hand money back otherwise than it was paid. */
  free: boolean
  /** The customer's group does not have goods exchanged: taking others instead needs someone allowed to. */
  noExchange: boolean
  /** How much may still go back each way, in so'm: what was paid that way, less what has gone back. */
  caps: {
    cash: number
    accounts: { accountId: string; method: TenderMethod; name: string; last4: string | null; left: number }[]
    /** What the receipt still leaves owing: goods brought back come off this before any money is handed back. */
    debt: number
  }
}

// ───────────────────────────── At the till ─────────────────────────────

/** One sellable thing as the till shows it. */
export interface PosItemDto {
  variantId: string
  productId: string
  name: string
  label: string
  sku: string
  /** One unit in so'm tiyin; null when the model has no retail price and so cannot be sold. */
  price: number | null
  /** What one unit is not sold under without a manager's word, in so'm tiyin; null when no floor is set. */
  minPrice: number | null
  /**
   * The promotions in force for it at this till today, for a cart sold at the retail price. One that takes
   * a code is here only when the cart was asked about with that code. Absent in a cart kept from before.
   */
  promos?: PromoOffer[]
  /** On hand in the till's shop. */
  onHand: number
  /** Pieces sold by weight or length may be fractions. */
  decimals: number
  /** The tag that was read, when the code was one. */
  epc: string | null
  /** A photograph of it: of its own colour when there is one. Absent in a cart kept from before. */
  image?: ImageThumb | null
}

/** The price type the cart is being sold at, when it is not the retail one. */
const cartPriceType = idSchema.nullish().transform((value) => value ?? null)

export const posSearchSchema = z.object({
  registerId: idSchema,
  q: z.string().trim().min(1).max(100),
  priceTypeId: cartPriceType,
  promoCode: promoCodeSchema,
})
export const posLookupSchema = z.object({
  registerId: idSchema,
  code: z.string().trim().min(1).max(64),
  priceTypeId: cartPriceType,
  promoCode: promoCodeSchema,
})
/** Whether a word is the code of a promotion running at a till today. */
export const posPromoCodeSchema = z.object({ registerId: idSchema, code: z.string().trim().min(1).max(30) })
/** The things already in a cart, asked for again: a price or a count may have changed since they were put there. */
export const posItemsSchema = z.object({
  registerId: idSchema,
  variantIds: z.array(idSchema).min(1).max(300),
  priceTypeId: cartPriceType,
  promoCode: promoCodeSchema,
})

/** What the till needs to start: its shift, the day's rate, where money can go, how the shop rounds. */
export interface PosContextDto {
  register: RegisterDto
  shift: ShiftDto | null
  rate: RateDto | null
  /** Dollars are taken at this till. */
  usd: boolean
  cards: AccountDto[]
  terminals: AccountDto[]
  sellers: { id: string; name: string }[]
  /**
   * Who at this shop may allow what the cashier may not, with a PIN to say so: for discounts, for returns,
   * for a sale at a special price.
   */
  approvers: { id: string; name: string; discount: boolean; returns: boolean; prices: boolean; debts: boolean }[]
  /** Selling on credit: how many days a debt is given for unless another day is set, and what one customer may owe (0: no limit). */
  debtDays: number
  debtLimit: number
  /** This person may lend where the shop's rules would stop a cashier. */
  mayLend: boolean
  /**
   * The price types this person may sell at beside the retail one. `needsWord`: only with a manager's PIN.
   */
  priceTypes: { id: string; name: string; needsWord: boolean }[]
  /** Some promotion running here today asks for a code: the till has a field for it. */
  promoCodes: boolean
  /** The till's own cash accounts by currency; one that has never held money does not exist yet. */
  drawers: Record<CurrencyCode, string | null>
  /** Where cash from this till can be handed over to: the shop's safes, without their balances. */
  safes: AccountDto[]
  /** Money on its way from this till or to it, waiting to be confirmed. */
  transfers: MoneyTransferDto[]
  changeRoundStep: number
  maxDiscountPercent: number
  /** Dollars may be taken for this much over the day's rate without a manager's word, in percent. */
  maxRateLossPercent: number
  /** This person may go over the discount limit. */
  mayOverDiscount: boolean
}

// ───────────────────────────── Shifts ─────────────────────────────

export const SHIFT_STATUSES = ['open', 'closed'] as const
export type ShiftStatus = (typeof SHIFT_STATUSES)[number]

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = { open: 'Ochiq', closed: 'Yopilgan' }

/** Opening a shift starts with counting what is in the drawer. */
export const shiftOpenSchema = z.object({
  registerId: idSchema,
  cashUzs: amountSchema,
  cashUsd: amountSchema.default(0),
})
export type ShiftOpenInput = z.infer<typeof shiftOpenSchema>

/** Closing is a blind count: the cashier says what is there before being told what should be. */
export const shiftCloseSchema = z.object({
  cashUzs: amountSchema,
  cashUsd: amountSchema.default(0),
  note: optionalText(300),
  /** What of the counted cash is handed over as the shift ends, and to which safe; the rest stays in the drawer. */
  handovers: z
    .array(z.object({ toAccountId: idSchema, amount: amountSchema.refine((value) => value > 0) }))
    .max(4)
    .default([]),
  /** What each terminal's own end-of-day slip says it took: checked against the payments rung up on it. */
  terminals: z
    .array(z.object({ accountId: idSchema, amount: amountSchema }))
    .max(20)
    .default([]),
})
export type ShiftCloseInput = z.infer<typeof shiftCloseSchema>

export interface ShiftTotals {
  sales: number
  voided: number
  qty: number
  discount: number
  total: number
  /** What came in by each way of paying, in its own currency and in so'm. */
  payments: { method: PaymentMethod; accountName: string; currency: CurrencyCode; amount: number; base: number }[]
  /** Change handed back, by currency. */
  changeUzs: number
  changeUsd: number
  rounding: number
  /** Cash handed over out of the drawer during the shift, and cash brought into it, by currency. */
  outUzs: number
  outUsd: number
  inUzs: number
  inUsd: number
  /** Partners' payments taken into the drawer during the shift, and paid out of it, by currency. */
  partnersInUzs: number
  partnersInUsd: number
  partnersOutUzs: number
  partnersOutUsd: number
  /** Expenses paid out of the drawer during the shift, and other money put into it, by currency. */
  expensesUzs: number
  expensesUsd: number
  incomeUzs: number
  incomeUsd: number
  /** Customers' debts paid into the drawer during the shift, by currency. */
  debtsUzs: number
  debtsUsd: number
  /** Returns made in the shift: how many, what the goods were worth, and the money handed back for them. */
  returns: number
  returned: number
  refunds: { method: PaymentMethod; accountName: string; currency: CurrencyCode; amount: number; base: number }[]
}

export interface ShiftDto {
  id: string
  number: string
  status: ShiftStatus
  registerId: string
  registerName: string
  locationId: string
  locationName: string
  openedAt: string
  openedByName: string | null
  openingUzs: number
  openingUsd: number
  closedAt: string | null
  closedByName: string | null
  countedUzs: number | null
  countedUsd: number | null
  /**
   * What the books said should be in the drawer, and the difference. Null
   * while the shift is open, and for a person who may not see them: the
   * count is blind.
   */
  expectedUzs: number | null
  expectedUsd: number | null
  diffUzs: number | null
  diffUsd: number | null
  note: string | null
  totals: ShiftTotals | null
  /**
   * The terminals' own totals as typed at closing. What the till had rung up
   * on each, and the difference, are for those who check the cashier.
   */
  terminals: { accountId: string; name: string; counted: number; expected: number | null; diff: number | null }[]
}

export const shiftListQuerySchema = listQuerySchema.extend({
  status: z.enum(['all', ...SHIFT_STATUSES]).default('all'),
  locationId: idSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})
export type ShiftListQuery = z.infer<typeof shiftListQuerySchema>

// ───────────────────────────── Moving money ─────────────────────────────

/**
 * Money moved from one account to another: a till's cash handed over to the
 * safe, change money brought to a till. It takes two people: the one who
 * sends it and the one who says it arrived. Until then it is in neither
 * account but on its way; refused, or taken back, it returns to where it
 * came from.
 */
export const MONEY_TRANSFER_STATUSES = ['sent', 'received', 'rejected', 'cancelled'] as const
export type MoneyTransferStatus = (typeof MONEY_TRANSFER_STATUSES)[number]

export const MONEY_TRANSFER_STATUS_LABELS: Record<MoneyTransferStatus, string> = {
  sent: "Yo'lda",
  received: 'Qabul qilingan',
  rejected: 'Rad etilgan',
  cancelled: 'Qaytarib olingan',
}

export const moneyTransferInputSchema = z
  .object({
    /** Made by the screen for each transfer: sent twice, it is still made once. */
    clientKey: z.uuid(),
    fromAccountId: idSchema,
    toAccountId: idSchema,
    /** In the currency both accounts hold. */
    amount: amountSchema.refine((value) => value > 0, { message: 'Summani kiriting' }),
    note: optionalText(200),
  })
  .refine((transfer) => transfer.fromAccountId !== transfer.toAccountId, {
    path: ['toAccountId'],
    message: 'Boshqa hisobni tanlang',
  })
export type MoneyTransferInput = z.infer<typeof moneyTransferInputSchema>

export const moneyTransferRejectSchema = z.object({ reason: requiredText(200) })

export const moneyTransferListQuerySchema = listQuerySchema.extend({
  status: z.enum(['all', ...MONEY_TRANSFER_STATUSES]).default('all'),
  accountId: idSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})
export type MoneyTransferListQuery = z.infer<typeof moneyTransferListQuerySchema>

export interface MoneyTransferDto {
  id: string
  number: string
  status: MoneyTransferStatus
  currency: CurrencyCode
  amount: number
  fromAccountId: string
  fromAccountName: string
  toAccountId: string
  toAccountName: string
  sentAt: string
  sentByName: string | null
  /** When it was confirmed, refused or taken back, and by whom. */
  decidedAt: string | null
  decidedByName: string | null
  note: string | null
  /** Why it was refused. */
  reason: string | null
  /** This person may say it arrived, or refuse it. */
  mayReceive: boolean
  /** This person may take it back while it is on its way. */
  mayCancel: boolean
}
