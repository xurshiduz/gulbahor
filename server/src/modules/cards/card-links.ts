import {
  CARD_DOCUMENT_TYPES,
  formatMoney,
  type AnyCurrency,
  type CardDocumentRef,
  type CardDocumentType,
  type CardEntryDto,
  type CardLinkWay,
} from '@erp/core'
import type { EntityManager } from 'typeorm'

/**
 * Bank notices set beside the books (KEYINGI-REJA, 18-bo'lim, T2). A document's money on a card — a sale, a
 * customer's payment, an expense, a transfer — is the sum of its lines on that card, whatever entries it took
 * (a sale and its voiding are one document): what the notices tied to it stand for is set against that. Nothing
 * here moves money; a tie says the bank saw what the books hold.
 */

/** What one window's line said of the notices its money was picked from. */
export interface NoticePick {
  noticeIds?: string[]
  accountId: string
  direction: 'in' | 'out'
  /** In the card's own currency. */
  amount: number
}

/**
 * Holds the notices a line's money was picked from and says what is wrong with them, if anything: each must be
 * open, of that card, of money going the line's way, and together they must come to the line's sum. Two windows
 * picking one notice at once meet here, and only the first goes through.
 */
export async function checkPicks(em: EntityManager, pick: NoticePick): Promise<string | null> {
  const ids = [...new Set(pick.noticeIds ?? [])]
  if (!ids.length) {
    return null
  }
  const rows: {
    id: string
    standing: string | null
    direction: 'in' | 'out' | null
    amount: number | null
    currency: AnyCurrency | null
    account_id: string | null
  }[] = await em.query(
    `SELECT id, standing, direction, amount::float8 AS amount, currency, account_id
     FROM card_notices WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
    [ids],
  )
  if (rows.length !== ids.length || rows.some((row) => row.standing === null)) {
    return 'Bank xabari topilmadi'
  }
  if (rows.some((row) => row.standing !== 'open')) {
    return 'Bank xabarini boshqa to‘lovga bog‘lab bo‘lishgan: ro‘yxatni yangilang'
  }
  if (rows.some((row) => row.account_id !== pick.accountId)) {
    return 'Bank xabari boshqa kartaniki'
  }
  if (rows.some((row) => row.direction !== pick.direction)) {
    return pick.direction === 'in'
      ? 'Bank xabari kartadan pul chiqqanini aytadi'
      : 'Bank xabari kartaga pul tushganini aytadi'
  }
  const sum = rows.reduce((total, row) => total + (row.amount ?? 0), 0)
  if (sum !== pick.amount) {
    return `Tanlangan bank xabarlari ${formatMoney(sum, rows[0].currency ?? 'UZS')}: summa shunga teng bo‘lishi kerak`
  }
  return null
}

/** Ties notices, already held, to the document that wrote their money. Nobody ties those the system tied itself. */
export async function tieNotices(
  em: EntityManager,
  by: { userId: string | null; name: string } | null,
  ids: string[] | undefined,
  document: { type: CardDocumentType; id: string },
  way: CardLinkWay,
): Promise<void> {
  if (!ids?.length) {
    return
  }
  await em.query(
    `UPDATE card_notices
     SET standing = 'linked', link_way = $2, document_type = $3, document_id = $4, reason = NULL,
         handled_by = $5, handled_by_name = $6, handled_at = now()
     WHERE id = ANY($1)`,
    [[...new Set(ids)], way, document.type, document.id, by?.userId ?? null, by?.name ?? null],
  )
}

/**
 * Gives a document's notices back once its money is gone from their card — the sale voided, the payment
 * cancelled, the transfer turned back: the money they stand for has to be said of again. Run by the ledger on
 * every entry of a document.
 */
export const RELEASE_NOTICES = `
  UPDATE card_notices n
  SET standing = 'open', link_way = NULL, document_type = NULL, document_id = NULL,
      handled_by = NULL, handled_by_name = NULL, handled_at = NULL
  WHERE n.standing = 'linked' AND n.document_type = $1 AND n.document_id = $2
    AND (
      SELECT coalesce(sum(l.amount), 0) FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
      WHERE e.document_type = $1 AND e.document_id = $2 AND l.account_id = n.account_id
    ) = 0`

/** Two people tying notices to one document at once take turns: neither ties past what it holds. */
export async function holdDocument(em: EntityManager, documentId: string): Promise<void> {
  await em.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [documentId])
}

/**
 * When control of the business's cards began: a day before the first notice the system read. Of a chat's past,
 * read at sign-in, the last day is asked about — the till may have written that money already; what the bank wrote
 * before it is there to pick and to match, but nobody is asked about it.
 */
export const SINCE = `(SELECT min(created_at) - interval '1 day' FROM card_notices)`

/** A document as a list names it, from its type (`t`) and id (`i`). */
const describe = (t: string, i: string) => `
  LEFT JOIN sales ds ON ${t} = 'sale' AND ds.id = ${i}
  LEFT JOIN sale_returns dr ON ${t} = 'sale_return' AND dr.id = ${i}
  LEFT JOIN sales drs ON drs.id = dr.sale_id
  LEFT JOIN customer_payments dp ON ${t} = 'customer_payment' AND dp.id = ${i}
  LEFT JOIN customers dpc ON dpc.id = dp.customer_id
  LEFT JOIN money_ops dop ON ${t} = 'money_op' AND dop.id = ${i}
  LEFT JOIN money_categories dopc ON dopc.id = dop.category_id
  LEFT JOIN money_transfers dt ON ${t} = 'money_transfer' AND dt.id = ${i}
  LEFT JOIN accounts dtf ON dtf.id = dt.from_account_id
  LEFT JOIN accounts dtt ON dtt.id = dt.to_account_id`
const NUMBER = `coalesce(ds.number, dr.number, dp.number, dop.number, dt.number)`
const WHO = `coalesce(ds.customer_name, drs.customer_name, dpc.name, dopc.name, dtf.name || ' → ' || dtt.name)`
/**
 * Whose money it is, to tell two documents of one sum apart: one customer's payments are as good as one
 * another, two customers' are not — a notice is never put on the wrong one.
 */
const OWNER = (t: string) =>
  `coalesce(ds.customer_id::text, drs.customer_id::text, dp.customer_id::text, 'op:' || dop.category_id,
            'transfer:' || dt.from_account_id || ':' || dt.to_account_id, ${t})`

/** Names documents for the notices tied to them. */
export async function documentsOf(
  em: EntityManager,
  refs: { type: string; id: string }[],
): Promise<Map<string, CardDocumentRef>> {
  if (!refs.length) {
    return new Map()
  }
  const rows: { type: CardDocumentType; id: string; number: string | null; who: string | null }[] = await em.query(
    `SELECT d.type, d.id, ${NUMBER} AS number, ${WHO} AS who
     FROM unnest($1::text[], $2::uuid[]) AS d (type, id) ${describe('d.type', 'd.id')}`,
    [refs.map((ref) => ref.type), refs.map((ref) => ref.id)],
  )
  return new Map(rows.map((row) => [`${row.type}:${row.id}`, row]))
}

interface EntryRow {
  document_type: CardDocumentType
  document_id: string
  account_id: string
  account_name: string
  currency: AnyCurrency
  amount: number
  left: number
  written_at: Date
  written_by_name: string | null
  number: string | null
  who: string | null
  owner: string
}

/**
 * Every document's money on a card under control, since control of that card began, with what the notices tied to
 * it stand for taken off. A card is under control once a notice of it has come; one kept apart as looked at and
 * found right is left out.
 */
const ENTRIES = `
  WITH controlled AS (
    SELECT account_id, min(created_at) - interval '1 day' AS since
    FROM card_notices WHERE account_id IS NOT NULL GROUP BY account_id
  ),
  legs AS (
    SELECT e.document_type, e.document_id, l.account_id, sum(l.amount) AS amount, min(e.created_at) AS written_at,
           (array_agg(e.created_by ORDER BY e.created_at))[1] AS written_by
    FROM ledger_lines l
    JOIN ledger_entries e ON e.id = l.entry_id
    JOIN controlled c ON c.account_id = l.account_id
    WHERE e.document_type = ANY('{${CARD_DOCUMENT_TYPES.join(',')}}') AND e.created_at >= c.since
    GROUP BY e.document_type, e.document_id, l.account_id
  ),
  covered AS (
    SELECT document_type, document_id, account_id,
           sum(CASE WHEN direction = 'in' THEN amount ELSE -amount END) AS amount
    FROM card_notices WHERE standing = 'linked' GROUP BY document_type, document_id, account_id
  )
  SELECT * FROM (
    SELECT g.document_type, g.document_id, g.account_id, a.name AS account_name, a.currency,
           g.amount::float8 AS amount, (g.amount - coalesce(c.amount, 0))::float8 AS left, g.written_at,
           u.full_name AS written_by_name, ${NUMBER} AS number, ${WHO} AS who, ${OWNER('g.document_type')} AS owner
    FROM legs g
    JOIN accounts a ON a.id = g.account_id
    LEFT JOIN covered c
      ON c.document_type = g.document_type AND c.document_id = g.document_id AND c.account_id = g.account_id
    LEFT JOIN users u ON u.id = g.written_by
    ${describe('g.document_type', 'g.document_id')}
    WHERE g.amount <> 0
      AND NOT EXISTS (
        SELECT 1 FROM card_checks k
        WHERE k.document_type = g.document_type AND k.document_id = g.document_id AND k.account_id = g.account_id
      )
  ) entries`

const toEntry = (row: EntryRow): CardEntryDto => ({
  accountId: row.account_id,
  accountName: row.account_name,
  document: { type: row.document_type, id: row.document_id, number: row.number, who: row.who },
  writtenAt: row.written_at.toISOString(),
  writtenByName: row.written_by_name,
  amount: row.amount,
  left: row.left,
  currency: row.currency,
})

/** Money in the books no notice stands for yet, newest first. */
export async function unconfirmed(em: EntityManager, accountId?: string, limit = 200): Promise<CardEntryDto[]> {
  const rows: EntryRow[] = await em.query(
    `${ENTRIES} WHERE entries.left <> 0 AND ($1::uuid IS NULL OR entries.account_id = $1)
     ORDER BY entries.written_at DESC LIMIT $2`,
    [accountId ?? null, limit],
  )
  return rows.map(toEntry)
}

/** How many documents on a card no notice stands for. */
export async function unconfirmedCount(em: EntityManager): Promise<Map<string, number>> {
  const rows: { account_id: string; count: number }[] = await em.query(
    `SELECT entries.account_id, count(*)::int AS count FROM (${ENTRIES}) entries
     WHERE entries.left <> 0 GROUP BY entries.account_id`,
  )
  return new Map(rows.map((row) => [row.account_id, row.count]))
}

interface OpenNotice {
  id: string
  direction: 'in' | 'out'
  amount: number
  account_id: string
  received_at: Date
}

async function openNotice(em: EntityManager, id: string): Promise<OpenNotice | null> {
  const [notice]: (OpenNotice & { standing: string | null })[] = await em.query(
    `SELECT id, standing, direction, amount::float8 AS amount, account_id, received_at
     FROM card_notices WHERE id = $1 FOR UPDATE`,
    [id],
  )
  return notice?.standing === 'open' && notice.account_id ? notice : null
}

/**
 * The documents a notice may be of: money going its way on its card with room left for its sum, written within a
 * few days of it. The nearest sum first, then the nearest time.
 */
export async function candidatesFor(em: EntityManager, noticeId: string): Promise<CardEntryDto[]> {
  const notice = await openNotice(em, noticeId)
  if (!notice) {
    return []
  }
  const sign = notice.direction === 'in' ? 1 : -1
  const rows: EntryRow[] = await em.query(
    `${ENTRIES}
     WHERE entries.account_id = $1 AND entries.left * $2 >= $3
       AND entries.written_at BETWEEN $4::timestamptz - interval '3 days' AND $4::timestamptz + interval '3 days'
     ORDER BY abs(entries.left * $2 - $3), abs(extract(epoch FROM entries.written_at - $4::timestamptz))
     LIMIT 8`,
    [notice.account_id, sign, notice.amount, notice.received_at],
  )
  return rows.map(toEntry)
}

/** One document's money on one card, with its sign, and what of it no notice stands for yet; null where it moved none. */
async function moneyOf(
  em: EntityManager,
  document: { type: string; id: string },
  accountId: string,
): Promise<{ amount: number; left: number } | null> {
  const [row]: { amount: number | null; covered: number }[] = await em.query(
    `SELECT (SELECT sum(l.amount) FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
             WHERE e.document_type = $1 AND e.document_id = $2 AND l.account_id = $3)::float8 AS amount,
            (SELECT coalesce(sum(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) FROM card_notices
             WHERE standing = 'linked' AND document_type = $1 AND document_id = $2 AND account_id = $3)::float8 AS covered`,
    [document.type, document.id, accountId],
  )
  return row?.amount ? { amount: row.amount, left: row.amount - row.covered } : null
}

/**
 * A person says the notice's money is one already in the books. The document may take several notices until its
 * money on the card is stood for, never more.
 */
export async function matchNotice(
  em: EntityManager,
  by: { userId: string | null; name: string },
  noticeId: string,
  document: { type: CardDocumentType; id: string },
): Promise<string | null> {
  const notice = await openNotice(em, noticeId)
  if (!notice) {
    return 'Bank xabari ochiq emas: ro‘yxatni yangilang'
  }
  await holdDocument(em, document.id)
  const money = await moneyOf(em, document, notice.account_id)
  const sign = notice.direction === 'in' ? 1 : -1
  if (!money || money.amount * sign <= 0) {
    return notice.direction === 'in' ? 'Bu hujjat shu kartaga pul yozmagan' : 'Bu hujjat shu kartadan pul chiqarmagan'
  }
  if (money.left * sign < notice.amount) {
    return 'Bu hujjatning kartadagi puli bank xabarlari bilan yopilgan'
  }
  await tieNotices(em, by, [notice.id], document, 'matched')
  return null
}

/**
 * Ties an open notice to the one document it fits to the tiyin, written within a day of it. Documents of one
 * owner are as good as one another, so the oldest is taken; when they are different people's, nothing is
 * chosen — a transfer is never put on the wrong customer — and the notice waits for a person.
 */
export async function autoTie(em: EntityManager, noticeId: string): Promise<CardDocumentRef | null> {
  const notice = await openNotice(em, noticeId)
  if (!notice) {
    return null
  }
  const sign = notice.direction === 'in' ? 1 : -1
  const fits: EntryRow[] = await em.query(
    `${ENTRIES}
     WHERE entries.account_id = $1 AND entries.left * $2 = $3
       AND entries.written_at BETWEEN $4::timestamptz - interval '1 day' AND $4::timestamptz + interval '1 day'
     ORDER BY entries.written_at
     LIMIT 10`,
    [notice.account_id, sign, notice.amount, notice.received_at],
  )
  if (!fits.length || new Set(fits.map((fit) => fit.owner)).size > 1) {
    return null
  }
  for (const fit of fits) {
    const document = { type: fit.document_type, id: fit.document_id }
    await holdDocument(em, document.id)
    if (((await moneyOf(em, document, notice.account_id))?.left ?? 0) * sign === notice.amount) {
      await tieNotices(em, null, [notice.id], document, 'auto')
      return { ...document, number: fit.number, who: fit.who }
    }
  }
  return null
}

/** Open notices worth trying again: of known cards, since control began, from the last two days. */
export async function untied(em: EntityManager): Promise<string[]> {
  const rows: { id: string }[] = await em.query(
    `SELECT id FROM card_notices
     WHERE standing = 'open' AND account_id IS NOT NULL AND received_at >= ${SINCE}
       AND received_at > now() - interval '2 days'
     ORDER BY received_at LIMIT 100`,
  )
  return rows.map((row) => row.id)
}
