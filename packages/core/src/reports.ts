import { z } from 'zod'

import { addDays, daysInMonth, fromIsoDate, toIsoDate, type LocalDate } from './date'
import type { ImageThumb } from './images'
import type { CurrencyCode } from './money'
import type { PaymentMethod } from './pos'
import { idSchema } from './schemas'

/**
 * Reports read what the tills, the stock and the books have written; they
 * write nothing. Every one of them is asked for a stretch of days — the
 * business's days, not the server's — and, where it matters, a shop.
 *
 * Money is counted the way the drawer sees it: goods brought back come off
 * on the day they came back, not on the day they were sold.
 */

// ───────────────────────────── The days asked about ─────────────────────────────

export interface DateRange {
  /** Both ends are days of the range: "2026-10-01" to "2026-10-05" is five days. */
  from: string
  to: string
}

export const REPORT_PERIODS = ['today', 'yesterday', 'week', 'month', 'last_month', 'year'] as const
export type ReportPeriod = (typeof REPORT_PERIODS)[number]

/** Monday is 0: a week of trade starts there. */
function weekday(date: LocalDate): number {
  return (new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay() + 6) % 7
}

/**
 * The days a named period covers. A period still running ends today: this
 * month is the first to today, not to the thirtieth — days that have not
 * come have sold nothing and would only drag the averages down.
 */
export function periodRange(period: ReportPeriod, today: LocalDate): DateRange {
  const iso = toIsoDate(today)
  if (period === 'today') {
    return { from: iso, to: iso }
  }
  if (period === 'yesterday') {
    const day = toIsoDate(addDays(today, -1))
    return { from: day, to: day }
  }
  if (period === 'week') {
    return { from: toIsoDate(addDays(today, -weekday(today))), to: iso }
  }
  if (period === 'month') {
    return { from: toIsoDate({ ...today, day: 1 }), to: iso }
  }
  if (period === 'last_month') {
    const last = addDays({ ...today, day: 1 }, -1)
    return { from: toIsoDate({ ...last, day: 1 }), to: toIsoDate(last) }
  }
  return { from: toIsoDate({ year: today.year, month: 1, day: 1 }), to: iso }
}

/** Which named period these days are, as of today; none for days picked by hand. */
export function periodOf(range: DateRange, today: LocalDate): ReportPeriod | null {
  return (
    REPORT_PERIODS.find((period) => {
      const named = periodRange(period, today)
      return named.from === range.from && named.to === range.to
    }) ?? null
  )
}

/** How many days a range holds, both ends counted; 0 for one that makes no sense. */
export function rangeDays(range: DateRange): number {
  const from = fromIsoDate(range.from)
  const to = fromIsoDate(range.to)
  if (!from || !to) {
    return 0
  }
  const days = (Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / 86_400_000
  return days < 0 ? 0 : days + 1
}

/**
 * What a range is measured against: as many days, ending the day before it
 * starts. A whole calendar month is set against the whole month before it,
 * whatever their lengths — February against January, not against 28 days
 * of it.
 */
export function previousRange(range: DateRange): DateRange {
  const from = fromIsoDate(range.from)
  const to = fromIsoDate(range.to)
  if (!from || !to) {
    return range
  }
  const wholeMonth =
    from.day === 1 && from.year === to.year && from.month === to.month && to.day === daysInMonth(to.year, to.month)
  const end = addDays(from, -1)
  if (wholeMonth) {
    return { from: toIsoDate({ ...end, day: 1 }), to: toIsoDate(end) }
  }
  return { from: toIsoDate(addDays(end, 1 - rangeDays(range))), to: toIsoDate(end) }
}

/**
 * How finely a range is cut for a chart: a single day by its hours, up to a
 * quarter by its days, anything longer by its months.
 */
export const REPORT_BUCKETS = ['hour', 'day', 'month'] as const
export type ReportBucket = (typeof REPORT_BUCKETS)[number]

export function reportBucket(range: DateRange): ReportBucket {
  const days = rangeDays(range)
  return days <= 1 ? 'hour' : days <= 92 ? 'day' : 'month'
}

/**
 * Every bucket of a range, in order, whether anything was sold in it or
 * not: a chart with the empty days left out tells a better story than the
 * shop had. Hours are "00" to "23", days "2026-10-05", months "2026-10".
 */
export function bucketKeys(range: DateRange, bucket: ReportBucket = reportBucket(range)): string[] {
  if (bucket === 'hour') {
    return Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
  }
  const from = fromIsoDate(range.from)
  const to = fromIsoDate(range.to)
  if (!from || !to) {
    return []
  }
  const keys: string[] = []
  if (bucket === 'day') {
    for (let day = from; toIsoDate(day) <= range.to; day = addDays(day, 1)) {
      keys.push(toIsoDate(day))
    }
    return keys
  }
  for (let year = from.year, month = from.month; year < to.year || (year === to.year && month <= to.month);) {
    keys.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return keys
}

/** Three years of days: more than that is not a report, it is an export. */
export const MAX_REPORT_DAYS = 1100

const rangeShape = {
  from: z.iso.date(),
  to: z.iso.date(),
  /** One shop; without it, every shop the person may look at. */
  locationId: idSchema.optional(),
}

export const reportQuerySchema = z
  .object(rangeShape)
  .refine((query) => query.from <= query.to, { path: ['to'], message: 'Davr oxiri boshidan oldin' })
  .refine((query) => rangeDays(query) <= MAX_REPORT_DAYS, { path: ['to'], message: 'Davr juda uzun' })
export type ReportQuery = z.infer<typeof reportQuerySchema>

// ───────────────────────────── Sales ─────────────────────────────

/** What a stretch of days sold. Money in so'm tiyin. */
export interface SalesFigures {
  /** Receipts made out; the voided ones are not among them. */
  receipts: number
  /** Pieces sold. */
  qty: number
  /** What they would have come to with nothing taken off. */
  gross: number
  /** Everything that came off: promotions, the customer's own discount, what the cashier gave. */
  discount: number
  /** What the receipts came to. */
  sold: number
  /** Returns made in these days, the pieces brought back and what they were worth. */
  returns: number
  returnedQty: number
  returned: number
  /** Sold less returned: what the days brought in. */
  net: number
  /** What the goods had cost, less the cost of those brought back; null for whoever may not see costs. */
  cost: number | null
  /** `net` less `cost`. */
  profit: number | null
}

export const NO_SALES: SalesFigures = {
  receipts: 0,
  qty: 0,
  gross: 0,
  discount: 0,
  sold: 0,
  returns: 0,
  returnedQty: 0,
  returned: 0,
  net: 0,
  cost: 0,
  profit: 0,
}

/** One bar of the chart. */
export interface SalesPoint {
  /** An hour, a day or a month: see `bucketKeys`. */
  key: string
  receipts: number
  net: number
  profit: number | null
}

export interface SalesReportDto extends DateRange {
  bucket: ReportBucket
  totals: SalesFigures
  /** The days the totals are measured against, and what they sold. */
  previous: DateRange & { totals: SalesFigures }
  /** Every bucket of the range, the empty ones too. */
  series: SalesPoint[]
  /** Each shop that sold or took something back, the best first. */
  shops: { id: string; name: string; receipts: number; net: number; profit: number | null }[]
  /**
   * How the money came: what each way of paying brought, less the change
   * given out of it and what was handed back for returns. `amount` is in
   * the currency it was paid in, `base` what that was worth in so'm.
   */
  payments: { method: PaymentMethod; currency: CurrencyCode; amount: number; base: number }[]
  /** Who made out the receipts, the busiest first. */
  cashiers: { id: string | null; name: string; receipts: number; sold: number }[]
  /** What sold best, by what it brought in after returns. */
  products: {
    id: string
    name: string
    sku: string
    image: ImageThumb | null
    qty: number
    net: number
    profit: number | null
  }[]
  categories: { id: string | null; name: string | null; qty: number; net: number }[]
}

/** The average receipt, in so'm tiyin; 0 when there were none. */
export function averageReceipt(figures: Pick<SalesFigures, 'receipts' | 'sold'>): number {
  return figures.receipts ? Math.round(figures.sold / figures.receipts) : 0
}

/**
 * How a number stands against the one before it, in percent with one
 * decimal: +12.5 is an eighth more. Null when there was nothing before —
 * growth from nothing is not a percentage.
 */
export function changePercent(now: number, before: number): number | null {
  return before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null
}
