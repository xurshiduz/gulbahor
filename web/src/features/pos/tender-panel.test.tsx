import { formatMoney, settle, settleRefund, type AccountDto, type PosContextDto, type PosItemDto } from '@gulbahor/core'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { cartTotals, enteredRows, tenderRows, tendersOf, type Cart, type TenderRow } from './pos-state'
import { ReceiptPreview } from './receipt-preview'
import { TenderPanel } from './tender-panel'

const som = (amount: number) => amount * 100
/** Thousands are kept apart by a space that does not break: here it is only a space. */
const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

const account = (id: string, kind: 'card' | 'terminal', name: string, last4: string | null = null) =>
  ({ id, kind, name, last4, currency: 'UZS' }) as AccountDto

const context = {
  usd: true,
  rate: { uzsPerUsd: 12_100 },
  cards: [account('humo', 'card', 'Humo', '3073'), account('uzcard', 'card', 'Uzcard', '8841')],
  terminals: [account('pos', 'terminal', 'Ipak yo‘li')],
  approvers: [{ id: 'm', name: 'Anvar', discount: true, returns: true }],
  maxRateLossPercent: 2,
  mayOverDiscount: false,
  changeRoundStep: 0,
} as unknown as PosContextDto

/** The money for a sale of `due`, kept the way the till keeps it. */
function Money({ due, onComplete }: { due: number; onComplete: (rows: TenderRow[]) => void }) {
  const [paid, setPaid] = useState<Record<string, Partial<TenderRow>>>({})
  const rows = tenderRows(context).map((row) => ({ ...row, ...paid[row.key] }))
  const entered = enteredRows(rows)
  const settlement = settle(due, tendersOf(entered, false), { uzsPerUsd: 12_100, changeCurrency: 'UZS', roundStep: 0 })
  return (
    <TenderPanel
      context={context}
      rows={rows}
      onPatch={(key, patch) => setPaid((current) => ({ ...current, [key]: { ...current[key], ...patch } }))}
      returning={null}
      refunding={false}
      due={due}
      suggested={{ cash: due }}
      settlement={settlement}
      refund={settleRefund(0, [], { uzsPerUsd: 12_100, roundStep: 0 })}
      changeCurrency="UZS"
      onChangeCurrency={() => undefined}
      action="Sotish"
      busy={false}
      onComplete={() => onComplete(entered)}
      onBack={() => undefined}
    />
  )
}

const field = (key: string) =>
  document.querySelector<HTMLInputElement>(`[data-tender="${key}"] input`) as HTMLInputElement

describe('the rows money is paid into', () => {
  it('are one for each way of paying, every card and terminal with its own', () => {
    expect(tenderRows(context).map((row) => [row.key, row.method, row.currency, row.accountId])).toEqual([
      ['cash', 'cash', 'UZS', null],
      ['usd', 'cash', 'USD', null],
      ['account:humo', 'card', 'UZS', 'humo'],
      ['account:uzcard', 'card', 'UZS', 'uzcard'],
      ['account:pos', 'terminal', 'UZS', 'pos'],
    ])
    // A till that takes neither dollars nor cards has so'm alone.
    const bare = { usd: false, cards: [], terminals: [] } as unknown as PosContextDto
    expect(tenderRows(bare).map((row) => row.key)).toEqual(['cash'])
  })

  it('are named by their card, and the first of a kind carries the key', () => {
    render(<Money due={som(200_000)} onComplete={() => undefined} />)
    const row = (key: string) => plain(document.querySelector(`[data-tender="${key}"]`)?.textContent)
    expect(row('cash')).toContain("Naqd so'm")
    expect(row('account:humo')).toContain('Humo *3073')
    expect(row('account:humo')).toContain('F7')
    expect(row('account:uzcard')).toContain('Uzcard *8841')
    expect(row('account:uzcard')).not.toContain('F7')
    expect(row('account:pos')).toContain('F8')
    // Nothing typed: so'm cash for the lot is what is meant, and it shows faintly.
    expect(plain(field('cash').placeholder)).toBe('200 000')
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
    await waitFor(() => expect(document.activeElement).toBe(field('usd')))
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
    await userEvent.type(field('usd'), '50{Enter}')
    // 605 000 at the rate, 95 000 still to pay: on to the next sum, past the agreed worth.
    await waitFor(() => expect(document.activeElement).toBe(field('account:humo')))
    const taken = within(document.querySelector('[data-tender="usd"]') as HTMLElement).getAllByRole('textbox')[1]
    expect(plain((taken as HTMLInputElement).placeholder)).toBe('605 000')

    // The terminal's slip number appears with its sum, and is not on Enter's way either.
    await userEvent.type(field('account:pos'), '95000{Enter}')
    await waitFor(() => expect(screen.getByText('Chek raqami')).toBeTruthy())
    expect(document.activeElement).toBe(field('account:pos'))
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(sold).toHaveBeenCalledTimes(1))
  })
})

describe('Tab in the money', () => {
  it('reaches the agreed worth straight from the dollars it is for', async () => {
    const sold = vi.fn()
    render(<Money due={som(600_000)} onComplete={sold} />)
    // The field is there as soon as the cursor is in the row: Tab does not go past where it would appear.
    field('usd').focus()
    await userEvent.keyboard('50')
    await userEvent.tab()
    const taken = within(document.querySelector('[data-tender="usd"]') as HTMLElement).getAllByRole('textbox')[1]
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
      ['usd', 5000, som(600_000)],
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
        { key: 'a', item: { ...item("Ko'ylak", som(900_000)), label: 'M, qora' }, qty: 2, discountText: '100000' },
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
    expect(text).toContain("Ko'ylak, M, qora")
    // Everything that came off a line is said on the line: the 1 600 000 agreed on is 170 000 less than the
    // lines came to, and the dresses bear their share of it beside the 100 000 of their own.
    const [dresses, scarf] = totals.lines
    expect(dresses.total + scarf.total).toBe(160_000_000)
    expect(text).toContain(`2 × 900 000 so'm − ${plain(formatMoney(dresses.discount, 'UZS', { minor: 'auto' }))}`)
    expect(text).toContain(plain(formatMoney(dresses.total, 'UZS', { minor: 'auto' })))
    expect(plain(screen.getByText('Chegirma').parentElement?.textContent)).toContain("−270 000 so'm")
    expect(plain(screen.getByText('Jami').parentElement?.textContent)).toContain("1 600 000 so'm")
    expect(text).toContain('Sotuvchi: Dilnoza')
  })
})
