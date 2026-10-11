import type { PosContextDto, PosItemDto, RateBook, ReturnableDto, SaleLineDto } from '@erp/core'
import { describe, expect, it } from 'vitest'

import {
  addToCart,
  agreedOf,
  agreedText,
  autoReasons,
  backLines,
  badDiscount,
  cartTotals,
  changeLines,
  changeRows,
  changeText,
  discountOf,
  EMPTY_CART,
  linesTotal,
  refundRows,
  refundsOf,
  roundTotals,
  splitMultiplier,
  suggestRefunds,
  underFloor,
  type Cart,
  type TenderRow,
} from './pos-state'
import { uuid } from '@/lib/uuid'

const som = (amount: number) => amount * 100

const item = (variantId: string, price: number, epc: string | null = null): PosItemDto => ({
  variantId,
  productId: `p-${variantId}`,
  name: variantId,
  label: '',
  sku: variantId,
  price,
  minPrice: null,
  onHand: 10,
  decimals: 0,
  epc,
})

describe('cart', () => {
  it('adds to the line already there, and keeps each tagged piece apart', () => {
    let cart = addToCart(EMPTY_CART, item('shirt', som(95_000)), 1).cart
    cart = addToCart(cart, item('shirt', som(95_000)), 2).cart
    expect(cart.lines.map((line) => line.qty)).toEqual([3])

    const tagged = item('shirt', som(95_000), '47554C000000000000000001')
    const first = addToCart(cart, tagged, 5)
    expect(first.added).toBe(true)
    // A tag read is one piece, whatever multiplier was typed.
    expect(first.cart.lines.map((line) => line.qty)).toEqual([3, 1])
    // The reader reports the same tag again: nothing changes.
    const again = addToCart(first.cart, tagged, 1)
    expect(again.added).toBe(false)
    expect(again.cart).toBe(first.cart)
  })

  it('reads a discount as a percentage or a sum, never more than there is', () => {
    expect(discountOf('10%', som(95_000))).toBe(som(9500))
    expect(discountOf('5000', som(95_000))).toBe(som(5000))
    expect(discountOf('5k', som(95_000))).toBe(som(5000))
    expect(discountOf('200000', som(95_000))).toBe(som(95_000))
    expect(discountOf('', som(95_000))).toBe(0)
    expect(discountOf('abc', som(95_000))).toBe(0)
    expect(badDiscount('abc')).toBe(true)
    expect(badDiscount('120%')).toBe(true)
    expect(badDiscount('10%')).toBe(false)
    expect(badDiscount('  ')).toBe(false)
  })

  it('takes "=" as the sum agreed on, and what comes off as the rest', () => {
    // 1 620 000 on the tag, 1 600 000 agreed.
    expect(discountOf('=1600000', som(1_620_000))).toBe(som(20_000))
    expect(discountOf('=1 600 000', som(1_620_000))).toBe(som(20_000))
    expect(agreedOf('=1600000')).toBe(som(1_600_000))
    expect(agreedOf('10%')).toBeNull()
    // Written the way the till writes it, it reads back the same.
    expect(agreedOf(agreedText(som(1_600_000)))).toBe(som(1_600_000))
    // Haggling only brings a price down.
    expect(discountOf('=2000000', som(1_620_000))).toBe(0)
    expect(badDiscount('=2000000', som(1_620_000))).toBe(true)
    expect(badDiscount('=1600000', som(1_620_000))).toBe(false)
    expect(badDiscount('=1620000', som(1_620_000))).toBe(false)
    expect(badDiscount('=')).toBe(true)
  })

  it('offers the round sums a total is brought down to', () => {
    expect(roundTotals(som(1_770_000))).toEqual([som(1_700_000), som(1_600_000)])
    expect(roundTotals(som(285_000))).toEqual([som(280_000), som(270_000)])
    // Already round: the next ones down.
    expect(roundTotals(som(1_700_000))).toEqual([som(1_600_000), som(1_500_000)])
    expect(roundTotals(som(95_000))).toEqual([som(94_000), som(93_000)])
    // Too small to haggle over.
    expect(roundTotals(som(900))).toEqual([])
  })

  it('comes to the same sum the server will work out', () => {
    let cart = addToCart(EMPTY_CART, item('shirt', som(95_000)), 2).cart
    cart = addToCart(cart, item('scarf', som(40_000)), 1).cart
    cart = {
      ...cart,
      lines: cart.lines.map((line, index) => (index === 1 ? { ...line, discountText: '5000' } : line)),
      discountText: '10%',
    }
    const totals = cartTotals(cart)
    // 190 000 + 35 000 = 225 000; 10% of that is 22 500.
    expect(totals.lineDiscounts).toEqual([0, som(5000)])
    expect(totals.saleDiscount).toBe(som(22_500))
    expect(totals).toMatchObject({ subtotal: som(230_000), discount: som(27_500), total: som(202_500) })
    expect(totals.lines.reduce((sum, line) => sum + line.total, 0)).toBe(totals.total)
  })

  it('brings a line and then the whole sale down to what was agreed', () => {
    let cart = addToCart(EMPTY_CART, item('suit', som(740_000)), 1).cart
    cart = addToCart(cart, item('bag', som(1_030_000)), 1).cart
    // The bag for a round million, then the lot for 1 600 000.
    cart = {
      ...cart,
      lines: cart.lines.map((line, index) => (index === 1 ? { ...line, discountText: '=1000000' } : line)),
    }
    expect(linesTotal(cart)).toBe(som(1_740_000))
    cart = { ...cart, discountText: agreedText(som(1_600_000)) }
    const totals = cartTotals(cart)
    expect(totals.lineDiscounts).toEqual([0, som(30_000)])
    expect(totals.saleDiscount).toBe(som(140_000))
    expect(totals).toMatchObject({ subtotal: som(1_770_000), discount: som(170_000), total: som(1_600_000) })
    // Shared out over the lines to the tiyin.
    expect(totals.lines.reduce((sum, line) => sum + line.total, 0)).toBe(som(1_600_000))
  })
})

describe('the floor', () => {
  const dress = { ...item('dress', som(200_000)), minPrice: som(190_000) }
  const cartOf = (lineDiscount: string, saleDiscount = ''): Cart => ({
    ...EMPTY_CART,
    lines: [
      { key: 'a', item: dress, qty: 2, discountText: lineDiscount },
      { key: 'b', item: item('scarf', som(100_000)), qty: 1, discountText: '' },
    ],
    discountText: saleDiscount,
  })
  const under = (cart: Cart) => underFloor(cart, cartTotals(cart))

  it('is not crossed down to it, and is one tiyin under', () => {
    expect(under(cartOf(''))).toEqual([])
    expect(under(cartOf('20000'))).toEqual([])
    expect(under(cartOf('=380 000'))).toEqual([])
    expect(under(cartOf('=379 999'))).toEqual([{ index: 0, floor: som(380_000) }])
    // 6% is 24 000 off 400 000.
    expect(under(cartOf('6%'))).toEqual([{ index: 0, floor: som(380_000) }])
  })

  it('counts what a discount on the whole sale takes off the line', () => {
    // 50 000 off 500 000 is a tenth off each: the dresses land at 360 000.
    expect(under(cartOf('', '=450 000'))).toEqual([{ index: 0, floor: som(380_000) }])
    // The scarf has no floor and never shows here.
    expect(under(cartOf('', '=490 000'))).toEqual([])
  })

  it('is nothing for a cart kept from before floors were known', () => {
    const old = { ...item('old', som(50_000)) } as Partial<PosItemDto>
    delete old.minPrice
    const cart: Cart = {
      ...EMPTY_CART,
      lines: [{ key: 'a', item: old as PosItemDto, qty: 1, discountText: '90%' }],
    }
    expect(under(cart)).toEqual([])
  })
})

describe("the customer's own discount", () => {
  const cartOf = (lineDiscount: string, saleDiscount = ''): Cart => ({
    ...EMPTY_CART,
    lines: [
      { key: 'a', item: item('dress', som(200_000)), qty: 1, discountText: lineDiscount },
      { key: 'b', item: item('scarf', som(100_000)), qty: 1, discountText: '' },
    ],
    discountText: saleDiscount,
  })

  it('comes off every line by itself, and nothing changes without it', () => {
    expect(cartTotals(cartOf(''))).toMatchObject({ subtotal: som(300_000), auto: 0, total: som(300_000) })
    const totals = cartTotals(cartOf(''), 10)
    expect(totals).toMatchObject({ subtotal: som(300_000), auto: som(30_000), discount: som(30_000) })
    expect(totals.total).toBe(som(270_000))
    expect(totals.lines.map((line) => line.total)).toEqual([som(180_000), som(90_000)])
    expect(linesTotal(cartOf(''), 10)).toBe(som(270_000))
  })

  it("leaves the cashier's discount to be counted from what is left", () => {
    // 10% of the 180 000 the dress is at for this customer, not of its 200 000.
    const totals = cartTotals(cartOf('10%'), 10)
    expect(totals.lineDiscounts).toEqual([som(18_000), 0])
    expect(totals.lines[0]).toMatchObject({ auto: som(20_000), discount: som(38_000), total: som(162_000) })
    // A price agreed on for the line, and a sum agreed on for the sale, are what is paid.
    expect(cartTotals(cartOf('=170 000'), 10).lines[0].total).toBe(som(170_000))
    expect(cartTotals(cartOf('', '=250 000'), 10).total).toBe(som(250_000))
    // A price above what the line is now at is no discount at all.
    expect(badDiscount('=190 000', som(180_000))).toBe(true)
  })
})

describe('promotions in the cart', () => {
  const autumn = { id: 'autumn', name: 'Kuzgi aksiya', kind: 'percent' as const, value: 20, stackable: false }
  const cartOf = (lineDiscount = ''): Cart => ({
    ...EMPTY_CART,
    lines: [
      { key: 'a', item: { ...item('dress', som(200_000)), promos: [autumn] }, qty: 1, discountText: lineDiscount },
      { key: 'b', item: item('scarf', som(50_000)), qty: 1, discountText: '' },
    ],
  })

  it('come off the lines they cover, and are named', () => {
    const totals = cartTotals(cartOf())
    expect(totals).toMatchObject({ subtotal: som(250_000), auto: som(40_000), total: som(210_000) })
    expect(totals.autos.map((line) => [line.promo?.name ?? null, line.promoOff])).toEqual([
      ['Kuzgi aksiya', som(40_000)],
      [null, 0],
    ])
    expect(autoReasons(totals.autos, null)).toBe('Kuzgi aksiya')
  })

  it("stand beside the customer's own discount line by line: the greater of the two on each", () => {
    // The dress is 20% off by the promotion; the scarf, which it does not cover, 10% off as hers.
    const totals = cartTotals(cartOf(), 10)
    expect(totals.autos.map((line) => [line.promoOff, line.ownOff])).toEqual([
      [som(40_000), 0],
      [0, som(5000)],
    ])
    expect(totals.total).toBe(som(205_000))
    expect(autoReasons(totals.autos, 'Doimiy 10%')).toBe('Kuzgi aksiya, Doimiy 10%')
    // Where her own discount took part in nothing, it is not named.
    expect(autoReasons(cartTotals(cartOf()).autos, 'Doimiy 10%')).toBe('Kuzgi aksiya')
  })

  it("leave the cashier's discount to be counted from the promotion's price", () => {
    const totals = cartTotals(cartOf('10%'))
    // 10% of the 160 000 the dress is at, not of its 200 000.
    expect(totals.lineDiscounts).toEqual([som(16_000), 0])
    expect(totals.lines[0].total).toBe(som(144_000))
  })
})

describe('the search field', () => {
  it('takes a count before the thing', () => {
    expect(splitMultiplier('3*')).toEqual({ qty: 3, rest: '' })
    expect(splitMultiplier('12 * polo')).toEqual({ qty: 12, rest: 'polo' })
    expect(splitMultiplier('polo')).toEqual({ qty: null, rest: 'polo' })
    expect(splitMultiplier('0*polo')).toEqual({ qty: null, rest: 'polo' })
    // A barcode is not a count.
    expect(splitMultiplier('2000000000015')).toEqual({ qty: null, rest: '2000000000015' })
  })
})

describe('change', () => {
  it("is said in the other currency first, then so'm", () => {
    const plain = (text: string) => text.replace(/\s/g, ' ')
    const cash = (amount: number, currency: 'UZS' | 'USD' | 'CNY' = 'UZS') => ({
      way: 'cash' as const,
      currency,
      amount,
    })
    expect(plain(changeText([cash(som(10_000))]))).toBe('10 000 so‘m')
    expect(plain(changeText([cash(som(11_000)), cash(600, 'USD')]))).toBe('6 $ + 11 000 so‘m')
    expect(plain(changeText([cash(650, 'USD')]))).toBe('6,50 $')
    expect(plain(changeText([cash(7100, 'CNY')]))).toBe('71 ¥')
    // What is kept on an account or sent from a card is no cash to count out.
    expect(changeText([{ way: 'account', currency: 'UZS', amount: som(5000) }])).toBe('')
    expect(changeText([])).toBe('')
  })

  const book: RateBook = { base: 'UZS', rates: { USD: { against: 'UZS', way: 'in', value: 12_650 } } }
  const till = {
    book,
    currencies: ['UZS', 'USD', 'CNY'],
    cards: [{ id: 'humo', currency: 'UZS' }],
  } as unknown as PosContextDto

  it('can go back from every drawer that has a rate, onto the customer’s account, from every card', () => {
    // The yuan has no rate today: nothing can be counted in it.
    expect(changeRows(till, 'USD').map((row) => [row.key, row.way, row.currency, row.accountId])).toEqual([
      ['cash:USD', 'cash', 'USD', null],
      ['account', 'account', 'USD', null],
      ['card:humo', 'card', 'UZS', 'humo'],
    ])
    expect(changeRows(till, null).map((row) => row.key)).toEqual(['cash:USD', 'card:humo'])
  })

  it('is written as it will be sent: notes for what is left to give, an account at the rate', () => {
    const typed = (patch: Record<string, { amount?: number; value?: number }>, account: 'UZS' | 'USD' | null = null) =>
      changeLines(
        changeRows(till, account).map((row) => ({ ...row, ...patch[row.key] })),
        som(25_000),
        book,
      ).map((line) => [line.key, line.amount, line.value])
    // One dollar is 12 650: within what there is to give, it goes at the rate.
    expect(typed({ 'cash:USD': { amount: 100 } })).toEqual([['cash:USD', 100, null]])
    // Two are 25 300: they go for the 25 000 there is, and for less once a card has sent part.
    expect(typed({ 'cash:USD': { amount: 200 } })).toEqual([['cash:USD', 200, som(25_000)]])
    expect(typed({ 'cash:USD': { amount: 200 }, 'card:humo': { amount: som(5000) } })).toEqual([
      ['cash:USD', 200, som(20_000)],
      ['card:humo', som(5000), null],
    ])
    // A worth typed is the worth.
    expect(typed({ 'cash:USD': { amount: 200, value: som(24_000) } })).toEqual([['cash:USD', 200, som(24_000)]])
    // Kept on an account in the base it is the sum itself; in dollars, what the rate makes of it or what was agreed.
    expect(typed({ account: { value: som(15_000) } }, 'UZS')).toEqual([['account', som(15_000), null]])
    expect(typed({ account: { value: som(12_650) } }, 'USD')).toEqual([['account', 100, som(12_650)]])
    expect(typed({ account: { value: som(13_000), amount: 100 } }, 'USD')).toEqual([['account', 100, som(13_000)]])
    // Nothing typed, nothing sent.
    expect(typed({}, 'USD')).toEqual([])
  })
})

describe('uuid', () => {
  it('is a version 4 id', () => {
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(uuid()).not.toBe(uuid())
  })
})

describe('goods coming back', () => {
  const line = (id: string, qty: number, total: number, returnedQty = 0, returnedTotal = 0) =>
    ({ id, qty, total, returnedQty, returnedTotal }) as SaleLineDto
  const found = (caps: Omit<ReturnableDto['caps'], 'account'>, free = false) =>
    ({
      sale: { lines: [line('a', 2, som(171_000)), line('b', 1, som(36_000))] },
      caps: { account: 0, ...caps },
      free,
    }) as ReturnableDto

  it('are worth what was paid for them, line by line', () => {
    const returning = { found: found({ cash: som(207_000), accounts: [] }), qty: { a: 1, b: 0 }, reason: '' }
    expect(backLines(returning).map((item) => [item.line.id, item.qty, item.total])).toEqual([['a', 1, som(85_500)]])
    expect(backLines(null)).toEqual([])
  })

  it('are paid for in cash as far as cash was paid, the rest to the card', () => {
    const card = { accountId: 'humo', method: 'card' as const, name: 'Humo', last4: '3073', left: som(200_000) }
    const mixed = found({ cash: som(100_000), accounts: [card] })
    // 300 000 back on a receipt paid 100 000 in cash and 200 000 by card.
    expect(suggestRefunds(som(300_000), mixed, som(1000))).toEqual({
      cash: som(100_000),
      'account:humo': som(200_000),
    })
    // Less than the cash that was paid: all of it in cash, rounded as change is.
    expect(suggestRefunds(som(85_500), mixed, som(1000))).toEqual({ cash: som(86_000) })
    // Someone allowed to hand it back otherwise is offered cash for the lot.
    expect(suggestRefunds(som(300_000), found({ cash: 0, accounts: [card] }, true), som(1000))).toEqual({
      cash: som(300_000),
    })

    const context = {
      currencies: ['UZS', 'USD'],
      cards: [{ id: 'other' }],
      terminals: [{ id: 'pos' }],
    } as unknown as PosContextDto
    // Handed back in dollars: at the rate while that fits what is owed, for what is owed once it is more.
    const rates: RateBook = { base: 'UZS', rates: { USD: { against: 'UZS', way: 'in', value: 12_650 } } }
    const row = (key: string, currency: 'UZS' | 'USD', amount: number, value: number | null = null) =>
      ({ key, method: 'cash', currency, accountId: null, amount, value, reference: '' }) as TenderRow
    const handed = (rows: TenderRow[]) => refundsOf(rows, som(75_000), rates).map((item) => [item.amount, item.value])
    expect(handed([row('cash:USD', 'USD', 500)])).toEqual([[500, null]])
    // Six dollars are 75 900: they go for the 75 000 owed, and for less beside so'm already handed back.
    expect(handed([row('cash:USD', 'USD', 600)])).toEqual([[600, som(75_000)]])
    expect(handed([row('cash', 'UZS', som(10_000)), row('cash:USD', 'USD', 600)])).toEqual([
      [som(10_000), null],
      [600, som(65_000)],
    ])
    expect(handed([row('cash:USD', 'USD', 600, som(74_000))])).toEqual([[600, som(74_000)]])

    // The fields are cash, and the card the receipt was paid with: not the shop's other cards.
    expect(refundRows(context, mixed).map((row) => [row.key, row.method, row.currency, row.accountId])).toEqual([
      ['cash', 'cash', 'UZS', null],
      ['cash:USD', 'cash', 'USD', null],
      ['account:humo', 'card', 'UZS', 'humo'],
    ])
  })
})
