import { CURRENCIES, type AnyCurrency } from '@erp/core'
import type { EntityManager } from 'typeorm'

/** A drawer named after its till and the sign of what it holds: "Kassa 1 (so‘m)", "Kassa 1 ($)", "Kassa 1 (¥)". */
export const drawerName = (till: string, currency: AnyCurrency) => `${till} (${CURRENCIES[currency].symbol})`

/**
 * What a till takes cash in is what drawers it has in use: `registers.currencies` keeps the currencies of those
 * beside the base, in the order the business switched them on, for whatever reads the till. Called after anything that makes,
 * moves, puts away or brings back a drawer — for the tills touched, or for all of them.
 */
export async function syncTills(em: EntityManager, registerIds?: (string | null)[]): Promise<void> {
  const ids = registerIds?.filter((id): id is string => !!id)
  if (ids && !ids.length) {
    return
  }
  await em.query(
    `UPDATE registers r SET currencies = coalesce((
       SELECT array_agg(a.currency ORDER BY c.created_at, a.currency)
       FROM accounts a JOIN organizations o ON o.id = a.org_id
       LEFT JOIN org_currencies c ON c.org_id = a.org_id AND c.code = a.currency
       WHERE a.register_id = r.id AND a.kind = 'cash' AND a.is_active AND a.currency <> o.base_currency
     ), '{}')
     ${ids ? 'WHERE r.id = ANY($1)' : ''}`,
    ids ? [ids] : [],
  )
}
