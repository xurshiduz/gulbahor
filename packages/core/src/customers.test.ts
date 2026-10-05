import { describe, expect, it } from 'vitest'

import {
  customerGroupInputSchema,
  customerInputSchema,
  daysToBirthday,
  loyaltyInputSchema,
  tierPercent,
} from './customers'
import { customerOff, overDiscountLimit, saleTotals } from './pos'

const som = (amount: number) => amount * 100

describe('a customer', () => {
  it('is written down by their phone, however it was typed', () => {
    const parsed = customerInputSchema.parse({ name: ' Nodira ', phone: '90 123-45-67', tags: ['vip', ' toy ', 'vip'] })
    expect(parsed).toMatchObject({
      name: 'Nodira',
      phone: '+998901234567',
      birthday: null,
      gender: null,
      groupIds: [],
      tags: ['vip', 'toy'],
    })
    expect(customerInputSchema.safeParse({ name: 'Nodira', phone: '90 123' }).success).toBe(false)
    expect(customerInputSchema.safeParse({ name: '', phone: '901234567' }).success).toBe(false)
  })

  it('has a birthday that comes round by the calendar', () => {
    expect(daysToBirthday('1990-10-05', '2026-10-05')).toBe(0)
    expect(daysToBirthday('1990-10-08', '2026-10-05')).toBe(3)
    expect(daysToBirthday('1990-10-04', '2026-10-05')).toBe(364)
    expect(daysToBirthday('1990-01-01', '2026-12-31')).toBe(1)
    // Born on 29 February: 1 March in a year without one.
    expect(daysToBirthday('1992-02-29', '2027-02-27')).toBe(2)
    expect(daysToBirthday('1992-02-29', '2028-02-27')).toBe(2)
  })
})

describe('the loyalty programme', () => {
  const tiers = [
    { from: som(10_000_000), percent: 5 },
    { from: som(15_000_000), percent: 6 },
    { from: som(40_000_000), percent: 10 },
  ]

  it('gives the highest step a customer has reached', () => {
    expect(tierPercent(tiers, 0)).toBe(0)
    expect(tierPercent(tiers, som(9_999_999))).toBe(0)
    expect(tierPercent(tiers, som(10_000_000))).toBe(5)
    expect(tierPercent(tiers, som(39_999_999))).toBe(6)
    expect(tierPercent(tiers, som(100_000_000))).toBe(10)
    expect(tierPercent([], som(100_000_000))).toBe(0)
  })

  it('has each sum once, and a percentage worth the name', () => {
    expect(loyaltyInputSchema.safeParse({ tiers }).success).toBe(true)
    expect(loyaltyInputSchema.safeParse({ tiers: [] }).success).toBe(true)
    expect(loyaltyInputSchema.safeParse({ tiers: [tiers[0], tiers[0]] }).success).toBe(false)
    expect(loyaltyInputSchema.safeParse({ tiers: [{ from: som(1000), percent: 0 }] }).success).toBe(false)
    expect(loyaltyInputSchema.safeParse({ tiers: [{ from: som(1000), percent: 101 }] }).success).toBe(false)
    expect(loyaltyInputSchema.safeParse({ tiers: [{ from: som(1000), percent: 7.5 }] }).success).toBe(true)
    expect(loyaltyInputSchema.safeParse({ tiers: [{ from: som(1000), percent: 7.555 }] }).success).toBe(false)
  })

  it('is one way a group may be generous; a group may also be none at all', () => {
    expect(customerGroupInputSchema.parse({ name: 'Doimiy' })).toMatchObject({
      discountPercent: 0,
      priceTypeId: null,
      reminder: null,
      noDebt: false,
      noLayaway: false,
      noExchange: false,
    })
    expect(customerGroupInputSchema.safeParse({ name: 'Xodimlar', discountPercent: 150 }).success).toBe(false)
  })
})

describe("a customer's own discount", () => {
  it('is a share of the line, to the tiyin', () => {
    expect(customerOff(som(100_000), 5)).toBe(som(5000))
    expect(customerOff(som(100_000), 7.5)).toBe(som(7500))
    // 7% of 99 999,99 is 6 999,9993: rounded to the tiyin.
    expect(customerOff(9_999_999, 7)).toBe(700_000)
    expect(customerOff(som(100_000), 0)).toBe(0)
  })

  it("comes off first, and the cashier's own is counted from what is left", () => {
    const line = (discount: number) => ({
      price: som(100_000),
      qty: 1,
      discount,
      auto: customerOff(som(100_000), 5),
    })
    const totals = saleTotals([line(som(9500))], 0)
    expect(totals).toMatchObject({ subtotal: som(100_000), auto: som(5000), discount: som(14_500), total: som(85_500) })
    expect(totals.lines[0]).toEqual({ gross: som(100_000), auto: som(5000), discount: som(14_500), total: som(85_500) })
    // 9 500 is a tenth of the 95 000 that was left: the cashier's limit of 10% is not crossed.
    expect(overDiscountLimit(totals, 10)).toBe(false)
    expect(overDiscountLimit(saleTotals([line(som(9500) + 1)], 0), 10)).toBe(true)
    // With nothing given by the cashier, however much came off by itself is over no limit.
    expect(overDiscountLimit(saleTotals([{ ...line(0), auto: som(50_000) }], 0), 10)).toBe(false)
  })

  it('leaves no more to give than the line is worth, and shares a discount on the whole sale over what is left', () => {
    const totals = saleTotals(
      [
        { price: som(100_000), qty: 1, discount: som(200_000), auto: som(10_000) },
        { price: som(50_000), qty: 2, discount: 0, auto: som(10_000) },
      ],
      som(9000),
    )
    // The first line is given away whole; the 9 000 falls on the second alone.
    expect(totals.lines).toEqual([
      { gross: som(100_000), auto: som(10_000), discount: som(100_000), total: 0 },
      { gross: som(100_000), auto: som(10_000), discount: som(19_000), total: som(81_000) },
    ])
    expect(totals).toMatchObject({
      subtotal: som(200_000),
      auto: som(20_000),
      discount: som(119_000),
      total: som(81_000),
    })
  })
})
