import { describe, expect, it } from 'vitest'

import { allocate, convert, formatMoney, percentOf, roundToStep, toMajorString, toMinor } from './money'

describe('toMinor / toMajorString', () => {
  it('moves between decimal strings and minor units without floats', () => {
    expect(toMinor('1250.5')).toBe(125050)
    expect(toMinor('0.1')).toBe(10)
    expect(toMajorString(125050)).toBe('1250.50')
    expect(toMajorString(-5)).toBe('-0.05')
  })
})

describe('allocate', () => {
  it('always adds up to the total', () => {
    const parts = allocate(100, [1, 1, 1])
    expect(parts).toEqual([34, 33, 33])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('splits the landed-cost example from the plan by weight and by value', () => {
    // Cargo 1 000 $ by weight 100/180/220 kg; duty 640 $ by value 1 500/2 400/2 500 $.
    expect(allocate(100_000, [100, 180, 220])).toEqual([20_000, 36_000, 44_000])
    expect(allocate(64_000, [150_000, 240_000, 250_000])).toEqual([15_000, 24_000, 25_000])
  })

  it('gives the leftover to the largest remainders', () => {
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3])
    expect(allocate(1, [1, 2])).toEqual([0, 1])
  })

  it('handles fractional weights, zero weights and negative totals', () => {
    expect(allocate(1000, [12.5, 37.5])).toEqual([250, 750])
    expect(allocate(99, [0, 0, 0])).toEqual([33, 33, 33])
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33])
  })
})

describe('convert', () => {
  it('converts so‘m to dollars to the cent (example from the plan)', () => {
    // 1 000 000 so'm at 12 650 -> 79.05 $
    expect(convert(100_000_000, 'UZS', 'USD', '12650')).toBe(7_905)
    // and back: 79.05 $ -> 999 982.50 so'm; the 17.50 so'm left over goes to exchange difference
    expect(convert(7_905, 'USD', 'UZS', '12650')).toBe(99_998_250)
  })

  it('works with fractional rates', () => {
    expect(convert(10_000, 'USD', 'UZS', '11821.18')).toBe(118_211_800)
  })
})

describe('percentOf and roundToStep', () => {
  it('rounds half away from zero', () => {
    expect(percentOf(12_345, '10')).toBe(1_235)
    expect(percentOf(100_000, '2.5')).toBe(2_500)
  })

  it('rounds to a cash step', () => {
    expect(roundToStep(149_950_00, 1_000_00)).toBe(150_000_00)
    expect(roundToStep(149_400_00, 1_000_00)).toBe(149_000_00)
    expect(roundToStep(149_400_00, 1_000_00, 'up')).toBe(150_000_00)
  })
})

describe('formatMoney', () => {
  it('groups thousands and hides zero tiyin', () => {
    expect(formatMoney(125_000_000, 'UZS', { group: ' ' })).toBe('1 250 000 so‘m')
    expect(formatMoney(125_000_050, 'UZS', { group: ' ', symbol: false })).toBe('1 250 000,50')
    expect(formatMoney(7_905, 'USD', { group: ' ' })).toBe('79,05 $')
  })
})
