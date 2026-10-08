import type { AnyCurrency, Page } from '@erp/core'
import type { SheetData } from 'write-excel-file/browser'

import { api } from './api'

import { base } from '@/lib/base'

/**
 * Lists as spreadsheets. A list says, column by column, what each row holds
 * as a plain value; numbers go out as numbers and dates as dates, so the
 * sheet can be summed and sorted without retyping anything.
 */

export type ExportValue = string | number | Date | null | undefined

export interface ExportCell {
  value: ExportValue
  /** An Excel number format: "#,##0", "dd.mm.yyyy". */
  format?: string
}

export interface ExportColumn<T> {
  title: string
  value: (row: T) => ExportValue | ExportCell
}

/** The most rows one export carries. */
export const MAX_EXPORT_ROWS = 50_000
const PAGE = 200

/** Money as a number in whole units; tiyin and cents show only when there are any. */
export function moneyCell(minor: number | null | undefined, currency: AnyCurrency = base()): ExportCell {
  if (minor === null || minor === undefined) {
    return { value: null }
  }
  return { value: minor / 100, format: minor % 100 === 0 && currency === base() ? '#,##0' : '#,##0.00' }
}

/** A calendar day ("2026-10-01") as a date the sheet can sort and filter by. */
export function dayCell(iso: string | null | undefined): ExportCell {
  if (!iso) {
    return { value: null }
  }
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  // Noon in UTC: whatever the time zone of the computer that opens the file, the day stays the day.
  return { value: new Date(Date.UTC(year, month - 1, day, 12)), format: 'dd.mm.yyyy' }
}

/** A moment, shown in the time of the computer that made the file. */
export function timeCell(iso: string | null | undefined): ExportCell {
  if (!iso) {
    return { value: null }
  }
  const at = new Date(iso)
  return { value: new Date(at.getTime() - at.getTimezoneOffset() * 60_000), format: 'dd.mm.yyyy hh:mm' }
}

const isCell = (value: ExportValue | ExportCell): value is ExportCell =>
  typeof value === 'object' && value !== null && !(value instanceof Date)

type SheetCell =
  | { value: string; type: StringConstructor; fontWeight?: 'bold' }
  | { value: number; type: NumberConstructor; format?: string }
  | { value: Date; type: DateConstructor; format: string }
  | null

/** The rows of the sheet, header first, and how wide each column should be to show its longest value. */
export function sheetOf<T>(columns: ExportColumn<T>[], rows: T[]): { data: SheetCell[][]; widths: number[] } {
  const widths = columns.map((column) => column.title.length)
  const data: SheetCell[][] = [columns.map((column) => ({ value: column.title, type: String, fontWeight: 'bold' }))]

  for (const row of rows) {
    data.push(
      columns.map((column, index) => {
        const raw = column.value(row)
        const cell = isCell(raw) ? raw : { value: raw }
        const { value } = cell
        if (value === null || value === undefined || value === '') {
          return null
        }
        if (value instanceof Date) {
          widths[index] = Math.max(widths[index], (cell.format ?? 'dd.mm.yyyy').length)
          return { value, type: Date, format: cell.format ?? 'dd.mm.yyyy' }
        }
        if (typeof value === 'number') {
          widths[index] = Math.max(widths[index], String(Math.round(value)).length + 4)
          return { value, type: Number, format: cell.format }
        }
        widths[index] = Math.max(widths[index], value.length)
        return { value, type: String }
      }),
    )
  }
  return { data, widths: widths.map((width) => Math.min(60, Math.max(8, width + 2))) }
}

/**
 * Writes the file and hands it to the browser to save, named after the list
 * and the day: "Qoldiq 2026-10-02.xlsx". The spreadsheet code is loaded only now.
 */
export async function saveExcel<T>(title: string, columns: ExportColumn<T>[], rows: T[]): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const { data, widths } = sheetOf(columns, rows)
  const now = new Date()
  const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part) => String(part).padStart(2, '0'))
  await writeXlsxFile(data as SheetData, {
    columns: widths.map((width) => ({ width })),
    // A sheet name may not contain these and is at most 31 characters long.
    sheet: title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31),
    stickyRowsCount: 1,
  }).toFile(`${title} ${day.join('-')}.xlsx`)
}

/** Every row a list's filters cover, fetched page by page. */
export async function fetchAll<T>(path: string, query: Record<string, unknown> = {}): Promise<T[]> {
  const rows: T[] = []
  for (let page = 1; rows.length < MAX_EXPORT_ROWS; page++) {
    const result = await api.get<Page<T>>(path, { ...query, page, size: PAGE } as Parameters<typeof api.get>[1])
    rows.push(...result.items)
    if (!result.items.length || rows.length >= result.total) {
      break
    }
  }
  return rows
}
