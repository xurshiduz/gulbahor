import { describe, expect, it } from 'vitest'

import { priceTypeInputSchema } from './catalog'
import { roundPrice } from './money'
import {
  formulaText,
  marginPercent,
  parsePriceEntry,
  pickMarkup,
  priceBy,
  priceFormulaSchema,
  priceRuleInputSchema,
  pricingSays,
  receiptPrice,
  receiptPricingSchema,
  repriceSchema,
  withPercent,
  type Markup,
  type PriceFormula,
  type RuledMarkup,
} from './pricing'

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

describe('roundPrice, upward', () => {
  it('is the smallest price the rounding allows that is not below the sum', () => {
    const thousand = { step: som(1000), ending: 0 }
    expect(roundPrice(som(10_450), thousand, 'up')).toBe(som(11_000))
    expect(roundPrice(som(10_001), thousand, 'up')).toBe(som(11_000))
    expect(roundPrice(som(11_000), thousand, 'up')).toBe(som(11_000))
    const nines = { step: som(10_000), ending: som(9000) }
    expect(roundPrice(som(50_000), nines, 'up')).toBe(som(59_000))
    expect(roundPrice(som(49_000), nines, 'up')).toBe(som(49_000))
    expect(roundPrice(som(49_001), nines, 'up')).toBe(som(59_000))
    expect(roundPrice(som(5000), nines, 'up')).toBe(som(9000))
    // No step: as worked out.
    expect(roundPrice(12_345, { step: 0, ending: 0 }, 'up')).toBe(12_345)
  })
})

describe('a price formula', () => {
  const thousand = { step: som(1000), ending: 0 }
  const none = { step: 0, ending: 0 }
  const formula = (base: PriceFormula['base'], percent = 0, amount = 0): PriceFormula => ({ base, percent, amount })
  const basis = { cost: som(100_000), retail: som(145_000) }

  it('works a price out from cost, with a percentage and a sum, rounded up', () => {
    expect(priceBy(formula('cost', 45), basis, none)).toBe(som(145_000))
    expect(priceBy(formula('cost', 0, som(50_000)), basis, none)).toBe(som(150_000))
    expect(priceBy(formula('cost', 20, som(5000)), basis, none)).toBe(som(125_000))
    // A markup is never lost to rounding: 10 450 with a step of a thousand is 11 000.
    expect(priceBy(formula('cost'), { cost: som(10_450), retail: null }, thousand)).toBe(som(11_000))
  })

  it('works one out from the retail price, and leaves a price named outright as it was named', () => {
    // 145 000 less 15% is 123 250: up to 124 000.
    expect(priceBy(formula('retail', -15), basis, thousand)).toBe(som(124_000))
    expect(priceBy(formula('retail', 5), basis, none)).toBe(som(152_250))
    expect(priceBy(formula('fixed', 0, som(180_500)), basis, thousand)).toBe(som(180_500))
  })

  it('makes nothing of nothing', () => {
    expect(priceBy(formula('cost', 30), { cost: null, retail: som(145_000) }, none)).toBeNull()
    expect(priceBy(formula('retail', -15), { cost: som(100_000), retail: null }, none)).toBeNull()
    // Taken down to nothing, it is not a price.
    expect(priceBy(formula('cost', 0, -som(100_000)), basis, none)).toBeNull()
    expect(priceBy(formula('fixed'), basis, none)).toBeNull()
  })

  it('is refused a price named outright with a percentage, or with no sum', () => {
    expect(priceFormulaSchema.parse({ base: 'cost', percent: 30 })).toEqual({ base: 'cost', percent: 30, amount: 0 })
    expect(priceFormulaSchema.safeParse({ base: 'fixed', amount: som(180_000) }).success).toBe(true)
    expect(priceFormulaSchema.safeParse({ base: 'fixed', amount: 0 }).success).toBe(false)
    expect(priceFormulaSchema.safeParse({ base: 'fixed', amount: som(180_000), percent: 5 }).success).toBe(false)
    expect(priceFormulaSchema.safeParse({ base: 'cost', percent: -100 }).success).toBe(false)
  })

  it('is said in words, and as it is typed', () => {
    const plain = (text: string) => text.replace(/\s/g, ' ')
    expect(plain(formulaText(formula('cost', 30, som(5000)), 'UZS'))).toBe('tannarx + 30% + 5 000 so‘m')
    expect(plain(formulaText(formula('cost'), 'UZS'))).toBe('tannarx')
    expect(plain(formulaText(formula('retail', -15), 'UZS'))).toBe('chakana − 15%')
    expect(plain(formulaText(formula('retail', 12.5, -som(1000)), 'UZS'))).toBe('chakana + 12,5% − 1 000 so‘m')
    expect(plain(formulaText(formula('fixed', 0, som(180_000)), 'UZS'))).toBe('180 000 so‘m')
    expect(plain(formulaText(formula('cost', 30), 'UZS', true))).toBe('30%')
    expect(plain(formulaText(formula('cost', 0, som(50_000)), 'UZS', true))).toBe('+50 000')
    expect(plain(formulaText(formula('cost', 30, som(5000)), 'UZS', true))).toBe('30% + 5 000')
    expect(plain(formulaText(formula('retail', -15), 'UZS', true))).toBe('ch −15%')
  })
})

describe('what is typed into a price field', () => {
  const read = (text: string) => parsePriceEntry(text)
  const cost = (percent: number, amount = 0) => ({ ok: true, entry: { formula: { base: 'cost', percent, amount } } })
  const retail = (percent: number, amount = 0) => ({
    ok: true,
    entry: { formula: { base: 'retail', percent, amount } },
  })

  it('is a formula from cost: a percentage, a sum, or both', () => {
    expect(read('30%')).toEqual(cost(30))
    expect(read(' 12,5 % ')).toEqual(cost(12.5))
    expect(read('+50 000')).toEqual(cost(0, som(50_000)))
    expect(read('+50k')).toEqual(cost(0, som(50_000)))
    expect(read('30% + 5000')).toEqual(cost(30, som(5000)))
    expect(read('30%+5 000')).toEqual(cost(30, som(5000)))
    expect(read('0%')).toEqual(cost(0))
  })

  it('is a formula from the retail price, in either alphabet', () => {
    expect(read('ch −15%')).toEqual(retail(-15))
    expect(read('ch-15%')).toEqual(retail(-15))
    expect(read('CH +5%')).toEqual(retail(5))
    expect(read('ч -15%')).toEqual(retail(-15))
    expect(read('ch -15% + 2000')).toEqual(retail(-15, som(2000)))
    expect(read('ch')).toEqual(retail(0))
  })

  it('is otherwise the price itself', () => {
    expect(read('250 000')).toEqual({ ok: true, entry: { amount: som(250_000) } })
    expect(read('250k')).toEqual({ ok: true, entry: { amount: som(250_000) } })
    expect(read('')).toEqual({ ok: true, entry: null })
    expect(read('   ')).toEqual({ ok: true, entry: null })
  })

  it('refuses a markdown from cost, and what it cannot read', () => {
    expect(read('−5%')).toEqual({ ok: false, error: 'below_cost' })
    expect(read('-5%')).toEqual({ ok: false, error: 'below_cost' })
    expect(read('ch 5000')).toEqual({ ok: false, error: 'invalid' })
    expect(read('arzon')).toEqual({ ok: false, error: 'invalid' })
    expect(read('+')).toEqual({ ok: false, error: 'invalid' })
    expect(read('20000%')).toEqual({ ok: false, error: 'invalid' })
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

  const markup = (percent: number, priceTypeId = RETAIL): Markup => ({
    priceTypeId,
    base: 'cost',
    percent,
    amount: 0,
  })
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
      rule({}, [markup(50), { priceTypeId: WHOLESALE, base: 'retail', percent: -15, amount: 0 }]),
      rule({ categoryId: SHIRTS }, [markup(80)]),
      rule({ season: 'aw' }, [markup(200)]),
    ]
    expect(pickMarkup(rules, shirt, RETAIL)?.percent).toBe(80)
    // The shirts rule has no wholesale markup, so the general one stands.
    expect(pickMarkup(rules, shirt, WHOLESALE)).toEqual({
      priceTypeId: WHOLESALE,
      base: 'retail',
      percent: -15,
      amount: 0,
    })
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
    // A sum on top of the percentage, and a price named outright.
    expect(priceRuleInputSchema.parse({ markups: [{ ...one, amount: 500_000 }] }).markups[0]).toEqual({
      ...one,
      amount: 500_000,
    })
    const fixed = { priceTypeId: RETAIL, base: 'fixed', amount: 18_000_000 }
    expect(priceRuleInputSchema.parse({ markups: [fixed] }).markups[0]).toEqual({ ...fixed, percent: 0 })
    expect(priceRuleInputSchema.safeParse({ markups: [{ ...fixed, amount: 0 }] }).success).toBe(false)
  })

  it('reads each way of changing prices', () => {
    const base = { priceTypeId: RETAIL, filter: {} }
    const parsed = repriceSchema.parse({ ...base, operation: { kind: 'formula' } })
    expect(parsed).toMatchObject({ dryRun: true, round: true, filter: { presence: 'all' } })
    // No formula named: each model takes what its rule gives it.
    expect(parsed.operation).toEqual({ kind: 'formula', formula: null, today: false })
    expect(
      repriceSchema.parse({ ...base, operation: { kind: 'formula', formula: { base: 'cost', percent: 45 } } })
        .operation,
    ).toEqual({ kind: 'formula', formula: { base: 'cost', percent: 45, amount: 0 }, today: false })
    expect(
      repriceSchema.parse({ ...base, filter: { missing: WHOLESALE }, operation: { kind: 'formula' } }).filter,
    ).toEqual({ presence: 'all', missing: WHOLESALE })
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

describe('a price on a receipt', () => {
  const rounding = { step: som(1000), ending: 0 }
  const own: RuledMarkup = { priceTypeId: RETAIL, base: 'cost', percent: 50, amount: 0, rule: null }
  const shirts: RuledMarkup = { priceTypeId: RETAIL, base: 'cost', percent: 60, amount: 0, rule: 'Ko‘ylaklar' }
  const goods = { cost: som(80_500), retail: null, rounding, floor: false, standing: null, typed: null, receipt: null }

  it('is what was typed, whatever else says otherwise', () => {
    expect(receiptPrice({ ...goods, typed: { amount: som(99_000) }, rule: own, standing: som(150_000) })).toEqual({
      price: som(99_000),
      formula: null,
      source: 'typed',
      rule: null,
      offered: null,
    })
    // A formula typed into the field is worked out of what these goods cost, and set though a price stands.
    const typed = receiptPrice({
      ...goods,
      typed: { formula: { base: 'cost', percent: 30, amount: 0 } },
      rule: own,
      standing: som(150_000),
      receipt: { skip: true, formula: null, all: false },
    })
    expect(typed).toMatchObject({ price: som(105_000), source: 'typed' })
  })

  it('is otherwise what the receipt itself says, then the narrowest rule, then the type’s own way', () => {
    const receipt = { skip: false, formula: { base: 'cost', percent: 100, amount: 0 } as PriceFormula, all: false }
    expect(receiptPrice({ ...goods, receipt, rule: shirts })).toMatchObject({ price: som(161_000), source: 'receipt' })
    expect(receiptPrice({ ...goods, rule: shirts })).toMatchObject({
      price: som(129_000),
      source: 'rule',
      rule: 'Ko‘ylaklar',
    })
    expect(receiptPrice({ ...goods, rule: own })).toMatchObject({ price: som(121_000), source: 'own', rule: null })
    expect(receiptPrice({ ...goods, rule: null })).toMatchObject({ price: null, source: null })
  })

  it('leaves a price that stands alone, and says what the formula would have given', () => {
    expect(receiptPrice({ ...goods, rule: own, standing: som(110_000) })).toMatchObject({
      price: null,
      source: 'own',
      offered: som(121_000),
    })
    // The same as what stands: nothing to say.
    expect(receiptPrice({ ...goods, rule: own, standing: som(121_000) }).offered).toBeNull()
    // Unless the receipt says its formula is for every one of its goods.
    const all = { skip: false, formula: null, all: true }
    expect(receiptPrice({ ...goods, rule: own, standing: som(110_000), receipt: all })).toMatchObject({
      price: som(121_000),
      source: 'own',
      offered: null,
    })
  })

  it('sets nothing where the receipt says so, and never the floor by rule', () => {
    const skip = { skip: true, formula: null, all: false }
    expect(receiptPrice({ ...goods, rule: own, receipt: skip }).price).toBeNull()
    expect(receiptPrice({ ...goods, rule: own, floor: true })).toMatchObject({ price: null, source: null })
    // The floor is set where the receipt names a formula for it outright.
    const named = { skip: false, formula: { base: 'cost', percent: 5, amount: 0 } as PriceFormula, all: false }
    expect(receiptPrice({ ...goods, rule: own, floor: true, receipt: named }).price).toBe(som(85_000))
  })

  it('starts "retail less" from the retail price the receipt leaves', () => {
    const wholesale: RuledMarkup = { priceTypeId: WHOLESALE, base: 'retail', percent: -15, amount: 0, rule: null }
    expect(receiptPrice({ ...goods, rule: wholesale, retail: som(121_000) }).price).toBe(som(103_000))
    expect(receiptPrice({ ...goods, rule: wholesale, retail: null }).price).toBeNull()
  })

  it('reads what a receipt says of a price type, and knows when that is nothing', () => {
    expect(receiptPricingSchema.parse({})).toEqual({ skip: false, formula: null, all: false })
    expect(pricingSays(receiptPricingSchema.parse({}))).toBe(false)
    expect(pricingSays(receiptPricingSchema.parse({ all: true }))).toBe(true)
    expect(pricingSays(receiptPricingSchema.parse({ skip: true }))).toBe(true)
    expect(receiptPricingSchema.safeParse({ formula: { base: 'fixed', percent: 0, amount: 0 } }).success).toBe(false)
  })
})
