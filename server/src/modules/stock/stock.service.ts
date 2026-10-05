import type {
  CurrencyCode,
  Page,
  StockListItemDto,
  StockListQuery,
  StockLocationDto,
  StockProductDto,
  StockVariantDto,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch, applySort } from '../../common/listing'
import { Db } from '../../database/db.service'
import { Brand, Category, Location, Product, StockMovement, type StockMovementKind } from '../../database/entities'
import { can, type Actor } from '../auth/actor'
import { productFaces } from '../catalog/faces'

/** The kind of the one place per business that holds goods on the way between two others. */
export const TRANSIT = 'transit'

export interface Movement {
  kind: StockMovementKind
  docDate: string
  documentType: string
  documentId: string
  lineId?: string | null
  /** Null for value added to or taken from goods that have already left. */
  locationId: string | null
  batchId: string
  variantId: string
  qty: number
  costUsd: number
  costUzs: number
}

/** Part of a batch: so many of a variant, at what that many cost. */
export interface Piece {
  batchId: string
  variantId: string
  qty: number
  costUsd: number
  costUzs: number
}

interface Held {
  batch_id: string
  variant_id: string
  qty: number
  cost_usd: number
  cost_uzs: number
}

const SORTABLE = { name: 'p.name', sku: 'p.sku', qty: 'qty' }

const QTY_SCALE = 1000

const scaled = (qty: number) => BigInt(Math.round(qty * QTY_SCALE))

/** `cost × part ÷ whole`, rounded half up: what `part` of a balance is worth. */
function share(cost: number, part: bigint, whole: bigint): number {
  if (part === whole) {
    return cost
  }
  const negative = cost < 0
  const doubled = (BigInt(Math.abs(cost)) * part * 2n) / whole
  const rounded = Number((doubled + 1n) / 2n)
  return negative ? -rounded : rounded
}

/** Takes `qty` out of the balances given, in their order; returns the pieces and what could not be found. */
function carve(balances: Held[], qty: number): { pieces: Piece[]; missing: number } {
  let wanted = scaled(qty)
  const pieces: Piece[] = []
  for (const balance of balances) {
    if (wanted === 0n) {
      break
    }
    const have = scaled(balance.qty)
    if (have === 0n) {
      continue
    }
    const take = have < wanted ? have : wanted
    const piece = {
      batchId: balance.batch_id,
      variantId: balance.variant_id,
      qty: Number(take) / QTY_SCALE,
      costUsd: share(balance.cost_usd, take, have),
      costUzs: share(balance.cost_uzs, take, have),
    }
    pieces.push(piece)
    // The same balances may be carved again in this request; they shrink as they would in the ledger.
    balance.qty = Number(have - take) / QTY_SCALE
    balance.cost_usd -= piece.costUsd
    balance.cost_uzs -= piece.costUzs
    wanted -= take
  }
  return { pieces, missing: Number(wanted) / QTY_SCALE }
}

/**
 * The stock ledger. `apply` is the only way quantities and values change:
 * it writes the movements and moves the balances by the same amounts in the
 * caller's transaction, so the two can never drift apart.
 */
@Injectable()
export class StockService {
  constructor(private readonly db: Db) {}

  async apply(em: EntityManager, orgId: string, actorId: string | null, movements: Movement[]): Promise<void> {
    if (!movements.length) {
      return
    }
    await em.insert(
      StockMovement,
      movements.map((movement) => ({ orgId, actorId, lineId: null, ...movement })),
    )

    // One statement may touch a balance only once, so changes to the same batch in the same place are added up first.
    const changes = new Map<string, Movement>()
    for (const movement of movements) {
      if (!movement.locationId) {
        continue
      }
      const key = `${movement.locationId}|${movement.batchId}`
      const sum = changes.get(key)
      if (sum) {
        sum.qty = (Math.round(sum.qty * QTY_SCALE) + Math.round(movement.qty * QTY_SCALE)) / QTY_SCALE
        sum.costUsd += movement.costUsd
        sum.costUzs += movement.costUzs
      } else {
        changes.set(key, { ...movement })
      }
    }
    const rows = [...changes.values()]
    if (!rows.length) {
      return
    }

    // A balance that exists is moved; one that does not is created. (An upsert would test the
    // movement itself against the balance checks before looking for the row it adds to.)
    const data = `unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::numeric[], $6::bigint[], $7::bigint[])
      AS d (location_id, batch_id, variant_id, qty, cost_usd, cost_uzs)`
    const params = [
      orgId,
      rows.map((row) => row.locationId),
      rows.map((row) => row.batchId),
      rows.map((row) => row.variantId),
      rows.map((row) => row.qty),
      rows.map((row) => row.costUsd),
      rows.map((row) => row.costUzs),
    ]
    try {
      await em.query(
        `WITH moved AS (
           UPDATE stock_balances b
           SET qty = b.qty + d.qty, cost_usd = b.cost_usd + d.cost_usd, cost_uzs = b.cost_uzs + d.cost_uzs
           FROM ${data}
           WHERE b.org_id = $1 AND b.location_id = d.location_id AND b.batch_id = d.batch_id
           RETURNING b.location_id, b.batch_id
         )
         INSERT INTO stock_balances (org_id, location_id, batch_id, variant_id, qty, cost_usd, cost_uzs)
         SELECT $1, d.location_id, d.batch_id, d.variant_id, d.qty, d.cost_usd, d.cost_uzs
         FROM ${data}
         WHERE NOT EXISTS (SELECT 1 FROM moved m WHERE m.location_id = d.location_id AND m.batch_id = d.batch_id)`,
        params,
      )
    } catch (error) {
      // The balance checks refuse to go below zero: more was asked for than is there.
      if ((error as { driverError?: { code?: string } }).driverError?.code === '23514') {
        throw AppError.conflict('NOT_ENOUGH_STOCK', 'Qoldiq yetarli emas: tovarning bir qismi allaqachon chiqib ketgan')
      }
      throw error
    }
    await em.query(`DELETE FROM stock_balances WHERE qty = 0 AND batch_id = ANY($1)`, [rows.map((row) => row.batchId)])
  }

  /**
   * The place goods are in while on the way between two others. A business
   * gets its one such place the first time it sends a transfer.
   */
  async transit(em: EntityManager, orgId: string): Promise<string> {
    const [existing]: { id: string }[] = await em.query(`SELECT id FROM locations WHERE kind = 'transit'`)
    if (existing) {
      return existing.id
    }
    const [created]: { id: string }[] = await em.query(
      `INSERT INTO locations (org_id, kind, name, code, search_key) VALUES ($1, 'transit', $2, 'YOLDA', '') RETURNING id`,
      [orgId, 'Yo‘lda'],
    )
    return created.id
  }

  /** What is on hand of each of these variants in a place. */
  async onHand(em: EntityManager, locationId: string, variantIds: string[]): Promise<Map<string, number>> {
    if (!variantIds.length) {
      return new Map()
    }
    const rows: { variant_id: string; qty: number }[] = await em.query(
      `SELECT variant_id, sum(qty)::float8 AS qty FROM stock_balances
       WHERE location_id = $1 AND variant_id = ANY($2) GROUP BY variant_id`,
      [locationId, variantIds],
    )
    return new Map(rows.map((row) => [row.variant_id, row.qty]))
  }

  /**
   * Chooses the pieces that make up `qty` of each variant in a place, oldest
   * batch first, and holds those balances until the transaction ends. Nothing
   * moves yet: the caller turns the pieces into movements. `missing` is how
   * much of each want is not there.
   */
  async pick(
    em: EntityManager,
    locationId: string,
    wants: { variantId: string; qty: number }[],
  ): Promise<{ pieces: Piece[]; missing: number }[]> {
    const held: Held[] = wants.length
      ? await em.query(
          `SELECT sb.batch_id, sb.variant_id, sb.qty::float8 AS qty, sb.cost_usd::float8 AS cost_usd, sb.cost_uzs::float8 AS cost_uzs
           FROM stock_balances sb JOIN stock_batches b ON b.id = sb.batch_id
           WHERE sb.location_id = $1 AND sb.variant_id = ANY($2) AND sb.qty > 0
           ORDER BY b.received_on, b.created_at, b.id
           FOR UPDATE OF sb`,
          [locationId, [...new Set(wants.map((want) => want.variantId))]],
        )
      : []
    return wants.map((want) =>
      carve(
        held.filter((balance) => balance.variant_id === want.variantId),
        want.qty,
      ),
    )
  }

  /** The same for named batches: the pieces a document put somewhere, taken from there again. */
  async pickBatches(
    em: EntityManager,
    locationId: string,
    wants: { batchId: string; qty: number }[],
  ): Promise<{ pieces: Piece[]; missing: number }[]> {
    const held: Held[] = wants.length
      ? await em.query(
          `SELECT batch_id, variant_id, qty::float8 AS qty, cost_usd::float8 AS cost_usd, cost_uzs::float8 AS cost_uzs
           FROM stock_balances WHERE location_id = $1 AND batch_id = ANY($2) AND qty > 0
           FOR UPDATE`,
          [locationId, [...new Set(wants.map((want) => want.batchId))]],
        )
      : []
    return wants.map((want) =>
      carve(
        held.filter((balance) => balance.batch_id === want.batchId),
        want.qty,
      ),
    )
  }

  /**
   * Every active place, whoever asks: a seller may not work at the other shop,
   * but should be able to say that the size a customer wants is there.
   */
  async locations(actor: Actor): Promise<StockLocationDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const rows = await em.find(Location, { where: { isActive: true }, order: { name: 'ASC' } })
      // The place for goods on the way comes last, whatever its name sorts as.
      const transit = (row: Location) => (row.kind as string) === TRANSIT
      return [...rows.filter((row) => !transit(row)), ...rows.filter(transit)].map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        isTransit: transit(row),
      }))
    })
  }

  /** Models with what is on hand of each, in all places or in one. */
  async list(actor: Actor, query: StockListQuery): Promise<Page<StockListItemDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const place = query.locationId ? 'AND sb.location_id = :locationId' : ''
      const onHand = `FROM stock_balances sb JOIN product_variants v ON v.id = sb.variant_id WHERE v.product_id = p.id AND sb.qty > 0 ${place}`
      const present = `EXISTS (SELECT 1 ${onHand})`

      const qb = em
        .createQueryBuilder(Product, 'p')
        .leftJoin(Category, 'c', 'c.id = p.categoryId')
        .leftJoin(Brand, 'b', 'b.id = p.brandId')
        .addSelect('c.name', 'category_name')
        .addSelect('b.name', 'brand_name')
        .addSelect(`(SELECT coalesce(sum(sb.qty), 0)::float8 ${onHand})`, 'qty')
        .addSelect(`(SELECT coalesce(sum(sb.cost_uzs), 0)::float8 ${onHand})`, 'cost_uzs')
        .addSelect(`(SELECT coalesce(sum(sb.cost_usd), 0)::float8 ${onHand})`, 'cost_usd')
        .addSelect(
          `(SELECT jsonb_object_agg(x.location_id, x.qty) FROM (SELECT sb.location_id, sum(sb.qty)::float8 AS qty ${onHand} GROUP BY sb.location_id) x)`,
          'by_location',
        )
        .addSelect(
          `(SELECT jsonb_build_object('amount', pr.amount, 'currency', pr.currency) FROM prices pr JOIN price_types t ON t.id = pr.price_type_id
            WHERE t.kind = 'retail' AND pr.product_id = p.id AND pr.variant_id IS NULL AND pr.location_id IS NULL)`,
          'retail_price',
        )
        .where('p.isActive')
      if (query.locationId) qb.setParameter('locationId', query.locationId)

      if (query.presence === 'in') qb.andWhere(present)
      if (query.presence === 'out') qb.andWhere(`NOT ${present}`)
      if (query.brandId) qb.andWhere('p.brandId = :brandId', { brandId: query.brandId })
      if (query.categoryId) {
        qb.andWhere(
          `p.category_id IN (
            WITH RECURSIVE tree AS (
              SELECT id FROM categories WHERE id = :categoryId
              UNION ALL
              SELECT k.id FROM categories k JOIN tree ON k.parent_id = tree.id
            )
            SELECT id FROM tree
          )`,
          { categoryId: query.categoryId },
        )
      }
      applySearch(qb, 'p.search_key', query.q)
      applySort(qb, SORTABLE, query.sort, query.order, 'name')
      qb.addOrderBy('p.id', 'ASC')

      const total = await qb.getCount()
      const { entities, raw } = await qb
        .offset((query.page - 1) * query.size)
        .limit(query.size)
        .getRawAndEntities()

      const seesCost = can(actor, 'stock.cost')
      const faces = await productFaces(
        em,
        entities.map((product) => product.id),
      )
      return {
        items: entities.map((product, index) => {
          const row = raw[index] as {
            category_name: string | null
            brand_name: string | null
            qty: number
            cost_uzs: number
            cost_usd: number
            by_location: Record<string, number> | null
            retail_price: { amount: number | string; currency: CurrencyCode } | null
          }
          return {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            brandName: row.brand_name,
            categoryName: row.category_name,
            unit: product.unit,
            qty: row.qty,
            byLocation: row.by_location ?? {},
            costUzs: seesCost ? row.cost_uzs : null,
            costUsd: seesCost ? row.cost_usd : null,
            retailPrice: row.retail_price
              ? { amount: Number(row.retail_price.amount), currency: row.retail_price.currency }
              : null,
            image: faces.get(product.id) ?? null,
          }
        }),
        total,
        page: query.page,
        size: query.size,
      }
    })
  }

  /** One model, variant by variant and place by place. */
  async product(actor: Actor, productId: string): Promise<StockProductDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const product = await em.findOneBy(Product, { id: productId })
      if (!product) {
        throw AppError.notFound('Tovar topilmadi')
      }
      const rows: {
        id: string
        value1_id: string | null
        value2_id: string | null
        value3_id: string | null
        sku: string
        qty: number
        cost_uzs: number
        cost_usd: number
        by_location: Record<string, number> | null
      }[] = await em.query(
        `SELECT v.id, v.value1_id, v.value2_id, v.value3_id, v.sku,
                coalesce(s.qty, 0)::float8 AS qty, coalesce(s.cost_uzs, 0)::float8 AS cost_uzs,
                coalesce(s.cost_usd, 0)::float8 AS cost_usd, s.by_location
         FROM product_variants v
         LEFT JOIN attribute_values a1 ON a1.id = v.value1_id
         LEFT JOIN attribute_values a2 ON a2.id = v.value2_id
         LEFT JOIN attribute_values a3 ON a3.id = v.value3_id
         LEFT JOIN LATERAL (
           SELECT sum(x.qty) AS qty, sum(x.cost_uzs) AS cost_uzs, sum(x.cost_usd) AS cost_usd,
                  jsonb_object_agg(x.location_id, x.qty) AS by_location
           FROM (
             SELECT sb.location_id, sum(sb.qty)::float8 AS qty, sum(sb.cost_uzs) AS cost_uzs, sum(sb.cost_usd) AS cost_usd
             FROM stock_balances sb WHERE sb.variant_id = v.id AND sb.qty > 0 GROUP BY sb.location_id
           ) x
         ) s ON true
         WHERE v.product_id = $1
         ORDER BY a1.sort_order NULLS FIRST, a1.name, a2.sort_order NULLS FIRST, a2.name, a3.sort_order NULLS FIRST, a3.name, v.created_at`,
        [productId],
      )
      const seesCost = can(actor, 'stock.cost')
      const variants: StockVariantDto[] = rows.map((row) => ({
        variantId: row.id,
        valueIds: [row.value1_id, row.value2_id, row.value3_id].filter((id): id is string => !!id),
        sku: row.sku,
        qty: row.qty,
        byLocation: row.by_location ?? {},
        costUzs: seesCost ? row.cost_uzs : null,
        costUsd: seesCost ? row.cost_usd : null,
      }))
      return {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        unit: product.unit,
        axisIds: [product.axis1Id, product.axis2Id, product.axis3Id].filter((id): id is string => !!id),
        variants,
      }
    })
  }
}
