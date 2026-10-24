import { z } from 'zod'

import { isValidEan13 } from './catalog'
import { idSchema, requiredText } from './schemas'

// ───────────────────────────── What a label may show ─────────────────────────────

/**
 * What an element of a label shows: a fact of the goods, a sum, a code, the business's logo, or words of its own.
 * `details` is the colour and the size together; `color` and `size` are each alone.
 */
export const LABEL_FIELDS = [
  'name',
  'brand',
  'category',
  'details',
  'color',
  'size',
  'season',
  'gender',
  'country',
  'collection',
  'material',
  'manufacturer',
  'sku',
  'price',
  'barcode',
  'tag',
  'printedAt',
  'text',
  'logo',
] as const
export type LabelField = (typeof LABEL_FIELDS)[number]

/** What a label's goods say of themselves, field by field; a field the goods do not have is left out. */
export type LabelValues = Partial<Record<Exclude<LabelField, 'barcode' | 'logo' | 'text'>, string>> & {
  /** The barcode's own code; the digits under the bars are the printer's. */
  barcode?: string | null
}

export const LABEL_ALIGNS = ['L', 'C', 'R'] as const
export type LabelAlign = (typeof LABEL_ALIGNS)[number]

export const LABEL_BARCODE_TYPES = ['auto', 'ean13', 'code128'] as const
export type LabelBarcodeType = (typeof LABEL_BARCODE_TYPES)[number]

const mm = z.number().min(0).max(300)

export const labelElementSchema = z.object({
  id: z.string().min(1).max(40),
  field: z.enum(LABEL_FIELDS),
  /** The element's box: its top left corner and its size, in millimetres. */
  x: mm,
  y: mm,
  w: z.number().min(1).max(300),
  h: z.number().min(1).max(300),
  /** How tall a line of its text is, in points (1 pt ≈ 0.35 mm). */
  size: z.number().min(4).max(96).default(10),
  bold: z.boolean().default(false),
  underline: z.boolean().default(false),
  align: z.enum(LABEL_ALIGNS).default('L'),
  /** A long text runs onto this many lines, and is cut after them. */
  lines: z.number().int().min(1).max(6).default(1),
  /** Words set before the value: «Бренд:». */
  prefix: z.string().trim().max(30).default(''),
  /** The words of a `text` element. */
  text: z.string().trim().max(120).default(''),
  /** A barcode: its digits under the bars. */
  digits: z.boolean().default(true),
})
export type LabelElement = z.infer<typeof labelElementSchema>

/**
 * A picture for the head: the logo, as the printer takes it — a dot is black or not, a row at a time, packed eight
 * to a byte as hexadecimal. The screen draws `preview`; it is made from the same dots.
 */
export const labelPictureSchema = z.object({
  /** Dots across and down, for a 203 dpi head. */
  width: z.number().int().min(1).max(2400),
  height: z.number().int().min(1).max(2400),
  hex: z
    .string()
    .regex(/^[0-9A-F]*$/)
    .max(600_000),
  preview: z.string().startsWith('data:image/').max(400_000),
  /** The picture as it was given, made small: the dots are drawn again from it when the logo's box is resized. */
  source: z.string().startsWith('data:image/').max(700_000).nullish(),
})
export type LabelPicture = z.infer<typeof labelPictureSchema>

export const labelDesignSchema = z.object({
  id: idSchema,
  name: requiredText(60),
  /** The label's size in millimetres. */
  width: z.number().min(10).max(200),
  height: z.number().min(10).max(200),
  barcode: z.enum(LABEL_BARCODE_TYPES).default('auto'),
  elements: z.array(labelElementSchema).max(40),
  logo: labelPictureSchema.nullish().transform((value) => value ?? null),
})
export type LabelDesign = z.infer<typeof labelDesignSchema>

export const labelDesignsSchema = z.object({
  designs: z.array(labelDesignSchema).max(30),
  /** The design picked when printing, unless another is chosen. */
  defaultId: idSchema.nullish().transform((value) => value ?? null),
})
export type LabelDesigns = z.infer<typeof labelDesignsSchema>

// ───────────────────────────── Laid out in dots ─────────────────────────────

export interface DesignText {
  kind: 'text'
  x: number
  y: number
  width: number
  /** The height of a line, in dots. */
  font: number
  lines: number
  align: LabelAlign
  bold: boolean
  underline: boolean
  text: string
}

export interface DesignBars {
  kind: 'bars'
  x: number
  y: number
  width: number
  height: number
  /** How many dots wide the thinnest bar is. */
  module: number
  code: string
  ean: boolean
  digits: boolean
  /** How tall the digits under the bars are, in dots: the element's own size. */
  digitFont: number
}

export interface DesignPicture {
  kind: 'picture'
  x: number
  y: number
  picture: LabelPicture
}

export interface DesignLayout {
  width: number
  height: number
  items: (DesignText | DesignBars | DesignPicture)[]
}

const clean = (value: string | null | undefined) =>
  String(value ?? '')
    .replace(/[\^~\\]/g, ' ')
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

/** Modules of a Code 128 (set B) symbol: start, one per character, check, stop. */
const code128Modules = (code: string) => 11 * (code.length + 3) + 2

/** Points to dots: a point is 1/72 of an inch, a 203 dpi head has 8 dots to the millimetre. */
const pointsToDots = (points: number, dotsPerMm: number) => Math.max(8, Math.round(points * 0.3528 * dotsPerMm))

/** The words an element puts on the label for these goods; empty: nothing to show. */
export function elementText(element: LabelElement, values: LabelValues): string {
  if (element.field === 'text') {
    return clean(element.text)
  }
  if (element.field === 'barcode' || element.field === 'logo') {
    return ''
  }
  const value = clean(values[element.field])
  return value ? clean(`${element.prefix ? `${element.prefix} ` : ''}${value}`) : ''
}

/**
 * Where everything of a design goes for these goods, in the dots of a head of `dpi`. The screen draws this and the
 * printer is told this: what is seen is what comes out.
 */
export function layoutDesign(design: LabelDesign, values: LabelValues, dpi: 203 | 300 = 203): DesignLayout {
  const dotsPerMm = dpi === 300 ? 12 : 8
  const dots = (millimetres: number) => Math.round(millimetres * dotsPerMm)
  const items: DesignLayout['items'] = []
  for (const element of design.elements) {
    const x = dots(element.x)
    const y = dots(element.y)
    const width = dots(element.w)
    const height = dots(element.h)
    if (element.field === 'logo') {
      if (design.logo) {
        items.push({ kind: 'picture', x, y, picture: design.logo })
      }
      continue
    }
    if (element.field === 'barcode') {
      const code = clean(values.barcode)
      if (!code || !/^[\x20-\x7e]+$/.test(code)) {
        continue
      }
      const ean = design.barcode !== 'code128' && isValidEan13(code)
      const modules = ean ? 95 : code128Modules(code)
      // The widest bars that fit the box; a code too long for it is not drawn rather than cut.
      const module = [4, 3, 2, 1].find((candidate) => modules * candidate <= width)
      if (!module) {
        continue
      }
      const digitFont = pointsToDots(element.size, dotsPerMm)
      // The digits take their own height and a little air above them; the bars get the rest.
      const digitRoom = element.digits ? digitFont + Math.round(dotsPerMm / 2) : 0
      items.push({
        kind: 'bars',
        x: x + Math.max(0, Math.floor((width - modules * module) / 2)),
        y,
        width: modules * module,
        height: Math.max(8, height - digitRoom),
        module,
        code: ean ? code.slice(0, 12) : code,
        ean,
        digits: element.digits,
        digitFont,
      })
      continue
    }
    const text = elementText(element, values)
    if (!text) {
      continue
    }
    const font = pointsToDots(element.size, dotsPerMm)
    items.push({
      kind: 'text',
      x,
      y,
      width,
      font,
      lines: Math.max(1, Math.min(element.lines, Math.floor(height / font) || 1)),
      align: element.align,
      bold: element.bold,
      underline: element.underline,
      text,
    })
  }
  return { width: dots(design.width), height: dots(design.height), items }
}

/** The commands for one label of a design; `epc` writes the chip, `copies` prints it again. */
export function buildDesignZpl(
  design: LabelDesign,
  values: LabelValues,
  options: { dpi?: 203 | 300; epc?: string | null; copies?: number } = {},
): string {
  const layout = layoutDesign(design, values, options.dpi ?? 203)
  const lines = ['^XA', '^CI28', `^PW${layout.width}`, `^LL${layout.height}`, '^LH0,0']
  if (options.epc) {
    lines.push('^RS8,,,2', `^RFW,H^FD${options.epc}^FS`)
  }
  for (const item of layout.items) {
    if (item.kind === 'text') {
      const field = `^A0N,${item.font},${item.font}^FB${item.width},${item.lines},0,${item.align},0^FD${item.text}^FS`
      lines.push(`^FO${item.x},${item.y}${field}`)
      // The printer's font has no bold of its own: the same words once more, a dot across.
      if (item.bold) {
        lines.push(`^FO${item.x + 1},${item.y}${field}`)
      }
      if (item.underline) {
        lines.push(`^FO${item.x},${item.y + item.font}^GB${item.width},2,2^FS`)
      }
    } else if (item.kind === 'bars') {
      const digits = item.digits ? 'Y' : 'N'
      // The digits under the bars are written in the printer's default font: set to the size asked for.
      if (item.digits) {
        lines.push(`^CF0,${item.digitFont}`)
      }
      // EAN-13: the printer sets the first digit left of the bars, in their quiet zone.
      lines.push(
        item.ean
          ? `^FO${item.x + 11 * item.module},${item.y}^BY${item.module}^BEN,${item.height},${digits},N^FD${item.code}^FS`
          : `^FO${item.x},${item.y}^BY${item.module}^BCN,${item.height},${digits},N,N^FD${item.code}^FS`,
      )
    } else {
      const { width, height, hex } = item.picture
      const bytes = Math.ceil(width / 8)
      lines.push(`^FO${item.x},${item.y}^GFA,${bytes * height},${bytes * height},${bytes},${hex}^FS`)
    }
  }
  lines.push(`^PQ${options.epc ? 1 : Math.max(1, Math.floor(options.copies ?? 1))}`, '^XZ')
  return lines.join('\n')
}

/** What the designer shows in place of real goods. */
export const SAMPLE_LABEL_VALUES: LabelValues = {
  name: 'kardigan kalta',
  brand: 'max mara',
  category: 'Kardiganlar',
  details: 'karichniviy · 44',
  color: 'karichniviy',
  size: '44',
  season: 'qish',
  gender: 'Ayollar',
  country: 'china',
  collection: '2026',
  material: '100% paxta',
  manufacturer: 'Elaris',
  sku: '56163',
  price: '125 000',
  barcode: '2000000457932',
  tag: '#000123',
  printedAt: '23.10.2026',
}

/**
 * The shop's own label, as Gulbahor prints it: the logo top left with brand, size and season under it and the price,
 * the article, name, country and colour on the right over the barcode. A start to change, not a rule.
 */
export function starterDesign(id: string, name: string, width = 58, height = 40): LabelDesign {
  const element = (field: LabelField, x: number, y: number, w: number, h: number, more: Partial<LabelElement> = {}) =>
    labelElementSchema.parse({ id: `${field}-${x}-${y}`, field, x, y, w, h, ...more })
  return {
    id,
    name,
    width,
    height,
    barcode: 'auto',
    logo: null,
    elements: [
      element('logo', 2, 1.5, 24, 12),
      element('brand', 2, 14, 25, 3.5, { size: 7, prefix: 'Бренд:' }),
      element('size', 2, 18, 25, 3.5, { size: 7, prefix: 'Размер:' }),
      element('season', 2, 22, 25, 3.5, { size: 7, prefix: 'Сезон:' }),
      element('price', 2, 27, 25, 10, { size: 11, bold: true, lines: 2, align: 'C' }),
      element('sku', 29, 2, 27, 4.5, { size: 10, bold: true, align: 'R' }),
      element('name', 29, 6.5, 27, 7, { size: 8, lines: 2, align: 'R' }),
      element('country', 29, 14, 27, 3.5, { size: 8, align: 'R' }),
      element('color', 29, 18, 27, 3.5, { size: 8, align: 'R' }),
      element('barcode', 28, 23, 28, 15, { digits: true }),
    ],
  }
}
