import { settle, settleRefund, type PosContextDto, type PosPartnerDto, type RateBook } from '@gulbahor/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { exchangeLine, type ExchangeSums } from '@/features/money/exchange'
import { api } from '@/lib/api'

import { CustomerPicker } from './customer-picker'
import { enteredRows, tenderRows, tendersOf, type TenderRow } from './pos-state'
import { paidText } from './receipt-paper'
import { TenderPanel } from './tender-panel'

const som = (amount: number) => Math.round(amount * 100)
const usd = (amount: number) => Math.round(amount * 100)
const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

const book: RateBook = { base: 'UZS', rates: { USD: { against: 'UZS', way: 'in', value: 12_650 } } }
const context = {
  usd: true,
  rate: { uzsPerUsd: 12_650 },
  cards: [],
  terminals: [],
  approvers: [],
  maxRateLossPercent: 2,
  mayOverDiscount: false,
  changeRoundStep: 0,
} as unknown as PosContextDto
const elaris: PosPartnerDto = { id: 'p1', name: 'Elaris', phone: null, currency: 'USD', priceType: null }

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
    uzsPerUsd: 12_650,
    changeCurrency: 'UZS',
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
      refund={settleRefund(0, [], { uzsPerUsd: 12_650, roundStep: 0 })}
      changeCurrency="UZS"
      onChangeCurrency={() => undefined}
      action="Sotish"
      busy={false}
      onComplete={() => onComplete(rows, sums)}
      onBack={() => undefined}
      onAccount={{
        name: elaris.name,
        currency: elaris.currency,
        sums,
        line,
        max: due,
        book,
        setsRates: false,
        warning: 'Hamkor hisobiga sotishda rahbar tasdig‘i so‘raladi',
        onChange: setSums,
      }}
    />
  )
}

describe('a sale on a partner’s account', () => {
  it('puts the rest on the account with "=", and shows it in the partner’s currency beside', async () => {
    render(<Money due={som(1_265_000)} onComplete={() => undefined} />)
    const into = screen.getByLabelText(/Hisobiga · Elaris/) as HTMLInputElement
    into.focus()
    await userEvent.keyboard('={Tab}')
    expect(plain(into.value)).toBe('1 265 000')
    // 1 265 000 so'm are 100 $ on a dollar account: both sums are in sight before the sale.
    expect((screen.getByLabelText('Hisobiga (USD)') as HTMLInputElement).value).toBe('100,00')
    // Nothing is left for the money to cover.
    expect(screen.queryByText('Yana kerak')).toBeNull()
    expect(screen.getByText('Hamkor hisobiga sotishda rahbar tasdig‘i so‘raladi')).toBeTruthy()
  })

  it('keeps the sale’s sum when the partner’s is typed over, and says what the agreement costs', async () => {
    const done = vi.fn()
    render(<Money due={som(1_265_000)} onComplete={done} />)
    const into = screen.getByLabelText(/Hisobiga · Elaris/) as HTMLInputElement
    await userEvent.type(into, '1265000{Tab}')
    const theirs = screen.getByLabelText('Hisobiga (USD)') as HTMLInputElement
    await userEvent.clear(theirs)
    await userEvent.type(theirs, '99{Tab}')
    expect(plain(into.value)).toBe('1 265 000')
    // 99 $ for 1 265 000 is 12 777,78 against 12 650: the business gives 12 650 so'm away.
    expect(plain(document.querySelector('[data-agreed]')?.textContent)).toBe(
      'Kelishilgan kurs 12 777,78, kun kursi 12 650 (1% farq): 12 650 so‘m zararimizga',
    )
    await userEvent.click(screen.getByRole('button', { name: /Sotish/ }))
    await waitFor(() => expect(done).toHaveBeenCalled())
    expect(done.mock.calls[0][1]).toEqual({ amount: som(1_265_000), received: usd(99) })
  })

  it('is said on the receipt in so’m, and in the partner’s own currency beside', () => {
    expect(plain(paidText({ method: 'partner', currency: 'USD', amount: usd(100), base: som(1_265_000) }))).toBe(
      '1 265 000 so‘m (100,00 $)',
    )
    expect(plain(paidText({ method: 'partner', currency: 'UZS', amount: som(500_000), base: som(500_000) }))).toBe(
      '500 000 so‘m',
    )
  })
})

describe('a partner at the counter', () => {
  it('is found by the customer field, marked as a partner, and picked with Enter after the customers', async () => {
    vi.spyOn(api, 'get').mockImplementation(((path: string) =>
      Promise.resolve(path === '/pos/partners' ? [elaris] : [])) as typeof api.get)
    function Counter() {
      const [partner, setPartner] = useState<PosPartnerDto | null>(null)
      return (
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <CustomerPicker
            registerId="r1"
            value={null}
            onChange={() => undefined}
            partner={partner}
            onPartner={setPartner}
          />
        </QueryClientProvider>
      )
    }
    render(<Counter />)
    const field = screen.getByRole('textbox', { name: 'Mijoz' })
    await userEvent.type(field, 'ela')
    await waitFor(() => expect(screen.getByText('Elaris')).toBeTruthy())
    expect(plain(screen.getByText(/hamkor · USD/).textContent)).toBe('hamkor · USD')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByLabelText('Hamkorni olib tashlash')).toBeTruthy())
    expect(plain(document.body.textContent)).toContain('Hamkor · USD')
  })
})
