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
 *
 * Someone merged into one of these customers left their history on accounts of their own: it is read here as part
 * of the account it was carried to, and the entries that carried it — in on one side, out on the other — are left
 * out. A customer who was merged into another has no accounts of their own here.
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
    `SELECT a.id, coalesce(c.merged_into, c.id) AS customer_id, a.currency, a.balance::float8 AS balance
     FROM accounts a JOIN customers c ON c.id = a.customer_id
     WHERE a.kind = 'customer'
       AND ((c.id = ANY($1) AND c.merged_into IS NULL) OR c.merged_into = ANY($1))
     ORDER BY a.created_at, a.id`,
    [customerIds],
  )
  // One account to a customer and a currency, with whatever was merged into it.
  const keyOf = (account: AccountRow) => `${account.customer_id}:${account.currency}`
  const whole = new Map<string, AccountRow>()
  const partOf = new Map<string, string>()
  for (const account of accounts) {
    const key = keyOf(account)
    const sum = whole.get(key)
    if (sum) {
      sum.balance += account.balance
    } else {
      whole.set(key, { ...account, id: key })
    }
    partOf.set(account.id, key)
  }
  const owing = accounts.filter((account) => (whole.get(keyOf(account))?.balance ?? 0) > 0)
  const events = new Map<string, AccountEvent[]>()
  if (owing.length) {
    const rows: EventRow[] = await em.query(
      `SELECT l.account_id, l.amount::float8 AS amount, e.kind AS entry_kind, e.document_type, e.document_id,
              (d.id IS NOT NULL) AS dated, d.due_date::text AS due, sr.sale_id AS sold_in
       FROM ledger_lines l
       JOIN ledger_entries e ON e.id = l.entry_id
       JOIN accounts a ON a.id = l.account_id
       JOIN customers c ON c.id = a.customer_id
       -- The day belongs to whoever owes the debt now: a receipt given to another customer took its day along,
       -- and the days of someone merged into another are that other's.
       LEFT JOIN customer_dues d
         ON ((e.document_type = 'sale' AND d.sale_id = e.document_id)
          OR (e.document_type = 'customer_payment' AND d.payment_id = e.document_id))
        AND d.customer_id = coalesce(c.merged_into, c.id)
       LEFT JOIN sale_returns sr ON e.document_type = 'sale_return' AND sr.id = e.document_id
       WHERE l.account_id = ANY($1)
         AND e.kind <> 'customer_merge'
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
      const key = partOf.get(row.account_id) as string
      const list = events.get(key) ?? []
      // A sale on the account, or an opening balance given a day, falls due; anything else they owe never does.
      // A receipt given to them by someone it was first rung up to is a sale on their account all the same.
      const sold = row.entry_kind === 'sale' || row.entry_kind === 'sale_customer'
      const charges = row.amount > 0 && row.document_id && (sold || row.dated)
      list.push(
        row.amount < 0
          ? {
              type: 'credit',
              amount: -row.amount,
              // What leaves with a receipt given to another closes that receipt's own debt here, not an older one.
              target: row.sold_in ?? (row.entry_kind === 'sale_customer' ? row.document_id : null),
            }
          : charges
            ? { type: 'charge', id: row.document_id as string, amount: row.amount, due: row.due }
            : { type: 'debit', amount: row.amount },
      )
      events.set(key, list)
    }
  }
  for (const account of whole.values()) {
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
