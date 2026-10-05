import { describe, expect, it } from 'vitest'

import { parseAmount, parseDiscount, parseQuantity } from './amount'

const minor = (input: string) => {
  const result = parseAmount(input)
  return result.ok ? result.minor : result.error
}

describe('parseAmount: what cashiers type', () => {
  it('reads grouped numbers', () => {
    expect(minor('1250000')).toBe(125_000_000)
    expect(minor('1 250 000')).toBe(125_000_000)
    expect(minor('1.250.000')).toBe(125_000_000)
    expect(minor('1,250,000')).toBe(125_000_000)
    expect(minor("1'250'000")).toBe(125_000_000)
    expect(minor('1.250')).toBe(125_000)
  })

  it('reads decimals', () => {
    expect(minor('79.05')).toBe(7_905)
    expect(minor('79,05')).toBe(7_905)
    expect(minor('0,125')).toBe(13)
    expect(minor('.5')).toBe(50)
  })

  it('reads shorthand', () => {
    expect(minor('250k')).toBe(25_000_000)
    expect(minor('250 ming')).toBe(25_000_000)
    expect(minor('1.5m')).toBe(150_000_000)
    expect(minor('1,5 mln')).toBe(150_000_000)
    expect(minor('2 млн')).toBe(200_000_000)
  })

  it('calculates', () => {
    expect(minor('120000*3')).toBe(36_000_000)
    expect(minor('120 000 x 3')).toBe(36_000_000)
    expect(minor('1 500 000 - 10%')).toBe(135_000_000)
    expect(minor('200000 + 5%')).toBe(21_000_000)
    expect(minor('(100+50)*2')).toBe(30_000)
    expect(minor('1000/3')).toBe(33_333)
    expect(minor('100000=')).toBe(10_000_000)
  })

  it('recognises the currency', () => {
    const dollars = parseAmount('$1,250.50')
    expect(dollars).toMatchObject({ ok: true, minor: 125_050, currency: 'USD' })
    expect(parseAmount("1 250 000 so'm")).toMatchObject({ ok: true, minor: 125_000_000, currency: 'UZS' })
    expect(parseAmount('100$')).toMatchObject({ ok: true, minor: 10_000, currency: 'USD' })
    expect(parseAmount('100$ 5 сум')).toMatchObject({ ok: false, error: 'currency_conflict' })
  })

  it('reads bank notice amounts in both bank formats', () => {
    expect(minor('375.000,00 UZS')).toBe(37_500_000)
    expect(minor('40.671.427,77 UZS')).toBe(4_067_142_777)
    expect(minor('40 000.00 UZS')).toBe(4_000_000)
    expect(minor('7 771 313.65 UZS')).toBe(777_131_365)
  })

  it('rejects what is not an amount', () => {
    expect(minor('')).toBe('empty')
    expect(minor('abc')).toBe('invalid')
    expect(minor('-500')).toBe('negative')
    expect(minor('5/0')).toBe('division_by_zero')
    expect(minor('1.2.3,4,5')).toBe('invalid')
  })
})

describe('parseQuantity', () => {
  it('multiplies packs and keeps piece goods whole', () => {
    expect(parseQuantity('5*12')).toMatchObject({ ok: true, value: 60 })
    expect(parseQuantity('2.5')).toMatchObject({ ok: false, error: 'not_integer' })
    expect(parseQuantity('2.5', 3)).toMatchObject({ ok: true, value: 2.5, text: '2.500' })
  })
})

describe('parseDiscount', () => {
  it('tells a percentage from an amount', () => {
    expect(parseDiscount('10%')).toEqual({ ok: true, kind: 'percent', percent: '10' })
    expect(parseDiscount('12,5%')).toEqual({ ok: true, kind: 'percent', percent: '12.5' })
    expect(parseDiscount('50k')).toEqual({ ok: true, kind: 'amount', minor: 5_000_000 })
    expect(parseDiscount('120%')).toMatchObject({ ok: false, error: 'over_100' })
  })

  it('reads "=" as the sum agreed on, not as what comes off', () => {
    expect(parseDiscount('=1600000')).toEqual({ ok: true, kind: 'target', minor: 160_000_000 })
    expect(parseDiscount('= 1 600 000')).toEqual({ ok: true, kind: 'target', minor: 160_000_000 })
    expect(parseDiscount('=1,6 mln')).toEqual({ ok: true, kind: 'target', minor: 160_000_000 })
    expect(parseDiscount('=')).toMatchObject({ ok: false })
    expect(parseDiscount('=abc')).toMatchObject({ ok: false })
  })
})
