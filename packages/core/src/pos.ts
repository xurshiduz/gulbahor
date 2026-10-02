import { z } from 'zod'

import { allocateExact, roundToStep, type CurrencyCode } from './money'
import { idSchema, listQuerySchema, optionalText, requiredText } from './schemas'

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
export const ACCOUNT_KINDS = ['cash', 'safe', 'card', 'terminal', 'bank', 'system'] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  cash: 'Kassa (naqd)',
  safe: 'Seyf',
  card: 'Plastik karta',
  terminal: 'Bank terminali',
  bank: 'Bank hisob raqami',
  system: 'Ichki hisob',
}

export const SYSTEM_ACCOUNTS = ['sales', 'rounding', 'fx', 'cash_diff', 'opening'] as const
export type SystemAccount = (typeof SYSTEM_ACCOUNTS)[number]

export const SYSTEM_ACCOUNT_LABELS: Record<SystemAccount, string> = {
  sales: 'Savdo tushumi',
  rounding: 'Yaxlitlash farqi',
  fx: 'Kurs farqi',
  cash_diff: 'Kassa farqi (kamomad va ortiqcha)',
  opening: "Boshlang'ich qoldiq",
}

/** The accounts a person sets up; a till's own cash is made with the till. */
export const PAYMENT_ACCOUNT_KINDS = ['card', 'terminal', 'safe', 'bank'] as const
export type PaymentAccountKind = (typeof PAYMENT_ACCOUNT_KINDS)[number]

export const accountInputSchema = z.object({
  kind: z.enum(PAYMENT_ACCOUNT_KINDS),
  name: requiredText(60),
  /** The shop it belongs to; none for one shared by all. */
  locationId: idSchema.nullish().transform((value) => value ?? null),
  /** A card's last four digits: what bank messages and receipts call it by. */
  last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Oxirgi 4 ta raqam')
    .nullish()
    .transform((value) => value || null),
  bank: optionalText(60),
})
export type AccountInput = z.infer<typeof accountInputSchema>

export interface AccountDto {
  id: string
  kind: AccountKind
  name: string
  currency: CurrencyCode
  locationId: string | null
  locationName: string | null
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
  /** The shift open on it now. */
  shift: { id: string; number: string; openedAt: string; openedByName: string | null } | null
}

// ───────────────────────────── Rates ─────────────────────────────

const rateSchema = z
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

export const PAYMENT_METHODS = ['cash', 'card', 'terminal'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Naqd',
  card: 'Kartaga',
  terminal: 'Terminal',
}

export interface CartLine {
  /** One unit, in so'm tiyin. */
  price: number
  qty: number
  /** Taken off this line as a whole. */
  discount: number
}

const QTY_SCALE = 1000n

/** `price × qty`, exactly, rounded half up. */
export function gross(price: number, qty: number): number {
  return Number((BigInt(price) * BigInt(Math.round(qty * 1000)) * 2n + QTY_SCALE) / (QTY_SCALE * 2n))
}

export interface SaleTotals {
  subtotal: number
  /** Line discounts and the discount on the whole sale together. */
  discount: number
  total: number
  /** Each line after its own discount and its share of the sale's. */
  lines: { gross: number; discount: number; total: number }[]
}

/**
 * What a cart comes to. A discount on the whole sale is shared out over the
 * lines by what each is worth, to the tiyin, so the lines always add up to
 * the total and a later return of one line knows what was paid for it.
 */
export function saleTotals(cart: readonly CartLine[], saleDiscount: number): SaleTotals {
  const own = cart.map((line) => {
    const value = gross(line.price, line.qty)
    return { gross: value, discount: Math.min(line.discount, value) }
  })
  const after = own.map((line) => line.gross - line.discount)
  const left = after.reduce((sum, value) => sum + value, 0)
  const shared = allocateExact(
    Math.min(Math.max(0, saleDiscount), left),
    after.map((value) => BigInt(value)),
  )
  const lines = own.map((line, index) => ({
    gross: line.gross,
    discount: line.discount + shared[index],
    total: line.gross - line.discount - shared[index],
  }))
  const subtotal = lines.reduce((sum, line) => sum + line.gross, 0)
  const discount = lines.reduce((sum, line) => sum + line.discount, 0)
  return { subtotal, discount, total: subtotal - discount, lines }
}

export interface Tender {
  method: PaymentMethod
  currency: CurrencyCode
  /** In the tender's own currency. */
  amount: number
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
  const worth = tenders.map((tender) => toBase(tender.amount, tender.currency, uzsPerUsd))
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
    method: z.enum(PAYMENT_METHODS),
    /** The card or the terminal; cash goes to the till's own drawer. */
    accountId: idSchema.nullish().transform((value) => value ?? null),
    currency: z.enum(['UZS', 'USD']).default('UZS'),
    amount: amountSchema.refine((value) => value > 0, { message: 'Summani kiriting' }),
    /** A terminal slip's number (last digits), or a note. */
    reference: optionalText(40),
  })
  .superRefine((payment, context) => {
    if (payment.method !== 'cash' && !payment.accountId) {
      context.addIssue({ code: 'custom', path: ['accountId'], message: 'Karta yoki terminalni tanlang' })
    }
    if (payment.method !== 'cash' && payment.currency !== 'UZS') {
      context.addIssue({ code: 'custom', path: ['currency'], message: "Karta va terminal faqat so'mda" })
    }
  })
export type SalePaymentInput = z.infer<typeof salePaymentInputSchema>

export const saleInputSchema = z
  .object({
    /** Made by the till for each sale: sent twice, the sale is still made once. */
    clientKey: z.uuid(),
    registerId: idSchema,
    /** Who served the customer, when it was not the cashier. */
    sellerId: idSchema.nullish().transform((value) => value ?? null),
    lines: z.array(saleLineInputSchema).min(1, "Chekda kamida bitta tovar bo'lishi kerak").max(300),
    /** Off the whole sale, on top of what each line has. */
    discount: amountSchema.default(0),
    payments: z.array(salePaymentInputSchema).min(1, "To'lovni kiriting").max(10),
    /** `USD`: hand back whole dollars first, the rest in so'm. */
    changeCurrency: z.enum(['UZS', 'USD']).default('UZS'),
    /** What the till showed as the total: if prices have changed since, the sale is refused rather than made at another sum. */
    total: amountSchema,
    note: optionalText(300),
  })
  .superRefine((sale, context) => {
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
  discount: number
  total: number
  epc: string | null
}

export interface SalePaymentDto {
  method: PaymentMethod
  accountName: string
  currency: CurrencyCode
  amount: number
  /** Its worth in so'm at the sale's rate. */
  base: number
  reference: string | null
}

export interface SaleDto extends Omit<SaleListItemDto, 'paidBy' | 'qty'> {
  shiftId: string
  shiftNumber: string
  subtotal: number
  /** So'm for a dollar when the sale was made; null when none was set. */
  uzsPerUsd: number | null
  /** Handed back in so'm, and in dollars (cents). */
  changeUzs: number
  changeUsd: number
  rounding: number
  note: string | null
  voidedAt: string | null
  voidedByName: string | null
  voidReason: string | null
  lines: SaleLineDto[]
  payments: SalePaymentDto[]
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
  /** On hand in the till's shop. */
  onHand: number
  /** Pieces sold by weight or length may be fractions. */
  decimals: number
  /** The tag that was read, when the code was one. */
  epc: string | null
}

export const posSearchSchema = z.object({ registerId: idSchema, q: z.string().trim().min(1).max(100) })
export const posLookupSchema = z.object({ registerId: idSchema, code: z.string().trim().min(1).max(64) })
/** The things already in a cart, asked for again: a price or a count may have changed since they were put there. */
export const posItemsSchema = z.object({ registerId: idSchema, variantIds: z.array(idSchema).min(1).max(300) })

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
  changeRoundStep: number
  maxDiscountPercent: number
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
}

export const shiftListQuerySchema = listQuerySchema.extend({
  status: z.enum(['all', ...SHIFT_STATUSES]).default('all'),
  locationId: idSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})
export type ShiftListQuery = z.infer<typeof shiftListQuerySchema>
