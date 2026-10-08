import { describe, expect, it } from 'vitest'

import { allocateExact } from './money'
import { costReceipt, receiptInputSchema, receiptRateWay, unitCost, type CostingInput } from './purchasing'

const usd = (dollars: number) => Math.round(dollars * 100)

describe('allocateExact', () => {
  it('splits by weights far beyond what a float can hold', () => {
    const parts = allocateExact(100, [10n ** 30n, 2n * 10n ** 30n])
    expect(parts).toEqual([33, 67])
    expect(allocateExact(-7, [1n, 1n])).toEqual([-4, -3])
    expect(allocateExact(5, [0n, 0n])).toEqual([3, 2])
  })
})

describe('costReceipt', () => {
  // The cargo from China in docs/REJA.md, section 9, for a business that keeps its books in dollars.
  const cargo: CostingInput = {
    base: 'USD',
    currency: 'USD',
    rate: null,
    rateWay: 'in',
    book: { base: 'USD', rates: {} },
    extraCurrency: 'USD',
    lines: [
      { qty: 500, price: usd(3), extra: 0, weightG: 200 },
      { qty: 300, price: usd(8), extra: 0, weightG: 600 },
      { qty: 100, price: usd(25), extra: 0, weightG: 2200 },
    ],
    expenses: [
      { amount: usd(1000), currency: 'USD', basis: 'weight' },
      { amount: usd(640), currency: 'USD', basis: 'value' },
      { amount: usd(64), currency: 'USD', basis: 'value' },
    ],
  }

  it('shares freight by weight and duty by value, as in the worked example', () => {
    const costing = costReceipt(cargo)
    expect(costing.lines.map((line) => line.costUzs)).toEqual([usd(1865), usd(3024), usd(3215)])
    expect(costing.totals).toMatchObject({
      qty: 900,
      goods: usd(6400),
      goodsUzs: usd(6400),
      expensesUzs: usd(1704),
      costUzs: usd(8104),
    })
    expect(unitCost(costing.lines[0].costUzs, 500)).toBe(usd(3.73))
    expect(unitCost(costing.lines[2].costUzs, 100)).toBe(usd(32.15))
    expect(costing.weightless).toEqual([])
    expect(costing.wanting).toBeNull()
  })

  it('costs the same cargo for a so’m business at the receipt’s own rate, each total converted once', () => {
    const costing = costReceipt({ ...cargo, base: 'UZS', rate: 12_800, book: { base: 'UZS', rates: {} } })
    expect(costing.totals.costUzs).toBe(usd(8104) * 12_800)
    expect(costing.lines.reduce((sum, line) => sum + line.costUzs, 0)).toBe(costing.totals.costUzs)
  })

  it('adds up to the totals to the last tiyin when nothing divides evenly', () => {
    const costing = costReceipt({
      base: 'UZS',
      currency: 'CNY',
      rate: 1_801.87,
      rateWay: 'in',
      // The day's dollar: an expense in dollars goes at it, not through the yuan.
      book: { base: 'UZS', rates: { USD: { against: 'UZS', way: 'in', value: 12_847.35 } } },
      extraCurrency: 'CNY',
      lines: [
        { qty: 7, price: 3333, extra: 11, weightG: 310 },
        { qty: 3, price: 9999, extra: 0, weightG: 150 },
        { qty: 11, price: 101, extra: 7, weightG: 95 },
      ],
      expenses: [
        { amount: 10_001, currency: 'USD', basis: 'weight' },
        { amount: 777_777, currency: 'UZS', basis: 'quantity' },
        { amount: 12_345, currency: 'CNY', basis: 'value' },
      ],
    })
    const sum = (pick: (line: (typeof costing.lines)[number]) => number) =>
      costing.lines.reduce((total, line) => total + pick(line), 0)

    expect(sum((line) => line.goodsUzs)).toBe(costing.totals.goodsUzs)
    expect(sum((line) => line.costUzs)).toBe(costing.totals.costUzs)
    // Goods: 7 × 33.33 + 3 × 99.99 + 11 × 1.01 = 544.39 yuan.
    expect(costing.totals.goods).toBe(54_439)
    expect(costing.totals.goodsUzs).toBe(Math.round(54_439 * 1_801.87))
    // Each expense once, in its own way: dollars at the day's rate, so'm as they are, yuan at the receipt's rate.
    expect(costing.expenses).toEqual([{ amountUzs: 128_486_347 }, { amountUzs: 777_777 }, { amountUzs: 22_244_085 }])
    // The lines' own extras, 7 × 0.11 and 11 × 0.07 yuan, go at the receipt's rate where they stand.
    expect(costing.totals.expensesUzs).toBe(
      128_486_347 + 777_777 + 22_244_085 + Math.round(77 * 1_801.87) + Math.round(77 * 1_801.87),
    )
  })

  it('falls back to quantity, and says so, when a weight is missing', () => {
    const costing = costReceipt({
      ...cargo,
      lines: [cargo.lines[0], { ...cargo.lines[1], weightG: null }, cargo.lines[2]],
    })
    expect(costing.weightless).toEqual([0])
    // 1000 dollars over 900 pieces: 555.56, 333.33, 111.11.
    expect(costing.lines.map((line) => line.expensesUzs - line.goodsUzs / 10 - line.goodsUzs / 100)).toEqual([
      55_556, 33_333, 11_111,
    ])
  })

  it('costs a local purchase in so’m with no rate at all', () => {
    const costing = costReceipt({
      base: 'UZS',
      currency: 'UZS',
      // Whatever a form sends: a receipt in the base has nothing to convert.
      rate: 12_800,
      rateWay: 'per',
      book: { base: 'UZS', rates: {} },
      extraCurrency: 'UZS',
      lines: [{ qty: 10, price: 150_000_00, extra: 5_000_00, weightG: null }],
      expenses: [],
    })
    expect(costing.totals).toMatchObject({ goods: 1_500_000_00, goodsUzs: 1_500_000_00, costUzs: 1_550_000_00 })
  })
})

describe('costReceipt in another base', () => {
  it('costs a yuan purchase in tenge, with a tenge delivery as it is', () => {
    // 10 pieces at 71 ¥ = 710 ¥ at "1 ¥ = 67,6 ₸" = 47 996 ₸; a delivery of 4 800 ₸.
    const costing = costReceipt({
      base: 'KZT',
      currency: 'CNY',
      rate: 67.6,
      rateWay: receiptRateWay('CNY', 'KZT'),
      book: { base: 'KZT', rates: {} },
      extraCurrency: 'KZT',
      lines: [{ qty: 10, price: usd(71), extra: 0, weightG: null }],
      expenses: [{ amount: usd(4800), currency: 'KZT', basis: 'quantity' }],
    })
    expect(costing.totals).toMatchObject({ goodsUzs: usd(47_996), expensesUzs: usd(4800), costUzs: usd(52_796) })
    expect(costing.expenses).toEqual([{ amountUzs: usd(4800) }])
  })

  it('reads a dollar business’s yuan rate the way it is written: one dollar is 7,25 yuan', () => {
    expect(receiptRateWay('CNY', 'USD')).toBe('per')
    const costing = costReceipt({
      base: 'USD',
      currency: 'CNY',
      rate: 7.25,
      rateWay: 'per',
      book: { base: 'USD', rates: {} },
      extraCurrency: 'USD',
      lines: [{ qty: 4, price: usd(72.5), extra: 0, weightG: null }],
      expenses: [{ amount: usd(20), currency: 'USD', basis: 'value' }],
    })
    expect(costing.totals).toMatchObject({ goods: usd(290), goodsUzs: usd(40), costUzs: usd(60) })
  })
})

describe('costReceipt with an expense in a third currency', () => {
  const yuan: CostingInput = {
    base: 'UZS',
    currency: 'CNY',
    rate: 1_750,
    rateWay: 'in',
    book: { base: 'UZS', rates: { USD: { against: 'UZS', way: 'in', value: 12_650 } } },
    extraCurrency: 'UZS',
    lines: [{ qty: 100, price: usd(71), extra: 0, weightG: null }],
    expenses: [{ amount: usd(300), currency: 'USD', basis: 'quantity' }],
  }

  it('takes it at the rate of the receipt’s day', () => {
    expect(receiptRateWay('CNY', 'UZS')).toBe('in')
    const costing = costReceipt(yuan)
    // 71 ¥ × 1 750 = 124 250 so'm a piece, and 300 $ × 12 650 = 3 795 000 over a hundred: 37 950.
    expect(costing.expenses).toEqual([{ amountUzs: usd(3_795_000) }])
    expect(unitCost(costing.lines[0].costUzs, 100)).toBe(usd(124_250 + 37_950))
    expect(costing.wanting).toBeNull()
  })

  it('says which currency has no rate, and counts its sums as nothing until it has one', () => {
    const lira = costReceipt({ ...yuan, expenses: [{ amount: usd(5000), currency: 'TRY', basis: 'value' }] })
    expect(lira.wanting).toBe('TRY')
    expect(lira.totals.expensesUzs).toBe(0)
    const unrated = costReceipt({ ...yuan, rate: null })
    expect(unrated.wanting).toBe('CNY')
    expect(unrated.totals.goodsUzs).toBe(0)
  })
})

describe('receiptInputSchema', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  const base = {
    locationId: id,
    docDate: '2026-10-01',
    currency: 'CNY',
    rate: 1_750,
    lines: [{ variantId: id, qty: 2, price: 1000 }],
  }

  it('accepts a draft with nothing but lines, and fills the rest', () => {
    const parsed = receiptInputSchema.parse(base)
    // Left to the server, which knows the base.
    expect(parsed.extraCurrency).toBeUndefined()
    expect(receiptInputSchema.parse({ ...base, currency: 'UZS', rate: undefined }).rate).toBeNull()
    expect(parsed.lines[0]).toMatchObject({ extra: 0, retailPrice: null, supplierId: null })
    expect(parsed.expenses).toEqual([])
  })

  it('leaves the currency of an expense to the server, which knows the base', () => {
    const result = receiptInputSchema.safeParse({
      ...base,
      expenses: [{ name: 'Kargo', amount: 100, currency: 'KZT', basis: 'weight' }],
    })
    expect(result.success).toBe(true)
  })

  it('refuses a zero quantity and more than three decimals', () => {
    expect(receiptInputSchema.safeParse({ ...base, lines: [{ variantId: id, qty: 0, price: 1 }] }).success).toBe(false)
    expect(receiptInputSchema.safeParse({ ...base, lines: [{ variantId: id, qty: 1.2345, price: 1 }] }).success).toBe(
      false,
    )
    expect(receiptInputSchema.safeParse({ ...base, lines: [{ variantId: id, qty: 1.25, price: 1 }] }).success).toBe(
      true,
    )
  })
})
