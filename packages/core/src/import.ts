import { z } from 'zod'

import { parseAmount, parseQuantity } from './amount'
import { GENDERS, normalizeBarcode, SEASONS, type Gender, type Season } from './catalog'
import { ALL_CURRENCY_CODES, type AnyCurrency } from './money'
import { idSchema, optionalText } from './schemas'

/**
 * Reading a supplier's or the business's own spreadsheet into a receipt.
 * One row is one variant: a model's name and article, a colour and a size,
 * how many came and at what price. The columns can be in any order and
 * called anything; `guessMapping` recognises the usual names and a person
 * corrects the rest once.
 */

export interface ImportField {
  key: string
  title: string
  /** What the column is usually called, lower-case. A header matches if it equals one of these or begins with it. */
  headers: string[]
}

export const IMPORT_FIELDS = [
  { key: 'name', title: 'Nomi', headers: ['наименование', 'название', 'товар', 'nomi', 'tovar', 'name'] },
  { key: 'sku', title: 'Artikul', headers: ['артикул', 'artikul', 'article', 'sku'] },
  { key: 'size', title: 'O‘lcham', headers: ['v_размер', 'размер', "o'lcham", 'olcham', 'razmer', 'size'] },
  { key: 'color', title: 'Rang', headers: ['v_цвет', 'цвет', 'rang', 'color', 'colour'] },
  {
    key: 'qty',
    title: 'Soni',
    headers: ['кол-во', 'количество', 'кол во', 'колво', 'soni', 'miqdor', 'qty', 'quantity'],
  },
  {
    key: 'price',
    title: 'Xarid narxi',
    headers: ['цена закупки', 'закупочная цена', 'цена покупки', 'xarid narxi', 'kirim narxi', 'purchase price'],
  },
  {
    key: 'extra',
    title: 'Qo‘shimcha xarajat (1 dona)',
    headers: ['доп расход', 'доп. расход', 'дополнительный расход', "qo'shimcha xarajat", 'extra'],
  },
  {
    key: 'retailPrice',
    title: 'Chakana narx',
    headers: ['розничная цена', 'цена продажи', 'chakana narx', 'sotuv narxi', 'retail price'],
  },
  { key: 'wholesalePrice', title: 'Ulgurji narx', headers: ['оптовая цена', 'ulgurji narx', 'wholesale price'] },
  {
    key: 'barcode',
    title: 'Shtrix-kod',
    headers: ['баркод', 'штрих-код', 'штрихкод', 'штрих код', 'shtrix-kod', 'barcode', 'ean'],
  },
  { key: 'brand', title: 'Brend', headers: ['бренд', 'brend', 'brand'] },
  { key: 'category', title: 'Kategoriya', headers: ['категория', 'kategoriya', 'category'] },
  { key: 'supplier', title: 'Yetkazib beruvchi', headers: ['поставщик', 'yetkazib beruvchi', 'supplier'] },
  {
    key: 'factoryCode',
    title: 'Fabrika kodi',
    headers: ['код фабрике', 'код фабрики', 'fabrika kodi', 'factory code'],
  },
  {
    key: 'manufacturer',
    title: 'Ishlab chiqaruvchi',
    headers: ['производитель', 'ishlab chiqaruvchi', 'manufacturer'],
  },
  { key: 'season', title: 'Sezon', headers: ['сезон', 'sezon', 'season'] },
  { key: 'collection', title: 'Kolleksiya yili', headers: ['коллекция', 'kolleksiya', 'collection'] },
  { key: 'gender', title: 'Jins', headers: ['пол', 'jins', 'gender'] },
] as const satisfies readonly ImportField[]

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]['key']

/** Which column (by position) each field is read from. A field left out is not read. */
export type ImportMapping = Partial<Record<ImportFieldKey, number>>

const tidy = (header: unknown) =>
  String(header ?? '')
    .toLowerCase()
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

/** Shorter names ("пол", "sku") must match whole: as a beginning they would catch unrelated columns. */
const MIN_PREFIX = 5

/**
 * Matches a sheet's headers to fields. A field takes the leftmost column
 * whose header is one of its usual names or begins with one, so
 * "цена закупки YUAN" is the purchase price even when a bare "цена закупки"
 * follows it. A column is given to one field only, and a column that is
 * exactly another field's name is left for that field.
 */
export function guessMapping(headers: readonly unknown[]): ImportMapping {
  const names = headers.map(tidy)
  const exact = (field: ImportField, name: string) => field.headers.includes(name)
  const begins = (field: ImportField, name: string) =>
    field.headers.some((usual) => usual.length >= MIN_PREFIX && name.startsWith(usual))
  const owner = names.map((name) => IMPORT_FIELDS.find((field) => name && exact(field, name))?.key)

  const mapping: ImportMapping = {}
  const taken = new Set<number>()
  for (const field of IMPORT_FIELDS) {
    const column = names.findIndex(
      (name, index) =>
        !!name && !taken.has(index) && (owner[index] === field.key || (!owner[index] && begins(field, name))),
    )
    if (column !== -1) {
      mapping[field.key] = column
      taken.add(column)
    }
  }
  return mapping
}

const CURRENCY_HINTS: [AnyCurrency, RegExp][] = [
  ['CNY', /yuan|юан|cny|rmb|¥/],
  ['KGS', /kirgiz|kyrgyz|кирг|кырг|kgs/],
  ['TRY', /\btry\b|лир|lira|₺/],
  ['RUB', /rub|руб|₽/],
  ['KZT', /kzt|тенге|tenge|₸/],
  ['EUR', /eur|евро|€/],
  ['AED', /aed|дирхам|dirham/],
  ['USD', /usd|\$|доллар|dollar/],
  ['UZS', /uzs|сум|сўм|so'm|som/],
]

/** The currency a price column is in, when its header says: "цена закупки YUAN" is yuan. */
export function currencyOfHeader(header: unknown): AnyCurrency | null {
  const name = tidy(header)
  return CURRENCY_HINTS.find(([, pattern]) => pattern.test(name))?.[0] ?? null
}

const GENDER_WORDS: [Gender, RegExp][] = [
  ['boys', /мальчик|boy|o'g'il/],
  ['girls', /девоч|girl|qiz/],
  ['unisex', /унисекс|unisex|uniseks/],
  ['women', /^ж|жен|women|female|ayol|^w$|^f$/],
  ['men', /^м|муж|men|male|erkak|^m$/],
]

const SEASON_WORDS: [Season, RegExp][] = [
  ['all', /всесезон|круглый|^all|yil bo'yi|demi|деми/],
  ['ss', /лет|весн|summer|spring|^ss|yoz|bahor/],
  ['aw', /зим|осен|winter|autumn|fall|^aw|^fw|qish|kuz/],
]

const wordOf = <T extends string>(words: [T, RegExp][], text: string): T | null =>
  words.find(([, pattern]) => pattern.test(tidy(text)))?.[0] ?? null

export interface ImportRow {
  /** The row's number in the sheet, as the person sees it. */
  row: number
  name: string
  sku: string | null
  size: string | null
  color: string | null
  qty: number
  price: number
  extra: number
  retailPrice: number | null
  wholesalePrice: number | null
  barcode: string | null
  brand: string | null
  category: string | null
  supplier: string | null
  factoryCode: string | null
  manufacturer: string | null
  season: Season | null
  collectionYear: number | null
  gender: Gender | null
}

export interface ReadRow {
  row: number
  /** Null when the row cannot be taken as it stands; `problems` says why. */
  value: ImportRow | null
  problems: string[]
}

/** A cell as text, trimmed; empty is null. */
function text(cell: unknown): string | null {
  if (cell === null || cell === undefined) {
    return null
  }
  const value = String(cell).replace(/\s+/g, ' ').trim()
  return value || null
}

/** A price cell in minor units. Spreadsheets hold numbers as numbers; typed text goes through the amount reader. */
function money(cell: unknown): { minor: number | null; bad: boolean } {
  if (cell === null || cell === undefined || cell === '') {
    return { minor: null, bad: false }
  }
  if (typeof cell === 'number') {
    const minor = Math.round(cell * 100)
    return Number.isFinite(cell) && cell >= 0 && Number.isSafeInteger(minor)
      ? { minor, bad: false }
      : { minor: null, bad: true }
  }
  const parsed = parseAmount(String(cell))
  return parsed.ok ? { minor: parsed.minor, bad: false } : { minor: null, bad: true }
}

/**
 * Turns one sheet row into an import row. A row with no name and no quantity
 * is an empty line and is skipped (null with no problems).
 */
export function readImportRow(cells: readonly unknown[], mapping: ImportMapping, rowNumber: number): ReadRow | null {
  const cell = (key: ImportFieldKey) => (mapping[key] === undefined ? null : cells[mapping[key] as number])
  const name = text(cell('name'))
  const rawQty = cell('qty')
  if (!name && (rawQty === null || rawQty === undefined || rawQty === '')) {
    return null
  }

  const problems: string[] = []
  if (!name) {
    problems.push('Nomi yozilmagan')
  }

  let qty = 0
  if (typeof rawQty === 'number') {
    qty = rawQty
  } else if (rawQty !== null && rawQty !== undefined && rawQty !== '') {
    const parsed = parseQuantity(String(rawQty), 3)
    qty = parsed.ok ? parsed.value : Number.NaN
  }
  if (!(qty > 0) || qty > 1_000_000 || Math.abs(qty * 1000 - Math.round(qty * 1000)) > 1e-6) {
    problems.push('Soni noto‘g‘ri yoki yozilmagan')
  }

  const amounts = {
    price: money(cell('price')),
    extra: money(cell('extra')),
    retailPrice: money(cell('retailPrice')),
    wholesalePrice: money(cell('wholesalePrice')),
  }
  const titles = {
    price: 'Xarid narxi',
    extra: 'Qo‘shimcha xarajat',
    retailPrice: 'Chakana narx',
    wholesalePrice: 'Ulgurji narx',
  }
  for (const key of Object.keys(amounts) as (keyof typeof amounts)[]) {
    if (amounts[key].bad) {
      problems.push(`${titles[key]} noto‘g‘ri yozilgan`)
    }
  }

  const barcode = text(cell('barcode'))
  const collection = text(cell('collection'))
  const year = collection ? /(20\d{2})/.exec(collection)?.[1] : undefined

  if (problems.length) {
    return { row: rowNumber, value: null, problems }
  }
  return {
    row: rowNumber,
    problems,
    value: {
      row: rowNumber,
      name: (name as string).slice(0, 160),
      sku: text(cell('sku'))?.slice(0, 40) ?? null,
      size: text(cell('size'))?.slice(0, 40) ?? null,
      color: text(cell('color'))?.slice(0, 40) ?? null,
      qty,
      price: amounts.price.minor ?? 0,
      extra: amounts.extra.minor ?? 0,
      retailPrice: amounts.retailPrice.minor,
      wholesalePrice: amounts.wholesalePrice.minor,
      barcode: barcode ? normalizeBarcode(barcode).slice(0, 48) : null,
      brand: text(cell('brand'))?.slice(0, 80) ?? null,
      category: text(cell('category'))?.slice(0, 80) ?? null,
      supplier: text(cell('supplier'))?.slice(0, 120) ?? null,
      factoryCode: text(cell('factoryCode'))?.slice(0, 60) ?? null,
      manufacturer: text(cell('manufacturer'))?.slice(0, 120) ?? null,
      season: wordOf(SEASON_WORDS, text(cell('season')) ?? ''),
      collectionYear: year ? Number(year) : null,
      gender: wordOf(GENDER_WORDS, text(cell('gender')) ?? ''),
    },
  }
}

// ───────────────────────────── The request and its answer ─────────────────────────────

const currencySchema = z.enum(ALL_CURRENCY_CODES as [AnyCurrency, ...AnyCurrency[]])
const amount = z.number().int().min(0).max(1_000_000_000_000_00)
const cellText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null)

export const importRowSchema = z.object({
  row: z.number().int().min(1),
  name: z.string().trim().min(1).max(160),
  sku: cellText(40),
  size: cellText(40),
  color: cellText(40),
  qty: z.number().positive().max(1_000_000),
  price: amount,
  extra: amount.default(0),
  retailPrice: amount.nullish().transform((value) => value ?? null),
  wholesalePrice: amount.nullish().transform((value) => value ?? null),
  barcode: cellText(48),
  brand: cellText(80),
  category: cellText(80),
  supplier: cellText(120),
  factoryCode: cellText(60),
  manufacturer: cellText(120),
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
  gender: z
    .enum(GENDERS)
    .nullish()
    .transform((value) => value ?? null),
})

export const MAX_IMPORT_ROWS = 5000

export const receiptImportSchema = z.object({
  /** True to see what the import would do without doing it. */
  dryRun: z.boolean(),
  locationId: idSchema,
  /** Named on rows that name no supplier of their own. */
  supplierId: idSchema.nullish().transform((value) => value || null),
  docDate: z.iso.date(),
  currency: currencySchema,
  usdRate: z.number().positive().max(1_000_000_000),
  uzsRate: z.number().positive().max(1_000_000_000),
  extraCurrency: currencySchema.default('USD'),
  note: optionalText(500),
  fileName: z.string().trim().min(1).max(200),
  fileHash: z.string().regex(/^[0-9a-f]{64}$/),
  rows: z.array(importRowSchema).min(1).max(MAX_IMPORT_ROWS),
})
export type ReceiptImportInput = z.infer<typeof receiptImportSchema>

export interface ImportRowResult {
  row: number
  problems: string[]
}

export interface ImportResult {
  /** Set once the import is done for real. */
  receiptId: string | null
  receiptNumber: string | null
  /** The number of an earlier receipt made from this very file, if there is one. */
  duplicateOf: string | null
  rows: number
  qty: number
  /** Models the file names that are not in the catalogue yet, and so on: what the import will add. */
  newProducts: string[]
  newVariants: number
  newValues: string[]
  newBrands: string[]
  newCategories: string[]
  newSuppliers: string[]
  /** Rows that cannot be taken; while there are any, nothing is imported. */
  problems: ImportRowResult[]
}
