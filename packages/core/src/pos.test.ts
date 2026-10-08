import { describe, expect, it } from 'vitest'

import {
  belowFloor,
  floorOf,
  fromBase,
  gross,
  overRateLoss,
  rateGain,
  returnInputSchema,
  returnShare,
  saleInputSchema,
  saleTotals,
  settle,
  settleRefund,
  toBase,
  worthOf,
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
    expect(toBase(usd(100), 'USD', 12_850, 'UZS')).toBe(som(1_285_000))
    expect(toBase(usd(0.01), 'USD', 12_850.55, 'UZS')).toBe(12_851)
    expect(toBase(som(5000), 'UZS', null, 'UZS')).toBe(som(5000))
    expect(() => toBase(usd(1), 'USD', null, 'UZS')).toThrow(RangeError)
    expect(fromBase(som(1_285_000), 12_850)).toBe(usd(100))
    expect(fromBase(som(150_000), 12_850)).toBe(usd(11.67))
  })
})

describe('a till in another base', () => {
  const tenge = (amount: number) => amount * 100
  const kzt = { uzsPerUsd: 480, changeCurrency: null, roundStep: tenge(10), base: 'KZT' as const }

  it('counts the base as itself and dollars at the base’s rate', () => {
    expect(toBase(tenge(5000), 'KZT', null, 'KZT')).toBe(tenge(5000))
    expect(toBase(usd(10), 'USD', 480, 'KZT')).toBe(tenge(4800))
    expect(() => toBase(usd(10), 'USD', null, 'KZT')).toThrow(RangeError)
  })

  it('settles a tenge sale paid partly in dollars, the change in tenge rounded to the step', () => {
    const tenders: Tender[] = [
      { method: 'cash', currency: 'KZT', amount: tenge(2000) },
      { method: 'cash', currency: 'USD', amount: usd(20) },
    ]
    // 2 000 + 9 600 = 11 600 against 11 248: 352 over, 350 handed back, 2 left with the shop.
    expect(settle(tenge(11_248), tenders, kzt)).toMatchObject({
      paid: tenge(11_600),
      changeUzs: tenge(350),
      changeUsd: 0,
      rounding: tenge(2),
      problem: null,
    })
    // Whole dollars first when the customer asks for them.
    expect(
      settle(tenge(1600), [{ method: 'cash', currency: 'USD', amount: usd(10) }], { ...kzt, changeCurrency: 'USD' }),
    ).toMatchObject({ changeUsd: usd(6), changeUzs: tenge(320), rounding: 0 })
  })

  it('takes no rate where the dollar is the base, and gives no change in dollars beside it', () => {
    const dollarsOnly = { uzsPerUsd: null, changeCurrency: 'USD' as const, roundStep: usd(1), base: 'USD' as const }
    expect(settle(usd(37.6), [{ method: 'cash', currency: 'USD', amount: usd(50) }], dollarsOnly)).toMatchObject({
      paid: usd(50),
      changeUzs: usd(12),
      changeUsd: 0,
      rounding: usd(0.4),
      problem: null,
    })
    expect(worthOf({ method: 'cash', currency: 'USD', amount: usd(50) }, null, 'USD')).toBe(usd(50))
    expect(settleRefund(usd(12.4), [{ method: 'cash', currency: 'USD', amount: usd(12) }], dollarsOnly)).toMatchObject({
      due: 0,
      rounding: usd(0.4),
      problem: null,
    })
  })
})

describe('settle', () => {
  const cash = (amount: number, currency: 'UZS' | 'USD' = 'UZS'): Tender => ({ method: 'cash', currency, amount })
  const options = { uzsPerUsd: 12_850, changeCurrency: 'UZS' as const, roundStep: som(1000), base: 'UZS' as const }

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

describe('dollars taken for an agreed worth', () => {
  const dollars = (amount: number, value?: number): Tender => ({ method: 'cash', currency: 'USD', amount, value })
  const options = { uzsPerUsd: 12_100, changeCurrency: 'UZS' as const, roundStep: som(1000), base: 'UZS' as const }

  it('count for what was agreed, and the rate keeps the difference', () => {
    // 50 $ are 605 000 at 12 100.
    expect(worthOf(dollars(usd(50)), 12_100, 'UZS')).toBe(som(605_000))
    expect(rateGain(dollars(usd(50)), 12_100, 'UZS')).toBe(0)
    // "Call them 600 000": the shop is left with 5 000 more than the sale took.
    expect(worthOf(dollars(usd(50), som(600_000)), 12_100, 'UZS')).toBe(som(600_000))
    expect(rateGain(dollars(usd(50), som(600_000)), 12_100, 'UZS')).toBe(som(5000))
    // At 11 800 the same 50 $ are 590 000: calling them 600 000 costs the shop 10 000.
    expect(rateGain(dollars(usd(50), som(600_000)), 11_800, 'UZS')).toBe(-som(10_000))
    // So'm are so'm.
    expect(rateGain({ method: 'cash', currency: 'UZS', amount: som(1000) }, null, 'UZS')).toBe(0)
  })

  it('pay the sale with what was agreed', () => {
    const tenders: Tender[] = [
      { method: 'cash', currency: 'UZS', amount: som(500_000) },
      { method: 'card', currency: 'UZS', amount: som(500_000) },
      dollars(usd(50), som(600_000)),
    ]
    expect(settle(som(1_600_000), tenders, options)).toMatchObject({
      paid: som(1_600_000),
      due: 0,
      changeUzs: 0,
      rounding: 0,
      problem: null,
    })
    // At the rate alone the same notes would leave 5 000 over.
    expect(settle(som(1_600_000), [...tenders.slice(0, 2), dollars(usd(50))], options).paid).toBe(som(1_605_000))
    // Change is counted from what was agreed.
    expect(settle(som(500_000), [dollars(usd(50), som(600_000))], options).changeUzs).toBe(som(100_000))
  })

  it('need a word once the loss is past the limit, each tender for itself', () => {
    // 590 000 at 11 800: 600 000 is 1,7% over, 602 000 is 2,03% over.
    expect(overRateLoss([dollars(usd(50), som(600_000))], 11_800, 2, 'UZS')).toBe(false)
    expect(overRateLoss([dollars(usd(50), som(601_800))], 11_800, 2, 'UZS')).toBe(false)
    expect(overRateLoss([dollars(usd(50), som(602_000))], 11_800, 2, 'UZS')).toBe(true)
    // A gain is the shop's and is never over anything.
    expect(overRateLoss([dollars(usd(50), som(300_000))], 11_800, 2, 'UZS')).toBe(false)
    expect(overRateLoss([dollars(usd(50), som(300_000)), dollars(usd(50), som(650_000))], 11_800, 2, 'UZS')).toBe(true)
    // With a limit of nothing, any loss needs it.
    expect(overRateLoss([dollars(usd(50), som(590_001))], 11_800, 0, 'UZS')).toBe(true)
    expect(overRateLoss([dollars(usd(50))], 11_800, 0, 'UZS')).toBe(false)
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

  it('takes an agreed worth for dollars only', () => {
    const paid = (payment: Record<string, unknown>) => ({ ...base, payments: [payment] })
    const taken = saleInputSchema.parse(paid({ method: 'cash', currency: 'USD', amount: usd(50), value: som(600_000) }))
    expect(taken.payments[0].value).toBe(som(600_000))
    expect(saleInputSchema.parse(base).payments[0].value).toBeNull()
    expect(refused(paid({ method: 'cash', amount: som(95_000), value: som(90_000) }))).toEqual(['payments.0.value'])
    expect(refused(paid({ method: 'cash', currency: 'USD', amount: usd(50), value: 0 }))).toEqual(['payments.0.value'])
  })

  it('fills in what a plain cash sale leaves out', () => {
    const sale = saleInputSchema.parse(base)
    // No currency is a so'm the schema knows of: left out, it is the business's base, for the server to say.
    expect(sale).toMatchObject({ discount: 0, changeCurrency: null, sellerId: null })
    expect(sale.lines[0]).toMatchObject({ discount: 0, epc: null })
    expect(sale.payments[0]).toMatchObject({ currency: null, accountId: null })
  })

  it('wants a card or a terminal named, and leaves what it may hold to the server, which knows the base', () => {
    expect(refused({ ...base, payments: [{ method: 'card', amount: 1 }] })).toEqual(['payments.0.accountId'])
    expect(refused({ ...base, payments: [{ method: 'terminal', accountId: ID, currency: 'USD', amount: 1 }] })).toEqual(
      [],
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
  const options = { uzsPerUsd: 12_850, roundStep: som(1000), base: 'UZS' as const }

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
