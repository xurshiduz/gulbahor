import { describe, expect, it } from 'vitest'

import { allocateExact } from './money'
import { costReceipt, receiptInputSchema, unitCost, type CostingInput } from './purchasing'

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
  // The cargo from China in docs/REJA.md, section 9.
  const cargo: CostingInput = {
    currency: 'USD',
    usdRate: 1,
    uzsRate: 12_800,
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
    expect(costing.lines.map((line) => line.costUsd)).toEqual([usd(1865), usd(3024), usd(3215)])
    expect(costing.totals.costUsd).toBe(usd(8104))
    expect(costing.totals.goodsUsd).toBe(usd(6400))
    expect(costing.totals.expensesUsd).toBe(usd(1704))
    expect(costing.totals.qty).toBe(900)
    expect(unitCost(costing.lines[0].costUsd, 500)).toBe(usd(3.73))
    expect(unitCost(costing.lines[2].costUsd, 100)).toBe(usd(32.15))

    // The same in so'm, converted once per total.
    expect(costing.totals.costUzs).toBe(usd(8104) * 12_800)
    expect(costing.weightless).toEqual([])
  })

  it('adds up to the totals to the last cent when nothing divides evenly', () => {
    const costing = costReceipt({
      currency: 'CNY',
      usdRate: 7.13,
      uzsRate: 12_847.35,
      extraCurrency: 'USD',
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

    expect(sum((line) => line.goodsUsd)).toBe(costing.totals.goodsUsd)
    expect(sum((line) => line.costUsd)).toBe(costing.totals.costUsd)
    expect(sum((line) => line.costUzs)).toBe(costing.totals.costUzs)

    // Goods: 7 × 33.33 + 3 × 99.99 + 11 × 1.01 = 544.39 yuan = 76.35 dollars at 7.13.
    expect(costing.totals.goods).toBe(54_439)
    expect(costing.totals.goodsUsd).toBe(7635)

    // Expenses: each converted once, plus the lines' own extras (7 × 0.11 + 11 × 0.07 dollars).
    const billed = costing.expenses.reduce((total, expense) => total + expense.amountUsd, 0)
    expect(costing.totals.expensesUsd).toBe(billed + 77 + 77)
    // So'm stay so'm: the 7 777,77 bill is not pushed through the dollar and back.
    expect(costing.expenses[1].amountUzs).toBe(777_777)
  })

  it('falls back to quantity, and says so, when a weight is missing', () => {
    const costing = costReceipt({
      ...cargo,
      lines: [cargo.lines[0], { ...cargo.lines[1], weightG: null }, cargo.lines[2]],
    })
    expect(costing.weightless).toEqual([0])
    // 1000 dollars over 900 pieces: 555.56, 333.33, 111.11.
    expect(costing.lines.map((line) => line.expensesUsd - line.goodsUsd / 10 - line.goodsUsd / 100)).toEqual([
      55_556, 33_333, 11_111,
    ])
  })

  it('costs a local purchase in so’m without touching the dollar rate of the goods', () => {
    const costing = costReceipt({
      currency: 'UZS',
      usdRate: 12_800,
      uzsRate: 12_800,
      extraCurrency: 'UZS',
      lines: [{ qty: 10, price: 150_000_00, extra: 5_000_00, weightG: null }],
      expenses: [],
    })
    expect(costing.totals.goodsUzs).toBe(1_500_000_00)
    expect(costing.totals.costUzs).toBe(1_550_000_00)
    expect(costing.totals.costUsd).toBe(Math.round(1_500_000_00 / 12_800) + Math.round(50_000_00 / 12_800))
  })
})

describe('receiptInputSchema', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  const base = {
    locationId: id,
    docDate: '2026-10-01',
    currency: 'CNY',
    usdRate: 7.1,
    uzsRate: 12_800,
    lines: [{ variantId: id, qty: 2, price: 1000 }],
  }

  it('accepts a draft with nothing but lines, and fills the rest', () => {
    const parsed = receiptInputSchema.parse(base)
    expect(parsed.extraCurrency).toBe('USD')
    expect(parsed.lines[0]).toMatchObject({ extra: 0, retailPrice: null, supplierId: null })
    expect(parsed.expenses).toEqual([])
  })

  it('refuses an expense in a currency the receipt has no rate for', () => {
    const result = receiptInputSchema.safeParse({
      ...base,
      expenses: [{ name: 'Kargo', amount: 100, currency: 'TRY', basis: 'weight' }],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['expenses', 0, 'currency'])
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
