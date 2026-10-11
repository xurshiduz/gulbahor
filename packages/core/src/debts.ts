import { z } from 'zod'

import type { CreditMode } from './customers'
import type { AnyCurrency } from './money'
import { listQuerySchema } from './schemas'

/**
 * What customers owe, and since when (KEYINGI-REJA, 16.3). There is no book of
 * debts apart from the customer's account: a sale put on it, or an opening
 * balance with a day, is a charge that falls due on its day; money they bring
 * pays what falls due first; goods brought back come off the receipt they were
 * sold on. What is left unpaid past its day is overdue. Nothing here is stored:
 * it is read from the account each time, so it can never disagree with it.
 */

/** One change to a customer's account as ageing reads it, in the order it was posted, in the account's currency. */
export type AccountEvent =
  /** A sale put on the account, or an opening balance given a day: it falls due on `due` (null: never). */
  | { type: 'charge'; id: string; amount: number; due: string | null }
  /** Anything else they came to owe: money paid out to them, goods sent back to a supplier. */
  | { type: 'debit'; amount: number }
  /** Anything that takes from what they owe: money in, goods back (`target`: the sale they came off), a receipt. */
  | { type: 'credit'; amount: number; target?: string | null }

/** How one account stands today. `owed − credit` is the account's balance. */
export interface AccountAge {
  /** What they owe, and what is theirs to spend (haqi): never both above zero. */
  owed: number
  credit: number
  /** What is past its day, and the oldest such day. */
  overdue: number
  overdueSince: string | null
  /** The next day something falls due, and how much then. */
  nextDue: string | null
  nextDueAmount: number
}

interface OpenItem {
  id: string | null
  amount: number
  due: string | null
  /** Dated charges are paid first, then charges with no day, then the rest. */
  rank: 0 | 1 | 2
  order: number
}

const byTurn = (a: OpenItem, b: OpenItem) =>
  a.rank - b.rank || (a.due && b.due ? a.due.localeCompare(b.due) : 0) || a.order - b.order

/**
 * Ages an account: money a customer has with the business (a pool, haqi)
 * pays what they come to owe first; what is left owing stands as open items;
 * money in pays a receipt's own goods brought back first, then whatever falls
 * due first. Cancelled documents and their reversals, and voided sales, are
 * to be left out of `events` by the caller.
 */
export function ageBalance(events: AccountEvent[], today: string): AccountAge {
  let pool = 0
  const open: OpenItem[] = []
  const pay = (item: OpenItem, amount: number) => {
    const taken = Math.min(item.amount, amount)
    item.amount -= taken
    return taken
  }
  events.forEach((event, order) => {
    if (event.type === 'credit') {
      let left = event.amount
      const own = event.target ? open.find((item) => item.id === event.target) : undefined
      if (own) {
        left -= pay(own, left)
      }
      for (const item of open.filter((entry) => entry.amount > 0).sort(byTurn)) {
        if (left <= 0) {
          break
        }
        left -= pay(item, left)
      }
      pool += left
      return
    }
    const spent = Math.min(pool, event.amount)
    pool -= spent
    const amount = event.amount - spent
    if (amount > 0) {
      open.push(
        event.type === 'charge'
          ? { id: event.id, amount, due: event.due, rank: event.due ? 0 : 1, order }
          : { id: null, amount, due: null, rank: 2, order },
      )
    }
  })
  const owing = open.filter((item) => item.amount > 0)
  const late = owing.filter((item) => item.due !== null && item.due < today)
  const coming = owing.filter((item) => item.due !== null && item.due >= today)
  const nextDue = coming.reduce<string | null>((first, item) => (!first || item.due! < first ? item.due : first), null)
  return {
    owed: owing.reduce((sum, item) => sum + item.amount, 0),
    credit: pool,
    overdue: late.reduce((sum, item) => sum + item.amount, 0),
    overdueSince: late.reduce<string | null>((first, item) => (!first || item.due! < first ? item.due : first), null),
    nextDue,
    nextDueAmount: coming.filter((item) => item.due === nextDue).reduce((sum, item) => sum + item.amount, 0),
  }
}

/** Why a sale on account needs someone's word; null when it needs nobody's. */
export const ACCOUNT_BARS = ['supplier', 'barred', 'no_phone', 'overdue', 'over_limit'] as const
export type AccountBar = (typeof ACCOUNT_BARS)[number]

/** What the till knows of a customer when something goes on their account. */
export interface AccountBarInput {
  /** They supply goods: even what is theirs to spend is taken only with someone's word. */
  supplier: boolean
  /** Their group, or their card, says they are given nothing on credit. */
  barred: boolean
  hasPhone: boolean
  credit: CreditMode
  /** Their own ceiling, in the base, for `limit`. */
  creditLimit: number | null
  /** What they owe across their accounts now, less what is theirs, in the base at today's rates. */
  owedBase: number
  /** Something of theirs, in any currency, is past its day. */
  overdue: boolean
}

/**
 * What stands in the way of putting a sale on a customer's account: the first
 * that applies. `adds` is what the sale adds to what they owe, in the base —
 * the part their haqi does not cover; a sale their haqi covers whole adds
 * nothing and needs nobody's word, unless they supply goods. A customer with
 * no phone is lent to only on terms set for them. The ceiling is their own,
 * none at all, or the business's — and the business's 0 means that every debt
 * needs someone's word.
 */
export function accountBar(customer: AccountBarInput, adds: number, orgLimit: number): AccountBar | null {
  if (customer.supplier) {
    return 'supplier'
  }
  if (adds <= 0) {
    return null
  }
  if (customer.barred || customer.credit === 'none') {
    return 'barred'
  }
  if (!customer.hasPhone && customer.credit === 'default') {
    return 'no_phone'
  }
  if (customer.overdue) {
    return 'overdue'
  }
  const limit =
    customer.credit === 'unlimited' ? null : customer.credit === 'limit' ? (customer.creditLimit ?? 0) : orgLimit
  return limit !== null && customer.owedBase + adds > limit ? 'over_limit' : null
}

/** What a sale adds to what an account owes: the part of `amount` its haqi (`balance` below zero) does not cover. */
export function addedDebt(balance: number, amount: number): number {
  return Math.max(0, balance + amount) - Math.max(0, balance)
}

// ───────────────────────────── Who owes ─────────────────────────────

export const debtorListQuerySchema = listQuerySchema.extend({
  /** `owed`: everyone who owes something, due or not; `overdue`: those with something past its day. */
  state: z.enum(['owed', 'overdue']).default('owed'),
})
export type DebtorListQuery = z.infer<typeof debtorListQuerySchema>

/** One account that owes the business: a customer in one of their currencies. */
export interface DebtorDto extends AccountAge {
  customerId: string
  customerName: string
  phone: string | null
  isSupplier: boolean
  currency: AnyCurrency
}

/** What stands over the list of those who owe: in the base, at today's rates. */
export interface DebtorSummary {
  owed: number
  debtors: number
  overdue: number
  overdueDebtors: number
}

/** A new day for a debt to fall due on; null for none at all (only for a customer whose debts are given none). */
export const dueChangeSchema = z.object({ dueDate: z.iso.date().nullable() })
export type DueChangeInput = z.infer<typeof dueChangeSchema>
