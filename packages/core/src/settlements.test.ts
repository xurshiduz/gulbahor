import { describe, expect, it } from 'vitest'

import type { RateBook } from './currencies'
import { accountInputSchema, formatCardNumber } from './pos'
import {
  amountFor,
  dayPairRate,
  defaultTill,
  pairBook,
  pairOf,
  pairRate,
  partnerPaymentInputSchema,
  rateGap,
  settledFor,
  settleLine,
  straysFromRate,
  tillsOf,
  type PaymentAccountDto,
} from './settlements'

const som = (amount: number) => Math.round(amount * 100)
const usd = (amount: number) => Math.round(amount * 100)

const ID = '11111111-1111-4111-8111-111111111111'
const KEY = '22222222-2222-4222-8222-222222222222'

describe("settling a partner's account", () => {
  it("takes money of the account's own currency as it is", () => {
    expect(settledFor(som(1_000_000), 'UZS', 'UZS', null)).toEqual({
      settled: som(1_000_000),
      cashBase: som(1_000_000),
      partnerBase: som(1_000_000),
      fx: 0,
    })
    // 500 $ against a dollar account, valued in so'm at the day's rate.
    expect(settledFor(usd(500), 'USD', 'USD', 12_650)).toEqual({
      settled: usd(500),
      cashBase: som(6_325_000),
      partnerBase: som(6_325_000),
      fx: 0,
    })
  })

  it("settles a dollar account with so'm to the cent, and keeps the tiyin that are left", () => {
    // 1 000 000 / 12 650 = 79,0513…: 79,05 $ is settled; that is 999 982,50 so'm, and 17,50 are left over.
    expect(settledFor(som(1_000_000), 'UZS', 'USD', 12_650)).toEqual({
      settled: usd(79.05),
      cashBase: som(1_000_000),
      partnerBase: som(999_982.5),
      fx: som(17.5),
    })
    // 6 325 000 so'm is 500 $ exactly: nothing is left over.
    expect(settledFor(som(6_325_000), 'UZS', 'USD', 12_650)).toMatchObject({ settled: usd(500), fx: 0 })
    // Rounded up to the cent, the difference is the other way.
    const up = settledFor(som(1_000_100), 'UZS', 'USD', 12_650)
    expect(up.settled).toBe(usd(79.06))
    expect(up.fx).toBe(som(1_000_100) - som(79.06 * 12_650))
    expect(up.cashBase).toBe(up.partnerBase + up.fx)
  })

  it("settles a so'm account with dollars at their worth in so'm", () => {
    expect(settledFor(usd(100), 'USD', 'UZS', 12_650)).toEqual({
      settled: som(1_265_000),
      cashBase: som(1_265_000),
      partnerBase: som(1_265_000),
      fx: 0,
    })
  })

  it('needs a rate to change one currency into the other', () => {
    expect(() => settledFor(som(1_000_000), 'UZS', 'USD', null)).toThrow()
    expect(() => settledFor(usd(100), 'USD', 'UZS', null)).toThrow()
  })

  it('works out what to hand over for a sum to settle: the second of the paired fields', () => {
    // To settle 500 $ with so'm: 6 325 000.
    expect(amountFor(usd(500), 'UZS', 'USD', 12_650)).toBe(som(6_325_000))
    // To settle 1 265 000 so'm with dollars: 100 $.
    expect(amountFor(som(1_265_000), 'USD', 'UZS', 12_650)).toBe(usd(100))
    expect(amountFor(som(250_000), 'UZS', 'UZS', null)).toBe(som(250_000))
    // What comes back settles the sum that was asked for.
    for (const cents of [1, 7905, 12_345, 99_999]) {
      const handed = amountFor(cents, 'UZS', 'USD', 12_650)
      expect(settledFor(handed, 'UZS', 'USD', 12_650).settled).toBe(cents)
    }
  })
})

describe('a payment', () => {
  it('has at least one line, each with a sum', () => {
    const payment = {
      clientKey: KEY,
      partnerId: ID,
      kind: 'in',
      lines: [{ accountId: ID, amount: som(1_000_000) }],
      settled: usd(79.05),
    }
    expect(partnerPaymentInputSchema.parse(payment).lines[0]).toEqual({
      accountId: ID,
      amount: som(1_000_000),
      settled: null,
    })
    expect(partnerPaymentInputSchema.safeParse({ ...payment, lines: [] }).success).toBe(false)
    expect(partnerPaymentInputSchema.safeParse({ ...payment, lines: [{ accountId: ID, amount: 0 }] }).success).toBe(
      false,
    )
    expect(partnerPaymentInputSchema.safeParse({ ...payment, kind: 'opening' }).success).toBe(false)
  })
})

describe('the till a payment opens on', () => {
  const place = (id: string, registerId: string | null, more: Partial<PaymentAccountDto> = {}) =>
    ({ id, registerId, locationName: 'Gulbahor 1', open: false, till: null, ...more }) as PaymentAccountDto
  const places = [
    place('s1', 't1', { till: { name: 'Kassa 1', main: true, mine: false } }),
    place('d1', 't1', { till: { name: 'Kassa 1', main: true, mine: false } }),
    place('s2', 't2', { open: true, till: { name: 'Kassa 2', main: false, mine: false } }),
    place('safe', null, { open: true }),
    place('s3', 't3', { locationName: 'Gulbahor 2', open: true, till: { name: 'Kassa 1', main: true, mine: true } }),
  ]
  const tills = tillsOf(places)

  it('is found among the places a person may pay through, once each', () => {
    expect(tills).toEqual([
      { id: 't1', name: 'Kassa 1', locationName: 'Gulbahor 1', main: true, mine: false, open: false },
      { id: 't2', name: 'Kassa 2', locationName: 'Gulbahor 1', main: false, mine: false, open: true },
      { id: 't3', name: 'Kassa 1', locationName: 'Gulbahor 2', main: true, mine: true, open: true },
    ])
    expect(tillsOf([place('safe', null)])).toEqual([])
  })

  it('is the one this computer sells at, before anything else', () => {
    expect(defaultTill(tills, 't2', 't1')).toBe('t2')
  })

  it('is the one whose shift the person has open, on a computer that sells at none', () => {
    expect(defaultTill(tills, null, 't1')).toBe('t3')
    // A till this computer once sold at and the person may no longer use is not it.
    expect(defaultTill(tills, 'gone', null)).toBe('t3')
  })

  it("is the one chosen here last, then a shop's main till — one that is open before one that is not", () => {
    const nobodys = tills.map((till) => ({ ...till, mine: false }))
    expect(defaultTill(nobodys, null, 't2')).toBe('t2')
    expect(defaultTill(nobodys, null, null)).toBe('t3')
    expect(defaultTill(nobodys.slice(0, 2), null, null)).toBe('t1')
    expect(defaultTill([{ ...nobodys[1] }], null, null)).toBe('t2')
    expect(defaultTill([], null, 't1')).toBeNull()
  })
})

describe('a pair of sums', () => {
  // The dollar stands at 11 800: a hundred are worth 1 180 000.
  const RATE = 11_800

  it("is left to the day's rate when nothing was agreed", () => {
    expect(settleLine(usd(100), 'USD', 'UZS', RATE)).toEqual({
      settled: som(1_180_000),
      cashBase: som(1_180_000),
      partnerBase: som(1_180_000),
      fx: 0,
      rate: RATE,
      agreed: false,
      // The rate reads "1 $ = 11 800 so'm", and a cent is worth 118 tiyin: rounding can leave no more.
      pair: { one: 'USD', of: 'UZS' },
      slack: RATE,
    })
    // An agreed sum that is what the rate makes anyway is no agreement.
    expect(settleLine(usd(100), 'USD', 'UZS', RATE, som(1_180_000)).agreed).toBe(false)
    // One currency on both sides is a single sum: what is said beside it is not heard.
    expect(settleLine(usd(100), 'USD', 'USD', RATE, usd(120))).toMatchObject({
      settled: usd(100),
      rate: null,
      agreed: false,
      fx: 0,
    })
    expect(settleLine(som(500_000), 'UZS', 'UZS', null, som(600_000))).toMatchObject({
      settled: som(500_000),
      agreed: false,
    })
  })

  it('stands as agreed: the money at what it is worth, the account by what was said, the rest to the rate', () => {
    // "Take these 100 dollars for 1 200 000."
    expect(settleLine(usd(100), 'USD', 'UZS', RATE, som(1_200_000))).toEqual({
      settled: som(1_200_000),
      cashBase: som(1_180_000),
      partnerBase: som(1_200_000),
      fx: -som(20_000),
      rate: 12_000,
      agreed: true,
      pair: { one: 'USD', of: 'UZS' },
      slack: RATE,
    })
    // 1 200 000 so'm for a hundred dollars of a dollar account: the so'm are all there, and are worth 20 000 more.
    expect(settleLine(som(1_200_000), 'UZS', 'USD', RATE, usd(100))).toEqual({
      settled: usd(100),
      cashBase: som(1_200_000),
      partnerBase: som(1_180_000),
      fx: som(20_000),
      rate: 12_000,
      agreed: true,
      pair: { one: 'USD', of: 'UZS' },
      slack: RATE,
    })
  })

  it('makes a rate between its two sums, to the tiyin', () => {
    expect(pairRate(usd(100), 'USD', som(1_200_000))).toBe(12_000)
    expect(pairRate(som(1_200_000), 'UZS', usd(100))).toBe(12_000)
    expect(pairRate(usd(101), 'USD', som(1_200_000))).toBe(11_881.19)
    expect(pairRate(0, 'USD', som(1_200_000))).toBeNull()
  })

  it('may stray from the day’s rate only so far, either way; what a cent cannot split never counts', () => {
    const agreed = (settled: number) => settleLine(usd(100), 'USD', 'UZS', RATE, settled)
    expect(rateGap(agreed(som(1_200_000)))).toBe(1.7)
    expect(straysFromRate(agreed(som(1_200_000)), 2, RATE)).toBe(false)
    expect(straysFromRate(agreed(som(1_203_600)), 2, RATE)).toBe(false)
    expect(straysFromRate(agreed(som(1_203_700)), 2, RATE)).toBe(true)
    // Short-changing the partner is held to the same limit as overpaying them.
    expect(straysFromRate(agreed(som(1_150_000)), 2, RATE)).toBe(true)
    expect(rateGap(agreed(som(1_300_000)))).toBe(10.2)
    // 590 so'm against five cents: 59 000 tiyin by the rate, and a so'm either way is rounding, not agreement.
    const tiny = settleLine(som(590), 'UZS', 'USD', RATE, 6)
    expect(tiny.agreed).toBe(true)
    expect(straysFromRate(tiny, 2, RATE)).toBe(false)
  })

  it('is asked for as an agreed sum on the line, or left out', () => {
    const line = (more: object) =>
      partnerPaymentInputSchema.safeParse({
        clientKey: KEY,
        partnerId: ID,
        kind: 'in',
        lines: [{ accountId: ID, amount: usd(100), ...more }],
        settled: som(1_200_000),
      })
    expect(line({}).data?.lines[0].settled).toBeNull()
    expect(line({ settled: som(1_200_000) }).data?.lines[0].settled).toBe(som(1_200_000))
    expect(line({ settled: 0 }).success).toBe(false)
    expect(line({ settled: 12.5 }).success).toBe(false)
  })
})

describe('a card', () => {
  const card = (more: object) => accountInputSchema.safeParse({ kind: 'card', name: 'Humo', ...more })

  it('is kept by its whole number, typed as it is printed, and called by its last four digits', () => {
    expect(card({ cardNumber: '9860 1234 5678 9012' }).data).toMatchObject({
      cardNumber: '9860123456789012',
      last4: '9012',
    })
    expect(card({ cardNumber: '9860-1234-5678-9012', last4: '0000' }).data?.last4).toBe('9012')
    // One set up before whole numbers were kept is still known by its last four.
    expect(card({ last4: '3073' }).data).toMatchObject({ cardNumber: null, last4: '3073' })
    expect(card({ cardNumber: '' }).data?.cardNumber).toBeNull()
    expect(card({ cardNumber: '9860 12' }).success).toBe(false)
    expect(card({ cardNumber: '9860 1234 5678 901x' }).success).toBe(false)
    expect(formatCardNumber('9860123456789012')).toBe('9860 1234 5678 9012')
    expect(formatCardNumber('4000123412341234567')).toBe('4000 1234 1234 1234 567')
  })

  it('may hold dollars; a terminal may not, and nothing but a card has a card’s number', () => {
    expect(card({ currency: 'USD', cardNumber: '4000123412341234' }).success).toBe(true)
    expect(accountInputSchema.safeParse({ kind: 'terminal', name: 'POS', currency: 'USD' }).success).toBe(false)
    expect(
      accountInputSchema.safeParse({ kind: 'safe', name: 'Seyf', cardNumber: '9860123456789012' }).data?.cardNumber,
    ).toBeNull()
  })
})

describe('a line of money in any currency the business keeps', () => {
  /** So'm the base, the dollar 12 650, the yuan named against the dollar, the rouble straight in so'm. */
  const book: RateBook = {
    base: 'UZS',
    rates: {
      USD: { against: 'UZS', way: 'in', value: 12_650 },
      CNY: { against: 'USD', way: 'per', value: 7.25 },
      RUB: { against: 'UZS', way: 'in', value: 135 },
    },
  }
  const yuan = (value: number) => Math.round(value * 100)

  it('is valued through the whole chain of rates, in one step', () => {
    // 1 000 ¥ spent, counted in so'm: 1 000 × 12 650 / 7,25.
    expect(settledFor(yuan(1000), 'CNY', 'UZS', book)).toEqual({
      settled: som(1_744_827.59),
      cashBase: som(1_744_827.59),
      partnerBase: som(1_744_827.59),
      fx: 0,
    })
    // 7 250 ¥ against a dollar account are 1 000 $ whatever the dollar costs; nothing is left over.
    expect(settledFor(yuan(7250), 'CNY', 'USD', book)).toEqual({
      settled: usd(1000),
      cashBase: som(12_650_000),
      partnerBase: som(12_650_000),
      fx: 0,
    })
    // 100 ¥ are 13,79 $ to the cent; the 0,3 of a cent that is left is written down in so'm.
    const odd = settledFor(yuan(100), 'CNY', 'USD', book)
    expect(odd).toMatchObject({ settled: 1379, cashBase: som(174_482.76), partnerBase: som(174_443.5) })
    expect(odd.fx).toBe(odd.cashBase - odd.partnerBase)
  })

  it('reads its rate as one of the dearer currency in so many of the cheaper', () => {
    expect(pairOf('CNY', 'USD', book)).toEqual({ one: 'USD', of: 'CNY' })
    expect(pairOf('USD', 'CNY', book)).toEqual({ one: 'USD', of: 'CNY' })
    expect(pairOf('CNY', 'UZS', book)).toEqual({ one: 'CNY', of: 'UZS' })
    expect(pairOf('RUB', 'CNY', book)).toEqual({ one: 'CNY', of: 'RUB' })
    expect(pairOf('USD', 'USD', book)).toBeNull()
    expect(pairOf('KZT', 'USD', book)).toBeNull()
    expect(dayPairRate('CNY', 'USD', book)).toEqual({ one: 'USD', of: 'CNY', value: 7.25 })
    expect(dayPairRate('UZS', 'USD', book)).toEqual({ one: 'USD', of: 'UZS', value: 12_650 })
    // 12 650 / 7,25: to the tiyin where a rate runs to hundreds.
    expect(dayPairRate('UZS', 'CNY', book)).toEqual({ one: 'CNY', of: 'UZS', value: 1744.83 })
    // 1 744,83 / 135: to four places where it is a handful.
    expect(dayPairRate('CNY', 'RUB', book)).toEqual({ one: 'CNY', of: 'RUB', value: 12.9246 })
  })

  it('stands as agreed between any two: "take these 7 300 yuan for a thousand dollars"', () => {
    const worth = settleLine(yuan(7300), 'CNY', 'USD', book, usd(1000))
    expect(worth).toMatchObject({
      settled: usd(1000),
      // The yuan are worth what the day says: 7 300 × 12 650 / 7,25.
      cashBase: som(12_737_241.38),
      partnerBase: som(12_650_000),
      rate: 7.3,
      agreed: true,
      pair: { one: 'USD', of: 'CNY' },
    })
    expect(worth.fx).toBe(som(87_241.38))
    // A cent is worth 127 tiyin, a fen 18: what rounding may leave is the dearer coin.
    expect(worth.slack).toBe(12_650)
    expect(rateGap(worth)).toBe(0.7)
    expect(straysFromRate(worth, 2)).toBe(false)
    expect(straysFromRate(settleLine(yuan(8000), 'CNY', 'USD', book, usd(1000)), 2)).toBe(true)
  })

  it('works the money back from what is to be settled, and a typed rate for one pair alone', () => {
    expect(amountFor(usd(1000), 'CNY', 'USD', book)).toBe(yuan(7250))
    expect(amountFor(som(1_744_827.59), 'CNY', 'UZS', book)).toBe(yuan(1000))
    expect(amountFor(yuan(500), 'CNY', 'CNY', book)).toBe(yuan(500))
    // "1 $ = 7,30 ¥" typed for a line: only what the one makes of the other is read from it.
    const own = pairBook({ one: 'USD', of: 'CNY' }, 7.3)
    expect(settledFor(yuan(7300), 'CNY', 'USD', own).settled).toBe(usd(1000))
    expect(amountFor(usd(1000), 'CNY', 'USD', own)).toBe(yuan(7300))
  })

  it('cannot be valued while a rate it hangs on is wanting', () => {
    const { USD: _gone, ...rest } = book.rates
    const noDollar: RateBook = { base: 'UZS', rates: rest }
    expect(() => settledFor(yuan(100), 'CNY', 'UZS', noDollar)).toThrow(RangeError)
    expect(() => settleLine(usd(100), 'USD', 'UZS', null)).toThrow(RangeError)
    // The rouble is written in so'm and asks nobody.
    expect(settledFor(yuan(100), 'RUB', 'UZS', noDollar).settled).toBe(som(13_500))
  })
})
