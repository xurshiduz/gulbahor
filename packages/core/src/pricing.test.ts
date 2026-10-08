import { describe, expect, it } from 'vitest'

import { priceTypeInputSchema } from './catalog'
import { roundPrice } from './money'
import { marginPercent, pickMarkup, priceRuleInputSchema, repriceSchema, withPercent, type Markup } from './pricing'

const som = (amount: number) => amount * 100

const RETAIL = '11111111-1111-4111-8111-111111111111'
const WHOLESALE = '22222222-2222-4222-8222-222222222222'
const MEN = '33333333-3333-4333-8333-333333333333'
const SHIRTS = '44444444-4444-4444-8444-444444444444'
const ZARA = '55555555-5555-4555-8555-555555555555'

describe('roundPrice', () => {
  it('rounds to a step', () => {
    const thousand = { step: som(1000), ending: 0 }
    expect(roundPrice(som(94_499), thousand)).toBe(som(94_000))
    expect(roundPrice(som(94_500), thousand)).toBe(som(95_000))
    expect(roundPrice(som(95_000), thousand)).toBe(som(95_000))
  })

  it('makes prices end the same way', () => {
    const nines = { step: som(10_000), ending: som(9000) }
    expect(roundPrice(som(96_768), nines)).toBe(som(99_000))
    expect(roundPrice(som(93_999), nines)).toBe(som(89_000))
    expect(roundPrice(som(94_000), nines)).toBe(som(99_000))
    expect(roundPrice(som(49_000), nines)).toBe(som(49_000))
    // Too small for the pattern: the ending itself, never nothing.
    expect(roundPrice(som(2000), nines)).toBe(som(9000))
  })

  it('leaves a price alone without a step, and never turns something into nothing', () => {
    expect(roundPrice(som(94_499), { step: 0, ending: 0 })).toBe(som(94_499))
    expect(roundPrice(som(300), { step: som(1000), ending: 0 })).toBe(som(1000))
    expect(roundPrice(0, { step: som(1000), ending: 0 })).toBe(0)
  })

  it('is refused an ending that does not fit inside the step', () => {
    const type = { name: 'Chakana', kind: 'retail', currency: 'UZS' }
    expect(priceTypeInputSchema.safeParse({ ...type, roundStep: som(10_000), roundEnding: som(9000) }).success).toBe(
      true,
    )
    expect(priceTypeInputSchema.safeParse({ ...type, roundStep: som(1000), roundEnding: som(9000) }).success).toBe(
      false,
    )
    expect(priceTypeInputSchema.parse(type)).toMatchObject({ roundStep: 0, roundEnding: 0 })
  })
})

describe('markup', () => {
  it('adds a percentage exactly, and reads one back', () => {
    expect(withPercent(som(53_760), 80)).toBe(som(96_768))
    expect(withPercent(som(100_000), -15)).toBe(som(85_000))
    expect(withPercent(333, 33.33)).toBe(444)
    expect(marginPercent(som(95_000), som(53_760))).toBe(76.7)
    expect(marginPercent(som(40_000), som(53_760))).toBe(-25.6)
    expect(marginPercent(som(95_000), 0)).toBeNull()
    expect(marginPercent(som(95_000), null)).toBeNull()
  })

  const markup = (percent: number, priceTypeId = RETAIL): Markup => ({ priceTypeId, base: 'cost', percent })
  const rule = (scope: { categoryId?: string; brandId?: string; season?: 'ss' | 'aw' }, markups: Markup[]) => ({
    categoryId: scope.categoryId ?? null,
    brandId: scope.brandId ?? null,
    season: scope.season ?? null,
    markups,
  })
  /** A Zara shirt of the summer season, in "Men / Shirts". */
  const shirt = { categoryIds: [SHIRTS, MEN], brandId: ZARA, season: 'ss' as const }

  it('takes the rule that says the most about the product', () => {
    const rules = [
      rule({}, [markup(50)]),
      rule({ categoryId: MEN }, [markup(60)]),
      rule({ categoryId: SHIRTS }, [markup(80)]),
      rule({ categoryId: MEN, brandId: ZARA }, [markup(120)]),
    ]
    // Two things named beats one, even when the one is the nearer category.
    expect(pickMarkup(rules, shirt, RETAIL)?.percent).toBe(120)
    expect(pickMarkup(rules, { ...shirt, brandId: null }, RETAIL)?.percent).toBe(80)
    expect(pickMarkup(rules, { categoryIds: [MEN], brandId: null, season: null }, RETAIL)?.percent).toBe(60)
    expect(pickMarkup(rules, { categoryIds: [], brandId: null, season: null }, RETAIL)?.percent).toBe(50)
  })

  it('between equals prefers the category, then the brand, then the season', () => {
    const rules = [rule({ season: 'ss' }, [markup(10)]), rule({ brandId: ZARA }, [markup(20)])]
    expect(pickMarkup(rules, shirt, RETAIL)?.percent).toBe(20)
    expect(pickMarkup([...rules, rule({ categoryId: MEN }, [markup(30)])], shirt, RETAIL)?.percent).toBe(30)
  })

  it('passes over rules that do not fit or say nothing about the price type', () => {
    const rules = [
      rule({}, [markup(50), { priceTypeId: WHOLESALE, base: 'retail', percent: -15 }]),
      rule({ categoryId: SHIRTS }, [markup(80)]),
      rule({ season: 'aw' }, [markup(200)]),
    ]
    expect(pickMarkup(rules, shirt, RETAIL)?.percent).toBe(80)
    // The shirts rule has no wholesale markup, so the general one stands.
    expect(pickMarkup(rules, shirt, WHOLESALE)).toEqual({ priceTypeId: WHOLESALE, base: 'retail', percent: -15 })
    expect(pickMarkup([rule({ season: 'aw' }, [markup(200)])], shirt, RETAIL)).toBeNull()
  })
})

describe('schemas', () => {
  it('reads a rule and refuses a repeated price type', () => {
    const one = { priceTypeId: RETAIL, base: 'cost', percent: 80 }
    expect(priceRuleInputSchema.parse({ markups: [one] })).toMatchObject({
      categoryId: null,
      brandId: null,
      season: null,
    })
    expect(priceRuleInputSchema.safeParse({ markups: [one, one] }).success).toBe(false)
    expect(priceRuleInputSchema.safeParse({ markups: [] }).success).toBe(false)
    expect(priceRuleInputSchema.safeParse({ markups: [{ ...one, percent: 12.345 }] }).success).toBe(false)
  })

  it('reads each way of changing prices', () => {
    const base = { priceTypeId: RETAIL, filter: {} }
    const parsed = repriceSchema.parse({ ...base, operation: { kind: 'markup' } })
    expect(parsed).toMatchObject({ dryRun: true, round: true, filter: { presence: 'all' } })
    expect(parsed.operation).toEqual({ kind: 'markup', percent: null, today: false })
    expect(repriceSchema.safeParse({ ...base, operation: { kind: 'percent', percent: 10 } }).success).toBe(true)
    expect(repriceSchema.safeParse({ ...base, operation: { kind: 'amount', amount: -500_000 } }).success).toBe(true)
    expect(
      repriceSchema.safeParse({ ...base, operation: { kind: 'from_type', priceTypeId: WHOLESALE, percent: 20 } })
        .success,
    ).toBe(true)
    expect(repriceSchema.safeParse({ ...base, operation: { kind: 'percent', percent: -100 } }).success).toBe(false)
    expect(repriceSchema.safeParse({ ...base, operation: { kind: 'set' } }).success).toBe(false)
  })
})
