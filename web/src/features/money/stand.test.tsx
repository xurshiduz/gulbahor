import type { AccountDto, MoneyTransferDto, RateBook } from '@erp/core'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import '@/i18n'

import { moneyStand, standWorth } from './stand'
import { MoneyStandView } from './stand-view'

const som = (value: number) => value * 100
const usd = (value: number) => value * 100
const plain = (text: string) => text.replace(/\s/g, ' ')

const account = (id: string, part: Partial<AccountDto>): AccountDto => ({
  id,
  kind: 'cash',
  name: id,
  currency: 'UZS',
  locationId: 'shop-1',
  locationName: 'Gulbahor 1',
  locationIds: ['shop-1'],
  locationNames: ['Gulbahor 1'],
  registerId: null,
  last4: null,
  cardNumber: null,
  bank: null,
  balance: 0,
  isActive: true,
  ...part,
})

const registers = [
  { id: 'till-1', name: 'Gulbahor 1 kassasi' },
  { id: 'till-2', name: 'Gulbahor 2 kassasi' },
]
const second = {
  locationId: 'shop-2',
  locationName: 'Gulbahor 2',
  locationIds: ['shop-2'],
  locationNames: ['Gulbahor 2'],
}
const shared = {
  locationId: null,
  locationName: null,
  locationIds: ['shop-1', 'shop-2'],
  locationNames: ['Gulbahor 1', 'Gulbahor 2'],
}

const accounts: AccountDto[] = [
  account('drawer-1', { registerId: 'till-1', balance: som(5_000_000) }),
  account('drawer-1-usd', { registerId: 'till-1', currency: 'USD', balance: usd(300) }),
  account('drawer-2', { registerId: 'till-2', balance: som(3_000_000), ...second }),
  account('safe', { kind: 'safe', name: 'Asosiy seyf', balance: som(1_000_000) }),
  account('humo', {
    kind: 'card',
    name: 'Humo',
    cardNumber: '9860123456789012',
    bank: 'Ipak yo‘li',
    balance: som(4_000_000),
    ...shared,
  }),
  account('uzcard', {
    kind: 'card',
    name: 'Uzcard',
    cardNumber: '8600123456789012',
    balance: som(1_500_000),
    ...second,
  }),
  account('visa', {
    kind: 'card',
    name: 'Visa',
    currency: 'USD',
    cardNumber: '4000123456789010',
    balance: usd(700),
    ...shared,
  }),
  account('terminal', { kind: 'terminal', name: 'Ipak terminal', balance: som(500_000) }),
  account('old', { kind: 'bank', name: 'Eski hisob', balance: 0, isActive: false }),
]

const transfer = (part: Partial<MoneyTransferDto>): MoneyTransferDto => ({
  id: 'transfer',
  number: 'PO-000007',
  status: 'sent',
  currency: 'UZS',
  amount: som(2_000_000),
  toCurrency: part.currency ?? 'UZS',
  toAmount: part.amount ?? som(2_000_000),
  fx: 0,
  fromAccountId: 'drawer-1',
  fromAccountName: 'Gulbahor 1 kassasi',
  toAccountId: 'safe',
  toAccountName: 'Asosiy seyf',
  sentAt: '2026-10-06T09:00:00.000Z',
  sentByName: 'Kassir',
  decidedAt: null,
  decidedByName: null,
  note: null,
  reason: null,
  mayReceive: false,
  mayCancel: false,
  ...part,
})

describe('where the money stands', () => {
  it('is counted by currency, each split into what is in hand and what is a figure somewhere', () => {
    const [uzs, dollars] = moneyStand(accounts, registers, [])
    expect(uzs.currency).toBe('UZS')
    expect(uzs.cash.total).toBe(som(9_000_000))
    expect(uzs.cash.places.map((place) => place.account.id)).toEqual(['drawer-1', 'drawer-2', 'safe'])
    expect(uzs.cash.places[0].till).toBe('Gulbahor 1 kassasi')
    expect(uzs.cashless.total).toBe(som(6_000_000))
    // A place put away with nothing in it is not shown.
    expect(uzs.cashless.places.map((place) => place.account.id)).toEqual(['humo', 'uzcard', 'terminal'])
    expect(uzs.total).toBe(som(15_000_000))
    expect(dollars).toMatchObject({ currency: 'USD', total: usd(1000) })
    expect(dollars.cash.total).toBe(usd(300))
    expect(dollars.cashless.total).toBe(usd(700))
  })

  it('still counts money sent from one place and not yet confirmed at the other', () => {
    const [uzs] = moneyStand(accounts, registers, [
      transfer({}),
      transfer({ id: 'done', status: 'received', amount: som(900_000) }),
    ])
    expect(uzs.transit.total).toBe(som(2_000_000))
    expect(uzs.total).toBe(som(17_000_000))
  })

  it('shows one shop what it has to hand: its own places, and those it shares', () => {
    const [uzs, dollars] = moneyStand(accounts, registers, [transfer({})], 'shop-2')
    expect(uzs.cash.places.map((place) => place.account.id)).toEqual(['drawer-2'])
    expect(uzs.cashless.places.map((place) => [place.account.id, place.shared])).toEqual([
      ['humo', true],
      ['uzcard', false],
    ])
    // Money on its way between two places of another shop is not this one's.
    expect(uzs.transit.transfers).toEqual([])
    expect(uzs.total).toBe(som(8_500_000))
    expect(dollars.total).toBe(usd(700))
  })

  it('shows a place put away for as long as money is left in it', () => {
    const [uzs] = moneyStand([account('old', { kind: 'bank', balance: som(10), isActive: false })], registers, [])
    expect(uzs.cashless.places).toHaveLength(1)
  })

  it('leaves out balances the person may not see', () => {
    expect(moneyStand([account('drawer', { balance: null })], registers, [])).toEqual([])
  })

  it('has a block for every currency the business keeps, the base first, money or not', () => {
    const stand = moneyStand(accounts, registers, [], null, ['UZS', 'CNY', 'USD'])
    expect(stand.map((item) => [item.currency, item.total])).toEqual([
      ['UZS', som(15_000_000)],
      ['CNY', 0],
      ['USD', usd(1000)],
    ])
    expect(stand[1].cash.places).toEqual([])
  })

  it('values everything in so’m at the day’s rate, and says nothing without one', () => {
    const stand = moneyStand(accounts, registers, [])
    expect(standWorth(stand, 12_650)).toBe(som(15_000_000) + som(12_650_000))
    expect(standWorth(stand, null)).toBeNull()
    expect(standWorth(stand.slice(0, 1), null)).toBe(som(15_000_000))
  })
})

describe('the stand on the screen', () => {
  const show = (shopId: string | null = null) =>
    render(
      <MoneyStandView
        accounts={accounts}
        registers={registers}
        waiting={[transfer({})]}
        rates={12_650}
        shops={[
          { id: 'shop-1', name: 'Gulbahor 1' },
          { id: 'shop-2', name: 'Gulbahor 2' },
        ]}
        shopId={shopId}
        onShop={() => undefined}
      />,
    )
  const card = (currency: string) => document.querySelector(`[data-currency="${currency}"]`) as HTMLElement
  const line = (id: string) => plain(document.querySelector(`[data-place="${id}"]`)?.textContent ?? '')

  it('names each place by what it holds: a card by its number, a drawer by its till', () => {
    show()
    expect(line('drawer-1')).toBe('So‘m naqdGulbahor 1 kassasi5 000 000 so‘m')
    expect(line('drawer-1-usd')).toBe('Dollar naqdGulbahor 1 kassasi300,00 $')
    expect(line('safe')).toBe('So‘m naqd (Asosiy seyf)Gulbahor 11 000 000 so‘m')
    expect(line('humo')).toBe(
      'So‘m karta (9860 1234 5678 9012)Humo · Ipak yo‘li · Gulbahor 1 · Gulbahor 24 000 000 so‘m',
    )
    expect(line('visa')).toContain('Dollar karta (4000 1234 5678 9010)')
    expect(line('terminal')).toContain('Terminal (Ipak terminal)')
  })

  it('adds each currency up, the money on its way with it, and all of it as so’m', () => {
    show()
    const uzs = within(card('UZS'))
    expect(plain(card('UZS').querySelector('header')?.textContent ?? '')).toBe('So‘m17 000 000 so‘m')
    expect(plain(uzs.getByText('Naqd').closest('div')?.textContent ?? '')).toBe('Naqd9 000 000 so‘m')
    expect(plain(uzs.getByText('Naqdsiz').closest('div')?.textContent ?? '')).toBe('Naqdsiz6 000 000 so‘m')
    expect(plain(card('UZS').querySelector('[data-half="transit"]')?.textContent ?? '')).toContain('PO-000007')
    expect(card('USD').querySelector('[data-half="transit"]')).toBeNull()
    // 17 000 000 so'm and 1 000 $ at 12 650.
    expect(plain(screen.getByText('Hammasi so‘mda').parentElement?.textContent ?? '')).toBe(
      'Hammasi so‘mda29 650 000 so‘m1 $ = 12 650 so‘m',
    )
  })

  it('marks what a shop shares with another, under the shop it was asked about', () => {
    show('shop-2')
    expect(line('humo')).toContain('umumiy')
    expect(line('uzcard')).not.toContain('umumiy')
    expect(document.querySelector('[data-place="drawer-1"]')).toBeNull()
    expect(screen.getByRole('combobox').textContent).toBe('Gulbahor 2')
  })
})

describe('money kept in another currency', () => {
  /** So'm the base, the dollar 12 650, the yuan named against the dollar. */
  const book: RateBook = {
    base: 'UZS',
    rates: { USD: { against: 'UZS', way: 'in', value: 12_650 }, CNY: { against: 'USD', way: 'per', value: 7.25 } },
  }
  const withYuan = [
    ...accounts,
    account('yuan-safe', { kind: 'safe', name: 'Yuan seyfi', currency: 'CNY', balance: 725_000 }),
    account('union', { kind: 'card', name: 'UnionPay', currency: 'CNY', cardNumber: '6200123456789012', balance: 0 }),
  ]

  it('stands in its own block, after so’m and dollars, and is counted in with the rest', () => {
    const stand = moneyStand(withYuan, registers, [])
    expect(stand.map((item) => item.currency)).toEqual(['UZS', 'USD', 'CNY'])
    expect(stand[2]).toMatchObject({ total: 725_000 })
    expect(stand[2].cash.places.map((place) => place.account.id)).toEqual(['yuan-safe'])
    expect(stand[2].cashless.places.map((place) => place.account.id)).toEqual(['union'])
    // 15 000 000 so'm, 1 000 $ at 12 650, and 7 250 ¥ — which are another thousand dollars.
    expect(standWorth(stand, book)).toBe(som(15_000_000) + som(12_650_000) + som(12_650_000))
    // The yuan's rate hangs on the dollar's: without it the whole cannot be said.
    expect(standWorth(stand, { base: 'UZS', rates: { CNY: book.rates.CNY } })).toBeNull()
  })

  it('is named by its currency on the screen, and the sum of all says it is at the day’s rates', () => {
    render(
      <MoneyStandView
        accounts={withYuan}
        registers={registers}
        waiting={[]}
        rates={book}
        shops={[]}
        shopId={null}
        onShop={() => undefined}
      />,
    )
    const card = document.querySelector('[data-currency="CNY"]') as HTMLElement
    expect(plain(card.querySelector('header')?.textContent ?? '')).toBe('Yuan7 250,00 ¥')
    expect(plain(document.querySelector('[data-place="yuan-safe"]')?.textContent ?? '')).toBe(
      'Yuan naqd (Yuan seyfi)Gulbahor 17 250,00 ¥',
    )
    expect(plain(document.querySelector('[data-place="union"]')?.textContent ?? '')).toContain(
      'Yuan karta (6200 1234 5678 9012)',
    )
    expect(plain(screen.getByText('Hammasi so‘mda').parentElement?.textContent ?? '')).toBe(
      'Hammasi so‘mda40 300 000 so‘m1 $ = 12 650 so‘m · 1 ¥ = 1 744,83 so‘m',
    )
  })
})
