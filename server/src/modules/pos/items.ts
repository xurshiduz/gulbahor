import { toBase, UNIT_INFO, variantLabel, type CurrencyCode, type PosItemDto, type Unit } from '@gulbahor/core'
import type { EntityManager } from 'typeorm'

import { applySearch } from '../../common/listing'
import { AttributeValue, Product, ProductVariant } from '../../database/entities'

interface Row {
  variant_id: string
  product_id: string
  name: string
  sku: string
  unit: Unit
  value_names: string[]
  price: { amount: number | string; currency: CurrencyCode } | null
  on_hand: number
}

/** The retail price of a variant in a shop: the most specific one set wins. */
const PRICE = `(
  SELECT jsonb_build_object('amount', pr.amount, 'currency', pr.currency)
  FROM prices pr JOIN price_types t ON t.id = pr.price_type_id
  WHERE t.kind = 'retail' AND pr.product_id = v.product_id
    AND (pr.variant_id IS NULL OR pr.variant_id = v.id)
    AND (pr.location_id IS NULL OR pr.location_id = :locationId)
  ORDER BY (pr.variant_id IS NOT NULL) DESC, (pr.location_id IS NOT NULL) DESC
  LIMIT 1
)`

const ON_HAND = `(
  SELECT coalesce(sum(sb.qty), 0)::float8 FROM stock_balances sb
  WHERE sb.variant_id = v.id AND sb.location_id = :locationId
)`

/**
 * What can be sold in a shop, each thing with its price there and how many
 * are on hand: by id, or by what a cashier types. A price kept in dollars is
 * given in so'm at the day's rate; with no rate it has no price.
 */
export async function sellables(
  em: EntityManager,
  what: { ids: string[] } | { search: string; limit: number },
  locationId: string,
  uzsPerUsd: number | null,
): Promise<PosItemDto[]> {
  if ('ids' in what && !what.ids.length) {
    return []
  }
  const qb = em
    .createQueryBuilder(ProductVariant, 'v')
    .innerJoin(Product, 'p', 'p.id = v.productId')
    .leftJoin(AttributeValue, 'a1', 'a1.id = v.value1Id')
    .leftJoin(AttributeValue, 'a2', 'a2.id = v.value2Id')
    .leftJoin(AttributeValue, 'a3', 'a3.id = v.value3Id')
    .select('v.id', 'variant_id')
    .addSelect('p.id', 'product_id')
    .addSelect('p.name', 'name')
    .addSelect('v.sku', 'sku')
    .addSelect('p.unit', 'unit')
    .addSelect('array_remove(ARRAY[a1.name, a2.name, a3.name], NULL)', 'value_names')
    .addSelect(PRICE, 'price')
    .addSelect(ON_HAND, 'on_hand')
    .where('v.isActive AND p.isActive')
    .setParameter('locationId', locationId)

  if ('ids' in what) {
    qb.andWhere('v.id IN (:...ids)', { ids: what.ids })
  } else {
    applySearch(qb, 'v.search_key', what.search)
    // What is on the shelf comes first: that is what the customer is holding.
    qb.orderBy(`${ON_HAND} > 0`, 'DESC').addOrderBy('p.name').addOrderBy('v.sku').limit(what.limit)
  }

  const rows: Row[] = await qb.getRawMany()
  return rows.map((row) => {
    const amount = row.price ? Number(row.price.amount) : null
    const price =
      amount === null || !row.price
        ? null
        : row.price.currency === 'UZS'
          ? amount
          : uzsPerUsd
            ? toBase(amount, 'USD', uzsPerUsd)
            : null
    return {
      variantId: row.variant_id,
      productId: row.product_id,
      name: row.name,
      label: variantLabel(row.value_names),
      sku: row.sku,
      price,
      onHand: row.on_hand,
      decimals: UNIT_INFO[row.unit].decimals,
      epc: null,
    }
  })
}
