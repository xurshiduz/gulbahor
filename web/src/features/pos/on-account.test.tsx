import { settle, settleRefund, type PosContextDto, type RateBook } from '@erp/core'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { exchangeLine, type ExchangeSums } from '@/features/money/exchange'
import { addedDebt, type AnyCurrency } from '@erp/core'
import { enteredRows, tenderRows, tendersOf, type TenderRow } from './pos-state'
import { paidText } from './receipt-paper'
import { TenderPanel } from './tender-panel'

const som = (amount: number) => Math.round(amount * 100)
const usd = (amount: number) => Math.round(amount * 100)
const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

const book: RateBook = { base: 'UZS', rates: { USD: { against: 'UZS', way: 'in', value: 12_650 } } }
const context = {
  book,
  currencies: ['UZS', 'USD'],
  cards: [],
  terminals: [],
  approvers: [],
  maxRateLossPercent: 2,
  mayOverDiscount: false,
  changeRoundStep: 0,
} as unknown as PosContextDto
/** A customer who deals in dollars. */
const elaris = { name: 'Elaris', currency: 'USD' as const }

afterEach(() => vi.restoreAllMocks())

/** The money for a sale to Elaris, part of which may go on their dollar account. */
function Money({ due, onComplete }: { due: number; onComplete: (rows: TenderRow[], sums: ExchangeSums) => void }) {
  const [paid, setPaid] = useState<Record<string, Partial<TenderRow>>>({})
  const [sums, setSums] = useState<ExchangeSums>({ amount: null, received: null })
  const rows = tenderRows(context).map((row) => ({ ...row, ...paid[row.key] }))
  const onAccount = Math.min(sums.amount ?? 0, due)
  const line = exchangeLine(
    { id: 'sale', currency: 'UZS' },
    'USD',
    { amount: onAccount || null, received: sums.received },
    book,
    2,
  )
  const settlement = settle(due - onAccount, tendersOf(enteredRows(rows), false), {
    book,
    roundStep: 0,
  })
  return (
    <TenderPanel
      context={context}
      rows={rows}
      onPatch={(key, patch) => setPaid((current) => ({ ...current, [key]: { ...current[key], ...patch } }))}
      returning={null}
      refunding={false}
      due={due}
      suggested={due - onAccount ? { cash: due - onAccount } : {}}
      settlement={settlement}
      refund={settleRefund(0, [], { book, roundStep: 0 })}
      action="Sotish"
      busy={false}
      onComplete={() => onComplete(rows, sums)}
      onBack={() => undefined}
      onAccount={{
        name: elaris.name,
        rows: [
          {
            currency: elaris.currency,
            sums,
            line,
            balance: 0,
            prepaid: 0,
            lent: line?.settled ?? 0,
            haqi: 0,
            removable: false,
          },
        ],
        spare: [],
        onAdd: () => undefined,
        onRemove: () => undefined,
        max: due,
        book,
        setsRates: false,
        dueDate: '2026-11-10',
        noDue: false,
        onDueDate: () => undefined,
        warning: 'Mijoz hisobiga sotishda rahbar tasdig‘i so‘raladi',
        onChange: (_currency, next) => setSums(next),
      }}
    />
  )
}

/** The second sum of a balance kept in another currency: what its own sum is in the sale's money. */
const worthOf = (currency: string) =>
  document.querySelectorAll<HTMLInputElement>(`[data-on-account-row="${currency}"] input`)[1] as HTMLInputElement

describe('a sale on a customer’s account', () => {
  it('is written in the account’s own currency first, as cash of it is, with the sale’s money beside', async () => {
    render(<Money due={som(1_265_000)} onComplete={() => undefined} />)
    const into = screen.getByLabelText(/Balansidan · Elaris/) as HTMLInputElement
    // The same columns as the dollars paid in cash above it: dollars, the rate, so'm.
    const row = document.querySelector('[data-on-account-row="USD"]') as HTMLElement
    expect([...row.querySelectorAll('input')].indexOf(into)).toBe(0)
    into.focus()
    // "=" puts the rest of the sale there: 1 265 000 so'm are 100 $ on a dollar account.
    await userEvent.keyboard('={Tab}')
    expect(into.value).toBe('100,00')
    expect(plain(worthOf('USD').value)).toBe('1 265 000')
    // Nothing is left for the money to cover.
    expect(screen.queryByText('Yana kerak')).toBeNull()
    expect(screen.getByText('Mijoz hisobiga sotishda rahbar tasdig‘i so‘raladi')).toBeTruthy()
  })

  it('follows the day’s rate when the account’s sum is typed again', async () => {
    render(<Money due={som(1_265_000)} onComplete={() => undefined} />)
    const into = screen.getByLabelText(/Balansidan · Elaris/) as HTMLInputElement
    await userEvent.type(into, '40{Tab}')
    expect(plain(worthOf('USD').value)).toBe('506 000')
    await userEvent.clear(into)
    await userEvent.type(into, '50{Tab}')
    // No agreement was made: fifty dollars are what the rate makes them.
    expect(plain(worthOf('USD').value)).toBe('632 500')
    expect(document.querySelector('[data-agreed]')).toBeNull()
    // The sale's money typed alone asks how many dollars it is, and the rate says.
    await userEvent.clear(into)
    await userEvent.tab()
    expect(worthOf('USD').value).toBe('')
    await userEvent.type(worthOf('USD'), '253000{Tab}')
    expect(into.value).toBe('20,00')
  })

  it('keeps the account’s sum when the sale’s is typed over it, and says what the agreement costs', async () => {
    const done = vi.fn()
    render(<Money due={som(1_265_000)} onComplete={done} />)
    const into = screen.getByLabelText(/Balansidan · Elaris/) as HTMLInputElement
    await userEvent.type(into, '99{Tab}')
    expect(plain(worthOf('USD').value)).toBe('1 252 350')
    await userEvent.clear(worthOf('USD'))
    await userEvent.type(worthOf('USD'), '1265000{Tab}')
    expect(into.value).toBe('99,00')
    // 99 $ for 1 265 000 is 12 777,78 against 12 650: the business gives 12 650 so'm away.
    expect(plain(document.querySelector('[data-agreed]')?.textContent)).toBe(
      'Kelishilgan kurs 12 777,78, kun kursi 12 650 (1% farq): 12 650 so‘m zararimizga',
    )
    await userEvent.click(screen.getByRole('button', { name: /Sotish/ }))
    await waitFor(() => expect(done).toHaveBeenCalled())
    expect(done.mock.calls[0][1]).toEqual({ amount: som(1_265_000), received: usd(99) })
  })

  it('is said on the receipt in so’m, and in the account’s own currency beside', () => {
    expect(plain(paidText({ method: 'account', currency: 'USD', amount: usd(100), base: som(1_265_000) }))).toBe(
      '1 265 000 so‘m (100,00 $)',
    )
    expect(plain(paidText({ method: 'account', currency: 'UZS', amount: som(500_000), base: som(500_000) }))).toBe(
      '500 000 so‘m',
    )
  })
})

/** A sale to Omadillo, who has 10 $ of their own and deals in so'm: part may go on either account, or on both. */
function Several({ due, onRemove }: { due: number; onRemove: (currency: AnyCurrency) => void }) {
  const [sums, setSums] = useState<Partial<Record<AnyCurrency, ExchangeSums>>>({})
  const balances: Partial<Record<AnyCurrency, number>> = { USD: -usd(10), UZS: 0 }
  let left = due
  const rows = (['USD', 'UZS'] as AnyCurrency[]).map((currency) => {
    const typed = sums[currency] ?? { amount: null, received: null }
    const amount = Math.min(typed.amount ?? 0, left)
    left -= amount
    const line = exchangeLine(
      { id: 'sale', currency: 'UZS' },
      currency,
      { amount: amount || null, received: typed.received },
      book,
      2,
    )
    const settled = line ? (line.settled ?? 0) : amount
    const balance = balances[currency] ?? 0
    const lent = settled ? addedDebt(balance, settled) : 0
    return {
      currency,
      sums: typed,
      line,
      balance,
      prepaid: settled - lent,
      lent,
      haqi: currency === 'USD' ? som(126_500) : 0,
      removable: false,
    }
  })
  const owing = rows.reduce((sum, row) => sum + Math.min(row.sums.amount ?? 0, due), 0)
  return (
    <TenderPanel
      context={context}
      rows={tenderRows(context)}
      onPatch={() => undefined}
      returning={null}
      refunding={false}
      due={due}
      suggested={due - owing > 0 ? { cash: due - owing } : {}}
      settlement={settle(Math.max(0, due - owing), [], { book, roundStep: 0 })}
      refund={settleRefund(0, [], { book, roundStep: 0 })}
      action="Sotish"
      busy={false}
      onComplete={() => undefined}
      onBack={() => undefined}
      onAccount={{
        name: 'Omadillo',
        rows: [...rows, { ...rows[1], currency: 'CNY', haqi: 0, balance: null, removable: true }],
        spare: ['RUB'],
        onAdd: () => undefined,
        onRemove,
        max: due,
        book,
        setsRates: false,
        dueDate: '2026-11-10',
        noDue: false,
        onDueDate: () => undefined,
        warning: null,
        onChange: (currency, next) => setSums((current) => ({ ...current, [currency]: next })),
      }}
    />
  )
}

describe('a sale on several of a customer’s accounts at once', () => {
  it('takes what is theirs with "=", and lends the rest on another', async () => {
    const removed = vi.fn()
    render(<Several due={som(1_386_000)} onRemove={removed} />)
    const dollars = screen.getByLabelText(/Omadillo · \$/) as HTMLInputElement
    expect(plain(dollars.closest('[data-on-account-row]')?.textContent)).toContain('Dollar balansi')
    dollars.focus()
    // Their 10 $, and no more: what is theirs is spent first — typed in dollars, counted in so'm beside.
    await userEvent.keyboard('={Tab}')
    expect(dollars.value).toBe('10,00')
    expect(plain(worthOf('USD').value)).toBe('126 500')
    expect(plain(document.querySelector('[data-on-account-row="USD"]')?.textContent)).toContain('Haqidan: 10,00 $')
    // The rest on their so'm account, lent.
    const soms = screen.getByLabelText(/Omadillo · so‘m/) as HTMLInputElement
    soms.focus()
    await userEvent.keyboard('={Tab}')
    expect(plain(soms.value)).toBe('1 259 500')
    expect(plain(document.querySelector('[data-on-account-row="UZS"]')?.textContent)).toContain(
      'Qarzga: 1 259 500 so‘m',
    )
    // One day for all that is lent.
    expect(screen.getAllByLabelText('To‘lash muddati')).toHaveLength(1)
    // A line opened for this sale alone may be taken off; another currency may be added.
    await userEvent.click(screen.getByRole('button', { name: 'Bu valyutani olib tashlash' }))
    expect(removed).toHaveBeenCalledWith('CNY')
    expect(screen.getByText('+ Valyuta')).toBeTruthy()
  })
})
