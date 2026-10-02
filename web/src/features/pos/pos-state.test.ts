import type { PosContextDto, PosItemDto, ReturnableDto, SaleLineDto } from '@gulbahor/core'
import { describe, expect, it } from 'vitest'

import {
  addToCart,
  backLines,
  badDiscount,
  cartTotals,
  changeText,
  discountOf,
  EMPTY_CART,
  refundRows,
  splitMultiplier,
  suggestRefunds,
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
  it("is said dollars first, then so'm", () => {
    const plain = (text: string) => text.replace(/\s/g, ' ')
    expect(plain(changeText(som(10_000), 0))).toBe("10 000 so'm")
    expect(plain(changeText(som(11_000), 600))).toBe("6 $ + 11 000 so'm")
    expect(plain(changeText(0, 600))).toBe('6 $')
    expect(plain(changeText(0, 0))).toBe("0 so'm")
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
  const found = (caps: ReturnableDto['caps'], free = false) =>
    ({ sale: { lines: [line('a', 2, som(171_000)), line('b', 1, som(36_000))] }, caps, free }) as ReturnableDto

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

    const context = { usd: true, cards: [{ id: 'other' }], terminals: [{ id: 'pos' }] } as PosContextDto
    // The fields are cash, and the card the receipt was paid with: not the shop's other cards.
    expect(refundRows(context, mixed).map((row) => [row.key, row.method, row.currency, row.accountId])).toEqual([
      ['cash', 'cash', 'UZS', null],
      ['usd', 'cash', 'USD', null],
      ['account:humo', 'card', 'UZS', 'humo'],
    ])
  })
})
