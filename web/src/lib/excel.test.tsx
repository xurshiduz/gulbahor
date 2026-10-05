import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DataTable } from '@/components/ui/data-table'
import { TooltipProvider } from '@/components/ui/feedback'

import { api } from './api'
import * as excel from './excel'
import { dayCell, fetchAll, moneyCell, sheetOf, timeCell } from './excel'

describe('cells', () => {
  it('writes money as a number, with tiyin only when there are any', () => {
    expect(moneyCell(95_000_00)).toEqual({ value: 95_000, format: '#,##0' })
    expect(moneyCell(53_760_45)).toEqual({ value: 53_760.45, format: '#,##0.00' })
    expect(moneyCell(4_20, 'USD')).toEqual({ value: 4.2, format: '#,##0.00' })
    expect(moneyCell(5_00, 'USD')).toEqual({ value: 5, format: '#,##0.00' })
    expect(moneyCell(null)).toEqual({ value: null })
    expect(moneyCell(undefined, 'USD')).toEqual({ value: null })
  })

  it('writes a day as that day wherever the file is opened', () => {
    const cell = dayCell('2026-10-01')
    expect(cell.format).toBe('dd.mm.yyyy')
    expect((cell.value as Date).toISOString().slice(0, 10)).toBe('2026-10-01')
    expect(dayCell(null)).toEqual({ value: null })
    expect(timeCell('2026-10-02T06:54:00.000Z').format).toBe('dd.mm.yyyy hh:mm')
  })
})

describe('sheetOf', () => {
  interface Row {
    name: string
    qty: number
    price: number | null
    day: string
  }
  const rows: Row[] = [
    { name: 'Futbolka Polo', qty: 62, price: 95_000_00, day: '2026-10-01' },
    { name: 'Kepka', qty: 0, price: null, day: '2026-10-02' },
  ]

  it('gives a header row and typed cells', () => {
    const { data, widths } = sheetOf<Row>(
      [
        { title: 'Nomi', value: (row) => row.name },
        { title: 'Soni', value: (row) => row.qty },
        { title: 'Narx', value: (row) => moneyCell(row.price) },
        { title: 'Sana', value: (row) => dayCell(row.day) },
      ],
      rows,
    )
    expect(data[0]).toEqual([
      { value: 'Nomi', type: String, fontWeight: 'bold' },
      { value: 'Soni', type: String, fontWeight: 'bold' },
      { value: 'Narx', type: String, fontWeight: 'bold' },
      { value: 'Sana', type: String, fontWeight: 'bold' },
    ])
    expect(data[1].slice(0, 3)).toEqual([
      { value: 'Futbolka Polo', type: String },
      { value: 62, type: Number, format: undefined },
      { value: 95_000, type: Number, format: '#,##0' },
    ])
    expect(data[1][3]).toMatchObject({ type: Date, format: 'dd.mm.yyyy' })
    // A zero is a value; a missing price is an empty cell.
    expect(data[2][1]).toEqual({ value: 0, type: Number, format: undefined })
    expect(data[2][2]).toBeNull()
    // Wide enough for the longest value, and never narrower than a readable column.
    expect(widths).toEqual([15, 8, 11, 12])
  })
})

describe('fetchAll', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('reads every page the filters cover', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (_path, query) => {
      const { page } = query as { page: number }
      const count = page === 3 ? 50 : 200
      return { items: Array.from({ length: count }, (_item, index) => (page - 1) * 200 + index), total: 450 }
    })
    const all = await fetchAll<number>('/stock', { q: 'polo', page: 7, size: 20 })
    expect(all).toHaveLength(450)
    expect(all[449]).toBe(449)
    expect(get).toHaveBeenCalledTimes(3)
    // The list's own page and size give way to the export's.
    expect(get).toHaveBeenLastCalledWith('/stock', { q: 'polo', page: 3, size: 200 })
  })

  it('stops when a page comes back empty', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ items: [], total: 10 })
    expect(await fetchAll('/stock')).toEqual([])
    expect(get).toHaveBeenCalledTimes(1)
  })
})

describe('DataTable export', () => {
  interface Row {
    id: string
    name: string
    brand: string | null
  }
  const page: Row[] = [{ id: '1', name: 'Polo', brand: 'Zara' }]
  const everything: Row[] = [...page, { id: '2', name: 'Sharf', brand: null }]

  const columns: ColumnDef<Row>[] = [
    { id: 'name', header: 'Nomi', meta: { export: (row) => row.name }, cell: ({ row }) => row.original.name },
    // Folded into the name on the screen; a column of its own in the file.
    { id: 'brand', header: 'Brend', meta: { exportOnly: true, export: (row) => row.brand } },
    { id: 'actions', header: '', cell: () => <button type="button">…</button> },
  ]

  it('saves every row of the filter, in the columns that hold data', async () => {
    const saveExcel = vi.spyOn(excel, 'saveExcel').mockResolvedValue()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <DataTable
            columns={columns}
            data={page}
            rowId={(row) => row.id}
            exportAs={{ fileName: 'Tovarlar', rows: async () => everything }}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    )

    // The spreadsheet-only column is not on the screen.
    expect(screen.queryByText('Brend')).toBeNull()
    expect(screen.getByText('Polo')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Excel’ga chiqarish' }))
    await vi.waitFor(() => expect(saveExcel).toHaveBeenCalledTimes(1))
    const [title, exported, rows] = saveExcel.mock.calls[0]
    expect(title).toBe('Tovarlar')
    expect(exported.map((column) => column.title)).toEqual(['Nomi', 'Brend'])
    expect(rows).toEqual(everything)
    expect(exported[1].value(everything[0])).toBe('Zara')
  })
})
