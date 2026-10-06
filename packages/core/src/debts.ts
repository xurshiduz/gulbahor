import { z } from 'zod'

import type { AnyCurrency } from './money'
import { idSchema, listQuerySchema, optionalText } from './schemas'

/**
 * What customers owe the shop. A sale may be made out, wholly or in part, as
 * a debt: the goods go, the money is to come by a day agreed on. Each debt
 * belongs to the receipt that made it. Money a customer brings pays their
 * debts in the order they fall due, the oldest first; goods they bring back
 * come off the debt of that receipt before any money is handed back.
 *
 * A debt is always in so'm, as a receipt is.
 */

/** What a sale leaves owing, and by when it is to be paid. */
export const saleDebtSchema = z.object({
  amount: z.number().int().positive('Qarz summasini kiriting').max(Number.MAX_SAFE_INTEGER),
  dueDate: z.iso.date(),
})
export type SaleDebtInput = z.infer<typeof saleDebtSchema>

/**
 * `open`: still owed, and not yet due. `overdue`: owed past its day.
 * `closed`: paid, or taken off by goods brought back. `cancelled`: the
 * receipt that made it was undone.
 */
export const DEBT_STATES = ['open', 'overdue', 'closed', 'cancelled'] as const
export type DebtState = (typeof DEBT_STATES)[number]

/** How a debt stands today. */
export function debtState(debt: { left: number; dueDate: string; cancelled: boolean }, today: string): DebtState {
  if (debt.cancelled) {
    return 'cancelled'
  }
  if (debt.left <= 0) {
    return 'closed'
  }
  return debt.dueDate < today ? 'overdue' : 'open'
}

export interface CustomerDebtDto {
  id: string
  customerId: string
  customerName: string
  customerPhone: string
  saleId: string
  saleNumber: string
  soldAt: string
  locationName: string
  /** What was lent. */
  amount: number
  /** What has come back as money, and what was taken off by goods brought back. */
  paid: number
  returned: number
  /** What is still owed. */
  left: number
  dueDate: string
  state: DebtState
  /** Everything this customer still owes, on this receipt and the others: what a payment from them may come to. */
  customerOwed: number
}

export const debtListQuerySchema = listQuerySchema.extend({
  /** `owed`: everything still owed, due or not. */
  state: z.enum(['owed', 'overdue', 'closed', 'all']).default('owed'),
  customerId: idSchema.optional(),
  locationId: idSchema.optional(),
})
export type DebtListQuery = z.infer<typeof debtListQuerySchema>

/** What stands over the list of debts. */
export interface DebtSummary {
  /** Everything owed, and how many customers owe it. */
  owed: number
  debtors: number
  /** Of that, what is past its day. */
  overdue: number
  overdueDebtors: number
}

/** What a customer owes, for whoever is serving them. */
export interface CustomerDebtBrief {
  owed: number
  overdue: number
  /** The day the oldest of it falls, or fell, due. */
  dueDate: string | null
}

/**
 * Money shared out over debts, the first in the list first: each takes what
 * it is still owed and the rest goes on. What no debt takes is left over.
 */
export function spreadOverDebts(
  debts: { id: string; left: number }[],
  amount: number,
): { parts: { debtId: string; amount: number }[]; rest: number } {
  const parts: { debtId: string; amount: number }[] = []
  let rest = amount
  for (const debt of debts) {
    if (rest <= 0) {
      break
    }
    const taken = Math.min(rest, Math.max(0, debt.left))
    if (taken > 0) {
      parts.push({ debtId: debt.id, amount: taken })
      rest -= taken
    }
  }
  return { parts, rest }
}

/** Why a sale on credit needs someone's word; null when it needs nobody's. */
export type DebtBar = 'barred' | 'overdue' | 'over_limit'

/**
 * What stands in the way of lending a customer more: their group forbids
 * it, they are late with what they owe already, or it would take them over
 * what the shop lends to one customer. The first that applies.
 */
export function debtBar(
  customer: { noDebt: boolean; owed: number; overdue: number },
  amount: number,
  limit: number,
): DebtBar | null {
  if (customer.noDebt) {
    return 'barred'
  }
  if (customer.overdue > 0) {
    return 'overdue'
  }
  return limit > 0 && customer.owed + amount > limit ? 'over_limit' : null
}

// ───────────────────────────── Paying a debt ─────────────────────────────

export const debtPaymentInputSchema = z.object({
  /** Made by the screen for each payment: sent twice, it is still taken once. */
  clientKey: z.uuid(),
  customerId: idSchema,
  /** Where the money goes: a drawer, a card, the safe. Each in its own currency. */
  lines: z
    .array(
      z.object({
        accountId: idSchema,
        amount: z.number().int().positive('Summani kiriting').max(Number.MAX_SAFE_INTEGER),
        /** What dollars are taken for in so'm, when that was agreed and not left to the day's rate. */
        settled: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullish(),
      }),
    )
    .min(1, 'To‘lovni kiriting')
    .max(10),
  /** What the screen showed it comes to in so'm: if the rate has changed since, it is refused. */
  total: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  note: optionalText(200),
})
export type DebtPaymentInput = z.infer<typeof debtPaymentInputSchema>

export const DEBT_PAYMENT_STATUSES = ['posted', 'cancelled'] as const
export type DebtPaymentStatus = (typeof DEBT_PAYMENT_STATUSES)[number]

export interface DebtPaymentDto {
  id: string
  number: string
  status: DebtPaymentStatus
  customerId: string
  customerName: string
  customerPhone: string
  /** In so'm. */
  total: number
  paidAt: string
  paidBy: string
  createdByName: string | null
  note: string | null
  /** `fx`: what the rate gave the business (+) or cost it (−) on the line, in so'm. */
  lines: { accountName: string; currency: AnyCurrency; amount: number; base: number; fx: number }[]
  /** The receipts whose debts it paid, and how much of each. */
  parts: { saleNumber: string; amount: number }[]
  cancelledAt: string | null
  cancelledByName: string | null
  cancelReason: string | null
}

export const debtPaymentListQuerySchema = listQuerySchema.extend({
  status: z.enum(['all', ...DEBT_PAYMENT_STATUSES]).default('all'),
  customerId: idSchema.optional(),
})
export type DebtPaymentListQuery = z.infer<typeof debtPaymentListQuerySchema>

export const debtPaymentCancelSchema = z.object({ reason: optionalText(200) })
