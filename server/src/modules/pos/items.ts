import {
  imageUrl,
  isDollar,
  toBase,
  UNIT_INFO,
  variantLabel,
  type AnyCurrency,
  type CurrencyCode,
  type ImageFormat,
  type PosItemDto,
  type Unit,
} from '@gulbahor/core'
import type { EntityManager } from 'typeorm'

import { applySearch } from '../../common/listing'
import { AttributeValue, Product, ProductVariant } from '../../database/entities'
import { offersFor, type RunningPromotions } from '../promotions/promotions.service'

interface Row {
  variant_id: string
  product_id: string
  name: string
  sku: string
  unit: Unit
  value_names: string[]
  price: Priced | null
  floor: Priced | null
  on_hand: number
  category_id: string | null
  brand_id: string | null
  season: string | null
  image: { org: string; id: string; format: ImageFormat; blur: string } | null
}

interface Priced {
  amount: number | string
  currency: CurrencyCode
}

/** A variant's price of one kind in a shop: the most specific one set wins. */
const priceOf = (kind: 'retail' | 'min') => `(
  SELECT jsonb_build_object('amount', pr.amount, 'currency', pr.currency)
  FROM prices pr JOIN price_types t ON t.id = pr.price_type_id
  WHERE t.kind = '${kind}' AND pr.product_id = v.product_id
    AND (pr.variant_id IS NULL OR pr.variant_id = v.id)
    AND (pr.location_id IS NULL OR pr.location_id = :locationId)
  ORDER BY (pr.variant_id IS NOT NULL) DESC, (pr.location_id IS NOT NULL) DESC
  LIMIT 1
)`

/** What it is sold for, and what it is not sold under. */
const PRICE = priceOf('retail')
const FLOOR = priceOf('min')

/** The same, at the price type a cart is being sold at: where that has no price of its own, the retail one stands. */
const SPECIAL = `(
  SELECT jsonb_build_object('amount', pr.amount, 'currency', pr.currency)
  FROM prices pr
  WHERE pr.price_type_id = :priceTypeId AND pr.product_id = v.product_id
    AND (pr.variant_id IS NULL OR pr.variant_id = v.id)
    AND (pr.location_id IS NULL OR pr.location_id = :locationId)
  ORDER BY (pr.variant_id IS NOT NULL) DESC, (pr.location_id IS NOT NULL) DESC
  LIMIT 1
)`

const ON_HAND = `(
  SELECT coalesce(sum(sb.qty), 0)::float8 FROM stock_balances sb
  WHERE sb.variant_id = v.id AND sb.location_id = :locationId
)`

/** A photograph to show it by: of its own colour if there is one, else one of no colour in particular. */
const IMAGE = `(
  SELECT jsonb_build_object('org', i.org_id, 'id', i.id, 'format', i.format, 'blur', i.blur)
  FROM product_images i
  WHERE i.product_id = v.product_id
  ORDER BY (i.value_id IN (v.value1_id, v.value2_id, v.value3_id)) DESC NULLS LAST,
    (i.value_id IS NULL) DESC, i.sort_order
  LIMIT 1
)`

/** The thing whose article or barcode is exactly what was typed. */
const EXACT = `(lower(v.sku) = lower(:exact) OR EXISTS (
  SELECT 1 FROM variant_barcodes c WHERE c.variant_id = v.id AND c.code = :exact
))`

/**
 * What can be sold in a shop, each thing with its price there and how many
 * are on hand: by id, or by what a cashier types. A price kept in dollars is
 * given in so'm at the day's rate; with no rate it has no price, and a floor
 * kept in dollars holds nothing back. `priceTypeId` prices them at another
 * price type than the retail one, for a cart sold that way. `running` are the
 * promotions in force: each thing is told which of them cover it.
 */
export async function sellables(
  em: EntityManager,
  what: { ids: string[] } | { search: string; limit: number },
  locationId: string,
  /** Prices are in the base or in dollars; a dollar price is shown in the base at the day's rate. */
  money: { base: AnyCurrency; uzsPerUsd: number | null },
  priceTypeId: string | null = null,
  running: RunningPromotions | null = null,
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
    .addSelect(priceTypeId ? `coalesce(${SPECIAL}, ${PRICE})` : PRICE, 'price')
    .addSelect(FLOOR, 'floor')
    .addSelect('p.categoryId', 'category_id')
    .addSelect('p.brandId', 'brand_id')
    .addSelect('p.season', 'season')
    .addSelect(ON_HAND, 'on_hand')
    .addSelect(IMAGE, 'image')
    .where('v.isActive AND p.isActive')
    .setParameter('locationId', locationId)
  if (priceTypeId) {
    qb.setParameter('priceTypeId', priceTypeId)
  }

  if ('ids' in what) {
    qb.andWhere('v.id IN (:...ids)', { ids: what.ids })
  } else {
    applySearch(qb, 'v.search_key', what.search)
    // A code typed in full means that thing, whatever else has the same digits somewhere in it: Enter
    // takes the first of the list. After it, what is on the shelf: that is what the customer is holding.
    qb.orderBy(EXACT, 'DESC')
      .addOrderBy(`${ON_HAND} > 0`, 'DESC')
      .addOrderBy('p.name')
      .addOrderBy('v.sku')
      .limit(what.limit)
      .setParameter('exact', what.search.trim())
  }

  const { base, uzsPerUsd } = money
  const inSom = (priced: Priced | null): number | null =>
    !priced
      ? null
      : priced.currency === base
        ? Number(priced.amount)
        : isDollar(priced.currency, base) && uzsPerUsd
          ? toBase(Number(priced.amount), priced.currency, uzsPerUsd, base)
          : null

  const rows: Row[] = await qb.getRawMany()
  return rows.map((row) => {
    const price = inSom(row.price)
    return {
      variantId: row.variant_id,
      productId: row.product_id,
      name: row.name,
      label: variantLabel(row.value_names),
      sku: row.sku,
      price,
      minPrice: inSom(row.floor),
      // Promotions are for the retail price: a cart sold at a price of its own has none.
      promos:
        running && !priceTypeId
          ? offersFor(running, {
              productId: row.product_id,
              categoryId: row.category_id,
              brandId: row.brand_id,
              season: row.season,
            })
          : [],
      onHand: row.on_hand,
      image: row.image
        ? { url: imageUrl(row.image.org, row.image.id, 's', row.image.format), blur: row.image.blur }
        : null,
      decimals: UNIT_INFO[row.unit].decimals,
      epc: null,
    }
  })
}
