import { z } from 'zod'

import { parseAmount } from './amount'
import { SEASONS, type Season } from './catalog'
import { formatMoney, percentOf, roundPrice, type AnyCurrency, type PriceRounding } from './money'
import { idSchema, listQuerySchema, optionalText } from './schemas'

/**
 * Setting prices by rule and in bulk. A markup rule says how far above cost
 * (or how far from the retail price) goods of some kind are sold; a price
 * type says how its prices are rounded. Changing many prices at once is a
 * revision: it is previewed, applied in one go, kept, and can be put back.
 */

// ───────────────────────────── Markup ─────────────────────────────

/**
 * What a price is worked out from: what the goods cost, or the retail price ("retail less 15%") — with a
 * percentage and a sum on top — or nothing at all: a price named outright.
 */
export const PRICE_BASES = ['cost', 'retail', 'fixed'] as const
export type PriceBase = (typeof PRICE_BASES)[number]

export const PRICE_BASE_LABELS: Record<PriceBase, string> = {
  cost: 'Tannarxdan',
  retail: 'Chakana narxdan',
  fixed: 'Belgilangan narx',
}

/** The names the rules went by before a price could be named outright. */
export const MARKUP_BASES = PRICE_BASES
export type MarkupBase = PriceBase
export const MARKUP_BASE_LABELS = PRICE_BASE_LABELS

/**
 * How a price is worked out: "cost + 30% + 5 000", "retail − 15%", or 180 000 as it stands. `amount` is in the
 * price type's currency, in minor units: added to (or, below zero, taken off) what the percentage gives, or —
 * for `fixed` — the price itself.
 */
export interface PriceFormula {
  base: PriceBase
  /** May be negative: "retail less 15%" is -15. Nothing for a price named outright. */
  percent: number
  amount: number
}

export interface Markup extends PriceFormula {
  priceTypeId: string
}

/**
 * A formula with where it comes from: the goods its rule is for, in words ("Ko‘ylaklar, Zara") — or null for the
 * price type's own way, the rule for everything else.
 */
export interface RuledMarkup extends Markup {
  rule: string | null
}

/** `amount` with `percent` added. */
export function withPercent(amount: number, percent: number): number {
  return amount + percentOf(amount, percent)
}

/** How far a price stands above a cost, in percent to one decimal. Null when there is no cost to compare with. */
export function marginPercent(price: number, cost: number | null | undefined): number | null {
  if (!cost || cost <= 0) {
    return null
  }
  return Math.round(((price - cost) * 1000) / cost) / 10
}

const percentSchema = z
  .number()
  .min(-99)
  .max(10_000)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: 'Foizda ko‘pi bilan 2 ta kasr xona bo‘ladi',
  })

const nullableId = idSchema.nullish().transform((value) => value ?? null)

const formulaShape = {
  base: z.enum(PRICE_BASES),
  percent: percentSchema.default(0),
  amount: z.number().int().min(-1_000_000_000_000_00).max(1_000_000_000_000_00).default(0),
}
const FIXED = { path: ['amount'], message: 'Belgilangan narxni kiriting' }
/** A price named outright is a sum above nothing, with no percentage. */
const fixedIsWhole = (formula: { base: PriceBase; percent: number; amount: number }) =>
  formula.base !== 'fixed' || (formula.amount > 0 && formula.percent === 0)

export const priceFormulaSchema = z.object(formulaShape).refine(fixedIsWhole, FIXED)

/**
 * What a formula makes of what the goods cost and what they retail at, in the price type's currency. Worked out
 * from cost or from retail, it is rounded **up** to the type's step and ending — a markup is never lost to
 * rounding; a price named outright stands as it was named. Null with nothing to work from, or where what comes
 * out is not a price.
 */
export function priceBy(
  formula: PriceFormula,
  basis: { cost: number | null; retail: number | null },
  rounding: PriceRounding,
): number | null {
  if (formula.base === 'fixed') {
    return formula.amount > 0 ? formula.amount : null
  }
  const from = formula.base === 'cost' ? basis.cost : basis.retail
  if (from === null || from <= 0) {
    return null
  }
  const worked = withPercent(from, formula.percent) + formula.amount
  return worked > 0 ? roundPrice(worked, rounding, 'up') : null
}

const signed = (value: number, text: string) => `${value < 0 ? '−' : '+'} ${text}`
const percentWords = (percent: number) => `${String(Math.abs(percent)).replace('.', ',')}%`

/**
 * A formula in words: "tannarx + 30% + 5 000 so‘m", "chakana − 15%", "180 000 so‘m". `short` is how it is typed
 * into a price field: "30% + 5 000", "ch −15%".
 */
export function formulaText(formula: PriceFormula, currency: AnyCurrency, short = false): string {
  const sum = (minor: number) =>
    short
      ? formatMoney(minor, currency, { symbol: false, group: ' ' })
      : formatMoney(minor, currency, { minor: 'auto' })
  if (formula.base === 'fixed') {
    return sum(formula.amount)
  }
  const { percent, amount } = formula
  if (short) {
    const parts = [
      formula.base === 'retail'
        ? `ch ${percent < 0 ? '−' : '+'}${percentWords(percent)}`
        : percent || !amount
          ? percentWords(percent)
          : '',
      amount
        ? `${amount < 0 ? '−' : '+'}${formula.base === 'cost' && !percent ? '' : ' '}${sum(Math.abs(amount))}`
        : '',
    ]
    return parts.filter(Boolean).join(' ')
  }
  return [
    formula.base === 'cost' ? 'tannarx' : 'chakana',
    percent ? signed(percent, percentWords(percent)) : '',
    amount ? signed(amount, sum(Math.abs(amount))) : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** A price as it is written into a receipt's field: the sum itself, or how it is to be worked out. */
export type LinePrice = { amount: number } | { formula: PriceFormula }

export type PriceEntryResult =
  | { ok: true; entry: LinePrice | null }
  /** `below_cost`: a percentage under cost — a markdown is meant from the retail price ("ch −15%"). */
  | { ok: false; error: 'below_cost' | 'invalid' }

/**
 * Reads what is typed into a price field:
 *
 *   30%            cost + 30%
 *   +50 000, +50k  cost + 50 000
 *   30% + 5 000    cost + 30% + 5 000
 *   ch −15%, ch +5% (also "ч")   15% under, 5% over the retail price
 *   250 000, 250k, 200000+10%   the price itself
 *
 * Nothing typed is nothing set. "−5%" is refused: under cost is not what is meant.
 */
export function parsePriceEntry(text: string): PriceEntryResult {
  const typed = text.trim().toLowerCase().replace(/[−–—]/g, '-')
  if (!typed) {
    return { ok: true, entry: null }
  }
  const number = (digits: string) => Number(digits.replace(/\s/g, '').replace(',', '.'))
  const sumOf = (sign: string | undefined, sum: string | undefined): number | null => {
    if (!sum) {
      return 0
    }
    const parsed = parseAmount(sum)
    return parsed.ok ? (sign === '-' ? -parsed.minor : parsed.minor) : null
  }
  const formula = (base: 'cost' | 'retail', percent: number, amount: number | null): PriceEntryResult =>
    amount === null || !Number.isFinite(percent) || percent < -99 || percent > 10_000
      ? { ok: false, error: 'invalid' }
      : { ok: true, entry: { formula: { base, percent: Math.round(percent * 100) / 100, amount } } }

  // From the retail price: "ch -15%", "ch+5%", "ч -15% + 5000".
  const retail = /^(?:ch|ч)\s*(?:([+-])\s*([\d\s.,]+?)\s*%)?\s*(?:([+-])\s*(.+))?$/.exec(typed)
  if (retail) {
    const percent = retail[2] === undefined ? 0 : number(retail[2]) * (retail[1] === '-' ? -1 : 1)
    return formula('retail', percent, sumOf(retail[3], retail[4]))
  }
  // From cost: a percentage, with or without a sum after it.
  const cost = /^([+-])?\s*([\d\s.,]+?)\s*%\s*(?:([+-])\s*(.+))?$/.exec(typed)
  if (cost) {
    if (cost[1] === '-') {
      return { ok: false, error: 'below_cost' }
    }
    return formula('cost', number(cost[2]), sumOf(cost[3], cost[4]))
  }
  // From cost: a sum on top of it.
  if (typed.startsWith('+')) {
    const amount = sumOf('+', typed.slice(1))
    return amount ? formula('cost', 0, amount) : { ok: false, error: 'invalid' }
  }
  const parsed = parseAmount(typed)
  return parsed.ok ? { ok: true, entry: { amount: parsed.minor } } : { ok: false, error: 'invalid' }
}

// ───────────────────────────── A receipt's prices ─────────────────────────────

/**
 * What one receipt says of one price type for all its goods ("shu kirim uchun"): this shipment is priced another
 * way than the rules have it, or not priced at all.
 */
export const receiptPricingSchema = z.object({
  /** Nothing is worked out for this type on this receipt: only a price typed on a line is set. */
  skip: z.boolean().default(false),
  /** The receipt's own formula, in place of the rules; null leaves it to them. */
  formula: priceFormulaSchema.nullish().transform((value) => value ?? null),
  /** Goods that already have a price of this type are given the new one too. */
  all: z.boolean().default(false),
})
export type ReceiptPricing = z.infer<typeof receiptPricingSchema>

/** Which of them says something: one that says nothing is not kept. */
export const pricingSays = (pricing: ReceiptPricing | null | undefined): pricing is ReceiptPricing =>
  !!pricing && (pricing.skip || !!pricing.formula || pricing.all)

/**
 * Where a price a receipt sets comes from, the nearest first: typed into the line's own field; the receipt's own
 * formula; a rule for goods of its kind; the price type's own way.
 */
export const PRICE_SOURCES = ['typed', 'receipt', 'rule', 'own'] as const
export type PriceSource = (typeof PRICE_SOURCES)[number]

export interface ReceiptPrice {
  /** What posting sets; null where it sets nothing — the price that stands stays, or there is none to set. */
  price: number | null
  /** What it is worked out by; null for a sum typed as it stands, and where nothing says how. */
  formula: PriceFormula | null
  source: PriceSource | null
  /** The goods of the rule that gave the formula, in words. */
  rule: string | null
  /** Where a price that stands is left alone: what the formula would have given, when that is another. */
  offered: number | null
}

/**
 * What a receipt does with one price type of one model. What is typed into the field wins — a sum stands as
 * typed, a formula is worked out of what these goods cost; then the receipt's own formula; then the narrowest
 * rule, the price type's own way last. A formula sets a price where the model has none of this type — and, on a
 * receipt that says `all`, where it has one too. The floor is not worked out by rule here: where none is set by
 * hand the till works it out of what the goods cost on the day.
 */
export function receiptPrice(input: {
  typed: LinePrice | null
  receipt: ReceiptPricing | null | undefined
  rule: RuledMarkup | null | undefined
  /** The model's price of this type as it stands; null with none. */
  standing: number | null
  /** One unit's cost on this receipt, in the base. */
  cost: number | null
  /** The retail price as this receipt leaves it: what "retail − 15%" starts from. */
  retail: number | null
  rounding: PriceRounding
  floor: boolean
}): ReceiptPrice {
  const { typed, receipt, rule, standing } = input
  const basis = { cost: input.cost, retail: input.retail }
  if (typed && 'amount' in typed) {
    return { price: typed.amount, formula: null, source: 'typed', rule: null, offered: null }
  }
  if (typed) {
    const price = priceBy(typed.formula, basis, input.rounding)
    return { price, formula: typed.formula, source: 'typed', rule: null, offered: null }
  }
  const nothing: ReceiptPrice = { price: null, formula: null, source: null, rule: null, offered: null }
  if (receipt?.skip) {
    return nothing
  }
  const by: Pick<ReceiptPrice, 'formula' | 'source' | 'rule'> | null = receipt?.formula
    ? { formula: receipt.formula, source: 'receipt', rule: null }
    : rule && !input.floor
      ? {
          formula: { base: rule.base, percent: rule.percent, amount: rule.amount },
          source: rule.rule === null ? 'own' : 'rule',
          rule: rule.rule,
        }
      : null
  if (!by?.formula) {
    return nothing
  }
  const worked = priceBy(by.formula, basis, input.rounding)
  if (standing !== null && !receipt?.all) {
    return { ...by, price: null, offered: worked !== null && worked !== standing ? worked : null }
  }
  return { ...by, price: worked, offered: null }
}

/**
 * A rule covers the goods of a category (and everything under it), a brand,
 * a season, or any mix of them; with none of the three it is the rule for
 * everything else.
 */
export const priceRuleInputSchema = z.object({
  categoryId: nullableId,
  brandId: nullableId,
  season: z
    .enum(SEASONS)
    .nullish()
    .transform((value) => value ?? null),
  markups: z
    .array(z.object({ priceTypeId: idSchema, ...formulaShape }).refine(fixedIsWhole, FIXED))
    .min(1, 'Kamida bitta narx turi uchun qoida kiriting')
    .max(20)
    .refine((markups) => new Set(markups.map((markup) => markup.priceTypeId)).size === markups.length, {
      message: 'Narx turi takrorlangan',
    }),
})
export type PriceRuleInput = z.infer<typeof priceRuleInputSchema>

export interface PriceRuleDto {
  id: string
  categoryId: string | null
  categoryName: string | null
  brandId: string | null
  brandName: string | null
  season: Season | null
  markups: Markup[]
}

/** What a rule is matched against. */
export interface MarkupSubject {
  /** The product's category first, then each parent up to the top. */
  categoryIds: string[]
  brandId: string | null
  season: Season | null
}

type RuleScope = Pick<PriceRuleDto, 'categoryId' | 'brandId' | 'season' | 'markups'>

/**
 * The markup that applies to a product for one price type: of the rules that
 * fit it, the one that names the most about it; between equals, the nearer
 * category, then the brand, then the season. A rule that says nothing about
 * this price type is passed over, so a narrower rule can leave a price type
 * to a broader one.
 */
export function pickMarkup<M extends Markup = Markup>(
  rules: readonly (Omit<RuleScope, 'markups'> & { markups: M[] })[],
  subject: MarkupSubject,
  priceTypeId: string,
): M | null {
  let best: { markup: M; rank: number[] } | null = null
  for (const rule of rules) {
    const markup = rule.markups.find((item) => item.priceTypeId === priceTypeId)
    if (!markup) {
      continue
    }
    const depth = rule.categoryId ? subject.categoryIds.indexOf(rule.categoryId) : -1
    if (
      (rule.categoryId && depth === -1) ||
      (rule.brandId && rule.brandId !== subject.brandId) ||
      (rule.season && rule.season !== subject.season)
    ) {
      continue
    }
    const named = (rule.categoryId ? 1 : 0) + (rule.brandId ? 1 : 0) + (rule.season ? 1 : 0)
    const rank = [named, rule.categoryId ? 1000 - depth : 0, rule.brandId ? 1 : 0, rule.season ? 1 : 0]
    if (!best || outranks(rank, best.rank)) {
      best = { markup, rank }
    }
  }
  return best?.markup ?? null
}

/** Compares position by position; the first difference decides. */
function outranks(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] > b[i]
    }
  }
  return false
}

// ───────────────────────────── Changing prices in bulk ─────────────────────────────

export const REPRICE_KINDS = ['percent', 'amount', 'formula', 'from_type'] as const
export type RepriceKind = (typeof REPRICE_KINDS)[number]

export const REPRICE_KIND_LABELS: Record<RepriceKind, string> = {
  percent: 'Foizga o‘zgartirish',
  amount: 'Summaga o‘zgartirish',
  formula: 'Qoida yoki formula bo‘yicha hisoblash',
  from_type: 'Boshqa narx turidan hisoblash',
}

const operationSchema = z.discriminatedUnion('kind', [
  /** Every price up or down by a percentage. */
  z.object({ kind: z.literal('percent'), percent: percentSchema }),
  /** Every price up or down by a sum, in the price type's currency. */
  z.object({ kind: z.literal('amount'), amount: z.number().int().min(-1_000_000_000_00).max(1_000_000_000_00) }),
  /**
   * By a formula — from cost, from the retail price, or a price named outright. Without one each model takes
   * what its rule gives it (the narrowest rule that fits; the price type's own way last). `today`: goods bought
   * for foreign money are costed at today's rates of the currencies they came in, not at the rate of the day
   * they came in (`PriceListItemDto.unitCostToday`).
   */
  z.object({
    kind: z.literal('formula'),
    formula: priceFormulaSchema.nullish().transform((value) => value ?? null),
    today: z.boolean().default(false),
  }),
  /** From another price type's prices: wholesale as retail less 15%. */
  z.object({ kind: z.literal('from_type'), priceTypeId: idSchema, percent: percentSchema }),
])
export type RepriceOperation = z.infer<typeof operationSchema>

export const priceListFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: idSchema.optional(),
  brandId: idSchema.optional(),
  season: z.enum(SEASONS).optional(),
  /** Only models with goods on hand. */
  presence: z.enum(['all', 'in']).default('all'),
  /** Only models with no price of this type set: what a new price type, or goods brought over, still lack. */
  missing: idSchema.optional(),
})
export type PriceListFilter = z.infer<typeof priceListFilterSchema>

export const priceListQuerySchema = listQuerySchema.extend(priceListFilterSchema.shape)
export type PriceListQuery = z.infer<typeof priceListQuerySchema>

export const repriceSchema = z.object({
  priceTypeId: idSchema,
  /** Which models: the same filters the price list is looked at through. */
  filter: priceListFilterSchema,
  operation: operationSchema,
  /** Apply the price type's rounding to each new price. */
  round: z.boolean().default(true),
  note: optionalText(200),
  /** Work everything out and change nothing: the preview. */
  dryRun: z.boolean().default(true),
})
export type RepriceInput = z.infer<typeof repriceSchema>

export const REPRICE_SKIPS = ['no_price', 'no_cost', 'no_rule', 'no_source'] as const
export type RepriceSkip = (typeof REPRICE_SKIPS)[number]

export const REPRICE_SKIP_LABELS: Record<RepriceSkip, string> = {
  no_price: 'Narx qo‘yilmagan',
  no_cost: 'Tannarx noma’lum',
  no_rule: 'Narx qoidasi yo‘q',
  no_source: 'Asos narx qo‘yilmagan',
}

export interface RepriceLineDto {
  productId: string
  sku: string
  name: string
  /** The model's price before; null when it had none. */
  old: number | null
  /** The price after; null when the model was passed over. */
  next: number | null
  /** What one unit costs, in the price type's currency; null when unknown or not shown to this person. */
  unitCost: number | null
  skip: RepriceSkip | null
}

/** How many lines a preview carries; the counts cover everything. */
export const REPRICE_PREVIEW_LINES = 300

export interface RepriceResult {
  /** Set once the change has been made. */
  revision: { id: string; number: string } | null
  total: number
  changed: number
  unchanged: number
  skipped: number
  /** New prices that are under cost. */
  belowCost: number
  lines: RepriceLineDto[]
}

export interface PriceListItemDto {
  productId: string
  sku: string
  name: string
  categoryName: string | null
  brandName: string | null
  season: Season | null
  qty: number
  /** One unit's cost in the base; null when unknown or not shown to this person. */
  unitCostUzs: number | null
  /**
   * The same with the goods bought for foreign money at today's rates of the currencies they came in (their expenses
   * as they were): what it would cost to bring them in again. Null where it is no different, or not shown.
   */
  unitCostToday: number | null
  /** The model's own price by price type. */
  prices: Record<string, number>
  /** Prices set apart for a size or a shop: they move with the model's price. */
  overrides: number
}

export interface PriceRevisionDto {
  id: string
  number: string
  priceTypeName: string
  /** What was done, in words: "+10%", "Tannarxdan, qoida bo'yicha". */
  summary: string
  note: string | null
  changed: number
  createdByName: string | null
  createdAt: string
  /** The revision this one undid, and the one that undid this one. */
  revertsNumber: string | null
  revertedByNumber: string | null
}

export const priceRevisionListQuerySchema = listQuerySchema
export type PriceRevisionListQuery = z.infer<typeof priceRevisionListQuerySchema>

/** For a set of products: the markup each price type's rule gives them. Used to suggest prices while receiving. */
export const markupLookupSchema = z.object({ productIds: z.array(idSchema).min(1).max(500) })
export type MarkupLookupInput = z.infer<typeof markupLookupSchema>
export type MarkupLookupResult = Record<string, RuledMarkup[]>

/**
 * The same, with what each model sells for now by price type (its own price, not a size's or a shop's): a receipt
 * says from the two which prices posting will set, and where a rule would give another than the one that stands.
 */
export type PriceLookupResult = Record<string, { formulas: RuledMarkup[]; prices: Record<string, number> }>
