import type { CustomerDebtBrief } from '@gulbahor/core'
import type { EntityManager } from 'typeorm'

/** Today where the business is: a debt is late from the day after its day. `d` is the debt. */
export const DEBT_TODAY = `(now() AT TIME ZONE (SELECT o.timezone FROM organizations o WHERE o.id = d.org_id))::date`

/** What a debt still leaves owing. */
export const DEBT_LEFT = `(d.amount - d.paid - d.returned)`

/** A debt that still leaves something owing. */
export const DEBT_OWED = `NOT d.cancelled AND d.paid + d.returned < d.amount`

export const NO_DEBT: CustomerDebtBrief = { owed: 0, overdue: 0, dueDate: null }

/** What each of these customers owes now, and how much of it is past its day. Those who owe nothing are left out. */
export async function debtsOf(em: EntityManager, customerIds: string[]): Promise<Map<string, CustomerDebtBrief>> {
  if (!customerIds.length) {
    return new Map()
  }
  const rows: { customer_id: string; owed: number; overdue: number; due_date: string }[] = await em.query(
    `SELECT d.customer_id, sum(${DEBT_LEFT})::float8 AS owed,
            coalesce(sum(${DEBT_LEFT}) FILTER (WHERE d.due_date < ${DEBT_TODAY}), 0)::float8 AS overdue,
            min(d.due_date)::text AS due_date
     FROM customer_debts d WHERE d.customer_id = ANY($1) AND ${DEBT_OWED} GROUP BY d.customer_id`,
    [customerIds],
  )
  return new Map(rows.map((row) => [row.customer_id, { owed: row.owed, overdue: row.overdue, dueDate: row.due_date }]))
}
