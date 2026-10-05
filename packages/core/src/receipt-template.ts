import { z } from 'zod'

import { optionalText } from './schemas'
import { ruLayoutToEn } from './text'

/**
 * How a business's receipts look on paper: what is printed at the top, what
 * each line says, what stands at the bottom. One template for the business;
 * what a receipt holds (the goods, the sums) is never a matter of design.
 */

/** The printers shops use take paper 80 mm or 58 mm wide. */
export const RECEIPT_WIDTHS = [80, 58] as const
export type ReceiptWidth = (typeof RECEIPT_WIDTHS)[number]

/**
 * A logo is kept with the template, as the picture itself: small, black on
 * white, made ready by the screen that takes it. Nothing larger than a
 * receipt needs is let in.
 */
export const RECEIPT_LOGO_MAX = 200_000
const logoSchema = z
  .string()
  .max(RECEIPT_LOGO_MAX, 'Logotip juda katta')
  .regex(/^(data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*)?$/, "Logotip rasm bo'lishi kerak")
  .nullish()
  .transform((value) => value || null)

export const receiptTemplateSchema = z.object({
  width: z.union([z.literal(80), z.literal(58)]).default(80),
  logo: logoSchema,
  /** How much of the paper's width the logo takes, in percent. */
  logoWidth: z.coerce.number().int().min(20).max(100).default(50),
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
  /** The receipt's number as a barcode at the bottom: scanned at the till, it opens the return. */
  showBarcode: z.boolean().default(true),
})
export type ReceiptTemplate = z.infer<typeof receiptTemplateSchema>

export const DEFAULT_RECEIPT_TEMPLATE: ReceiptTemplate = {
  width: 80,
  logo: null,
  logoWidth: 50,
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
  showBarcode: true,
}

/** How wide the printed column is, in millimetres: the paper less the margins a printer leaves. */
export const receiptColumnMm = (width: ReceiptWidth): number => (width === 58 ? 48 : 72)

/**
 * A receipt's number out of what a scanner read off its barcode. A scanner
 * types what it reads as keys, so the code comes through whichever keyboard
 * layout is on: "СР-000123" for "CH-000123". Null for anything else — a
 * product's barcode, an article.
 */
export function saleNumberOf(code: string): string | null {
  const text = ruLayoutToEn(code.trim()).toUpperCase()
  return /^CH-\d{6,}$/.test(text) ? text : null
}
