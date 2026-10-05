import { z } from 'zod'

import { optionalText } from './schemas'

/**
 * How a business's receipts look on paper: what is printed at the top, what
 * each line says, what stands at the bottom. One template for the business;
 * what a receipt holds (the goods, the sums) is never a matter of design.
 */

/** The printers shops use take paper 80 mm or 58 mm wide. */
export const RECEIPT_WIDTHS = [80, 58] as const
export type ReceiptWidth = (typeof RECEIPT_WIDTHS)[number]

export const receiptTemplateSchema = z.object({
  width: z.union([z.literal(80), z.literal(58)]).default(80),
  /** What stands at the very top; empty for the business's own name. */
  title: optionalText(60),
  /** The shop's name under it, and its address and phone. */
  showShop: z.boolean().default(true),
  showAddress: z.boolean().default(true),
  showCashier: z.boolean().default(true),
  showSeller: z.boolean().default(true),
  showCustomer: z.boolean().default(true),
  /** The article beside each thing's name. */
  showSku: z.boolean().default(false),
  /** What came off each line, under it. */
  showLineDiscount: z.boolean().default(true),
  /** "You saved so much" under the total, when anything came off. */
  showSavings: z.boolean().default(true),
  /** A few lines at the bottom: thanks, how long goods are taken back for. */
  footer: optionalText(400),
  /** Where to find the shop: "Instagram: @gulbahor". */
  socials: optionalText(200),
})
export type ReceiptTemplate = z.infer<typeof receiptTemplateSchema>

export const DEFAULT_RECEIPT_TEMPLATE: ReceiptTemplate = {
  width: 80,
  title: null,
  showShop: true,
  showAddress: true,
  showCashier: true,
  showSeller: true,
  showCustomer: true,
  showSku: false,
  showLineDiscount: true,
  showSavings: true,
  footer: 'Xaridingiz uchun rahmat!',
  socials: null,
}

/** How wide the printed column is, in millimetres: the paper less the margins a printer leaves. */
export const receiptColumnMm = (width: ReceiptWidth): number => (width === 58 ? 48 : 72)
