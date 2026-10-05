import { describe, expect, it } from 'vitest'

import { amountFor, partnerPaymentInputSchema, settledFor } from './settlements'

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
      rate: null,
    })
    expect(partnerPaymentInputSchema.safeParse({ ...payment, lines: [] }).success).toBe(false)
    expect(partnerPaymentInputSchema.safeParse({ ...payment, lines: [{ accountId: ID, amount: 0 }] }).success).toBe(
      false,
    )
    expect(partnerPaymentInputSchema.safeParse({ ...payment, kind: 'opening' }).success).toBe(false)
  })
})
