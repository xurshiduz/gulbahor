import { z } from 'zod'

import type { CurrencyCode } from './money'
import { idSchema, listQuerySchema, optionalText, requiredText } from './schemas'

/**
 * Money that leaves the business or comes into it otherwise than by selling
 * goods or settling with a partner: rent, wages, lunch, a delivery paid for
 * out of the drawer; or the other way, something earned on the side.
 *
 * Each is one document with a kind of its own (what the money was for) and a
 * line for each sum that went out of, or into, one of the business's
 * accounts, in that account's currency. It is never edited: a wrong one is
 * cancelled, which puts the money back and keeps both in the books.
 */

export const MONEY_OP_KINDS = ['expense', 'income'] as const
export type MoneyOpKind = (typeof MONEY_OP_KINDS)[number]

export const MONEY_OP_KIND_LABELS: Record<MoneyOpKind, string> = {
  expense: 'Xarajat',
  income: 'Boshqa kirim',
}

// ───────────────────────────── What the money was for ─────────────────────────────

export interface MoneyCategoryDto {
  id: string
  kind: MoneyOpKind
  name: string
  /**
   * Counts towards profit. Money the owner takes out, or puts in, is neither
   * spent nor earned: it is kept apart from both.
   */
  inProfit: boolean
  isActive: boolean
}

export const moneyCategoryInputSchema = z.object({
  kind: z.enum(MONEY_OP_KINDS),
  name: requiredText(80),
  inProfit: z.boolean().default(true),
})
export type MoneyCategoryInput = z.infer<typeof moneyCategoryInputSchema>

/** What a business starts with; all of it can be renamed or archived. */
export const STARTER_MONEY_CATEGORIES: { kind: MoneyOpKind; name: string; inProfit: boolean }[] = [
  { kind: 'expense', name: 'Ijara', inProfit: true },
  { kind: 'expense', name: 'Ish haqi', inProfit: true },
  { kind: 'expense', name: 'Oshxona', inProfit: true },
  { kind: 'expense', name: 'Yuk haqi', inProfit: true },
  { kind: 'expense', name: 'Kommunal to‘lovlar', inProfit: true },
  { kind: 'expense', name: 'Tozalik', inProfit: true },
  { kind: 'expense', name: 'Reklama', inProfit: true },
  { kind: 'expense', name: 'Soliq va yig‘imlar', inProfit: true },
  { kind: 'expense', name: 'Bank komissiyasi', inProfit: true },
  { kind: 'expense', name: 'Boshqa xarajat', inProfit: true },
  { kind: 'expense', name: 'Egasi oldi', inProfit: false },
  { kind: 'income', name: 'Boshqa daromad', inProfit: true },
  { kind: 'income', name: 'Egasi qo‘shdi', inProfit: false },
]

// ───────────────────────────── The documents ─────────────────────────────

export const MONEY_OP_STATUSES = ['posted', 'cancelled'] as const
export type MoneyOpStatus = (typeof MONEY_OP_STATUSES)[number]

export const MONEY_OP_STATUS_LABELS: Record<MoneyOpStatus, string> = {
  posted: 'O‘tkazilgan',
  cancelled: 'Bekor qilingan',
}

const moneySchema = z.number().int().min(0).max(1_000_000_000_000_00)
const positive = moneySchema.refine((value) => value > 0, { message: 'Summani kiriting' })

export const moneyOpLineSchema = z.object({
  /** The till's drawer, the safe, the card or the bank account the money came out of, or went into. */
  accountId: idSchema,
  /** In that account's currency. */
  amount: positive,
  /** What dollars are counted as in so'm, when that was agreed and not left to the day's rate. */
  settled: positive.nullish().transform((value) => value ?? null),
})
export type MoneyOpLineInput = z.infer<typeof moneyOpLineSchema>

export const moneyOpInputSchema = z.object({
  /** Made by the screen for each document: sent twice, it is still made once. */
  clientKey: z.uuid(),
  kind: z.enum(MONEY_OP_KINDS),
  categoryId: idSchema,
  lines: z.array(moneyOpLineSchema).min(1, 'Summani kiriting').max(10),
  /** What the screen showed it comes to in so'm: if the rate has changed since, it is refused. */
  total: moneySchema,
  note: optionalText(300),
})
export type MoneyOpInput = z.infer<typeof moneyOpInputSchema>

export const moneyOpCancelSchema = z.object({ reason: requiredText(200) })

export const moneyOpListQuerySchema = listQuerySchema.extend({
  status: z.enum(['all', ...MONEY_OP_STATUSES]).default('all'),
  kind: z.enum(MONEY_OP_KINDS).optional(),
  categoryId: idSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})
export type MoneyOpListQuery = z.infer<typeof moneyOpListQuerySchema>

export interface MoneyOpLineDto {
  accountId: string
  accountName: string
  currency: CurrencyCode
  amount: number
  /** So'm for a dollar; null for a line in so'm. */
  rate: number | null
  /** The line's worth in so'm. */
  base: number
  /** What the rate gave the business (+) or cost it (−) on this line, in so'm. */
  fx: number
}

export interface MoneyOpDto {
  id: string
  number: string
  kind: MoneyOpKind
  status: MoneyOpStatus
  categoryId: string
  categoryName: string
  inProfit: boolean
  /** What it comes to, in so'm. */
  total: number
  doneAt: string
  createdByName: string | null
  note: string | null
  cancelledAt: string | null
  cancelledByName: string | null
  cancelReason: string | null
  /** Where the money came from, or went, in words: "Kassa 1, Humo". */
  paidBy: string
  lines: MoneyOpLineDto[]
}

/** What a list of them comes to, by kind, in so'm: only those that stand. */
export interface MoneyOpSums {
  expense: number
  income: number
}
