import { z } from 'zod'

import { SEASONS, type Season } from './catalog'
import { percentOf } from './money'
import { idSchema, listQuerySchema, optionalText } from './schemas'

/**
 * Setting prices by rule and in bulk. A markup rule says how far above cost
 * (or how far from the retail price) goods of some kind are sold; a price
 * type says how its prices are rounded. Changing many prices at once is a
 * revision: it is previewed, applied in one go, kept, and can be put back.
 */

// ───────────────────────────── Markup ─────────────────────────────

/** What a markup is counted from: what the goods cost, or the retail price ("retail less 15%"). */
export const MARKUP_BASES = ['cost', 'retail'] as const
export type MarkupBase = (typeof MARKUP_BASES)[number]

export const MARKUP_BASE_LABELS: Record<MarkupBase, string> = {
  cost: 'Tannarxdan',
  retail: 'Chakana narxdan',
}

export interface Markup {
  priceTypeId: string
  base: MarkupBase
  /** May be negative: "retail less 15%" is -15. */
  percent: number
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
    message: "Foizda ko'pi bilan 2 ta kasr xona bo'ladi",
  })

const nullableId = idSchema.nullish().transform((value) => value ?? null)

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
    .array(z.object({ priceTypeId: idSchema, base: z.enum(MARKUP_BASES), percent: percentSchema }))
    .min(1, 'Kamida bitta narx turi uchun ustama kiriting')
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
export function pickMarkup(rules: readonly RuleScope[], subject: MarkupSubject, priceTypeId: string): Markup | null {
  let best: { markup: Markup; rank: number[] } | null = null
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

export const REPRICE_KINDS = ['percent', 'amount', 'markup', 'from_type'] as const
export type RepriceKind = (typeof REPRICE_KINDS)[number]

export const REPRICE_KIND_LABELS: Record<RepriceKind, string> = {
  percent: "Foizga o'zgartirish",
  amount: "Summaga o'zgartirish",
  markup: 'Tannarx va ustamadan hisoblash',
  from_type: 'Boshqa narx turidan hisoblash',
}

const operationSchema = z.discriminatedUnion('kind', [
  /** Every price up or down by a percentage. */
  z.object({ kind: z.literal('percent'), percent: percentSchema }),
  /** Every price up or down by a sum, in the price type's currency. */
  z.object({ kind: z.literal('amount'), amount: z.number().int().min(-1_000_000_000_00).max(1_000_000_000_00) }),
  /**
   * From what the goods cost. Without a percentage each model takes the
   * markup its rule gives it. With a rate, goods bought for foreign money
   * are costed at that rate rather than at the rate of the day they came in.
   */
  z.object({
    kind: z.literal('markup'),
    percent: percentSchema.nullish().transform((value) => value ?? null),
    uzsRate: z
      .number()
      .positive()
      .max(1_000_000)
      .nullish()
      .transform((value) => value ?? null),
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
})
export type PriceListFilter = z.infer<typeof priceListFilterSchema>

export const priceListQuerySchema = listQuerySchema.extend(priceListFilterSchema.shape).extend({
  /** So'm per dollar: with it, cost is shown as what the goods would cost to buy today. */
  uzsRate: z.coerce.number().positive().max(1_000_000).optional(),
})
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
  no_price: "Narx qo'yilmagan",
  no_cost: "Tannarx noma'lum",
  no_rule: "Ustama qoidasi yo'q",
  no_source: "Asos narx qo'yilmagan",
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
  /** One unit's cost; null when unknown or not shown to this person. */
  unitCostUzs: number | null
  unitCostUsd: number | null
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
export type MarkupLookupResult = Record<string, Markup[]>
