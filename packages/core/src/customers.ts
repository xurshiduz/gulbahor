import { z } from 'zod'

import type { AccountAge } from './debts'
import { ALL_CURRENCY_CODES, type AnyCurrency } from './money'
import { idSchema, listQuerySchema, optionalPhoneSchema, optionalText, requiredText } from './schemas'

/**
 * The people the business deals with: who buys in the shops, who buys in
 * bulk, who supplies the goods — one book (KEYINGI-REJA, 16). Only the name is
 * required; a phone, when there is one, is theirs alone in the business. What
 * they have bought is not typed anywhere: it is the sum of their receipts,
 * less what came back.
 */

export const CUSTOMER_GENDERS = ['female', 'male'] as const
export type CustomerGender = (typeof CUSTOMER_GENDERS)[number]

export const CUSTOMER_GENDER_LABELS: Record<CustomerGender, string> = {
  female: 'Ayol',
  male: 'Erkak',
}

/**
 * How the till may lend to them: as the business does for anyone (`default`), never (`none`), up to their own
 * ceiling (`limit`), or without one (`unlimited`).
 */
export const CREDIT_MODES = ['default', 'none', 'limit', 'unlimited'] as const
export type CreditMode = (typeof CREDIT_MODES)[number]

/**
 * What a customer is allowed on credit and how long they are given: set by who may adjust accounts, and sent only
 * by them — a form without it leaves the terms as they are.
 */
export const customerTermsSchema = z
  .object({
    credit: z.enum(CREDIT_MODES).default('default'),
    /** Their own ceiling, in the base: what the till lends them without a word. */
    creditLimit: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .nullish()
      .transform((value) => value ?? null),
    /** The days a debt of theirs is given; null for the business's own. */
    dueDays: z
      .number()
      .int()
      .min(1)
      .max(3650)
      .nullish()
      .transform((value) => value ?? null),
    /** Their debts are given no day at all. */
    noDue: z.boolean().default(false),
    /** The days within which they may bring goods back; null for the business's own. */
    returnDays: z
      .number()
      .int()
      .min(0)
      .max(3650)
      .nullish()
      .transform((value) => value ?? null),
  })
  .superRefine((terms, context) => {
    if (terms.credit === 'limit' && terms.creditLimit === null) {
      context.addIssue({ code: 'custom', path: ['creditLimit'], message: 'Chegarani kiriting' })
    }
    if (terms.noDue && terms.dueDays !== null) {
      context.addIssue({ code: 'custom', path: ['dueDays'], message: 'Muddatsiz qarzga kun yozilmaydi' })
    }
  })
  .transform((terms) => ({ ...terms, creditLimit: terms.credit === 'limit' ? terms.creditLimit : null }))
export type CustomerTerms = z.infer<typeof customerTermsSchema>

export const DEFAULT_CUSTOMER_TERMS: CustomerTerms = {
  credit: 'default',
  creditLimit: null,
  dueDays: null,
  noDue: false,
  returnDays: null,
}

export const customerInputSchema = z.object({
  name: requiredText(120),
  /** Optional; an Uzbek number only — a foreign one is written in the note. */
  phone: optionalPhoneSchema,
  birthday: z.iso
    .date()
    .nullish()
    .transform((value) => value ?? null),
  gender: z
    .enum(CUSTOMER_GENDERS)
    .nullish()
    .transform((value) => value ?? null),
  note: optionalText(300),
  /** The groups they belong to: a group gives rules (a price, a reminder at the till, what is not done for them). */
  groupIds: z.array(idSchema).max(20).default([]),
  /** Marks for finding and for mailings; they give no rules. */
  tags: z
    .array(z.string().trim().min(1).max(30))
    .max(20)
    .default([])
    .transform((tags) => [...new Set(tags)]),
  /** The currency their dealings are usually in: what every window picks for them first. The base when not said. */
  currency: z.enum(ALL_CURRENCY_CODES as [AnyCurrency, ...AnyCurrency[]]).optional(),
  /** The price they buy at, when it is not the retail one: the till takes it with them. */
  priceTypeId: idSchema.nullish().transform((value) => value ?? null),
  /** They supply goods: the cashier sees none of their sums, and selling to their account needs a word. */
  isSupplier: z.boolean().default(false),
  terms: customerTermsSchema.optional(),
})
export type CustomerInput = z.infer<typeof customerInputSchema>

/** A percentage with at most two places after the point. */
const percentSchema = z
  .number()
  .min(0)
  .max(100)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: 'Foizda ko‘pi bilan 2 ta kasr xona bo‘ladi',
  })

// ───────────────────────────── Loyalty ─────────────────────────────

/**
 * A step of the loyalty programme: who has bought for `from` or more gets
 * `percent` off. What a customer has bought is the sum of their receipts,
 * less what came back; the highest step they have reached is theirs.
 */
export interface LoyaltyTier {
  /** In so'm tiyin. */
  from: number
  percent: number
}

export const loyaltyInputSchema = z.object({
  tiers: z
    .array(
      z.object({
        from: z.number().int().min(0).max(1_000_000_000_000_00),
        percent: percentSchema.refine((value) => value > 0, { message: 'Foizni kiriting' }),
      }),
    )
    .max(20)
    .superRefine((tiers, context) => {
      const sums = new Set<number>()
      tiers.forEach((tier, index) => {
        if (sums.has(tier.from)) {
          context.addIssue({ code: 'custom', path: [index, 'from'], message: 'Bunday summa bor' })
        }
        sums.add(tier.from)
      })
    }),
})
export type LoyaltyInput = z.infer<typeof loyaltyInputSchema>

/** The percentage someone who has bought for `purchases` has earned; 0 below the first step. */
export function tierPercent(tiers: readonly LoyaltyTier[], purchases: number): number {
  return tiers.reduce((best, tier) => (purchases >= tier.from && tier.percent > best ? tier.percent : best), 0)
}

// ───────────────────────────── Groups ─────────────────────────────

/**
 * A group gives its members rules. The till applies them by itself when one
 * of them is picked: their price type prices the cart, the reminder is shown
 * to the cashier, and what is not done for them is refused, not merely
 * written down for the cashier to remember.
 */
export const customerGroupInputSchema = z.object({
  name: requiredText(60),
  /** The price type its members buy at; none for the retail price. */
  priceTypeId: idSchema.nullish().transform((value) => value ?? null),
  /** Comes off everything its members buy at the retail price, in percent. */
  discountPercent: percentSchema.default(0),
  /** Shown to the cashier when a member is picked: "Chek berish kerak". */
  reminder: optionalText(200),
  /** Nothing is sold to them on credit. */
  noDebt: z.boolean().default(false),
  /** Nothing is put aside for them. */
  noLayaway: z.boolean().default(false),
  /** What they bought is not exchanged for something else. */
  noExchange: z.boolean().default(false),
})
export type CustomerGroupInput = z.infer<typeof customerGroupInputSchema>

export interface CustomerGroupDto {
  id: string
  name: string
  discountPercent: number
  priceTypeId: string | null
  priceTypeName: string | null
  reminder: string | null
  noDebt: boolean
  noLayaway: boolean
  noExchange: boolean
  isActive: boolean
  /** How many customers on the books are in it. */
  members: number
}

export const customerListQuerySchema = listQuerySchema.extend({
  status: z.enum(['active', 'archived', 'all']).default('active'),
  /** Only those who supply goods, or only those who do not. */
  supplier: z.enum(['yes', 'no']).optional(),
  /** `owes`: who owes the business in some currency; `owed`: whom the business owes. */
  balance: z.enum(['owes', 'owed']).optional(),
  /** Those whose birthday falls within the next so many days. */
  birthdayIn: z.coerce.number().int().min(0).max(366).optional(),
  groupId: idSchema.optional(),
  tag: z.string().trim().min(1).max(30).optional(),
})
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>

/**
 * One of a customer's accounts: what they owe in its currency (negative when the business owes them), and how
 * that stands against the days it falls due.
 */
export interface CustomerBalance extends AccountAge {
  currency: AnyCurrency
  balance: number
}

/** A customer as a picker shows them, among others of the same name: enough to tell two Azizes apart. */
export interface CustomerBriefDto {
  id: string
  name: string
  currency: AnyCurrency
  isSupplier: boolean
  isActive: boolean
  /** The last four digits of the phone; the whole number is not shown to whoever picks. */
  phoneTail: string | null
  tags: string[]
  /** The start of the note. */
  note: string | null
  /** When goods last came from them. */
  lastReceiptOn: string | null
}

export const customerBriefQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  /** Those who supply goods first, the rest after them. */
  supplier: z.enum(['first']).optional(),
  /** Those to show however the search goes, comma-separated: the ones already picked. */
  ids: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').filter(Boolean).slice(0, 50) : []))
    .pipe(z.array(idSchema)),
})
export type CustomerBriefQuery = z.infer<typeof customerBriefQuerySchema>

/** Written down where a name is all there is: a receipt's supplier typed in. */
export const customerQuickSchema = z.object({ name: requiredText(120), isSupplier: z.boolean().default(false) })
export type CustomerQuickInput = z.infer<typeof customerQuickSchema>

/** A customer as the till needs them: enough to say who is at the counter. */
export interface CustomerBrief {
  id: string
  name: string
  phone: string | null
}

/**
 * What the till is told about the customer it picked: the rules their groups
 * give, already put together. Several reminders are all shown; of several
 * price types the first group's stands; what any one group forbids is
 * forbidden.
 */
export interface PosCustomerDto extends CustomerBrief {
  groups: string[]
  reminders: string[]
  /**
   * What comes off everything they buy at the retail price, in percent, and where it comes from: the most
   * their groups give, or their loyalty tier, whichever is more. 0 when neither gives anything.
   */
  discountPercent: number
  discountReason: string | null
  priceType: { id: string; name: string } | null
  /** Whose the price is: their own, or their group's. */
  priceFrom: 'own' | 'group' | null
  /** Their main currency: what is put on their account is in it unless said. */
  currency: AnyCurrency
  /** They supply goods: the till shows none of their sums. */
  supplier: boolean
  noDebt: boolean
  noLayaway: boolean
  noExchange: boolean
  /**
   * Their accounts, one to a currency, with what is past its day: what the till weighs before lending them more.
   * Null for a supplier, unless this person may see suppliers' accounts.
   */
  accounts: CustomerBalance[] | null
  /** How the till may lend to them, as set on their card. */
  credit: CreditMode
  /** Their own ceiling, in the base, for `limit`. */
  creditLimit: number | null
  /** The days a debt of theirs is given (null: the business's), or none at all. */
  dueDays: number | null
  noDue: boolean
}

export interface CustomerDto extends CustomerBrief {
  currency: AnyCurrency
  /** Their own price; null for the retail one. */
  priceType: { id: string; name: string } | null
  isSupplier: boolean
  terms: CustomerTerms
  groups: { id: string; name: string }[]
  tags: string[]
  birthday: string | null
  gender: CustomerGender | null
  note: string | null
  /** The shop where they were first written down. */
  locationId: string | null
  locationName: string | null
  isActive: boolean
  createdAt: string
  /** Receipts made out to them that stand, what those came to less what came back, and when the last was. */
  salesCount: number
  purchases: number
  lastSaleAt: string | null
  /** What their groups or their loyalty tier take off for them, in percent. */
  discountPercent: number
  /** Their accounts, one to a currency; null for a person who may not see them. */
  balances: CustomerBalance[] | null
}

/** What stands over the list: the whole base at a glance. */
export interface CustomerSummary {
  total: number
  /** Written down in the last seven days. */
  newThisWeek: number
  /** Bought before, but not in the last ninety days. */
  lapsed: number
  /** Their birthday is within the next seven days. */
  birthdaysSoon: number
}

export const posCustomerSearchSchema = z.object({ q: z.string().trim().min(1).max(60) })

/** A customer written down at the till: the till says which shop that was. */
export const posCustomerInputSchema = customerInputSchema.extend({ registerId: z.uuid() })

/** Days from `today` to the next time a birthday comes round; 0 on the day itself. Both as `YYYY-MM-DD`. */
export function daysToBirthday(birthday: string, today: string): number {
  const [year, month, day] = today.split('-').map(Number)
  const [, bornMonth, bornDay] = birthday.split('-').map(Number)
  const from = Date.UTC(year, month - 1, day)
  // Born on 29 February: in a year without one the day is kept on 1 March.
  const at = (inYear: number) => Date.UTC(inYear, bornMonth - 1, bornDay)
  const next = at(year) >= from ? at(year) : at(year + 1)
  return Math.round((next - from) / 86_400_000)
}
