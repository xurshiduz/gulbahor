import type { PriceRuleDto } from '@erp/core'
import type { EntityManager } from 'typeorm'

import { Category, PriceRule, PriceRuleMarkup } from '../../database/entities'

/**
 * The price rules as they are matched against a product (`pickMarkup`), read
 * once for whoever needs them inside a transaction: the price list, a receipt
 * being posted, the till pricing a cart at a price type.
 */
export type RuleScope = Pick<PriceRuleDto, 'categoryId' | 'brandId' | 'season' | 'markups'>

export async function ruleScopes(em: EntityManager): Promise<RuleScope[]> {
  const rules = await em.find(PriceRule)
  const markups = await em.find(PriceRuleMarkup)
  return rules.map((rule) => ({
    categoryId: rule.categoryId,
    brandId: rule.brandId,
    season: rule.season,
    markups: markups
      .filter((markup) => markup.ruleId === rule.id)
      .map(({ priceTypeId, base, percent, amount }) => ({ priceTypeId, base, percent, amount })),
  }))
}

export async function categoryParents(em: EntityManager): Promise<Map<string, string | null>> {
  const categories = await em.find(Category, { select: { id: true, parentId: true } })
  return new Map(categories.map((category) => [category.id, category.parentId]))
}

/** A category and each of its parents up to the top. */
export function chain(parents: Map<string, string | null>, categoryId: string | null): string[] {
  const ids: string[] = []
  for (let id = categoryId; id && !ids.includes(id); id = parents.get(id) ?? null) {
    ids.push(id)
  }
  return ids
}

/**
 * What one unit of each model costs in the base: the average of what is on
 * hand anywhere, or, with nothing on hand, what the last batch cost. Null for
 * goods never bought.
 */
export async function unitCostsInBase(em: EntityManager, productIds: string[]): Promise<Map<string, number | null>> {
  if (!productIds.length) {
    return new Map()
  }
  const rows: { product_id: string; unit: number | null }[] = await em.query(
    `WITH held AS (
       SELECT v.product_id, sum(sb.qty) AS qty, sum(sb.cost_uzs) AS uzs
       FROM stock_balances sb JOIN product_variants v ON v.id = sb.variant_id
       WHERE sb.qty > 0 AND v.product_id = ANY($1)
       GROUP BY v.product_id
     ), last AS (
       SELECT DISTINCT ON (v.product_id) v.product_id, b.qty, b.cost_uzs AS uzs
       FROM stock_batches b
       JOIN product_variants v ON v.id = b.variant_id
       LEFT JOIN receipt_lines rl ON rl.id = b.receipt_line_id
       LEFT JOIN receipts r ON r.id = rl.receipt_id
       WHERE b.qty > 0 AND v.product_id = ANY($1) AND r.status IS DISTINCT FROM 'cancelled'
       ORDER BY v.product_id, b.received_on DESC, b.created_at DESC
     )
     SELECT p AS product_id, (coalesce(h.uzs, l.uzs) / coalesce(h.qty, l.qty))::float8 AS unit
     FROM unnest($1::uuid[]) AS p
     LEFT JOIN held h ON h.product_id = p
     LEFT JOIN last l ON l.product_id = p`,
    [productIds],
  )
  return new Map(rows.map((row) => [row.product_id, row.unit === null ? null : Math.round(row.unit)]))
}
