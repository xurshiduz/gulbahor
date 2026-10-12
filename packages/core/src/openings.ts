import { z } from 'zod'

import { parseAmount } from './amount'
import { parseDateInput, toIsoDate, type LocalDate } from './date'
import { currencyOfHeader, guessColumns, type ImportField } from './import'
import { ALL_CURRENCY_CODES, type AnyCurrency } from './money'
import { parsePhone } from './phone'
import { optionalText, requiredText } from './schemas'

/**
 * Opening balances from a spreadsheet: what stood between the business and
 * each customer before the books began (KEYINGI-REJA, 16.8). One row is one
 * customer in one currency — a name, a phone to find them by, who owes whom
 * and how much. The sum stands in two columns, "Mijoz qarzi" and "Bizning
 * qarzimiz", or in one, "Qoldiq", where a sum below zero is what the business
 * owes. The columns can be in any order and called by their usual names.
 */
export const OPENING_FIELDS = [
  {
    key: 'name',
    title: 'Mijoz',
    headers: ['mijoz', 'ism', 'ismi', 'nomi', 'name', 'клиент', 'имя', 'наименование', 'контрагент', 'фио'],
  },
  { key: 'phone', title: 'Telefon', headers: ['telefon', 'tel', 'phone', 'телефон', 'тел'] },
  { key: 'currency', title: 'Valyuta', headers: ['valyuta', 'currency', 'валюта'] },
  {
    key: 'owes',
    title: 'Mijoz qarzi',
    headers: ['mijoz qarzi', 'qarzi', 'qarz', 'debet', 'debt', 'долг клиента', 'нам должны', 'долг', 'дебет'],
  },
  {
    key: 'owed',
    title: 'Bizning qarzimiz',
    headers: ['bizning qarzimiz', 'biz qarzdormiz', 'haqi', 'kredit', 'credit', 'наш долг', 'мы должны', 'кредит'],
  },
  { key: 'balance', title: 'Qoldiq', headers: ['qoldiq', 'saldo', 'balance', 'сальдо', 'остаток'] },
  {
    key: 'dueDate',
    title: 'To‘lash muddati',
    headers: ["to'lash muddati", 'muddati', 'muddat', 'due', 'срок оплаты', 'срок'],
  },
  { key: 'supplier', title: 'Yetkazib beruvchi', headers: ['yetkazib beruvchi', 'supplier', 'поставщик'] },
  { key: 'note', title: 'Izoh', headers: ['izoh', 'note', 'примечание', 'комментарий'] },
] as const satisfies readonly ImportField[]

export type OpeningFieldKey = (typeof OPENING_FIELDS)[number]['key']
export type OpeningMapping = Partial<Record<OpeningFieldKey, number>>

/** Which column each field is read from, by what the sheet's headers say. */
export const guessOpeningMapping = (headers: readonly unknown[]): OpeningMapping =>
  guessColumns(OPENING_FIELDS, headers)

/** A sheet can be read when it says who, and how much one way or the other. */
export const openingMappingProblem = (mapping: OpeningMapping): string | null =>
  mapping.name === undefined
    ? 'Mijoz ustuni topilmadi'
    : mapping.owes === undefined && mapping.owed === undefined && mapping.balance === undefined
      ? 'Summa ustuni topilmadi: «Mijoz qarzi», «Bizning qarzimiz» yoki «Qoldiq»'
      : null

const currencySchema = z.enum(ALL_CURRENCY_CODES as [AnyCurrency, ...AnyCurrency[]])

/** One customer's balance in one currency, as the sheet gave it. */
export const openingRowSchema = z.object({
  /** The sheet's row, as a person counts them: what a problem is reported against. */
  row: z.number().int().min(1),
  name: requiredText(120),
  /** In full, with the country code. */
  phone: z
    .string()
    .regex(/^\+998\d{9}$/)
    .nullish()
    .transform((value) => value ?? null),
  /** Their main currency — the business's for someone new — unless the sheet says. */
  currency: currencySchema.nullish().transform((value) => value ?? null),
  owes: z.enum(['customer', 'us']),
  amount: z.number().int().positive().max(1_000_000_000_000_00),
  dueDate: z.iso
    .date()
    .nullish()
    .transform((value) => value ?? null),
  isSupplier: z.boolean().default(false),
  note: optionalText(300),
})
export type OpeningRow = z.infer<typeof openingRowSchema>

export interface ReadOpeningRow {
  row: number
  /** Null when the row cannot be taken as it stands; `problems` says why. */
  value: OpeningRow | null
  problems: string[]
}

function text(cell: unknown): string | null {
  if (cell === null || cell === undefined) {
    return null
  }
  const value = String(cell).replace(/\s+/g, ' ').trim()
  return value || null
}

/** A sum as the sheet holds it, in minor units, with its sign; null for an empty cell, NaN for one that is no sum. */
function signed(cell: unknown): number | null {
  if (cell === null || cell === undefined || cell === '') {
    return null
  }
  if (typeof cell === 'number') {
    const minor = Math.round(cell * 100)
    return Number.isSafeInteger(minor) ? minor : Number.NaN
  }
  // "-1 250 000", "−1250000", and the bookkeeper's "(1 250 000)".
  const written = String(cell).trim()
  const minus = /^[-−–]/.test(written) || /^\(.*\)$/.test(written)
  const parsed = parseAmount(written.replace(/^[-−–(]\s*|\)$/g, ''))
  return parsed.ok ? (minus ? -parsed.minor : parsed.minor) : Number.NaN
}

const YES = /^(ha|yes|да|true|1|\+|x|х|✓)/

/**
 * Turns one sheet row into an opening balance. A row with no name and no
 * sum is an empty line, and one that names somebody who owes nothing either
 * way has nothing to write: both are skipped (null).
 */
export function readOpeningRow(
  cells: readonly unknown[],
  mapping: OpeningMapping,
  rowNumber: number,
  today: LocalDate,
): ReadOpeningRow | null {
  const cell = (key: OpeningFieldKey) => (mapping[key] === undefined ? null : cells[mapping[key] as number])
  const name = text(cell('name'))
  const sums = { owes: signed(cell('owes')), owed: signed(cell('owed')), balance: signed(cell('balance')) }
  const written = Object.values(sums).some((sum) => sum !== null)
  if (!name && !written) {
    return null
  }

  const problems: string[] = []
  if (!name) {
    problems.push('Mijoz yozilmagan')
  }
  let change = 0
  if (Object.values(sums).some((sum) => Number.isNaN(sum))) {
    problems.push('Summa noto‘g‘ri yozilgan')
  } else if ((sums.owes ?? 0) < 0 || (sums.owed ?? 0) < 0) {
    problems.push('Qarz ustunida manfiy son: bitta ustunli hisob uchun «Qoldiq» ustuni ishlatiladi')
  } else if (sums.owes && sums.owed) {
    problems.push('Ikkala ustunda ham summa bor: mijoz qarzi yoki bizning qarzimiz')
  } else {
    // What the customer owes is above zero; what the business owes them, below.
    change = (sums.owes ?? 0) - (sums.owed ?? 0) + (sums.balance ?? 0)
    if (!change && name && !problems.length) {
      return null
    }
  }

  const rawCurrency = text(cell('currency'))
  const currency = rawCurrency ? currencyOfHeader(rawCurrency) : null
  if (rawCurrency && !currency) {
    problems.push(`Valyuta tanilmadi: ${rawCurrency}`)
  }

  const rawPhone = text(cell('phone'))
  const phone = rawPhone ? parsePhone(rawPhone) : null
  if (phone && !phone.ok) {
    problems.push(`Telefon noto‘g‘ri: ${rawPhone}`)
  }

  // A spreadsheet's own date comes as a moment at midnight UTC; a typed one is read as it is typed here.
  const rawDue = cell('dueDate')
  let dueDate: string | null = null
  if (rawDue instanceof Date) {
    dueDate = toIsoDate({ year: rawDue.getUTCFullYear(), month: rawDue.getUTCMonth() + 1, day: rawDue.getUTCDate() })
  } else if (text(rawDue)) {
    const parsed = parseDateInput(text(rawDue) as string, today)
    if (parsed.ok) {
      dueDate = toIsoDate(parsed.date)
    } else {
      problems.push(`Muddat noto‘g‘ri: ${text(rawDue)}`)
    }
  }

  if (problems.length) {
    return { row: rowNumber, value: null, problems }
  }
  return {
    row: rowNumber,
    problems,
    value: {
      row: rowNumber,
      name: (name as string).slice(0, 120),
      phone: phone?.ok ? phone.e164 : null,
      currency,
      owes: change > 0 ? 'customer' : 'us',
      amount: Math.abs(change),
      // A day is given to what the customer owes; what the business owes has none.
      dueDate: change > 0 ? dueDate : null,
      isSupplier: YES.test((text(cell('supplier')) ?? '').toLowerCase()),
      note: text(cell('note'))?.slice(0, 300) ?? null,
    },
  }
}

export const MAX_OPENING_ROWS = 2000

export const openingImportSchema = z.object({
  /** One for the whole file: sent twice, it is written once. */
  clientKey: z.uuid(),
  rows: z.array(openingRowSchema).min(1).max(MAX_OPENING_ROWS),
  /** A trial: everything is done and then undone, and the answer says what would have been. */
  dryRun: z.boolean().default(false),
})
export type OpeningImportInput = z.infer<typeof openingImportSchema>

export interface OpeningImportRowResult {
  row: number
  customerName: string
  /** Nobody of that phone or name is in the book: they are written down by this file. */
  created: boolean
  currency: AnyCurrency | null
  /** What the row adds to what they owe; below zero, to what the business owes them. */
  change: number
  /** What they would owe in that currency after it. */
  balance: number | null
  /** A balance from before the books stands on that account already: this would be a second one. */
  again: boolean
  problem: string | null
}

export interface OpeningImportResult {
  rows: OpeningImportRowResult[]
  created: number
  /** What the file comes to, a currency at a time: owed to the business, and by it. */
  totals: { currency: AnyCurrency; owes: number; owed: number }[]
  /** Written to the books: false for a trial, and for a file with a row that could not be taken. */
  done: boolean
}
