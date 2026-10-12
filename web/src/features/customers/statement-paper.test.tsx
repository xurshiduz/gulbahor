import type { CustomerStatementDto } from '@erp/core'
import { render } from '@testing-library/react'
import i18next from 'i18next'
import { describe, expect, it } from 'vitest'

import { sheetOf } from '@/lib/excel'

import { periodText, statementColumns, StatementPaper, statementRows } from './statement-paper'

const som = (amount: number) => amount * 100
const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')
const t = i18next.t.bind(i18next)

const account = (currency: 'UZS' | 'USD', balance: number) => ({
  currency,
  balance,
  owed: Math.max(0, balance),
  credit: Math.max(0, -balance),
  overdue: 0,
  overdueSince: null,
  nextDue: null,
  nextDueAmount: 0,
})

/** September with a buyer: she owed 50 000 before it, took two scarves on her account, brought one back, paid 100 000. */
const september = {
  customer: { id: 'nodira', name: 'Nodira', balances: [account('UZS', som(25_000)), account('USD', -1000)] },
  currency: 'UZS',
  from: '2026-09-01',
  to: '2026-09-30',
  opening: som(50_000),
  closing: som(25_000),
  balance: som(25_000),
  lines: [
    {
      at: '2026-09-05T06:00:00.000Z',
      on: '2026-09-05',
      kind: 'sale',
      source: 'sale',
      number: 'SR-000012',
      documentId: 's1',
      change: som(150_000),
      balance: som(200_000),
      note: null,
      due: { id: 'd1', dueDate: '2026-10-05' },
      qty: 2,
    },
    {
      at: '2026-09-07T06:00:00.000Z',
      on: '2026-09-07',
      kind: 'sale_return',
      source: 'sale_return',
      number: 'QT-000003',
      documentId: 'r1',
      change: -som(75_000),
      balance: som(125_000),
      note: null,
      due: null,
      qty: 1,
    },
    {
      at: '2026-09-20T06:00:00.000Z',
      on: '2026-09-20',
      kind: 'in',
      source: 'payment',
      number: 'TL-000040',
      documentId: 'p1',
      change: -som(100_000),
      balance: som(25_000),
      note: 'Naqd',
      due: null,
      qty: null,
    },
  ],
} as unknown as CustomerStatementDto

describe('a reconciliation on paper', () => {
  it('says who with and for which days, opens with what stood before and closes with what stands after', () => {
    render(<StatementPaper business="Gulbahor" data={september} totalBase={-som(101_500)} base="UZS" />)
    const paper = document.querySelector('[data-statement-paper]') as HTMLElement
    expect(plain(paper.querySelector('h1')?.textContent)).toBe('Akt-sverka')
    expect(plain(paper.textContent)).toContain('01.09.2026 – 30.09.2026 · UZS')
    expect(plain(paper.textContent)).toContain('Gulbahor — Nodira')
    const rows = [...paper.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => plain(cell.textContent)),
    )
    expect(rows).toEqual([
      // What she owes is a balance under nought.
      ['01.09.2026', 'Davr boshidagi qoldiq', '', '', '', '−50 000 so‘m'],
      ['05.09.2026', 'Kassadan sotuv SR-000012', '2', '150 000 so‘m', '', '−200 000 so‘m'],
      ['07.09.2026', 'Tovar qaytarildi QT-000003', '1', '', '75 000 so‘m', '−125 000 so‘m'],
      ['20.09.2026', expect.stringContaining('TL-000040'), '', '', '100 000 so‘m', '−25 000 so‘m'],
      ['30.09.2026', 'Davr oxiridagi qoldiq', '', '', '', '−25 000 so‘m'],
      ['Davr aylanmasi', '150 000 so‘m', '175 000 so‘m', ''],
    ])
    expect(plain(paper.querySelector('[data-akt-result]')?.textContent)).toBe('Davr oxirida Nodira: −25 000 so‘m')
    // Her dollars are not part of these lines: said beside them, never added in.
    expect(plain(paper.querySelector('[data-akt-others]')?.textContent)).toBe(
      'Boshqa valyutadagi hisoblari (bugun): 10,00 $ · hammasi bugungi kursda: 101 500 so‘m',
    )
    // A line for each side to sign.
    expect([...paper.querySelectorAll('[data-signature]')].map((line) => plain(line.textContent))).toEqual([
      'Gulbahor:',
      'Nodira:',
    ])
  })

  it('names the days it covers, whichever end is open', () => {
    expect(periodText({ from: '2026-09-01', to: null }, t)).toBe('01.09.2026 dan')
    expect(periodText({ from: null, to: '2026-09-30' }, t)).toBe('30.09.2026 gacha')
    expect(periodText({ from: null, to: null }, t)).toBe('Butun davr')
  })

  it('goes into a sheet as numbers and days, the debt’s rise and fall apart', () => {
    const { data } = sheetOf(statementColumns('UZS', t), statementRows(september, t))
    expect(data[0].map((cell) => cell?.value)).toEqual([
      'Sana',
      'Hujjat',
      'Raqami',
      'Tovar soni',
      'Qarz ko‘paydi',
      'Qarz kamaydi',
      'Qoldiq',
      'To‘lash muddati',
      'Izoh',
    ])
    const values = (row: (typeof data)[number]) =>
      row.map((cell) => (cell?.value instanceof Date ? 'day' : cell?.value))
    expect(values(data[1])).toEqual([
      'day',
      'Davr boshidagi qoldiq',
      undefined,
      undefined,
      undefined,
      undefined,
      -50_000,
      undefined,
      undefined,
    ])
    expect(values(data[2])).toEqual([
      'day',
      'Kassadan sotuv',
      'SR-000012',
      2,
      150_000,
      undefined,
      -200_000,
      'day',
      undefined,
    ])
    expect(values(data[4]).slice(3)).toEqual([undefined, undefined, 100_000, -25_000, undefined, 'Naqd'])
    expect(values(data[5])).toEqual([
      'day',
      'Davr oxiridagi qoldiq',
      undefined,
      undefined,
      undefined,
      undefined,
      -25_000,
      undefined,
      undefined,
    ])
  })
})
