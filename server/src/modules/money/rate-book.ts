import type { AnyCurrency, CurrencyRateDto, RateBook, RateWay } from '@erp/core'
import type { EntityManager } from 'typeorm'

/** The last rate of each currency on or before a day, of those still switched on. */
export async function ratesInForce(em: EntityManager, date: string): Promise<Map<AnyCurrency, CurrencyRateDto>> {
  const rows: {
    code: AnyCurrency
    rate_date: string
    against: AnyCurrency
    way: RateWay
    value: string
    set_by_name: string | null
  }[] = await em.query(
    `SELECT DISTINCT ON (r.code) r.code, r.rate_date::text, r.against, r.way, r.value, r.set_by_name
     FROM currency_rates r JOIN org_currencies c ON c.org_id = r.org_id AND c.code = r.code AND c.is_active
     WHERE r.rate_date <= $1 ORDER BY r.code, r.rate_date DESC`,
    [date],
  )
  return new Map(
    rows.map((row) => [
      row.code,
      { date: row.rate_date, against: row.against, way: row.way, value: Number(row.value), setByName: row.set_by_name },
    ]),
  )
}

/** The rates a business values money by on a day, each as it was written, and the base they come down to. */
export function bookFrom(base: AnyCurrency, rates: Map<AnyCurrency, CurrencyRateDto>): RateBook {
  const book: RateBook = { base, rates: {} }
  for (const [code, rate] of rates) {
    book.rates[code] = { against: rate.against, way: rate.way, value: rate.value }
  }
  return book
}

/** The business's day, in its own time zone. */
export async function businessToday(em: EntityManager): Promise<string> {
  const [row]: { day: string }[] = await em.query(
    `SELECT (now() AT TIME ZONE timezone)::date::text AS day FROM organizations WHERE id = current_setting('app.org_id')::uuid`,
  )
  return row.day
}

/** Today's rates: what a price in another currency is worth in the base right now. */
export async function bookToday(em: EntityManager): Promise<RateBook> {
  return bookFrom(await baseOf(em), await ratesInForce(em, await businessToday(em)))
}

/** The base of the business whose transaction this is. */
export async function baseOf(em: EntityManager): Promise<AnyCurrency> {
  const [row]: { base: AnyCurrency }[] = await em.query(
    `SELECT base_currency AS base FROM organizations WHERE id = current_setting('app.org_id')::uuid`,
  )
  return row.base
}
