import { z } from 'zod'

import { idSchema, listQuerySchema, optionalText } from './schemas'

/**
 * Goods set aside for a customer ("Band qilish"; YOL-XARITA, K1). The goods
 * stay in the shop and in its count — they are only promised: nobody else is
 * sold them, sent them or has them written off while the hold stands. It
 * stands until a day; taken, it becomes an ordinary sale, and let go, the
 * goods are anyone's again.
 *
 * A hold moves no money. What the customer leaves towards it is an ordinary
 * payment onto their balance, and is theirs whatever becomes of the hold.
 */

/** `active` — standing; `taken` — the customer came and it was sold; `released` — let go, the goods free again. */
export const HOLD_STATUSES = ['active', 'taken', 'released'] as const
export type HoldStatus = (typeof HOLD_STATUSES)[number]

export const HOLD_STATUS_LABELS: Record<HoldStatus, string> = {
  active: 'Band',
  taken: 'Sotildi',
  released: 'Bo‘shatildi',
}

/** How many days goods are held for when nobody says otherwise. */
export const HOLD_DAYS = 3

const quantitySchema = z
  .number()
  .positive({ message: 'Miqdor noldan katta bo‘lishi kerak' })
  .max(1_000_000)
  .refine((qty) => Math.abs(qty * 1000 - Math.round(qty * 1000)) < 1e-6, {
    message: 'Miqdorda ko‘pi bilan 3 ta kasr xona bo‘ladi',
  })

export const holdInputSchema = z.object({
  /** Made by the till for each hold: sent twice, it is still made once. */
  clientKey: z.uuid(),
  /** The till it is made at: the goods are set aside in that till's shop. */
  registerId: idSchema,
  /** Whom they are for: goods are never held for nobody. */
  customerId: idSchema,
  /** The price type the cart was at, so that the price said to the customer is the one written down. */
  priceTypeId: idSchema.nullish().transform((value) => value ?? null),
  lines: z
    .array(z.object({ variantId: idSchema, qty: quantitySchema }))
    .min(1, 'Kamida bitta tovar bo‘lishi kerak')
    .max(300),
  /** The last day they are held. */
  dueDate: z.iso.date(),
  note: optionalText(300),
})
export type HoldInput = z.infer<typeof holdInputSchema>

export const holdDueSchema = z.object({ dueDate: z.iso.date() })
export type HoldDueInput = z.infer<typeof holdDueSchema>

/** `overdue` — standing past its day. */
export const HOLD_LIST_STATES = ['active', 'overdue', 'taken', 'released', 'all'] as const
export type HoldListState = (typeof HOLD_LIST_STATES)[number]

export const holdListQuerySchema = listQuerySchema.extend({
  state: z.enum(HOLD_LIST_STATES).default('active'),
  locationId: idSchema.optional(),
  customerId: idSchema.optional(),
})
export type HoldListQuery = z.infer<typeof holdListQuerySchema>

export interface HoldLineDto {
  id: string
  variantId: string
  productId: string
  name: string
  /** The size and colour: "Qora, M". */
  label: string
  sku: string
  qty: number
  /** What one sold for on the day it was set aside, in the base: said for reference — it is sold at the day's price. */
  price: number
}

export interface HoldDto {
  id: string
  number: string
  status: HoldStatus
  locationId: string
  locationName: string
  customerId: string
  customerName: string
  customerPhone: string | null
  dueDate: string
  /** Standing past its day. */
  overdue: boolean
  note: string | null
  priceTypeId: string | null
  /** The goods at the prices of the day they were set aside, in the base. */
  total: number
  qty: number
  lines: HoldLineDto[]
  /** The sale it became. */
  saleId: string | null
  saleNumber: string | null
  createdByName: string | null
  createdAt: string
  closedByName: string | null
  closedAt: string | null
}

/** What wants looking at, whatever the list is filtered by. */
export interface HoldSummary {
  active: number
  overdue: number
}
