import { ageBalance, type AccountEvent, type AnyCurrency, type CustomerBalance } from '@erp/core'
import type { EntityManager } from 'typeorm'

interface AccountRow {
  id: string
  customer_id: string
  currency: AnyCurrency
  balance: number
}

interface EventRow {
  account_id: string
  amount: number
  entry_kind: string
  document_type: string | null
  document_id: string | null
  /** The day a sale or an opening balance falls due, when it has a row in `customer_dues`. */
  dated: boolean
  due: string | null
  /** For goods brought back: the sale they came off. */
  sold_in: string | null
}

/** Today where the business is: a debt is late from the day after its day. */
export async function businessDay(em: EntityManager, orgId: string): Promise<string> {
  const [{ day }]: { day: string }[] = await em.query(
    `SELECT (now() AT TIME ZONE timezone)::date::text AS day FROM organizations WHERE id = $1`,
    [orgId],
  )
  return day
}

const settled = (row: AccountRow): CustomerBalance => ({
  currency: row.currency,
  balance: row.balance,
  owed: Math.max(0, row.balance),
  credit: Math.max(0, -row.balance),
  overdue: 0,
  overdueSince: null,
  nextDue: null,
  nextDueAmount: 0,
})

/**
 * How each of these customers' accounts stands today, one to a currency, in the order they were opened. Only an
 * account that owes is aged: one that owes nothing has nothing late. Cancelled documents and voided sales, with
 * their reversals, never were.
 */
export async function standingsOf(
  em: EntityManager,
  customerIds: string[],
  today: string,
): Promise<Map<string, CustomerBalance[]>> {
  const result = new Map<string, CustomerBalance[]>()
  if (!customerIds.length) {
    return result
  }
  const accounts: AccountRow[] = await em.query(
    `SELECT id, customer_id, currency, balance::float8 AS balance FROM accounts
     WHERE kind = 'customer' AND customer_id = ANY($1) ORDER BY created_at, id`,
    [customerIds],
  )
  const owing = accounts.filter((account) => account.balance > 0)
  const events = new Map<string, AccountEvent[]>()
  if (owing.length) {
    const rows: EventRow[] = await em.query(
      `SELECT l.account_id, l.amount::float8 AS amount, e.kind AS entry_kind, e.document_type, e.document_id,
              (d.id IS NOT NULL) AS dated, d.due_date::text AS due, sr.sale_id AS sold_in
       FROM ledger_lines l
       JOIN ledger_entries e ON e.id = l.entry_id
       LEFT JOIN customer_dues d
         ON (e.document_type = 'sale' AND d.sale_id = e.document_id)
         OR (e.document_type = 'customer_payment' AND d.payment_id = e.document_id)
       LEFT JOIN sale_returns sr ON e.document_type = 'sale_return' AND sr.id = e.document_id
       WHERE l.account_id = ANY($1)
         AND NOT EXISTS (SELECT 1 FROM sales s WHERE e.document_type = 'sale' AND s.id = e.document_id AND s.status = 'voided')
         AND NOT EXISTS (SELECT 1 FROM customer_payments p
                         WHERE e.document_type = 'customer_payment' AND p.id = e.document_id AND p.status = 'cancelled')
         AND NOT EXISTS (SELECT 1 FROM receipts r WHERE e.document_type = 'receipt' AND r.id = e.document_id AND r.status = 'cancelled')
         AND NOT EXISTS (SELECT 1 FROM stock_documents sd
                         WHERE e.document_type = 'supplier_return' AND sd.id = e.document_id AND sd.status = 'cancelled')
       ORDER BY e.created_at, e.id, l.position`,
      [owing.map((account) => account.id)],
    )
    for (const row of rows) {
      const list = events.get(row.account_id) ?? []
      // A sale on the account, or an opening balance given a day, falls due; anything else they owe never does.
      const charges = row.amount > 0 && row.document_id && (row.entry_kind === 'sale' || row.dated)
      list.push(
        row.amount < 0
          ? { type: 'credit', amount: -row.amount, target: row.sold_in }
          : charges
            ? { type: 'charge', id: row.document_id as string, amount: row.amount, due: row.due }
            : { type: 'debit', amount: row.amount },
      )
      events.set(row.account_id, list)
    }
  }
  for (const account of accounts) {
    const list = result.get(account.customer_id) ?? []
    list.push(
      account.balance > 0
        ? { currency: account.currency, balance: account.balance, ...ageBalance(events.get(account.id) ?? [], today) }
        : settled(account),
    )
    result.set(account.customer_id, list)
  }
  return result
}
