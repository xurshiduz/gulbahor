import { z } from 'zod'

import { idSchema, listQuerySchema, optionalText, phoneSchema, requiredText } from './schemas'

/**
 * The people who buy in the shops. A customer is known by their phone
 * number: it is what they say at the till, and no two customers of one
 * business share it. What they have bought is not typed anywhere: it is the
 * sum of their receipts, less what came back.
 */

export const CUSTOMER_GENDERS = ['female', 'male'] as const
export type CustomerGender = (typeof CUSTOMER_GENDERS)[number]

export const CUSTOMER_GENDER_LABELS: Record<CustomerGender, string> = {
  female: 'Ayol',
  male: 'Erkak',
}

export const customerInputSchema = z.object({
  name: requiredText(120),
  phone: phoneSchema,
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
})
export type CustomerInput = z.infer<typeof customerInputSchema>

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
  /** Those whose birthday falls within the next so many days. */
  birthdayIn: z.coerce.number().int().min(0).max(366).optional(),
  groupId: idSchema.optional(),
  tag: z.string().trim().min(1).max(30).optional(),
})
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>

/** A customer as the till needs them: enough to say who is at the counter. */
export interface CustomerBrief {
  id: string
  name: string
  phone: string
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
  priceType: { id: string; name: string } | null
  noDebt: boolean
  noLayaway: boolean
  noExchange: boolean
}

export interface CustomerDto extends CustomerBrief {
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
