import {
  imageUrl,
  pickMarkup,
  priceBy,
  UNIT_INFO,
  variantLabel,
  type ImageFormat,
  type PosItemDto,
  type Season,
  type Unit,
} from '@erp/core'
import type { EntityManager } from 'typeorm'

import { applySearch } from '../../common/listing'
import { AttributeValue, PriceType, Product, ProductVariant } from '../../database/entities'
import { categoryParents, chain, ruleScopes, unitCostsInBase } from '../pricing/rules'
import { offersFor, type RunningPromotions } from '../promotions/promotions.service'

interface Row {
  variant_id: string
  product_id: string
  name: string
  sku: string
  unit: Unit
  value_names: string[]
  price: string | null
  /** In a cart sold at a price type: that type's own price for it, where one is set. */
  special?: string | null
  floor: string | null
  on_hand: number
  category_id: string | null
  brand_id: string | null
  season: Season | null
  image: { org: string; id: string; format: ImageFormat; blur: string } | null
}

/** A variant's price of one type in a shop: the most specific one set wins. */
const priceWhere = (type: string) => `(
  SELECT pr.amount
  FROM prices pr JOIN price_types t ON t.id = pr.price_type_id
  WHERE ${type} AND pr.product_id = v.product_id
    AND (pr.variant_id IS NULL OR pr.variant_id = v.id)
    AND (pr.location_id IS NULL OR pr.location_id = :locationId)
  ORDER BY (pr.variant_id IS NOT NULL) DESC, (pr.location_id IS NOT NULL) DESC
  LIMIT 1
)`

/** What it is sold for, and what it is not sold under. */
const PRICE = priceWhere(`t.kind = 'retail'`)
const FLOOR = priceWhere(`t.kind = 'min'`)
/** The same, at the price type a cart is being sold at. */
const SPECIAL = priceWhere('t.id = :priceTypeId')

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

const amountOf = (value: string | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value)

/**
 * What can be sold in a shop, each thing with its price there and how many
 * are on hand: by id, or by what a cashier types. `priceTypeId` prices them
 * at another price type than the retail one, for a cart sold that way —
 * each says where its price came from (`priceFrom`). Where a thing has no
 * price of that type, the type's formula makes one of its retail price or
 * its cost; with no formula either, the retail price stands. The floor is
 * worked out the same way where a thing has no minimal price of its own, so
 * that it follows what the goods cost today. The till, the search and the
 * sale all ask here, so that none of them can disagree. `running` are the
 * promotions in force: each thing is told which of them cover it.
 */
export async function sellables(
  em: EntityManager,
  what: { ids: string[] } | { search: string; limit: number },
  locationId: string,
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
    .addSelect(PRICE, 'price')
    .addSelect(FLOOR, 'floor')
    .addSelect('p.categoryId', 'category_id')
    .addSelect('p.brandId', 'brand_id')
    .addSelect('p.season', 'season')
    .addSelect(ON_HAND, 'on_hand')
    .addSelect(IMAGE, 'image')
    .where('v.isActive AND p.isActive')
    .setParameter('locationId', locationId)
  if (priceTypeId) {
    qb.addSelect(SPECIAL, 'special').setParameter('priceTypeId', priceTypeId)
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

  const rows: Row[] = await qb.getRawMany()
  const special = priceTypeId ? await em.findOneBy(PriceType, { id: priceTypeId }) : null
  const floor = await em.findOneBy(PriceType, { kind: 'min' })
  const worked = await workedOut(em, [
    ...(special ? [{ type: special, rows: rows.filter((row) => amountOf(row.special) === null) }] : []),
    ...(floor ? [{ type: floor, rows: rows.filter((row) => amountOf(row.floor) === null) }] : []),
  ])

  return rows.map((row) => {
    const own = amountOf(row.special)
    const formula = special ? worked.get(special.id)?.get(row.variant_id) : undefined
    return {
      priceFrom: !priceTypeId
        ? null
        : own !== null
          ? ('type' as const)
          : formula !== undefined
            ? ('formula' as const)
            : ('retail' as const),
      variantId: row.variant_id,
      productId: row.product_id,
      name: row.name,
      label: variantLabel(row.value_names),
      sku: row.sku,
      price: own ?? formula ?? amountOf(row.price),
      minPrice: amountOf(row.floor) ?? (floor ? (worked.get(floor.id)?.get(row.variant_id) ?? null) : null),
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

/**
 * What each price type's formula makes of the things given it — those with no price of that type — by the
 * narrowest rule that fits: of what they cost today, or of their retail price. By type id, then variant id;
 * a thing the formula says nothing of is left out.
 */
async function workedOut(
  em: EntityManager,
  wanted: { type: PriceType; rows: Row[] }[],
): Promise<Map<string, Map<string, number>>> {
  const worked = new Map<string, Map<string, number>>()
  const asked = wanted.filter((want) => want.rows.length)
  if (!asked.length) {
    return worked
  }
  const rules = await ruleScopes(em)
  const parents = await categoryParents(em)
  const formulas = asked.map(({ type, rows }) =>
    rows.map((row) =>
      pickMarkup(
        rules,
        { categoryIds: chain(parents, row.category_id), brandId: row.brand_id, season: row.season },
        type.id,
      ),
    ),
  )
  // What the goods cost is looked up only where some formula starts from it.
  const costed = asked.flatMap(({ rows }, index) =>
    rows.filter((_, at) => formulas[index][at]?.base === 'cost').map((row) => row.product_id),
  )
  const costs = costed.length ? await unitCostsInBase(em, [...new Set(costed)]) : new Map<string, number | null>()
  asked.forEach(({ type, rows }, index) => {
    const amounts = new Map<string, number>()
    rows.forEach((row, at) => {
      const formula = formulas[index][at]
      const amount = formula
        ? priceBy(
            formula,
            { cost: costs.get(row.product_id) ?? null, retail: amountOf(row.price) },
            { step: type.roundStep, ending: type.roundEnding },
          )
        : null
      if (amount !== null) {
        amounts.set(row.variant_id, amount)
      }
    })
    worked.set(type.id, amounts)
  })
  return worked
}
