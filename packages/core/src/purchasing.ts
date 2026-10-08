import { z } from 'zod'

import { dearer } from './currencies'
import { Fraction } from './fraction'
import type { ImageThumb } from './images'
import { ALL_CURRENCY_CODES, allocateExact, assertMinor, type AnyCurrency, type CurrencyCode } from './money'
import { idSchema, listQuerySchema, optionalPhoneSchema, optionalText, requiredText } from './schemas'
import type { Unit } from './catalog'

/**
 * Buying goods: who they come from, the document that takes them into
 * stock, and what each piece ends up costing once freight, customs and the
 * rest are shared out over it.
 */

// ───────────────────────────── Partners ─────────────────────────────

export const partnerInputSchema = z
  .object({
    name: requiredText(120),
    phone: optionalPhoneSchema,
    isSupplier: z.boolean().default(false),
    isBuyer: z.boolean().default(false),
    /** The currency their account is kept in: what they owe, or are owed, is always said in it. */
    currency: z.enum(ALL_CURRENCY_CODES as [AnyCurrency, ...AnyCurrency[]]).default('UZS'),
    /** The price they buy at the till at, when it is not the retail one: the till takes it with them. */
    priceTypeId: idSchema.nullish().transform((value) => value ?? null),
    note: optionalText(500),
  })
  .refine((partner) => partner.isSupplier || partner.isBuyer, {
    path: ['isSupplier'],
    message: 'Yetkazib beruvchi yoki xaridor ekanini belgilang',
  })
export type PartnerInput = z.infer<typeof partnerInputSchema>

export const partnerListQuerySchema = listQuerySchema.extend({
  status: z.enum(['active', 'archived', 'all']).default('active'),
  role: z.enum(['supplier', 'buyer']).optional(),
  /** `owes`: partners who owe the business; `owed`: those the business owes. */
  debt: z.enum(['owes', 'owed']).optional(),
})
export type PartnerListQuery = z.infer<typeof partnerListQuerySchema>

export interface PartnerDto {
  id: string
  name: string
  phone: string | null
  isSupplier: boolean
  isBuyer: boolean
  /** Any currency the business has switched on: one partner, one currency. */
  currency: AnyCurrency
  /** The price they buy at the till at; null for the retail one. */
  priceTypeId: string | null
  priceTypeName: string | null
  /** What they owe the business, in their currency; negative when the business owes them. Null for a person who may not see debts. */
  balance: number | null
  note: string | null
  isActive: boolean
  createdAt: string
}

// ───────────────────────────── Receipts ─────────────────────────────

export const RECEIPT_STATUSES = ['draft', 'posted', 'cancelled'] as const
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number]

export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  draft: 'Qoralama',
  posted: 'O‘tkazilgan',
  cancelled: 'Bekor qilingan',
}

/** What an expense is shared out by. */
export const EXPENSE_BASES = ['value', 'quantity', 'weight'] as const
export type ExpenseBasis = (typeof EXPENSE_BASES)[number]

export const EXPENSE_BASIS_LABELS: Record<ExpenseBasis, string> = {
  value: 'Qiymat bo‘yicha',
  quantity: 'Dona bo‘yicha',
  weight: 'Vazn bo‘yicha',
}

const currencySchema = z.enum(ALL_CURRENCY_CODES as [AnyCurrency, ...AnyCurrency[]])

/** Minor units; the ceiling keeps every sum inside what a double holds exactly. */
const amountSchema = z.number().int().min(0).max(1_000_000_000_000_00)

/** How many units of something one of the receipt's go-between currency buys (`pivotOf`). Kept to six decimals. */
const rateSchema = z
  .number()
  .positive({ message: 'Kurs noldan katta bo‘lishi kerak' })
  .max(1_000_000_000)
  .transform((rate) => Number(rate.toFixed(6)))

const quantitySchema = z
  .number()
  .positive({ message: 'Miqdor noldan katta bo‘lishi kerak' })
  .max(1_000_000)
  .refine((qty) => Number.isInteger(Math.round(qty * 1000)) && Math.abs(qty * 1000 - Math.round(qty * 1000)) < 1e-6, {
    message: 'Miqdorda ko‘pi bilan 3 ta kasr xona bo‘ladi',
  })

const nullableId = idSchema.nullish().transform((value) => value || null)
const nullableAmount = amountSchema.nullish().transform((value) => value ?? null)

export const receiptLineInputSchema = z.object({
  variantId: idSchema,
  /** Whose goods these are, when one shipment carries several suppliers'; null takes the document's. */
  supplierId: nullableId,
  qty: quantitySchema,
  /** Per unit, in the document's currency. */
  price: amountSchema,
  /** Per unit, in the document's extra-cost currency: a cost known for this line alone. */
  extra: amountSchema.default(0),
  /** Prices to put on the model when the document is posted, each in its price type's currency. */
  retailPrice: nullableAmount,
  wholesalePrice: nullableAmount,
  /**
   * The same for every other price type the business keeps (the floor, a family price, a second wholesale
   * one), by the price type's id. The retail type and the first wholesale one have the fields above.
   */
  otherPrices: z.record(idSchema, amountSchema).default({}),
})
export type ReceiptLineInput = z.infer<typeof receiptLineInputSchema>

export const receiptExpenseInputSchema = z.object({
  name: requiredText(80),
  amount: amountSchema,
  currency: currencySchema,
  basis: z.enum(EXPENSE_BASES),
  /** Agreed but not yet billed: replaced by the real figure when it arrives. */
  isEstimate: z.boolean().default(false),
})
export type ReceiptExpenseInput = z.infer<typeof receiptExpenseInputSchema>

const expensesSchema = z.array(receiptExpenseInputSchema).max(50)

/**
 * An amount on a receipt is in the cost currency, in the base or in the receipt's own currency: the three it has
 * rates for. Which those are only the server knows, so it is the server that asks.
 */
export const convertible = (
  currency: AnyCurrency,
  receiptCurrency: AnyCurrency,
  base: AnyCurrency,
  cost: AnyCurrency,
) => currency === cost || currency === base || currency === receiptCurrency

/**
 * The currency a receipt's rates are written against: the cost currency where the business keeps one beside
 * its base ("1 $ = 7,25 ¥", "1 $ = 12 650 so'm"). Where it keeps its costs in the base alone one rate is asked,
 * written with the dearer of the two first: "1 ¥ = 1 750 so'm", or "1 $ = 7,25 ¥" for a dollar business.
 */
export const pivotOf = (base: AnyCurrency, cost: AnyCurrency, receiptCurrency: AnyCurrency): AnyCurrency =>
  cost !== base ? cost : dearer(receiptCurrency, base) ? receiptCurrency : base

export const receiptInputSchema = z.object({
  locationId: idSchema,
  supplierId: nullableId,
  docDate: z.iso.date(),
  /** What the supplier is paid in. */
  currency: currencySchema,
  /** Units of `currency` for one of the go-between currency (`pivotOf`); 1 when they are the same. */
  usdRate: rateSchema,
  /** Units of the base for one of the go-between currency; 1 where that is the base. */
  uzsRate: rateSchema,
  /** Left out, the cost currency. */
  extraCurrency: currencySchema.optional(),
  note: optionalText(500),
  lines: z.array(receiptLineInputSchema).max(5000),
  expenses: expensesSchema.default([]),
})
export type ReceiptInput = z.infer<typeof receiptInputSchema>

/** A bill that arrives after the goods are in: the expenses of a posted receipt can still change. */
export const receiptExpensesInputSchema = z.object({ expenses: expensesSchema })
export type ReceiptExpensesInput = z.infer<typeof receiptExpensesInputSchema>

export const receiptListQuerySchema = listQuerySchema.extend({
  status: z.enum([...RECEIPT_STATUSES, 'all']).default('all'),
  locationId: idSchema.optional(),
  supplierId: idSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})
export type ReceiptListQuery = z.infer<typeof receiptListQuerySchema>

export interface ReceiptTotals {
  qty: number
  /** Goods at the supplier's prices, in the receipt's currency. */
  goods: number
  goodsUsd: number
  goodsUzs: number
  expensesUsd: number
  expensesUzs: number
  costUsd: number
  costUzs: number
}

export interface ReceiptListItemDto {
  id: string
  number: string
  status: ReceiptStatus
  docDate: string
  locationId: string
  locationName: string
  supplierName: string | null
  currency: AnyCurrency
  totals: ReceiptTotals
  hasEstimates: boolean
  createdByName: string | null
  createdAt: string
}

export interface ReceiptLineDto {
  id: string
  variantId: string
  productId: string
  supplierId: string | null
  qty: number
  price: number
  extra: number
  retailPrice: number | null
  wholesalePrice: number | null
  /** Prices for the other price types, by price type id. */
  otherPrices: Record<string, number>
  /** Landed cost of the whole line; null until the receipt is posted. */
  costUsd: number | null
  costUzs: number | null
}

export interface ReceiptExpenseDto extends ReceiptExpenseInput {
  id: string
  amountUsd: number | null
  amountUzs: number | null
}

/** A model on a receipt, with enough about its variants to draw the quantity matrix. */
export interface ReceiptProductDto {
  id: string
  name: string
  sku: string
  unit: Unit
  weightG: number | null
  axisIds: string[]
  variants: { id: string; valueIds: string[]; sku: string; isActive: boolean }[]
  /** The first of its photographs. Absent on a block made on the screen, before the server has answered. */
  image?: ImageThumb | null
}

export interface ReceiptDto {
  id: string
  number: string
  status: ReceiptStatus
  locationId: string
  locationName: string
  supplierId: string | null
  docDate: string
  currency: AnyCurrency
  usdRate: number
  uzsRate: number
  extraCurrency: AnyCurrency
  note: string | null
  sourceFile: string | null
  lines: ReceiptLineDto[]
  expenses: ReceiptExpenseDto[]
  products: ReceiptProductDto[]
  totals: ReceiptTotals
  createdByName: string | null
  createdAt: string
  postedAt: string | null
  postedByName: string | null
}

// ───────────────────────────── Costing ─────────────────────────────

export interface CostingLine {
  qty: number
  price: number
  extra: number
  /** Grams per unit; needed only when something is shared out by weight. */
  weightG: number | null
}

export interface CostingExpense {
  amount: number
  currency: AnyCurrency
  basis: ExpenseBasis
}

export interface CostingInput {
  /** What the business keeps its books in: the "so'm" of `uzsRate` and of every `…Uzs` the costing gives. */
  base: AnyCurrency
  /** What it keeps its costs in beside the base: every `…Usd` the costing gives. The base where it keeps none. */
  cost: AnyCurrency
  currency: AnyCurrency
  usdRate: number
  uzsRate: number
  extraCurrency: AnyCurrency
  lines: CostingLine[]
  expenses: CostingExpense[]
}

export interface CostedLine {
  /** qty × price, in the receipt's currency. */
  goods: number
  goodsUsd: number
  goodsUzs: number
  /** The line's own extra cost plus its share of every expense. */
  expensesUsd: number
  expensesUzs: number
  costUsd: number
  costUzs: number
}

export interface Costing {
  lines: CostedLine[]
  expenses: { amountUsd: number; amountUzs: number }[]
  totals: ReceiptTotals
  /** Positions of expenses shared by weight while some line has no weight: those fell back to quantity. */
  weightless: number[]
}

const QTY_SCALE = 1000

const rateOf = (rate: number) => Fraction.parse(rate.toFixed(6))
const rounded = (value: Fraction) => assertMinor(Number(value.toScaled(0)))
const scaledQty = (qty: number) => BigInt(Math.round(qty * QTY_SCALE))

/**
 * Works out what every line of a receipt costs, in the cost currency ("dollars" below) and in the base ("so'm").
 * Everything goes through the receipt's go-between currency (`pivotOf`): its rates are written against it.
 *
 * Each total is converted once and then split with the largest-remainder
 * method, so the lines always add up to the totals to the last tiyin and
 * cent: nothing is lost or invented by rounding line by line.
 */
export function costReceipt(input: CostingInput): Costing {
  const { base, cost } = input
  const pivot = pivotOf(base, cost, input.currency)
  const usdRate = input.currency === pivot ? Fraction.ONE : rateOf(input.usdRate)
  // Where the go-between is the base, one of it is one of the base whatever the receipt says.
  const uzsRate = base === pivot ? Fraction.ONE : rateOf(input.uzsRate)

  /** An amount in minor units of `currency`, in the go-between currency's minor units, exactly. */
  const toPivot = (minor: number, currency: AnyCurrency): Fraction => {
    const amount = Fraction.of(minor)
    if (currency === pivot) return amount
    if (currency === base) return amount.div(uzsRate)
    return amount.div(usdRate)
  }
  /** The base goes through no rate at all; everything else goes through the go-between currency. */
  const toUzs = (minor: number, currency: AnyCurrency): Fraction =>
    currency === base ? Fraction.of(minor) : toPivot(minor, currency).mul(uzsRate)
  /** In the cost currency: the go-between itself, or — where costs are kept in the base alone — the base. */
  const toUsd = (minor: number, currency: AnyCurrency): Fraction =>
    cost === base ? toUzs(minor, currency) : toPivot(minor, currency)

  const quantities = input.lines.map((line) => scaledQty(line.qty))
  const goods = input.lines.map((line, index) =>
    rounded(Fraction.of(quantities[index]).mul(Fraction.of(line.price)).div(Fraction.of(QTY_SCALE))),
  )
  const goodsWeights = goods.map((amount) => BigInt(amount))
  const totalGoods = goods.reduce((sum, amount) => sum + amount, 0)

  const goodsUsd = allocateExact(rounded(toUsd(totalGoods, input.currency)), goodsWeights)
  const goodsUzs = allocateExact(rounded(toUzs(totalGoods, input.currency)), goodsWeights)

  const expensesUsd = input.lines.map(() => 0)
  const expensesUzs = input.lines.map(() => 0)

  // A line's own extra cost is known for that line, so it is converted where it stands.
  input.lines.forEach((line, index) => {
    if (line.extra) {
      const extra = rounded(Fraction.of(quantities[index]).mul(Fraction.of(line.extra)).div(Fraction.of(QTY_SCALE)))
      expensesUsd[index] += rounded(toUsd(extra, input.extraCurrency))
      expensesUzs[index] += rounded(toUzs(extra, input.extraCurrency))
    }
  })

  const hasWeights = input.lines.every((line) => (line.weightG ?? 0) > 0)
  const weightless: number[] = []
  const expenses = input.expenses.map((expense, position) => {
    const amountUsd = rounded(toUsd(expense.amount, expense.currency))
    const amountUzs = rounded(toUzs(expense.amount, expense.currency))
    let basis = expense.basis
    if (basis === 'weight' && !hasWeights) {
      weightless.push(position)
      basis = 'quantity'
    }
    const weights =
      basis === 'value'
        ? goodsWeights
        : basis === 'weight'
          ? input.lines.map((line, index) => quantities[index] * BigInt(line.weightG as number))
          : quantities
    allocateExact(amountUsd, weights).forEach((share, index) => (expensesUsd[index] += share))
    allocateExact(amountUzs, weights).forEach((share, index) => (expensesUzs[index] += share))
    return { amountUsd, amountUzs }
  })

  const lines = input.lines.map((_line, index) => ({
    goods: goods[index],
    goodsUsd: goodsUsd[index],
    goodsUzs: goodsUzs[index],
    expensesUsd: expensesUsd[index],
    expensesUzs: expensesUzs[index],
    costUsd: goodsUsd[index] + expensesUsd[index],
    costUzs: goodsUzs[index] + expensesUzs[index],
  }))

  const sum = (pick: (line: CostedLine) => number) => lines.reduce((total, line) => total + pick(line), 0)
  return {
    lines,
    expenses,
    weightless,
    totals: {
      qty: Number(quantities.reduce((total, qty) => total + qty, 0n)) / QTY_SCALE,
      goods: totalGoods,
      goodsUsd: sum((line) => line.goodsUsd),
      goodsUzs: sum((line) => line.goodsUzs),
      expensesUsd: sum((line) => line.expensesUsd),
      expensesUzs: sum((line) => line.expensesUzs),
      costUsd: sum((line) => line.costUsd),
      costUzs: sum((line) => line.costUzs),
    },
  }
}

/** What one unit of a line costs, for showing; the line total is what is kept. */
export function unitCost(total: number, qty: number): number {
  return qty > 0
    ? rounded(
        Fraction.of(total)
          .mul(Fraction.of(QTY_SCALE))
          .div(Fraction.of(scaledQty(qty))),
      )
    : 0
}

// ───────────────────────────── Stock ─────────────────────────────

export const stockListQuerySchema = listQuerySchema.extend({
  locationId: idSchema.optional(),
  categoryId: idSchema.optional(),
  brandId: idSchema.optional(),
  /** `in`: only what is on hand; `out`: models with nothing left; `all`. */
  presence: z.enum(['in', 'out', 'all']).default('in'),
})
export type StockListQuery = z.infer<typeof stockListQuerySchema>

/** A place stock can be in, for the columns and filters of stock screens. */
export interface StockLocationDto {
  id: string
  name: string
  code: string
  /** Not a place anyone works in: goods sent from one place and not yet received at the other. */
  isTransit: boolean
}

export interface StockListItemDto {
  productId: string
  sku: string
  name: string
  brandName: string | null
  categoryName: string | null
  unit: Unit
  qty: number
  /** Quantity by place; places with nothing are left out. */
  byLocation: Record<string, number>
  /** Present only for those allowed to see cost. */
  costUzs: number | null
  costUsd: number | null
  retailPrice: { amount: number; currency: CurrencyCode } | null
  /** The first of its photographs. */
  image: ImageThumb | null
}

export interface StockVariantDto {
  variantId: string
  valueIds: string[]
  sku: string
  qty: number
  byLocation: Record<string, number>
  costUzs: number | null
  costUsd: number | null
}

export interface StockProductDto {
  productId: string
  name: string
  sku: string
  unit: Unit
  axisIds: string[]
  variants: StockVariantDto[]
}
