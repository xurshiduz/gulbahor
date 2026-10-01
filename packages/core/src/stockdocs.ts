import { z } from 'zod'

import { idSchema, listQuerySchema, optionalText } from './schemas'
import type { ReceiptProductDto } from './purchasing'

/**
 * The documents that move goods that are already in stock: a transfer from
 * one place to another, a write-off, a count. Each is a draft until it is
 * carried out, and none is edited afterwards.
 */

export const STOCK_DOC_KINDS = ['transfer', 'writeoff', 'count'] as const
export type StockDocKind = (typeof STOCK_DOC_KINDS)[number]

export const STOCK_DOC_KIND_LABELS: Record<StockDocKind, string> = {
  transfer: "Ko'chirish",
  writeoff: 'Hisobdan chiqarish',
  count: 'Inventarizatsiya',
}

/** `sent` exists only for transfers: the goods have left one place and not yet reached the other. */
export const STOCK_DOC_STATUSES = ['draft', 'sent', 'posted', 'cancelled'] as const
export type StockDocStatus = (typeof STOCK_DOC_STATUSES)[number]

export const STOCK_DOC_STATUS_LABELS: Record<StockDocStatus, string> = {
  draft: 'Qoralama',
  sent: "Yo'lda",
  posted: "O'tkazilgan",
  cancelled: 'Bekor qilingan',
}

export const WRITEOFF_REASONS = ['defect', 'loss', 'theft', 'sample', 'other'] as const
export type WriteoffReason = (typeof WRITEOFF_REASONS)[number]

export const WRITEOFF_REASON_LABELS: Record<WriteoffReason, string> = {
  defect: 'Brak',
  loss: "Yo'qolgan",
  theft: "O'g'irlik",
  sample: "Namuna yoki sovg'a",
  other: 'Boshqa sabab',
}

/** The permission a kind's documents are guarded by: "transfers.view", "writeoffs.post", and so on. */
export const STOCK_DOC_PERMISSION: Record<StockDocKind, string> = {
  transfer: 'transfers',
  writeoff: 'writeoffs',
  count: 'counts',
}

const quantity = z
  .number()
  .min(0)
  .max(1_000_000)
  .refine((qty) => Math.abs(qty * 1000 - Math.round(qty * 1000)) < 1e-6, {
    message: "Miqdorda ko'pi bilan 3 ta kasr xona bo'ladi",
  })

export const stockDocLineInputSchema = z.object({
  variantId: idSchema,
  /** Sent, written off, or counted. Only a count may say zero: "looked, found none". */
  qty: quantity,
})
export type StockDocLineInput = z.infer<typeof stockDocLineInputSchema>

export const stockDocInputSchema = z
  .object({
    kind: z.enum(STOCK_DOC_KINDS),
    /** Where the goods are: the place a transfer leaves from. */
    locationId: idSchema,
    /** Where a transfer goes. */
    toLocationId: idSchema.nullish().transform((value) => value || null),
    docDate: z.iso.date(),
    reason: z
      .enum(WRITEOFF_REASONS)
      .nullish()
      .transform((value) => value ?? null),
    /** A full count: whatever is on hand and was not counted is taken as missing. */
    fullCount: z.boolean().default(false),
    note: optionalText(500),
    lines: z.array(stockDocLineInputSchema).max(5000),
  })
  .superRefine((doc, context) => {
    if (doc.kind === 'transfer') {
      if (!doc.toLocationId) {
        context.addIssue({ code: 'custom', path: ['toLocationId'], message: "Qayerga ko'chirilishini tanlang" })
      } else if (doc.toLocationId === doc.locationId) {
        context.addIssue({ code: 'custom', path: ['toLocationId'], message: 'Boshqa joyni tanlang' })
      }
    }
    if (doc.kind === 'writeoff' && !doc.reason) {
      context.addIssue({ code: 'custom', path: ['reason'], message: 'Sababni tanlang' })
    }
    const seen = new Set<string>()
    doc.lines.forEach((line, index) => {
      if (seen.has(line.variantId)) {
        context.addIssue({ code: 'custom', path: ['lines', index, 'variantId'], message: 'Bu tovar takrorlangan' })
      }
      seen.add(line.variantId)
      if (doc.kind !== 'count' && !(line.qty > 0)) {
        context.addIssue({
          code: 'custom',
          path: ['lines', index, 'qty'],
          message: "Miqdor noldan katta bo'lishi kerak",
        })
      }
    })
  })
export type StockDocInput = z.infer<typeof stockDocInputSchema>

/** What actually arrived, line by line; a line left out arrived in full. */
export const stockDocReceiveSchema = z.object({
  lines: z
    .array(z.object({ lineId: idSchema, receivedQty: quantity }))
    .max(5000)
    .default([]),
})
export type StockDocReceiveInput = z.infer<typeof stockDocReceiveSchema>

export const stockDocListQuerySchema = listQuerySchema.extend({
  kind: z.enum(STOCK_DOC_KINDS),
  status: z.enum([...STOCK_DOC_STATUSES, 'all']).default('all'),
  locationId: idSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})
export type StockDocListQuery = z.infer<typeof stockDocListQuerySchema>

export interface StockDocListItemDto {
  id: string
  kind: StockDocKind
  number: string
  status: StockDocStatus
  docDate: string
  locationName: string
  toLocationName: string | null
  reason: WriteoffReason | null
  /** Sent, written off or counted. */
  qty: number
  /** A transfer: how many did not arrive. A count: what was found against what should be there, signed. */
  diffQty: number | null
  /** Value moved, written off or adjusted; null for those who may not see cost. */
  costUzs: number | null
  createdByName: string | null
  createdAt: string
}

export interface StockDocLineDto {
  id: string
  variantId: string
  productId: string
  qty: number
  /** Transfers: what arrived. */
  receivedQty: number | null
  /** Counts: what the books said when the count was posted. */
  expectedQty: number | null
  costUzs: number | null
}

export interface StockDocDto {
  id: string
  kind: StockDocKind
  number: string
  status: StockDocStatus
  locationId: string
  locationName: string
  toLocationId: string | null
  toLocationName: string | null
  docDate: string
  reason: WriteoffReason | null
  fullCount: boolean
  note: string | null
  lines: StockDocLineDto[]
  products: ReceiptProductDto[]
  /** On hand at the document's place right now, by variant, for the models on it. */
  onHand: Record<string, number>
  qty: number
  diffQty: number | null
  costUzs: number | null
  createdByName: string | null
  createdAt: string
  postedAt: string | null
  postedByName: string | null
}
