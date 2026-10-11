import {
  formatMoney,
  settle,
  settleRefund,
  type AccountDto,
  type PosContextDto,
  type PosItemDto,
  type RateBook,
  type ReturnableDto,
} from '@erp/core'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  cartTotals,
  changeLines,
  changeRows,
  enteredRows,
  refundRows,
  refundsOf,
  tenderRows,
  tendersOf,
  type Cart,
  type ChangeRow,
  type TenderRow,
  type WrittenChange,
} from './pos-state'
import { ReceiptPreview } from './receipt-preview'
import { TenderPanel } from './tender-panel'

const som = (amount: number) => amount * 100
/** Thousands are kept apart by a space that does not break: here it is only a space. */
const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

const account = (id: string, kind: 'card' | 'terminal', name: string, last4: string | null = null) =>
  ({ id, kind, name, last4, currency: 'UZS' }) as AccountDto

const book: RateBook = { base: 'UZS', rates: { USD: { against: 'UZS', way: 'in', value: 12_100 } } }
const context = {
  book,
  currencies: ['UZS', 'USD'],
  cards: [account('humo', 'card', 'Humo', '3073'), account('uzcard', 'card', 'Uzcard', '8841')],
  terminals: [account('pos', 'terminal', 'Ipak yo‘li')],
  approvers: [{ id: 'm', name: 'Anvar', discount: true, returns: true }],
  maxRateLossPercent: 2,
  mayOverDiscount: false,
  changeRoundStep: 0,
} as unknown as PosContextDto

interface Borrower {
  /** What stands on their account already: above zero they owe, below it the money is theirs. */
  balance: number
  warning?: string
}

/** The money for a sale of `due`, kept the way the till keeps it; with a `borrower`, part of it may go on their account. */
function Money({
  due,
  onComplete,
  borrower,
}: {
  due: number
  onComplete: (rows: TenderRow[], lent: number) => void
  borrower?: Borrower
}) {
  const [paid, setPaid] = useState<Record<string, Partial<TenderRow>>>({})
  const [lent, setLent] = useState<number | null>(null)
  const [dueDate, setDueDate] = useState('2026-11-04')
  const rows = tenderRows(context).map((row) => ({ ...row, ...paid[row.key] }))
  const entered = enteredRows(rows)
  const owing = Math.min(lent ?? 0, due)
  const prepaid = borrower ? Math.min(owing, Math.max(0, -borrower.balance)) : 0
  const settlement = settle(due - owing, tendersOf(entered, false), {
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
      suggested={due - owing ? { cash: due - owing } : {}}
      settlement={settlement}
      onAccount={
        borrower
          ? {
              name: 'Nodira',
              currency: 'UZS',
              sums: { amount: lent, received: null },
              line: null,
              max: due,
              book,
              setsRates: false,
              balance: borrower.balance,
              prepaid,
              lent: owing - prepaid,
              dueDate,
              noDue: false,
              onDueDate: (date) => setDueDate(date ?? ''),
              warning: borrower.warning ?? null,
              onChange: (sums) => setLent(sums.amount),
            }
          : null
      }
      refund={settleRefund(0, [], { book, roundStep: 0 })}
      action="Sotish"
      busy={false}
      onComplete={() => onComplete(entered, owing)}
      onBack={() => undefined}
    />
  )
}

const field = (key: string) =>
  document.querySelector<HTMLInputElement>(`[data-tender="${key}"] input`) as HTMLInputElement

/**
 * The money for a sale of `due` with the change kept the way the till keeps it: what was paid over the sum
 * may go back in parts. `keeper` is the customer whose account part of it may be kept on.
 */
function Change({
  due,
  onComplete,
  keeper,
  mayReturnAny = false,
}: {
  due: number
  onComplete: (change: WrittenChange[]) => void
  keeper?: { name: string; balance: number; currency: 'UZS' | 'USD' }
  mayReturnAny?: boolean
}) {
  const [paid, setPaid] = useState<Record<string, Partial<TenderRow>>>({})
  const [giving, setGiving] = useState<Record<string, Partial<ChangeRow>>>({})
  const [open, setOpen] = useState(false)
  const rows = tenderRows(context).map((row) => ({ ...row, ...paid[row.key] }))
  const typed = tendersOf(enteredRows(rows), false)
  const allCash = settle(due, typed, { book, roundStep: som(1000) })
  const over = allCash.problem ? 0 : allCash.changeBase + allCash.rounding
  const changing = changeRows(context, keeper?.currency ?? null).map((row) => ({ ...row, ...giving[row.key] }))
  const handed = over > 0 ? changeLines(changing, over, book) : []
  const settlement = handed.length ? settle(due, typed, { book, change: handed, roundStep: som(1000) }) : allCash
  return (
    <TenderPanel
      context={{ ...context, mayReturnAny }}
      rows={rows}
      onPatch={(key, patch) => setPaid((current) => ({ ...current, [key]: { ...current[key], ...patch } }))}
      returning={null}
      refunding={false}
      due={due}
      suggested={{ cash: due }}
      settlement={settlement}
      refund={settleRefund(0, [], { book, roundStep: 0 })}
      change={{
        rows: changing,
        onPatch: (key, patch) => setGiving((current) => ({ ...current, [key]: { ...current[key], ...patch } })),
        open,
        onOpen: (next) => {
          setOpen(next)
          if (!next) {
            setGiving({})
          }
        },
        over,
        keeper: keeper ? { name: keeper.name, balance: keeper.balance } : null,
        cardAsks: !mayReturnAny,
      }}
      action="Sotish"
      busy={false}
      onComplete={() => onComplete(handed)}
      onBack={() => undefined}
    />
  )
}

const changeField = (key: string, nth = 0) =>
  document.querySelectorAll<HTMLInputElement>(`[data-change-row="${key}"] input`)[nth] as HTMLInputElement
const changeSaid = () => plain(screen.getByText('Qaytim').parentElement?.textContent)

describe('the rows money is paid into', () => {
  it('are one for each way of paying, every card and terminal with its own', () => {
    expect(tenderRows(context).map((row) => [row.key, row.method, row.currency, row.accountId])).toEqual([
      ['cash', 'cash', 'UZS', null],
      ['cash:USD', 'cash', 'USD', null],
      ['account:humo', 'card', 'UZS', 'humo'],
      ['account:uzcard', 'card', 'UZS', 'uzcard'],
      ['account:pos', 'terminal', 'UZS', 'pos'],
    ])
    // A till that takes neither dollars nor cards has so'm alone.
    const bare = { currencies: ['UZS'], cards: [], terminals: [] } as unknown as PosContextDto
    expect(tenderRows(bare).map((row) => row.key)).toEqual(['cash'])
  })

  it('are named by their card, and the first of a kind carries the key', () => {
    render(<Money due={som(200_000)} onComplete={() => undefined} />)
    const row = (key: string) => plain(document.querySelector(`[data-tender="${key}"]`)?.textContent)
    expect(row('cash')).toContain('Naqd so‘m')
    expect(row('account:humo')).toContain('Humo *3073')
    expect(row('account:humo')).toContain('F7')
    expect(row('account:uzcard')).toContain('Uzcard *8841')
    expect(row('account:uzcard')).not.toContain('F7')
    expect(row('account:pos')).toContain('F8')
    // Nothing typed: so'm cash for the lot is what is meant, and it shows faintly.
    expect(plain(field('cash').placeholder)).toBe('200 000')
  })
})

describe('the change', () => {
  it('is cash in the base, with the other ways folded away until asked for', async () => {
    render(<Change due={som(75_000)} onComplete={() => undefined} />)
    // Nothing over yet: nothing to split.
    expect(screen.queryByText('Qaytimni bo‘lish')).toBeNull()
    await userEvent.type(field('cash'), '100000{Enter}')
    await waitFor(() => expect(changeSaid()).toContain('25 000 so‘m'))
    expect(document.querySelector('[data-change]')).toBeNull()
    await userEvent.click(screen.getByText('Qaytimni bo‘lish'))
    // A row for the other drawer and for each card; no account without a customer.
    expect(
      [...document.querySelectorAll('[data-change-row]')].map((row) => row.getAttribute('data-change-row')),
    ).toEqual(['cash:USD', 'card:humo', 'card:uzcard'])
    expect(plain(document.querySelector('[data-change]')?.textContent)).toContain('Naqd so‘m — qolgani')
  })

  it('is all cash again once the rows are folded away', async () => {
    render(<Change due={som(75_000)} onComplete={() => undefined} />)
    await userEvent.type(field('cash'), '100000{Enter}')
    await userEvent.click(await screen.findByText('Qaytimni bo‘lish'))
    await userEvent.type(changeField('card:humo'), '5000')
    await userEvent.tab()
    await waitFor(() => expect(changeSaid()).toContain('20 000 so‘m, kartadan 5 000 so‘m'))
    await userEvent.click(screen.getByText('Hammasi naqd'))
    expect(changeSaid()).toContain('25 000 so‘m')
    expect(changeSaid()).not.toContain('kartadan')
  })

  it('goes back in dollars for what is left to give, and says what the rate makes of it', async () => {
    const sold = vi.fn()
    // 76 000 paid with 100 000: 24 000 over. Two dollars are 24 200 at 12 100.
    render(<Change due={som(76_000)} onComplete={sold} />)
    await userEvent.type(field('cash'), '100000{Enter}')
    await userEvent.click(await screen.findByText('Qaytimni bo‘lish'))
    // "=" offers whole notes: of 24 000 one dollar fits, the second is 200 short.
    await userEvent.type(changeField('cash:USD'), '=')
    expect(changeField('cash:USD').value).toBe('1,00')
    await userEvent.clear(changeField('cash:USD'))
    await userEvent.type(changeField('cash:USD'), '2{Enter}')
    await waitFor(() => expect(changeSaid()).toContain('2 $'))
    expect(changeSaid()).not.toContain('so‘m')
    const row = () => plain(document.querySelector('[data-change-row="cash:USD"]')?.textContent)
    expect(row()).toContain('Kun kursida 24 200 so‘m · farq do‘kon zarariga 200 so‘m')
    // What it goes for shows faintly in the second sum; under 2% off the rate nobody is asked.
    expect(plain(changeField('cash:USD', 1).placeholder)).toBe('24 000')
    expect(row()).not.toContain('rahbar tasdig‘i')
    // The next Enter, with nothing more typed, sells.
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(sold).toHaveBeenCalledTimes(1))
    expect(sold.mock.calls[0][0]).toEqual([
      { key: 'cash:USD', way: 'cash', currency: 'USD', accountId: null, amount: 200, value: som(24_000) },
    ])
  })

  it('warns where a worth typed gives away more than a cashier may, and where a card will need a word', async () => {
    render(<Change due={som(76_000)} onComplete={() => undefined} />)
    await userEvent.type(field('cash'), '100000{Enter}')
    await userEvent.click(await screen.findByText('Qaytimni bo‘lish'))
    await userEvent.type(changeField('cash:USD'), '2')
    // Two dollars for 20 000: 4 200 under the rate, 17%.
    await userEvent.type(changeField('cash:USD', 1), '20000')
    await userEvent.tab()
    const row = (key: string) => plain(document.querySelector(`[data-change-row="${key}"]`)?.textContent)
    await waitFor(() => expect(row('cash:USD')).toContain('farq do‘kon zarariga 4 200 so‘m'))
    expect(row('cash:USD')).toContain('Kursdan farq 2% dan oshdi: sotishda rahbar tasdig‘i so‘raladi')
    // The rest is cash: 4 000 so'm.
    expect(changeSaid()).toContain('2 $ + 4 000 so‘m')
    await userEvent.type(changeField('card:uzcard'), '4000')
    await userEvent.tab()
    await waitFor(() => expect(row('card:uzcard')).toContain('Kartadan qaytim: sotishda rahbar tasdig‘i so‘raladi'))
    expect(changeSaid()).toContain('2 $, kartadan 4 000 so‘m')
  })

  it('says so when more is named than there is to give', async () => {
    const sold = vi.fn()
    render(<Change due={som(75_000)} onComplete={sold} mayReturnAny />)
    await userEvent.type(field('cash'), '100000{Enter}')
    await userEvent.click(await screen.findByText('Qaytimni bo‘lish'))
    await userEvent.type(changeField('card:humo'), '30000{Enter}')
    await waitFor(() => expect(screen.getByText(/dan oshmasligi kerak/)).toBeTruthy())
    // Whoever may hand money back any way is not told a word will be asked.
    expect(plain(document.querySelector('[data-change]')?.textContent)).not.toContain('rahbar tasdig‘i')
    await userEvent.keyboard('{Enter}')
    expect(sold).not.toHaveBeenCalled()
  })

  it('is kept on the customer’s account, in the sale’s money, whatever the account is kept in', async () => {
    const sold = vi.fn()
    render(<Change due={som(75_000)} onComplete={sold} keeper={{ name: 'Elaris', balance: 5000, currency: 'USD' }} />)
    await userEvent.type(field('cash'), '100000{Enter}')
    await userEvent.click(await screen.findByText('Qaytimni bo‘lish'))
    const row = () => plain(document.querySelector('[data-change-row="account"]')?.textContent)
    expect(row()).toContain('Hisobiga · Elaris')
    expect(row()).toContain('qarzi 50,00 $')
    // 12 100 of the change is a dollar on their account at the day's rate.
    await userEvent.type(changeField('account'), '12100{Enter}')
    await waitFor(() => expect(changeSaid()).toContain('hisobiga 1,00 $'))
    expect(changeSaid()).toContain('13 000 so‘m')
    expect(plain(changeField('account', 1).placeholder)).toBe('1,00')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(sold).toHaveBeenCalledTimes(1))
    expect(sold.mock.calls[0][0]).toEqual([
      { key: 'account', way: 'account', currency: 'USD', accountId: null, amount: 100, value: som(12_100) },
    ])
  })
})

/** 75 000 owed for goods brought back on a receipt paid in cash; with a `keeper`, part of it may stay on their account. */
function Refund({
  onComplete,
  keeper,
}: {
  onComplete: (rows: { amount: number; value?: number | null }[], kept: number) => void
  keeper?: { name: string; balance: number; currency: 'UZS' | 'USD' }
}) {
  const due = som(75_000)
  const found = { caps: { cash: due, accounts: [], account: 0 }, free: false } as unknown as ReturnableDto
  const [paid, setPaid] = useState<Record<string, Partial<TenderRow>>>({})
  const [keeping, setKeeping] = useState<{ amount: number | null; settled: number | null }>({
    amount: null,
    settled: null,
  })
  const rows = refundRows(context, found).map((row) => ({ ...row, ...paid[row.key] }))
  const kept = keeper ? Math.min(keeping.amount ?? 0, due) : 0
  const typed = refundsOf(enteredRows(rows), due - kept, book)
  return (
    <TenderPanel
      context={context}
      rows={rows}
      onPatch={(key, patch) => setPaid((current) => ({ ...current, [key]: { ...current[key], ...patch } }))}
      returning={{ found, qty: {}, reason: '' }}
      refunding
      due={due}
      suggested={kept < due ? { cash: due - kept } : {}}
      settlement={settle(0, [], { book, roundStep: 0 })}
      refund={settleRefund(due - kept, typed, { book, roundStep: 0 })}
      keep={
        keeper
          ? {
              name: keeper.name,
              currency: keeper.currency,
              balance: keeper.balance,
              amount: keeping.amount,
              settled: keeping.settled,
              max: due,
              strays: false,
              onChange: setKeeping,
            }
          : null
      }
      action="Qaytarish"
      busy={false}
      onComplete={() => onComplete(typed, kept)}
      onBack={() => undefined}
    />
  )
}

describe('money handed back', () => {
  it('goes back in dollars for what is owed, and says what the rate makes of them', async () => {
    const done = vi.fn()
    render(<Refund onComplete={done} />)
    // Seven dollars are 84 700 at 12 100: they go for the 75 000 owed, which is further than a cashier may give.
    await userEvent.type(field('cash:USD'), '7{Enter}')
    const row = () => plain(document.querySelector('[data-tender="cash:USD"]')?.textContent)
    await waitFor(() => expect(row()).toContain('Kun kursida 84 700 so‘m · farq do‘kon zarariga 9 700 so‘m'))
    expect(row()).toContain('Kursdan farq 2% dan oshdi: sotishda rahbar tasdig‘i so‘raladi')
    const worth = document.querySelectorAll<HTMLInputElement>('[data-tender="cash:USD"] input')[1]
    expect(plain(worth.placeholder)).toBe('75 000')
    // A worth typed is the worth: six dollars and a bit of so'm would be nearer, so the cashier says 74 000.
    await userEvent.clear(field('cash:USD'))
    await userEvent.type(field('cash:USD'), '6')
    await userEvent.type(worth, '74000')
    await userEvent.tab()
    await waitFor(() => expect(row()).toContain('farq do‘kon foydasiga 1 400 so‘m'))
    expect(plain(screen.getByText(/Yana .* qaytarilishi kerak/).textContent)).toContain('1 000')
  })

  it('stays on the customer’s account as far as the cashier says, the rest in the hand', async () => {
    const done = vi.fn()
    render(<Refund onComplete={done} keeper={{ name: 'Nodira', balance: som(20_000), currency: 'UZS' }} />)
    const block = () => plain(document.querySelector('[data-keep]')?.textContent)
    expect(block()).toContain('Hisobida qoldirish · Nodira')
    expect(block()).toContain('qarzi 20 000 so‘m')
    const keep = document.querySelector<HTMLInputElement>('[data-keep] input') as HTMLInputElement
    // "=" keeps there all that is owed; then nothing is left for the drawer.
    await userEvent.type(keep, '=')
    expect(plain(keep.value)).toBe('75 000')
    await userEvent.clear(keep)
    await userEvent.type(keep, '50000{Enter}')
    // Enter takes it and goes back to the money, where the rest shows as what is meant.
    await waitFor(() => expect(document.activeElement).toBe(field('cash')))
    expect(plain(field('cash').placeholder)).toBe('25 000')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1))
    expect(done.mock.calls[0]).toEqual([[], som(50_000)])
  })

  it('is not offered where there is nobody whose account it could stay on', () => {
    render(<Refund onComplete={() => undefined} />)
    expect(document.querySelector('[data-keep]')).toBeNull()
  })
})

describe('Enter in the money', () => {
  it('sells for cash, exactly, when nothing was typed', async () => {
    const sold = vi.fn()
    render(<Money due={som(200_000)} onComplete={sold} />)
    field('cash').focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(sold).toHaveBeenCalledTimes(1))
    expect(sold.mock.calls[0][0]).toEqual([])
  })

  it('goes on to the next sum while the receipt is not covered', async () => {
    const sold = vi.fn()
    render(<Money due={som(200_000)} onComplete={sold} />)
    await userEvent.type(field('cash'), '50000{Enter}')
    await waitFor(() => expect(document.activeElement).toBe(field('cash:USD')))
    expect(plain(screen.getByText('Yana kerak').parentElement?.textContent)).toContain('150 000')
    // An empty row is stepped over the same way.
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(document.activeElement).toBe(field('account:humo')))
    expect(sold).not.toHaveBeenCalled()

    // "=" fills in what is left; the Enter after it changes nothing more, and sells.
    await userEvent.keyboard('=')
    expect(plain(field('account:humo').value)).toBe('150 000')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(sold).toHaveBeenCalledTimes(1))
    expect(sold.mock.calls[0][0].map((row: TenderRow) => [row.key, row.amount])).toEqual([
      ['cash', som(50_000)],
      ['account:humo', som(150_000)],
    ])
  })

  it('shows the change first, and sells on the next Enter', async () => {
    const sold = vi.fn()
    render(<Money due={som(170_000)} onComplete={sold} />)
    await userEvent.type(field('cash'), '200000{Enter}')
    await waitFor(() => expect(plain(screen.getByText('Qaytim').parentElement?.textContent)).toContain('30 000'))
    // The cursor stays where the sum was typed: the change is there to be read.
    expect(document.activeElement).toBe(field('cash'))
    expect(sold).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(sold).toHaveBeenCalledTimes(1))
  })

  it('leaves what stands beside a sum to Tab: an agreed worth, a slip’s number', async () => {
    const sold = vi.fn()
    render(<Money due={som(700_000)} onComplete={sold} />)
    await userEvent.type(field('cash:USD'), '50{Enter}')
    // 605 000 at the rate, 95 000 still to pay: on to the next sum, past the agreed worth.
    await waitFor(() => expect(document.activeElement).toBe(field('account:humo')))
    const taken = within(document.querySelector('[data-tender="cash:USD"]') as HTMLElement).getAllByRole('textbox')[1]
    expect(plain((taken as HTMLInputElement).placeholder)).toBe('605 000')

    // The terminal's slip number appears with its sum, and is not on Enter's way either.
    await userEvent.type(field('account:pos'), '95000{Enter}')
    await waitFor(() => expect(screen.getByText('Chek raqami')).toBeTruthy())
    expect(document.activeElement).toBe(field('account:pos'))
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(sold).toHaveBeenCalledTimes(1))
  })
})

describe('putting part of it on the customer’s account', () => {
  it('is offered only when someone on the books is buying', () => {
    const { unmount } = render(<Money due={som(200_000)} onComplete={() => undefined} />)
    expect(screen.queryByLabelText(/Qarzga/)).toBeNull()
    unmount()
    render(<Money due={som(200_000)} onComplete={() => undefined} borrower={{ balance: som(150_000) }} />)
    // What they owe already stands beside the field, before more is lent.
    expect(plain(screen.getByLabelText(/Qarzga/).closest('[data-on-account]')?.textContent)).toContain(
      'qarzi 150 000 so‘m',
    )
    // No day is asked for until something is lent.
    expect(screen.queryByLabelText('To‘lash muddati')).toBeNull()
  })

  it('spends what is theirs first, and asks a day only for what is lent', async () => {
    render(<Money due={som(800_000)} onComplete={() => undefined} borrower={{ balance: -som(500_000) }} />)
    const into = screen.getByLabelText(/Qarzga/)
    expect(plain(into.closest('[data-on-account]')?.textContent)).toContain('haqi 500 000 so‘m')
    await userEvent.type(into, '400000{Tab}')
    const block = () => plain(into.closest('[data-on-account]')?.textContent)
    expect(block()).toContain('Haqidan: 400 000 so‘m')
    expect(screen.queryByLabelText('To‘lash muddati')).toBeNull()
    await userEvent.clear(into)
    await userEvent.type(into, '800000{Tab}')
    expect(block()).toContain('Haqidan: 500 000 so‘m')
    expect(block()).toContain('Qarzga: 300 000 so‘m')
    expect(screen.getByLabelText('To‘lash muddati')).toBeTruthy()
  })

  it('takes what is lent off what is to be paid, and asks by when', async () => {
    const sold = vi.fn()
    render(<Money due={som(1_000_000)} onComplete={sold} borrower={{ balance: 0, warning: 'Rahbar tasdig‘i kerak' }} />)
    expect(screen.queryByText('Rahbar tasdig‘i kerak')).toBeNull()
    // Enter takes the sum and goes back to the money: the rest is paid there, and nothing is sold yet.
    await userEvent.type(screen.getByLabelText(/Qarzga/), '300000{Enter}')
    await waitFor(() => expect(document.activeElement).toBe(field('cash')))
    expect(sold).not.toHaveBeenCalled()
    expect(screen.getByLabelText('To‘lash muddati')).toBeTruthy()
    // Why a manager will be asked is said as soon as there is something to ask about.
    expect(screen.getByText('Rahbar tasdig‘i kerak')).toBeTruthy()
    // The rest is what cash is offered for.
    expect(plain(field('cash').placeholder)).toBe('700 000')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(sold).toHaveBeenCalledTimes(1))
    expect(sold.mock.calls[0]).toEqual([[], som(300_000)])
  })

  it('fills in with "=" whatever the money typed has not covered', async () => {
    render(<Money due={som(1_000_000)} onComplete={() => undefined} borrower={{ balance: 0 }} />)
    await userEvent.type(field('cash'), '400000{Tab}')
    const lend = screen.getByLabelText(/Qarzga/) as HTMLInputElement
    lend.focus()
    await userEvent.keyboard('=')
    expect(plain(lend.value)).toBe('600 000')
    await userEvent.keyboard('{Tab}')
    await waitFor(() => expect(screen.queryByText('Yana kerak')).toBeNull())
  })

  it('is stepped over by Enter: lending is decided, not fallen into', async () => {
    const sold = vi.fn()
    render(<Money due={som(200_000)} onComplete={sold} borrower={{ balance: 0 }} />)
    // Through every sum to the last, and never past it into the debt.
    await userEvent.type(field('cash'), '50000{Enter}')
    for (const key of ['cash:USD', 'account:humo', 'account:uzcard', 'account:pos']) {
      await waitFor(() => expect(document.activeElement).toBe(field(key)))
      await userEvent.keyboard('{Enter}')
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(document.activeElement).toBe(field('account:pos'))
    expect(sold).not.toHaveBeenCalled()
    // "=" in a sum leaves out what is lent.
    await userEvent.type(screen.getByLabelText(/Qarzga/), '100000{Tab}')
    field('account:humo').focus()
    await userEvent.keyboard('=')
    expect(plain(field('account:humo').value)).toBe('50 000')
  })
})

describe('Tab in the money', () => {
  it('reaches the agreed worth straight from the dollars it is for', async () => {
    const sold = vi.fn()
    render(<Money due={som(600_000)} onComplete={sold} />)
    // The field is there as soon as the cursor is in the row: Tab does not go past where it would appear.
    field('cash:USD').focus()
    await userEvent.keyboard('50')
    await userEvent.tab()
    const taken = within(document.querySelector('[data-tender="cash:USD"]') as HTMLElement).getAllByRole('textbox')[1]
    expect(document.activeElement).toBe(taken)
    await waitFor(() => expect(plain((taken as HTMLInputElement).placeholder)).toBe('605 000'))

    // "Call them 600 000": the receipt is covered, with nothing over.
    await userEvent.keyboard('=')
    await waitFor(() => expect(screen.getByText(/kurs farqidan foyda/)).toBeTruthy())
    expect(screen.queryByText('Yana kerak')).toBeNull()
    expect(sold).not.toHaveBeenCalled()
    // "=" wrote the sum; the Enter after it has nothing more to write, and sells.
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(sold).toHaveBeenCalledTimes(1))
    expect(sold.mock.calls[0][0].map((row: TenderRow) => [row.key, row.amount, row.value])).toEqual([
      ['cash:USD', 5000, som(600_000)],
    ])
  })
})

describe('the receipt beside the money', () => {
  const item = (name: string, price: number): PosItemDto => ({
    variantId: name,
    productId: name,
    name,
    label: '',
    sku: name,
    price,
    minPrice: null,
    onHand: 5,
    decimals: 0,
    epc: null,
  })

  it('shows what is sold, what came off, and what it comes to', () => {
    const cart: Cart = {
      lines: [
        { key: 'a', item: { ...item('Ko‘ylak', som(900_000)), label: 'M, qora' }, qty: 2, discountText: '100000' },
        { key: 'b', item: item('Sharf', som(70_000)), qty: 1, discountText: '' },
      ],
      discountText: '=1 600 000',
      sellerId: null,
    }
    const totals = cartTotals(cart)
    render(
      <ReceiptPreview
        shop="Gulbahor 1"
        register="Gulbahor 1 kassasi"
        cart={cart}
        totals={totals}
        back={[]}
        backNumber={null}
        priceType="Oila"
        customer="Nodira Karimova"
        ownReason={null}
        credit={0}
        toPay={totals.total}
        toRefund={0}
        seller="Dilnoza"
      />,
    )
    const text = plain(document.body.textContent)
    expect(text).toContain('Gulbahor 1 kassasi')
    expect(text).toContain('Narx: Oila')
    expect(text).toContain('Mijoz: Nodira Karimova')
    expect(text).toContain('Ko‘ylak, M, qora')
    // Everything that came off a line is said on the line: the 1 600 000 agreed on is 170 000 less than the
    // lines came to, and the dresses bear their share of it beside the 100 000 of their own.
    const [dresses, scarf] = totals.lines
    expect(dresses.total + scarf.total).toBe(160_000_000)
    expect(text).toContain(`2 × 900 000 so‘m − ${plain(formatMoney(dresses.discount, 'UZS', { minor: 'auto' }))}`)
    expect(text).toContain(plain(formatMoney(dresses.total, 'UZS', { minor: 'auto' })))
    expect(plain(screen.getByText('Chegirma').parentElement?.textContent)).toContain('−270 000 so‘m')
    expect(plain(screen.getByText('Jami').parentElement?.textContent)).toContain('1 600 000 so‘m')
    expect(text).toContain('Sotuvchi: Dilnoza')
  })
})

describe('rows kept out of sight', () => {
  it('leave the till for a line that names them, come back with it, and are hidden or shown for good from the row', async () => {
    const changes: string[][] = []
    function Hidden() {
      const [hidden, setHidden] = useState(['cash:USD', 'uzcard'])
      const [peek, setPeek] = useState(false)
      return (
        <TenderPanel
          context={context}
          rows={tenderRows(context)}
          onPatch={() => undefined}
          returning={null}
          refunding={false}
          due={som(100_000)}
          suggested={{ cash: som(100_000) }}
          settlement={settle(som(100_000), [], { book, roundStep: 0 })}
          refund={settleRefund(0, [], { book, roundStep: 0 })}
          action="Sotish"
          busy={false}
          onComplete={() => undefined}
          onBack={() => undefined}
          hiding={{
            hidden,
            onChange: (next) => {
              changes.push(next)
              setHidden(next)
            },
            peek,
            onPeek: setPeek,
          }}
        />
      )
    }
    render(<Hidden />)
    const shown = () => [...document.querySelectorAll('[data-tender]')].map((row) => row.getAttribute('data-tender'))
    expect(shown()).toEqual(['cash', 'account:humo', 'account:pos'])
    const line = screen.getByRole('button', { name: /Yashirilgan/ })
    expect(plain(line.textContent)).toBe('Yashirilgan: Naqd dollar, Uzcard *8841')

    await userEvent.click(line)
    expect(shown()).toEqual(['cash', 'cash:USD', 'account:humo', 'account:uzcard', 'account:pos'])
    // The so'm in cash is never hidden: it has no button.
    expect(within(document.querySelector('[data-tender="cash"]') as HTMLElement).queryByRole('button')).toBeNull()
    await userEvent.click(
      within(document.querySelector('[data-tender="cash:USD"]') as HTMLElement).getByRole('button', {
        name: 'Doim ko‘rsatish',
      }),
    )
    await userEvent.click(
      within(document.querySelector('[data-tender="account:pos"]') as HTMLElement).getByRole('button', {
        name: 'Yashirish',
      }),
    )
    expect(changes).toEqual([['uzcard'], ['uzcard', 'pos']])

    await userEvent.click(screen.getByRole('button', { name: /Yashirilganlarni yig‘ish/ }))
    expect(shown()).toEqual(['cash', 'cash:USD', 'account:humo'])
  })
})
