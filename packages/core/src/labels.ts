import { z } from 'zod'

import { APP_NAME } from './app'
import { code128Width } from './barcode'
import { isValidEan13 } from './catalog'
import { idSchema, listQuerySchema, requiredText } from './schemas'

/**
 * Labels and the RFID tags in them. A label printer that understands ZPL
 * (Chainway CP30, Zebra ZD621R) prints the label and writes the tag's code
 * in one pass, so a label is one block of commands with both in it.
 *
 * The server may be far from the shop, on a domain, where it cannot reach a
 * printer on the shop's network. So it only prepares the commands; a small
 * program in the shop, the agent, fetches them and hands them to the printer.
 */

// ───────────────────────────── EPC ─────────────────────────────

/** A tag's code is 96 bits: 24 hex digits. */
export const EPC_LENGTH = 24

/**
 * Our own tags start with "GUL" (47 55 4C); the rest is a serial number that
 * never repeats, whichever business it was issued to. No GS1 code starts
 * this way, so a brand's own tag is never mistaken for one of ours.
 */
export const EPC_PREFIX = '47554C'

export function epcOfSerial(serial: bigint | number): string {
  const hex = BigInt(serial).toString(16).toUpperCase()
  const room = EPC_LENGTH - EPC_PREFIX.length
  if (BigInt(serial) <= 0n || hex.length > room) {
    throw new RangeError('EPC serial out of range')
  }
  return EPC_PREFIX + hex.padStart(room, '0')
}

/**
 * Readers give a tag's code in many shapes: lower case, with spaces or
 * dashes, with the PC word (4 hex) in front, with a CRC (4 hex) behind.
 * This brings them all to one: 24 upper-case hex digits. Null when the text
 * is not a tag's code at all — an ordinary barcode, say.
 */
export function normalizeEpc(raw: string): string | null {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s:-]/g, '')
  if (!/^[0-9A-F]+$/.test(value)) {
    return null
  }
  if (value.length === EPC_LENGTH) {
    return value
  }
  if (value.length === EPC_LENGTH + 4) {
    return value.slice(4)
  }
  if (value.length === EPC_LENGTH + 8) {
    return value.slice(4, 4 + EPC_LENGTH)
  }
  return null
}

export const isOwnEpc = (epc: string) => epc.startsWith(EPC_PREFIX)

// ───────────────────────────── Units ─────────────────────────────

/**
 * One tagged piece. It is `ready` from the moment its label is made, `in_stock`
 * once the goods it belongs to are on hand, and `void` when its receipt was
 * cancelled or the label was never used. Selling, moving and losing a piece
 * add their own states later.
 */
export const UNIT_STATUSES = ['ready', 'in_stock', 'sold', 'void'] as const
export type UnitStatus = (typeof UNIT_STATUSES)[number]

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  ready: 'Tayyorlandi',
  in_stock: 'Qoldiqda',
  sold: 'Sotilgan',
  void: 'Bekor qilingan',
}

// ───────────────────────────── The label ─────────────────────────────

export const LABEL_SIZES = {
  '40x30': { width: 40, height: 30 },
  '50x30': { width: 50, height: 30 },
  '54x34': { width: 54, height: 34 },
  '60x40': { width: 60, height: 40 },
  '70x40': { width: 70, height: 40 },
} as const
export type LabelSizeKey = keyof typeof LABEL_SIZES
export const LABEL_SIZE_KEYS = Object.keys(LABEL_SIZES) as [LabelSizeKey, ...LabelSizeKey[]]
/** The shop's own roll: 54 × 34 mm RFID labels (UCODE 9). */
export const DEFAULT_LABEL_SIZE: LabelSizeKey = '54x34'

export const PRINTER_DPIS = [203, 300] as const
export type PrinterDpi = (typeof PRINTER_DPIS)[number]

export interface LabelFormat {
  size: LabelSizeKey
  dpi: PrinterDpi
}

export interface LabelData {
  name: string
  /** "Qora · M" */
  details: string
  sku: string
  barcode: string | null
  /** As it is to be read: "95 000 so'm". */
  price: string | null
  /** Written to the chip. Null for a label without one. */
  epc: string | null
  /** The same label this many times. A tagged label is always one of a kind. */
  copies?: number
}

// ───────────────────────────── The label's template ─────────────────────────────

export const LABEL_TEXT_SIZES = ['small', 'normal', 'large'] as const
export type LabelTextSize = (typeof LABEL_TEXT_SIZES)[number]

const TEXT_SCALE: Record<LabelTextSize, number> = { small: 0.85, normal: 1, large: 1.2 }

/**
 * What a business puts on its labels. The size is not here: that is the roll
 * in the printer. Nor is the price: with it or without is chosen when
 * printing.
 */
export const labelTemplateSchema = z
  .object({
    showName: z.boolean().default(true),
    /** A long name runs onto a second line, or is cut at the first. */
    nameLines: z.union([z.literal(1), z.literal(2)]).default(2),
    /** The colour and the size. */
    showDetails: z.boolean().default(true),
    showBarcode: z.boolean().default(true),
    /** The article, small, in the corner. */
    showSku: z.boolean().default(true),
    /** The end of the chip's code beside it, to tell two pieces apart by eye. */
    showTag: z.boolean().default(true),
    text: z.enum(LABEL_TEXT_SIZES).default('normal'),
    /** The price set larger than the rest. */
    bigPrice: z.boolean().default(false),
  })
  .refine((template) => template.showName || template.showBarcode || template.showSku, {
    path: ['showName'],
    message: 'Etiketkada nom, shtrix-kod yoki artikuldan biri bo‘lishi kerak',
  })
export type LabelTemplate = z.infer<typeof labelTemplateSchema>

export const DEFAULT_LABEL_TEMPLATE: LabelTemplate = {
  showName: true,
  nameLines: 2,
  showDetails: true,
  showBarcode: true,
  showSku: true,
  showTag: true,
  text: 'normal',
  bigPrice: false,
}

// ───────────────────────────── The layout ─────────────────────────────

/** Some text, its top left corner in dots. In a box it is wrapped and set to one side; without one it runs on. */
export interface LabelText {
  kind: 'text'
  x: number
  y: number
  /** The height of a line, in dots. */
  font: number
  text: string
  box: { width: number; lines: number; align: 'L' | 'R' } | null
}

export interface LabelBars {
  kind: 'bars'
  x: number
  y: number
  /** How many dots wide the thinnest bar is. */
  module: number
  height: number
  code: string
  ean: boolean
}

export interface LabelLayout {
  width: number
  height: number
  items: (LabelText | LabelBars)[]
}

/**
 * `^` and `~` start a command and `\` an escape; none may come from a product's name. The letters o‘ and g‘
 * go to the printer with a plain apostrophe: its own font has no other, and would leave a gap where one stood.
 */
const clean = (value: string | null | undefined) =>
  String(value ?? '')
    .replace(/[\^~\\]/g, ' ')
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

/** EAN-13 with its quiet zones. */
const EAN13_MODULES = 113

/**
 * About how wide the printer's own font sets a text, in dots: half the
 * height a character, a space half of that. Enough to tell whether two
 * things fit on one row, and for the screen to show a line as long as it
 * will print.
 */
export const labelTextWidth = (text: string, font: number): number =>
  Math.ceil((text.length - (text.split(' ').length - 1) * 0.5) * font * 0.5)

/**
 * Where everything on a label goes: the model's name, colour and size, a
 * barcode, the price, the article. Sizes are laid out for a 203 dpi head and
 * scaled for a 300 dpi one. What the template leaves out gives its room to
 * the barcode.
 */
export function layoutLabel(
  label: LabelData,
  format: LabelFormat,
  template: LabelTemplate = DEFAULT_LABEL_TEMPLATE,
): LabelLayout {
  const size = LABEL_SIZES[format.size]
  const dotsPerMm = format.dpi === 300 ? 12 : 8
  const px = (dots: number) => Math.round((dots * dotsPerMm) / 8)
  const font = (dots: number) => px(dots * TEXT_SCALE[template.text])

  const width = size.width * dotsPerMm
  const height = size.height * dotsPerMm
  const margin = px(16)
  const inner = width - margin * 2
  const small = size.height <= 30

  const nameFont = font(small ? 24 : 30)
  const textFont = font(small ? 20 : 24)
  const priceFont = font((small ? 30 : 40) * (template.bigPrice ? 1.4 : 1))
  const footFont = font(18)

  const items: LabelLayout['items'] = []
  const text = (x: number, y: number, size: number, value: string, box: LabelText['box'] = null) =>
    items.push({ kind: 'text', x, y, font: size, text: value, box })

  const top = px(12)
  let y = top
  if (template.showName) {
    text(margin, y, nameFont, clean(label.name), { width: inner, lines: template.nameLines, align: 'L' })
    y += nameFont * template.nameLines + px(4)
  }
  if (template.showDetails) {
    const details = clean(label.details)
    if (details) {
      text(margin, y, textFont, details, { width: inner, lines: 1, align: 'L' })
    }
    y += textFont + px(6)
  }
  // Where the barcode would start with a name of two lines and the details under it.
  const usual = top + nameFont * 2 + px(4) + textFont + px(6)

  // The bottom row: the price on the left; the article, and the end of the chip's code, on the right.
  // Where the two would run into each other, the article goes above the price.
  const price = clean(label.price)
  const foot = [
    template.showSku ? clean(label.sku) : '',
    template.showTag && label.epc ? `#${label.epc.slice(-6)}` : '',
  ]
    .filter(Boolean)
    .join('  ')
  const bottom = height - margin
  const abreast = !price || !foot || labelTextWidth(price, priceFont) + px(8) + labelTextWidth(foot, footFont) <= inner
  const footTop = abreast ? bottom - footFont : bottom - priceFont - px(4) - footFont
  const rowTop = Math.min(price ? bottom - priceFont : bottom, foot ? footTop : bottom)

  const code = clean(label.barcode) || clean(label.sku)
  const ean = isValidEan13(code)
  const modules = ean ? EAN13_MODULES : code128Width(code)
  // The widest bars that still fit; a code too long for the label is left to the text below.
  const module = [px(2), 1].find((candidate) => modules * candidate <= inner)
  if (template.showBarcode && code && module && /^[\x20-\x7e]+$/.test(code)) {
    // As tall as always, and taller by what the template left out above; never into the row below,
    // with room kept under the bars for the digits the printer writes there.
    const room = rowTop - y - px(26)
    const tall = px(small ? 44 : 80) + (usual - y) + (price || foot ? 0 : priceFont)
    items.push({ kind: 'bars', x: margin, y, module, height: Math.max(px(20), Math.min(tall, room)), code, ean })
  }

  if (price) {
    text(margin, bottom - priceFont, priceFont, price)
  }
  if (foot) {
    text(margin, footTop, footFont, foot, { width: inner, lines: 1, align: 'R' })
  }
  return { width, height, items }
}

/**
 * The commands for one label: what `layoutLabel` laid out, and the
 * instruction to write the chip.
 */
export function buildLabelZpl(
  label: LabelData,
  format: LabelFormat,
  template: LabelTemplate = DEFAULT_LABEL_TEMPLATE,
): string {
  const layout = layoutLabel(label, format, template)
  const lines = ['^XA', '^CI28', `^PW${layout.width}`, `^LL${layout.height}`, '^LH0,0']

  if (label.epc) {
    // Gen2 tag; a label whose chip would not take the code is voided and the next one tried, twice at most.
    lines.push('^RS8,,,2', `^RFW,H^FD${label.epc}^FS`)
  }

  for (const item of layout.items) {
    const at = `^FO${item.x},${item.y}`
    if (item.kind === 'text') {
      const box = item.box ? `^FB${item.box.width},${item.box.lines},0,${item.box.align},0` : ''
      lines.push(`${at}^A0N,${item.font},${item.font}${box}^FD${item.text}^FS`)
    } else if (item.ean) {
      lines.push(`${at}^BY${item.module}^BEN,${item.height},Y,N^FD${item.code.slice(0, 12)}^FS`)
    } else {
      lines.push(`${at}^BY${item.module}^BCN,${item.height},Y,N,N^FD${item.code}^FS`)
    }
  }

  lines.push(`^PQ${label.epc ? 1 : Math.max(1, Math.floor(label.copies ?? 1))}`, '^XZ')
  return lines.join('\n')
}

/** A label that says where it came from: proof that a printer is reachable, with no chip written. */
export function buildTestLabelZpl(printerName: string, format: LabelFormat): string {
  return buildLabelZpl(
    {
      name: APP_NAME,
      details: `Sinov: ${printerName}`,
      sku: 'TEST',
      barcode: '2000000000008',
      price: null,
      epc: null,
    },
    format,
  )
}

// ───────────────────────────── Printing ─────────────────────────────

/** One request never prints more than this: a slip of the hand must not run a roll out. */
export const MAX_LABELS_PER_JOB = 2000

export const labelPrintSchema = z
  .object({
    /** Labels for the goods of this receipt: one tagged piece per unit received. */
    receiptId: idSchema.nullish().transform((value) => value ?? null),
    /** Labels for goods already on hand: where they are. */
    locationId: idSchema.nullish().transform((value) => value ?? null),
    items: z
      .array(z.object({ variantId: idSchema, count: z.number().int().min(1).max(MAX_LABELS_PER_JOB) }))
      .min(1, 'Chop etiladigan etiketka tanlanmagan')
      .max(5000),
    size: z.enum(LABEL_SIZE_KEYS),
    /** Write a chip and remember each piece. Off: an ordinary barcode label. */
    rfid: z.boolean().default(false),
    withPrice: z.boolean().default(true),
    /** Of a receipt's pieces, only those whose label has not been printed yet. */
    onlyNew: z.boolean().default(false),
    /** Where to print. Without a printer the commands come back as a file. */
    printerId: idSchema.nullish().transform((value) => value ?? null),
    /** The head of the printer the file is for; a chosen printer knows its own. */
    dpi: z.union([z.literal(203), z.literal(300)]).default(203),
  })
  .superRefine((request, context) => {
    const seen = new Set<string>()
    let total = 0
    request.items.forEach((item, index) => {
      if (seen.has(item.variantId)) {
        context.addIssue({ code: 'custom', path: ['items', index, 'variantId'], message: 'Bu tovar takrorlangan' })
      }
      seen.add(item.variantId)
      total += item.count
    })
    if (total > MAX_LABELS_PER_JOB) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: `Bir martada ko‘pi bilan ${MAX_LABELS_PER_JOB} ta etiketka chop etiladi`,
      })
    }
    if (request.rfid && !request.receiptId && !request.locationId) {
      context.addIssue({ code: 'custom', path: ['locationId'], message: 'Tovar qayerda turganini tanlang' })
    }
  })
export type LabelPrintInput = z.infer<typeof labelPrintSchema>

export interface LabelPrintResult {
  count: number
  /** The job waiting for, or already at, the printer. */
  job: PrintJobDto | null
  /** With no printer chosen: the commands themselves, to be saved and sent by hand. */
  file: { name: string; zpl: string } | null
}

/** How far a receipt's labels have got: one row per variant on it. */
export interface ReceiptLabelsDto {
  receiptId: string
  /** How many pieces the receipt has of each variant, and how many of their labels are printed. */
  items: { variantId: string; units: number; printed: number }[]
}

export const PRINT_JOB_STATUSES = ['queued', 'sent', 'done', 'failed', 'cancelled'] as const
export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[number]

export const PRINT_JOB_STATUS_LABELS: Record<PrintJobStatus, string> = {
  queued: 'Navbatda',
  sent: 'Yuborilmoqda',
  done: 'Printerga yetdi',
  failed: 'Xato',
  cancelled: 'Bekor qilingan',
}

export interface PrintJobDto {
  id: string
  title: string
  labels: number
  status: PrintJobStatus
  error: string | null
  printerId: string | null
  printerName: string
  /** Whether the agent that serves the printer is connected right now. */
  agentOnline: boolean
  createdByName: string | null
  createdAt: string
  doneAt: string | null
}

export const printJobListQuerySchema = listQuerySchema.extend({
  status: z.enum(['all', ...PRINT_JOB_STATUSES]).default('all'),
})
export type PrintJobListQuery = z.infer<typeof printJobListQuerySchema>

// ───────────────────────────── Devices ─────────────────────────────

/**
 * An address on the shop's own network: the only kind an agent will send
 * to. Nothing the server says can make it reach out to the internet.
 */
export function isLocalHost(host: string): boolean {
  const value = host.trim().toLowerCase()
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value)
  if (ip) {
    const [a, b, c, d] = ip.slice(1).map(Number)
    if ([a, b, c, d].some((part) => part > 255)) {
      return false
    }
    return (
      a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
    )
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(value) || /^[\d.]+$/.test(value)) {
    return false
  }
  return !value.includes('.') || /\.(local|lan|home|internal)$/.test(value)
}

export const agentInputSchema = z.object({
  name: requiredText(60),
  /** The shop or warehouse whose computer it runs on. */
  locationId: idSchema.nullish().transform((value) => value ?? null),
})
export type AgentInput = z.infer<typeof agentInputSchema>

export interface AgentDto {
  id: string
  name: string
  locationId: string | null
  locationName: string | null
  online: boolean
  lastSeenAt: string | null
  /** What the program said about itself when it last connected. */
  hostname: string | null
  version: string | null
  printers: number
  createdAt: string
}

/** The key is shown once, when it is made; only its hash is kept. */
export interface AgentKeyDto extends AgentDto {
  key: string
}

export const printerInputSchema = z.object({
  name: requiredText(60),
  locationId: idSchema.nullish().transform((value) => value ?? null),
  /** The agent on the same network as the printer. */
  agentId: idSchema,
  host: z
    .string()
    .trim()
    .max(120)
    .refine(isLocalHost, 'Printerning lokal tarmoqdagi manzilini yozing, masalan 192.168.1.50'),
  port: z.number().int().min(1).max(65535).default(9100),
  dpi: z.union([z.literal(203), z.literal(300)]),
  labelSize: z.enum(LABEL_SIZE_KEYS),
  /** It has an RFID encoder and tagged labels loaded. */
  rfid: z.boolean(),
})
export type PrinterInput = z.infer<typeof printerInputSchema>

export interface PrinterDto {
  id: string
  name: string
  locationId: string | null
  locationName: string | null
  agentId: string
  agentName: string
  online: boolean
  host: string
  port: number
  dpi: PrinterDpi
  labelSize: LabelSizeKey
  rfid: boolean
}

/** What the agent is told to do, and what it answers. */
export interface AgentPrintOrder {
  id: string
  host: string
  port: number
  data: string
}
export type AgentPrintAnswer = { ok: true } | { ok: false; error: string }
