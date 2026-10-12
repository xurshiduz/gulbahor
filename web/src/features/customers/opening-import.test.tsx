import type { OpeningImportResult } from '@erp/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { OpeningImportDialog } from './opening-import'

const som = (amount: number) => amount * 100
const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

/** What the spreadsheet reader hands back for the file picked: set by each test. */
let sheet: unknown[][] = []
vi.mock('read-excel-file/browser', () => ({ default: async () => [{ data: sheet }] }))

const shown = (onClose = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OpeningImportDialog onClose={onClose} />
    </QueryClientProvider>,
  )
  return onClose
}

const pick = async () => {
  const file = new File(['x'], 'qoldiqlar.xlsx')
  // A file's bytes are read before the reader is asked; here the reader answers whatever the test set.
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(0) })
  await userEvent.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file)
}

const result = (done: boolean): OpeningImportResult => ({
  done,
  created: 1,
  totals: [{ currency: 'UZS', owes: som(1_250_000), owed: som(300_000) }],
  rows: [
    {
      row: 2,
      customerName: 'Nodira',
      created: false,
      currency: 'UZS',
      change: som(1_250_000),
      balance: som(1_250_000),
      again: true,
      problem: null,
    },
    {
      row: 4,
      customerName: 'Aziz',
      created: true,
      currency: 'UZS',
      change: -som(300_000),
      balance: -som(300_000),
      again: false,
      problem: null,
    },
  ],
})

afterEach(() => vi.restoreAllMocks())

describe('opening balances from a sheet', () => {
  it('reads the file, shows what it would write, and writes it under the same key', async () => {
    sheet = [
      ['Mijoz', 'Telefon', 'Mijoz qarzi', 'Bizning qarzimiz'],
      ['Nodira', '90 123 45 67', 1_250_000, null],
      // Owes nothing either way: passed over.
      ['Bobur', null, 0, null],
      ['Aziz', null, null, 300_000],
    ]
    const post = vi.spyOn(api, 'post').mockResolvedValueOnce(result(false)).mockResolvedValueOnce(result(true))
    const onClose = shown()
    expect((screen.getByRole('button', { name: 'Tekshirish' }) as HTMLButtonElement).disabled).toBe(true)
    await pick()
    await waitFor(() =>
      expect(plain(document.querySelector('[data-opening-columns]')?.textContent)).toBe(
        'Tanilgan ustunlar: Mijoz, Telefon, Mijoz qarzi, Bizning qarzimiz',
      ),
    )
    expect(screen.getByText('Qoldiqli qatorlar: 2 ta')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Tekshirish' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    const [path, tried] = post.mock.calls[0] as [string, { clientKey: string; dryRun: boolean; rows: unknown[] }]
    expect(path).toBe('/customer-payments/opening/import')
    expect(tried.dryRun).toBe(true)
    expect(tried.rows).toEqual([
      expect.objectContaining({
        row: 2,
        name: 'Nodira',
        phone: '+998901234567',
        owes: 'customer',
        amount: som(1_250_000),
      }),
      expect.objectContaining({ row: 4, name: 'Aziz', phone: null, owes: 'us', amount: som(300_000) }),
    ])

    const preview = await waitFor(() => document.querySelector('[data-opening-preview]') as HTMLElement)
    expect(plain(preview.textContent)).toContain('2 ta qator, yangi mijozlar: 1 ta')
    expect(plain(preview.textContent)).toContain('Bizga qarzdor: 1 250 000 so‘m · Biz qarzdormiz: 300 000 so‘m')
    const rows = [...preview.querySelectorAll('tbody tr')].map((row) => plain(row.textContent))
    expect(rows[0]).toContain('Nodira')
    expect(rows[0]).toContain('Bu hisobga boshlang‘ich qoldiq avval kiritilgan')
    expect(rows[0]).toContain('−1 250 000 so‘m')
    expect(rows[1]).toContain('Aziz yangi')
    expect(rows[1]).toContain('300 000 so‘m')
    expect(rows[1]).not.toContain('−')

    await userEvent.click(screen.getByRole('button', { name: 'Yozish (2 ta qator)' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    const written = post.mock.calls[1][1] as { clientKey: string; dryRun: boolean }
    expect(written.dryRun).toBe(false)
    expect(written.clientKey).toBe(tried.clientKey)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('says what is wrong with the file, and sends nothing while something is', async () => {
    sheet = [
      ['Ism', 'Valyuta', 'Qoldiq'],
      ['Nodira', 'tugrik', 500_000],
      [null, null, 100],
    ]
    const post = vi.spyOn(api, 'post')
    shown()
    await pick()
    const problems = await waitFor(() => document.querySelector('[data-opening-problem]') as HTMLElement)
    expect(plain(problems.textContent)).toContain('Xato bor qatorlar: 2 ta')
    expect(plain(problems.textContent)).toContain('2-qator: Valyuta tanilmadi: tugrik')
    expect(plain(problems.textContent)).toContain('3-qator: Mijoz yozilmagan')
    expect((screen.getByRole('button', { name: 'Tekshirish' }) as HTMLButtonElement).disabled).toBe(true)
    expect(post).not.toHaveBeenCalled()
  })

  it('says which column it could not find', async () => {
    sheet = [
      ['Telefon', 'Summa', 'Izoh'],
      ['90 123 45 67', 500_000, null],
    ]
    shown()
    await pick()
    await waitFor(() =>
      expect(plain(document.querySelector('[data-opening-problem]')?.textContent)).toBe('Mijoz ustuni topilmadi'),
    )
  })

  it('shows what the server would not take, and keeps the file from being written', async () => {
    sheet = [
      ['Mijoz', 'Qoldiq'],
      ['Bobur', 10_000],
    ]
    const refused = result(false)
    refused.rows = [{ ...refused.rows[0], row: 2, customerName: 'Bobur', problem: '«Bobur» nomli mijoz bir nechta' }]
    vi.spyOn(api, 'post').mockResolvedValueOnce(refused)
    shown()
    await pick()
    await userEvent.click(await screen.findByRole('button', { name: 'Tekshirish' }))
    await waitFor(() =>
      expect(plain(document.querySelector('[data-opening-problem]')?.textContent)).toContain(
        '2-qator: «Bobur» nomli mijoz bir nechta',
      ),
    )
    expect(document.querySelector('[data-opening-preview]')).toBeNull()
    expect(screen.queryByRole('button', { name: /Yozish/ })).toBeNull()
  })
})
