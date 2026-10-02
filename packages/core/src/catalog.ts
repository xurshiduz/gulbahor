import { z } from 'zod'

import { CURRENCY_CODES, type CurrencyCode } from './money'
import { idSchema, listQuerySchema, optionalText, requiredText } from './schemas'

/**
 * Goods: a model ("Futbolka Polo") and its variants, one per combination of
 * the model's axes (colour × size by default). Stock, prices and sales always
 * point at a variant; a model with no axes has exactly one.
 */

// ───────────────────────────── Fixed lists ─────────────────────────────

export const GENDERS = ['men', 'women', 'unisex', 'boys', 'girls'] as const
export type Gender = (typeof GENDERS)[number]

export const GENDER_LABELS: Record<Gender, string> = {
  men: 'Erkaklar',
  women: 'Ayollar',
  unisex: 'Uniseks',
  boys: "O'g'il bolalar",
  girls: 'Qiz bolalar',
}

export const SEASONS = ['ss', 'aw', 'all'] as const
export type Season = (typeof SEASONS)[number]

export const SEASON_LABELS: Record<Season, string> = {
  ss: 'Bahor-yoz',
  aw: 'Kuz-qish',
  all: "Yil bo'yi",
}

export const UNITS = ['pcs', 'pair', 'set', 'kg', 'm'] as const
export type Unit = (typeof UNITS)[number]

/** `decimals` is how finely the unit can be divided: pieces not at all, metres to the centimetre. */
export const UNIT_INFO: Record<Unit, { label: string; short: string; decimals: number }> = {
  pcs: { label: 'Dona', short: 'dona', decimals: 0 },
  pair: { label: 'Juft', short: 'juft', decimals: 0 },
  set: { label: 'Komplekt', short: 'kompl', decimals: 0 },
  kg: { label: 'Kilogramm', short: 'kg', decimals: 3 },
  m: { label: 'Metr', short: 'm', decimals: 2 },
}

export const ATTRIBUTE_KINDS = ['color', 'size', 'other'] as const
export type AttributeKind = (typeof ATTRIBUTE_KINDS)[number]

export const ATTRIBUTE_KIND_LABELS: Record<AttributeKind, string> = {
  color: 'Rang',
  size: "O'lcham",
  other: 'Boshqa',
}

export const PRICE_KINDS = ['retail', 'wholesale', 'min', 'other'] as const
export type PriceKind = (typeof PRICE_KINDS)[number]

export const PRICE_KIND_LABELS: Record<PriceKind, string> = {
  retail: 'Chakana',
  wholesale: 'Ulgurji',
  min: 'Minimal',
  other: 'Boshqa',
}

export const MAX_AXES = 3
export const MAX_VARIANTS = 600
export const MAX_BARCODES = 10

/** Countries goods usually come from; anything else can be typed in. */
export const ORIGIN_COUNTRIES = [
  "O'zbekiston",
  'Xitoy',
  'Turkiya',
  'Rossiya',
  'Bangladesh',
  'Hindiston',
  'Pokiston',
  'Vyetnam',
  'Janubiy Koreya',
  'Italiya',
  'Germaniya',
  'Polsha',
  "Qirg'iziston",
  "Qozog'iston",
  'BAA',
]

// ───────────────────────────── Barcodes ─────────────────────────────

/** The 13th digit of an EAN-13, from its first twelve. */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) {
    throw new Error('EAN-13 needs twelve digits before the check digit')
  }
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3)
  }
  return (10 - (sum % 10)) % 10
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12])
}

/**
 * A barcode for goods that came without one. GS1 keeps the prefixes 20–29 for
 * codes used inside a shop, so these never collide with a manufacturer's.
 */
export function internalBarcode(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 9_999_999_999) {
    throw new Error('Barcode sequence out of range')
  }
  const first12 = `20${String(sequence).padStart(10, '0')}`
  return `${first12}${ean13CheckDigit(first12)}`
}

/** What a scanner sends, without the spaces a person may add when typing it. */
export function normalizeBarcode(text: string): string {
  return text.replace(/\s+/g, '')
}

export const barcodeSchema = z
  .string()
  .transform(normalizeBarcode)
  .pipe(
    z
      .string()
      .min(4, { message: 'Shtrix-kod juda qisqa' })
      .max(48)
      .regex(/^[\x21-\x7E]+$/, { message: "Shtrix-kodda faqat lotin harflari, raqam va belgilar bo'ladi" }),
  )

const skuSchema = z
  .string()
  .trim()
  .max(40)
  .nullish()
  .transform((value) => value || null)

/** "Qora, XL": how a variant is named next to its model. */
export function variantLabel(valueNames: readonly string[]): string {
  return valueNames.join(', ')
}

/** Every combination of one value from each list, in order: the variants a model's axes describe. */
export function combinations<T>(lists: readonly (readonly T[])[]): T[][] {
  return lists.reduce<T[][]>((result, list) => result.flatMap((prefix) => list.map((item) => [...prefix, item])), [[]])
}

// ───────────────────────────── Categories ─────────────────────────────

const nullableId = idSchema.nullish().transform((value) => value || null)

const axisIdsSchema = z
  .array(idSchema)
  .max(MAX_AXES, { message: `Ko'pi bilan ${MAX_AXES} ta xususiyat` })
  .refine((ids) => new Set(ids).size === ids.length, { message: 'Xususiyat takrorlangan' })

export const categoryInputSchema = z.object({
  name: requiredText(80),
  parentId: nullableId,
  /** The axes a new model in this category starts with; null takes them from the parent. */
  axisIds: axisIdsSchema.nullish().transform((value) => value ?? null),
})
export type CategoryInput = z.infer<typeof categoryInputSchema>

export interface CategoryDto {
  id: string
  name: string
  parentId: string | null
  axisIds: string[] | null
  isActive: boolean
  productCount: number
}

// ───────────────────────────── Brands ─────────────────────────────

export const brandInputSchema = z.object({ name: requiredText(80) })
export type BrandInput = z.infer<typeof brandInputSchema>

export interface BrandDto {
  id: string
  name: string
  isActive: boolean
  productCount: number
}

// ───────────────────────────── Attributes ─────────────────────────────

export const attributeInputSchema = z.object({
  name: requiredText(60),
  kind: z.enum(ATTRIBUTE_KINDS),
})
export type AttributeInput = z.infer<typeof attributeInputSchema>

export const hexColorSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^#[0-9A-F]{6}$/, { message: 'Rang #RRGGBB shaklida yoziladi' })

export const attributeValueInputSchema = z.object({
  name: requiredText(40),
  hex: hexColorSchema.nullish().transform((value) => value || null),
})
export type AttributeValueInput = z.infer<typeof attributeValueInputSchema>

/** Several values at once: "S, M, L, XL" typed into one field. */
export const attributeValuesBulkSchema = z.object({
  values: z.array(attributeValueInputSchema).min(1).max(100),
})
export type AttributeValuesBulkInput = z.infer<typeof attributeValuesBulkSchema>

export const orderSchema = z.object({ ids: z.array(idSchema).min(1).max(500) })
export type OrderInput = z.infer<typeof orderSchema>

export interface AttributeValueDto {
  id: string
  name: string
  hex: string | null
  isActive: boolean
}

export interface AttributeDto {
  id: string
  name: string
  kind: AttributeKind
  isActive: boolean
  values: AttributeValueDto[]
}

// ───────────────────────────── Price types ─────────────────────────────

export const priceTypeInputSchema = z.object({
  name: requiredText(60),
  kind: z.enum(PRICE_KINDS),
  currency: z.enum(CURRENCY_CODES as [CurrencyCode, ...CurrencyCode[]]),
})
export type PriceTypeInput = z.infer<typeof priceTypeInputSchema>

export interface PriceTypeDto {
  id: string
  name: string
  kind: PriceKind
  currency: CurrencyCode
  isActive: boolean
}

// ───────────────────────────── Products ─────────────────────────────

/** Minor units. The ceiling keeps every sum of prices inside what a double holds exactly. */
const amountSchema = z.number().int().min(0).max(1_000_000_000_000_00)

export const priceInputSchema = z.object({
  priceTypeId: idSchema,
  amount: amountSchema,
  currency: z.enum(CURRENCY_CODES as [CurrencyCode, ...CurrencyCode[]]),
})
export type PriceInput = z.infer<typeof priceInputSchema>

const pricesSchema = z
  .array(priceInputSchema)
  .max(20)
  .refine((prices) => new Set(prices.map((price) => price.priceTypeId)).size === prices.length, {
    message: 'Narx turi takrorlangan',
  })

export const variantInputSchema = z.object({
  /** Present for a variant that already exists. */
  id: nullableId,
  /** One value per axis of the model, in the model's axis order. */
  valueIds: z.array(idSchema).max(MAX_AXES),
  sku: skuSchema,
  barcodes: z
    .array(barcodeSchema)
    .max(MAX_BARCODES, { message: `Ko'pi bilan ${MAX_BARCODES} ta shtrix-kod` })
    .default([]),
  isActive: z.boolean().default(true),
  /** Prices that differ from the model's; a price type left out follows the model. */
  prices: pricesSchema.default([]),
})
export type VariantInput = z.infer<typeof variantInputSchema>

export const productInputSchema = z
  .object({
    name: requiredText(160),
    /** Left empty, the next free number is given. */
    sku: skuSchema,
    categoryId: nullableId,
    brandId: nullableId,
    gender: z
      .enum(GENDERS)
      .nullish()
      .transform((value) => value ?? null),
    season: z
      .enum(SEASONS)
      .nullish()
      .transform((value) => value ?? null),
    collectionYear: z
      .number()
      .int()
      .min(2000)
      .max(2100)
      .nullish()
      .transform((value) => value ?? null),
    material: optionalText(120),
    originCountry: optionalText(60),
    unit: z.enum(UNITS).default('pcs'),
    /** Grams per piece; freight is shared out by weight. */
    weightG: z
      .number()
      .int()
      .min(0)
      .max(1_000_000)
      .nullish()
      .transform((value) => value ?? null),
    /** The tax catalogue code printed on fiscal receipts. */
    mxikCode: z
      .string()
      .trim()
      .regex(/^(\d{17})?$/, { message: 'MXIK kodi 17 ta raqamdan iborat' })
      .nullish()
      .transform((value) => value || null),
    description: optionalText(2000),
    /** The supplier's own code for the model, as written on packing lists. */
    factoryCode: optionalText(60),
    manufacturer: optionalText(120),
    axisIds: axisIdsSchema,
    variants: z
      .array(variantInputSchema)
      .min(1, { message: 'Kamida bitta variant kerak' })
      .max(MAX_VARIANTS, { message: `Bitta modelda ko'pi bilan ${MAX_VARIANTS} ta variant` }),
    prices: pricesSchema.default([]),
  })
  .superRefine((product, context) => {
    const seen = new Map<string, number>()
    product.variants.forEach((variant, index) => {
      if (variant.valueIds.length !== product.axisIds.length) {
        context.addIssue({
          code: 'custom',
          path: ['variants', index, 'valueIds'],
          message: 'Variant modelning xususiyatlariga mos emas',
        })
        return
      }
      const key = variant.valueIds.join('|')
      if (seen.has(key)) {
        context.addIssue({ code: 'custom', path: ['variants', index, 'valueIds'], message: 'Bu variant takrorlangan' })
      }
      seen.set(key, index)
    })

    const codes = new Map<string, number>()
    product.variants.forEach((variant, index) => {
      variant.barcodes.forEach((code, position) => {
        if (codes.has(code)) {
          context.addIssue({
            code: 'custom',
            path: ['variants', index, 'barcodes', position],
            message: 'Bu shtrix-kod boshqa variantda ham yozilgan',
          })
        }
        codes.set(code, index)
      })
    })
  })
export type ProductInput = z.infer<typeof productInputSchema>

export const productListQuerySchema = listQuerySchema.extend({
  status: z.enum(['active', 'archived', 'all']).default('active'),
  categoryId: idSchema.optional(),
  brandId: idSchema.optional(),
  season: z.enum(SEASONS).optional(),
  gender: z.enum(GENDERS).optional(),
})
export type ProductListQuery = z.infer<typeof productListQuerySchema>

export interface PriceDto {
  priceTypeId: string
  amount: number
  currency: CurrencyCode
}

/** One axis of a model as a list shows it: the values its variants actually use. */
export interface AxisSummary {
  attributeId: string
  name: string
  kind: AttributeKind
  values: { id: string; name: string; hex: string | null }[]
}

export interface ProductListItemDto {
  id: string
  sku: string
  name: string
  categoryId: string | null
  categoryName: string | null
  brandId: string | null
  brandName: string | null
  season: Season | null
  collectionYear: number | null
  variantCount: number
  axes: AxisSummary[]
  /** The model's retail price; null when none is set. */
  retailPrice: { amount: number; currency: CurrencyCode } | null
  isActive: boolean
  createdAt: string
}

export interface VariantDto {
  id: string
  valueIds: string[]
  sku: string
  barcodes: string[]
  isActive: boolean
  prices: PriceDto[]
}

export interface ProductDto {
  id: string
  sku: string
  name: string
  categoryId: string | null
  brandId: string | null
  gender: Gender | null
  season: Season | null
  collectionYear: number | null
  material: string | null
  originCountry: string | null
  unit: Unit
  weightG: number | null
  mxikCode: string | null
  description: string | null
  factoryCode: string | null
  manufacturer: string | null
  axisIds: string[]
  variants: VariantDto[]
  prices: PriceDto[]
  isActive: boolean
  createdAt: string
}

export const lookupQuerySchema = z.object({ code: z.string().trim().min(1).max(64) })

/** What a scanned or typed code points at. */
export interface VariantLookupDto {
  productId: string
  variantId: string
  productName: string
  sku: string
  label: string
  /** Set when the code was an RFID tag: that one piece, to be counted once however often it is read. */
  epc?: string | null
}
