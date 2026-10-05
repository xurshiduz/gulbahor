import { describe, expect, it } from 'vitest'

import {
  belowFloor,
  floorOf,
  fromBase,
  gross,
  returnInputSchema,
  returnShare,
  saleInputSchema,
  saleTotals,
  settle,
  settleRefund,
  toBase,
  type Tender,
} from './pos'

const som = (amount: number) => amount * 100
const usd = (amount: number) => Math.round(amount * 100)

const ID = '11111111-1111-4111-8111-111111111111'
const KEY = '22222222-2222-4222-8222-222222222222'

describe('sale totals', () => {
  it('multiplies price by quantity exactly', () => {
    expect(gross(som(95_000), 3)).toBe(som(285_000))
    // 1.25 m at 33 333,33 so'm: 41 666,6625, rounded half up to the tiyin.
    expect(gross(3_333_333, 1.25)).toBe(4_166_666)
    expect(gross(1, 0.5)).toBe(1)
  })

  it('shares a discount on the whole sale over the lines to the tiyin', () => {
    const totals = saleTotals(
      [
        { price: som(95_000), qty: 2, discount: 0 },
        { price: som(40_000), qty: 1, discount: som(5000) },
        { price: som(10_000), qty: 1, discount: 0 },
      ],
      som(10_000),
    )
    expect(totals.subtotal).toBe(som(240_000))
    expect(totals.discount).toBe(som(15_000))
    expect(totals.total).toBe(som(225_000))
    // 10 000 over 190 000, 35 000 and 10 000: the parts add up exactly.
    expect(totals.lines.map((line) => line.discount)).toEqual([808_511, 648_936, 42_553])
    expect(totals.lines.reduce((sum, line) => sum + line.total, 0)).toBe(totals.total)
  })

  it('never discounts below nothing', () => {
    const totals = saleTotals([{ price: som(10_000), qty: 1, discount: som(50_000) }], som(1000))
    expect(totals).toMatchObject({ subtotal: som(10_000), discount: som(10_000), total: 0 })
  })
})

describe('the floor', () => {
  const lines = [
    { price: som(100_000), minPrice: som(95_000), qty: 1 },
    { price: som(100_000), minPrice: som(60_000), qty: 2 },
    { price: som(40_000), minPrice: null, qty: 1 },
  ]
  const under = (discounts: number[], saleDiscount = 0) =>
    belowFloor(
      lines,
      saleTotals(
        lines.map((line, index) => ({ price: line.price, qty: line.qty, discount: discounts[index] })),
        saleDiscount,
      ),
    )

  it('is for as many as are sold, and never above the price itself', () => {
    expect(floorOf(som(100_000), som(60_000), 2)).toBe(som(120_000))
    expect(floorOf(som(100_000), null, 2)).toBeNull()
    // A floor above the price is a slip in the price list: the price as it stands is not under it.
    expect(floorOf(som(100_000), som(130_000), 1)).toBe(som(100_000))
    expect(
      belowFloor(
        [{ price: som(100_000), minPrice: som(130_000), qty: 1 }],
        saleTotals([{ price: som(100_000), qty: 1, discount: 0 }], 0),
      ),
    ).toEqual([])
  })

  it('is crossed by what a line ends up at, its share of the discount on the whole sale counted', () => {
    expect(under([0, 0, 0])).toEqual([])
    // Right on the floor is not under it.
    expect(under([som(5000), som(80_000), 0])).toEqual([])
    expect(under([som(5001), 0, 0])).toEqual([0])
    // Without a floor a thing may go for anything.
    expect(under([0, 0, som(40_000)])).toEqual([])
    // 34 000 off 340 000 is a tenth off each line: the first lands at 90 000, under its 95 000.
    expect(under([0, 0, 0], som(34_000))).toEqual([0])
    expect(under([0, som(90_000), 0], som(34_000))).toEqual([0, 1])
  })
})

describe('dollars', () => {
  it("are worth what the day's rate says, to the tiyin", () => {
    expect(toBase(usd(100), 'USD', 12_850)).toBe(som(1_285_000))
    expect(toBase(usd(0.01), 'USD', 12_850.55)).toBe(12_851)
    expect(toBase(som(5000), 'UZS', null)).toBe(som(5000))
    expect(() => toBase(usd(1), 'USD', null)).toThrow(RangeError)
    expect(fromBase(som(1_285_000), 12_850)).toBe(usd(100))
    expect(fromBase(som(150_000), 12_850)).toBe(usd(11.67))
  })
})

describe('settle', () => {
  const cash = (amount: number, currency: 'UZS' | 'USD' = 'UZS'): Tender => ({ method: 'cash', currency, amount })
  const options = { uzsPerUsd: 12_850, changeCurrency: 'UZS' as const, roundStep: som(1000) }

  it('says what is still to pay, in both currencies', () => {
    const result = settle(som(285_000), [cash(som(100_000))], options)
    expect(result).toMatchObject({ paid: som(100_000), due: som(185_000), changeUzs: 0, changeUsd: 0, problem: null })
    // 185 000 / 12 850 = 14,396...: a cent more covers it.
    expect(result.dueUsd).toBe(usd(14.4))
  })

  it("takes so'm, dollars and a card in one sale and works out the change", () => {
    const tenders: Tender[] = [
      cash(usd(10), 'USD'),
      { method: 'card', currency: 'UZS', amount: som(100_000) },
      cash(som(60_000)),
    ]
    // 128 500 + 100 000 + 60 000 = 288 500 against 285 000: 3 500 back, rounded to 4 000.
    const result = settle(som(285_000), tenders, options)
    expect(result).toMatchObject({
      paid: som(288_500),
      due: 0,
      changeUzs: som(4000),
      changeUsd: 0,
      changeBase: som(4000),
      rounding: -som(500),
      problem: null,
    })
    // Without rounding the change is exact and nothing is left over.
    expect(settle(som(285_000), tenders, { ...options, roundStep: 0 })).toMatchObject({
      changeUzs: som(3500),
      rounding: 0,
    })
  })

  it("gives change in dollars as whole dollars, and what is left of it in so'm", () => {
    // 100 $ = 1 285 000 against 950 000: 335 000 over is 26 $ (334 100) and 900 so'm, handed back as 1 000.
    const result = settle(som(950_000), [cash(usd(100), 'USD')], { ...options, changeCurrency: 'USD' })
    expect(result).toMatchObject({
      changeUsd: usd(26),
      changeUzs: som(1000),
      changeBase: som(335_100),
      rounding: -som(100),
    })
    expect(result.paid - result.changeBase - result.rounding).toBe(som(950_000))
    // Less than a dollar over: all of it in so'm.
    expect(settle(som(950_000), [cash(usd(74), 'USD')], { ...options, changeCurrency: 'USD' })).toMatchObject({
      changeUsd: 0,
      changeUzs: som(1000),
    })
  })

  it('refuses a card that takes more than the sale, and dollars without a rate', () => {
    const card: Tender = { method: 'terminal', currency: 'UZS', amount: som(300_000) }
    expect(settle(som(285_000), [card], options).problem).toBe('non_cash_over')
    expect(settle(som(285_000), [cash(usd(30), 'USD')], { ...options, uzsPerUsd: null }).problem).toBe('rate')
    // Exactly covered by a card is fine.
    expect(settle(som(285_000), [{ ...card, amount: som(285_000) }], options)).toMatchObject({
      due: 0,
      changeUzs: 0,
      problem: null,
    })
  })
})

describe('saleInputSchema', () => {
  const base = {
    clientKey: KEY,
    registerId: ID,
    lines: [{ variantId: ID, qty: 1 }],
    payments: [{ method: 'cash', amount: som(95_000) }],
    total: som(95_000),
  }
  const refused = (input: unknown) => {
    const result = saleInputSchema.safeParse(input)
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
  }

  it('fills in what a plain cash sale leaves out', () => {
    const sale = saleInputSchema.parse(base)
    expect(sale).toMatchObject({ discount: 0, changeCurrency: 'UZS', sellerId: null })
    expect(sale.lines[0]).toMatchObject({ discount: 0, epc: null })
    expect(sale.payments[0]).toMatchObject({ currency: 'UZS', accountId: null })
  })

  it("wants a card or a terminal named, and only so'm on them", () => {
    expect(refused({ ...base, payments: [{ method: 'card', amount: 1 }] })).toEqual(['payments.0.accountId'])
    expect(refused({ ...base, payments: [{ method: 'terminal', accountId: ID, currency: 'USD', amount: 1 }] })).toEqual(
      ['payments.0.currency'],
    )
    expect(refused({ ...base, payments: [{ method: 'cash', amount: 0 }] })).toEqual(['payments.0.amount'])
  })

  it('sells a tagged piece once, one at a time', () => {
    const epc = '47554C000000000000000001'
    const twice = [
      { variantId: ID, qty: 1, epc },
      { variantId: ID, qty: 1, epc },
    ]
    expect(refused({ ...base, lines: twice })).toEqual(['lines.1.epc'])
    expect(refused({ ...base, lines: [{ variantId: ID, qty: 2, epc }] })).toEqual(['lines.0.qty'])
    expect(refused({ ...base, lines: [] })).toEqual(['lines'])
  })
})

describe('returns', () => {
  const cash = (amount: number, currency: 'UZS' | 'USD' = 'UZS'): Tender => ({ method: 'cash', currency, amount })
  const options = { uzsPerUsd: 12_850, roundStep: som(1000) }

  it('values what comes back at what was paid for it, and the parts add up', () => {
    // Three shirts sold for 256 500 after a discount: 85 500 each.
    const line = { qty: 3, total: som(256_500), returnedQty: 0, returnedTotal: 0 }
    expect(returnShare(line, 1)).toBe(som(85_500))
    expect(returnShare(line, 3)).toBe(som(256_500))

    // A total that does not divide: the last one takes what is left.
    const odd = { qty: 3, total: som(100_000), returnedQty: 0, returnedTotal: 0 }
    const first = returnShare(odd, 1)
    const second = returnShare({ ...odd, returnedQty: 1, returnedTotal: first }, 1)
    const third = returnShare({ ...odd, returnedQty: 2, returnedTotal: first + second }, 1)
    expect([first, second, third]).toEqual([3_333_333, 3_333_333, 3_333_334])
    // Cloth by the metre: 1,25 m of 2,5.
    expect(returnShare({ qty: 2.5, total: som(100_000), returnedQty: 0, returnedTotal: 0 }, 1.25)).toBe(som(50_000))
  })

  it("hands the money back to the sum, with so'm cash rounded as change is", () => {
    expect(settleRefund(som(85_500), [cash(som(85_500))], options)).toMatchObject({
      due: 0,
      rounding: 0,
      problem: null,
    })
    // Rounded to the till's step: the shop gives 500 more.
    expect(settleRefund(som(85_500), [cash(som(86_000))], options)).toMatchObject({
      due: 0,
      rounding: -som(500),
      problem: null,
    })
    // Part to the card it was paid with, the rest in cash.
    const card: Tender = { method: 'card', currency: 'UZS', amount: som(50_000) }
    expect(settleRefund(som(85_500), [card, cash(som(35_500))], options)).toMatchObject({ due: 0, problem: null })
    expect(settleRefund(som(85_500), [card], options)).toMatchObject({ due: som(35_500), problem: null })
    // 2 $ = 25 700, the rest 59 800 in so'm.
    expect(settleRefund(som(85_500), [cash(usd(2), 'USD'), cash(som(60_000))], options)).toMatchObject({
      due: 0,
      rounding: -som(200),
      problem: null,
    })
  })

  it('refuses more than is owed, and dollars without a rate', () => {
    expect(settleRefund(som(85_500), [cash(som(90_000))], options).problem).toBe('over')
    expect(settleRefund(som(85_500), [{ method: 'card', currency: 'UZS', amount: som(90_000) }], options).problem).toBe(
      'over',
    )
    expect(settleRefund(som(85_500), [cash(usd(5), 'USD')], { ...options, uzsPerUsd: null }).problem).toBe('rate')
    // Nothing owed (all of it went towards other goods): nothing is handed back.
    expect(settleRefund(0, [], options)).toMatchObject({ due: 0, rounding: 0, problem: null })
  })

  it('takes a line of the receipt once', () => {
    const input = {
      clientKey: KEY,
      registerId: ID,
      saleId: ID,
      lines: [
        { saleLineId: ID, qty: 1 },
        { saleLineId: ID, qty: 1 },
      ],
      total: som(95_000),
    }
    expect(returnInputSchema.safeParse(input).success).toBe(false)
    const parsed = returnInputSchema.parse({ ...input, lines: [input.lines[0]] })
    expect(parsed).toMatchObject({ refunds: [], exchange: null })
  })
})
