import {
  bucketKeys,
  NO_SALES,
  previousRange,
  reportBucket,
  type CurrencyCode,
  type DateRange,
  type PaymentMethod,
  type ReportBucket,
  type ReportQuery,
  type SalesFigures,
  type SalesReportDto,
} from '@erp/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Actor, can } from '../auth/actor'
import { productFaces } from '../catalog/faces'

/** Receipts that count: made in the days asked about, in the shops asked about, and not undone. */
const SOLD = `s.status = 'completed' AND s.sold_on BETWEEN $1 AND $2 AND ($3::uuid[] IS NULL OR s.location_id = ANY($3))`
/** Returns count on the day the goods came back. */
const BACK = `r.returned_on BETWEEN $1 AND $2 AND ($3::uuid[] IS NULL OR r.location_id = ANY($3))`

/** What a return's goods had cost: it comes off the cost of what was sold. */
const RETURN_COST = `(SELECT coalesce(sum(l.cost_uzs), 0) FROM sale_return_lines l WHERE l.return_id = r.id)`

/**
 * Every line sold and every line brought back, the second as a minus of
 * the first: summed by whatever they are grouped on, they give what that
 * thing brought in after returns.
 */
const LINES = `
  SELECT l.variant_id, l.qty, l.total AS amount, l.cost_uzs AS cost
  FROM sale_lines l JOIN sales s ON s.id = l.sale_id WHERE ${SOLD}
  UNION ALL
  SELECT l.variant_id, -l.qty, -l.total, -l.cost_uzs
  FROM sale_return_lines l JOIN sale_returns r ON r.id = l.return_id WHERE ${BACK}`

/** How many of the best are named. */
const TOP = 10

/** The hours a day's chart always shows; trade outside them widens it. */
const OPENS = 9
const CLOSES = 21

type Scope = [from: string, to: string, places: string[] | null]

/**
 * Reports: what the tills have sold, read back by day, shop, tender and
 * goods. Nothing here writes. A person sees the shops they work at, and
 * what goods cost only if they may see costs anywhere else.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly db: Db) {}

  sales(actor: Actor, query: ReportQuery): Promise<SalesReportDto> {
    const seesCost = can(actor, 'stock.cost')
    const places = placesOf(actor, query.locationId)
    const bucket = reportBucket(query)
    const before = previousRange(query)
    const scope: Scope = [query.from, query.to, places]
    const profit = (net: number, cost: number) => (seesCost ? net - cost : null)

    return this.db.tenant(actor.orgId, async ({ em }) => {
      const totals = await figures(em, scope, seesCost)
      const previous = await figures(em, [before.from, before.to, places], seesCost)

      // One pass gives both the chart and the shops: receipts and returns by bucket and by shop.
      const [{ timezone }]: { timezone: string }[] = await em.query(
        `SELECT timezone FROM organizations WHERE id = $1`,
        [actor.orgId],
      )
      const heads: { key: string; location_id: string; receipts: number; net: number; cost: number }[] = await em.query(
        `SELECT x.key, x.location_id, sum(x.receipts)::int AS receipts, sum(x.amount)::float8 AS net,
                sum(x.cost)::float8 AS cost
         FROM (
           SELECT ${bucketKey(bucket, 's.sold_at', 's.sold_on')} AS key, s.location_id, 1 AS receipts,
                  s.total AS amount, s.cost_uzs AS cost
           FROM sales s WHERE ${SOLD}
           UNION ALL
           SELECT ${bucketKey(bucket, 'r.returned_at', 'r.returned_on')}, r.location_id, 0, -r.total, -${RETURN_COST}
           FROM sale_returns r WHERE ${BACK}
         ) x GROUP BY x.key, x.location_id`,
        bucket === 'hour' ? [...scope, timezone] : scope,
      )

      const byKey = new Map<string, { receipts: number; net: number; cost: number }>()
      const byShop = new Map<string, { receipts: number; net: number; cost: number }>()
      for (const row of heads) {
        for (const [sums, key] of [
          [byKey, row.key],
          [byShop, row.location_id],
        ] as const) {
          const sum = sums.get(key) ?? { receipts: 0, net: 0, cost: 0 }
          sums.set(key, { receipts: sum.receipts + row.receipts, net: sum.net + row.net, cost: sum.cost + row.cost })
        }
      }
      const series = shownKeys(query, bucket, [...byKey.keys()]).map((key) => {
        const sum = byKey.get(key) ?? { receipts: 0, net: 0, cost: 0 }
        return { key, receipts: sum.receipts, net: sum.net, profit: profit(sum.net, sum.cost) }
      })

      const names: { id: string; name: string }[] = byShop.size
        ? await em.query(`SELECT id, name FROM locations WHERE id = ANY($1)`, [[...byShop.keys()]])
        : []
      const shops = names
        .map(({ id, name }) => {
          const sum = byShop.get(id)!
          return { id, name, receipts: sum.receipts, net: sum.net, profit: profit(sum.net, sum.cost) }
        })
        .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name))

      // What each way of paying brought, with the change given out of the cash and the refunds taken off it.
      // An exchange pays with goods, not money: it is no tender.
      const payments: { method: PaymentMethod; currency: CurrencyCode; amount: number; base: number }[] =
        await em.query(
          `SELECT x.method, x.currency, sum(x.amount)::float8 AS amount, sum(x.base)::float8 AS base
           FROM (
             SELECT p.method, p.currency, p.amount, p.base
             FROM sale_payments p JOIN sales s ON s.id = p.sale_id WHERE ${SOLD} AND p.method <> 'exchange'
             UNION ALL
             SELECT 'cash', $4::text, -s.change_uzs, -s.change_uzs FROM sales s WHERE ${SOLD} AND s.change_uzs > 0
             UNION ALL
             SELECT 'cash', 'USD', -s.change_usd, -round(s.change_usd * coalesce(s.uzs_per_usd, 0))
             FROM sales s WHERE ${SOLD} AND s.change_usd > 0
             UNION ALL
             SELECT p.method, p.currency, -p.amount, -p.base
             FROM sale_return_payments p JOIN sale_returns r ON r.id = p.return_id
             WHERE ${BACK} AND p.method <> 'exchange'
           ) x GROUP BY x.method, x.currency
           HAVING sum(x.amount) <> 0 OR sum(x.base) <> 0
           ORDER BY sum(x.base) DESC`,
          // Change given in the base is cash in the base.
          [...scope, actor.base],
        )

      const cashiers: { id: string | null; name: string; receipts: number; sold: number }[] = await em.query(
        `SELECT s.cashier_id AS id, coalesce(max(s.cashier_name), '') AS name, count(*)::int AS receipts,
                sum(s.total)::float8 AS sold
         FROM sales s WHERE ${SOLD} GROUP BY s.cashier_id ORDER BY sum(s.total) DESC LIMIT ${TOP}`,
        scope,
      )

      const goods: { id: string; name: string; sku: string; qty: number; net: number; cost: number }[] = await em.query(
        `SELECT p.id, p.name, p.sku, sum(x.qty)::float8 AS qty, sum(x.amount)::float8 AS net,
                sum(x.cost)::float8 AS cost
         FROM (${LINES}) x
         JOIN product_variants v ON v.id = x.variant_id JOIN products p ON p.id = v.product_id
         GROUP BY p.id, p.name, p.sku HAVING sum(x.amount) > 0
         ORDER BY sum(x.amount) DESC, p.name LIMIT ${TOP}`,
        scope,
      )
      const faces = await productFaces(
        em,
        goods.map((item) => item.id),
      )

      const categories: { id: string | null; name: string | null; qty: number; net: number }[] = await em.query(
        `SELECT c.id, c.name, sum(x.qty)::float8 AS qty, sum(x.amount)::float8 AS net
         FROM (${LINES}) x
         JOIN product_variants v ON v.id = x.variant_id JOIN products p ON p.id = v.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         GROUP BY c.id, c.name HAVING sum(x.amount) > 0
         ORDER BY sum(x.amount) DESC, c.name LIMIT ${TOP}`,
        scope,
      )

      return {
        from: query.from,
        to: query.to,
        bucket,
        totals,
        previous: { ...before, totals: previous },
        series,
        shops,
        payments,
        cashiers,
        products: goods.map(({ cost, ...item }) => ({
          ...item,
          image: faces.get(item.id) ?? null,
          profit: profit(item.net, cost),
        })),
        categories,
      }
    })
  }
}

/** The shops a report covers: the one asked for, or every one this person works at; null is all of them. */
function placesOf(actor: Actor, locationId: string | undefined): string[] | null {
  if (locationId) {
    if (!actor.allLocations && !actor.locationIds.includes(locationId)) {
      throw AppError.forbidden()
    }
    return [locationId]
  }
  return actor.allLocations ? null : actor.locationIds
}

/** How a moment or a day is named in the chart; an hour is the business's hour, wherever the server stands. */
function bucketKey(bucket: ReportBucket, at: string, on: string): string {
  if (bucket === 'hour') {
    return `to_char(${at} AT TIME ZONE $4, 'HH24')`
  }
  return bucket === 'day' ? `to_char(${on}, 'YYYY-MM-DD')` : `to_char(${on}, 'YYYY-MM')`
}

/** The buckets a chart shows: all of a range's days or months; of a day, its opening hours and any others that traded. */
function shownKeys(range: DateRange, bucket: ReportBucket, traded: string[]): string[] {
  const keys = bucketKeys(range, bucket)
  if (bucket !== 'hour') {
    return keys
  }
  const hours = traded.map(Number)
  const first = Math.min(OPENS, ...hours)
  const last = Math.max(CLOSES, ...hours)
  return keys.slice(first, last + 1)
}

async function figures(em: EntityManager, scope: Scope, seesCost: boolean): Promise<SalesFigures> {
  const [row]: {
    receipts: number
    qty: number
    gross: number
    discount: number
    sold: number
    cost: number
    returns: number
    returned_qty: number
    returned: number
    returned_cost: number
  }[] = await em.query(
    `SELECT s.*, r.* FROM (
       SELECT count(*)::int AS receipts, coalesce(sum(s.qty), 0)::float8 AS qty,
              coalesce(sum(s.subtotal), 0)::float8 AS gross, coalesce(sum(s.discount), 0)::float8 AS discount,
              coalesce(sum(s.total), 0)::float8 AS sold, coalesce(sum(s.cost_uzs), 0)::float8 AS cost
       FROM sales s WHERE ${SOLD}
     ) s, (
       SELECT count(DISTINCT r.id)::int AS returns, coalesce(sum(l.qty), 0)::float8 AS returned_qty,
              coalesce(sum(l.total), 0)::float8 AS returned, coalesce(sum(l.cost_uzs), 0)::float8 AS returned_cost
       FROM sale_returns r JOIN sale_return_lines l ON l.return_id = r.id WHERE ${BACK}
     ) r`,
    scope,
  )
  if (!row) {
    return seesCost ? NO_SALES : { ...NO_SALES, cost: null, profit: null }
  }
  const net = row.sold - row.returned
  const cost = row.cost - row.returned_cost
  return {
    receipts: row.receipts,
    qty: row.qty,
    gross: row.gross,
    discount: row.discount,
    sold: row.sold,
    returns: row.returns,
    returnedQty: row.returned_qty,
    returned: row.returned,
    net,
    cost: seesCost ? cost : null,
    profit: seesCost ? net - cost : null,
  }
}
