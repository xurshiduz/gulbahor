import { describe, expect, it } from 'vitest'

import {
  lineAuto,
  promoOff,
  promotionCovers,
  promotionInputSchema,
  promotionState,
  type PromoOffer,
  type PromoSubject,
} from './promotions'

const som = (amount: number) => amount * 100

const offer = (kind: 'percent' | 'price', value: number, more: Partial<PromoOffer> = {}): PromoOffer => ({
  id: `${kind}-${value}`,
  name: `${kind} ${value}`,
  kind,
  value,
  stackable: false,
  ...more,
})

describe('a promotion', () => {
  const base = { name: 'Yozgi aksiya', kind: 'percent', value: 20, startsOn: '2026-10-01' }
  const refused = (input: unknown) => {
    const result = promotionInputSchema.safeParse(input)
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
  }

  it('says what it gives, when, and to which goods; left unsaid, it is for everything, everywhere', () => {
    expect(promotionInputSchema.parse({ ...base, code: ' insta10 ' })).toMatchObject({
      endsOn: null,
      locationIds: [],
      productIds: [],
      categoryIds: [],
      brandIds: [],
      seasons: [],
      stackable: false,
      code: 'INSTA10',
    })
    expect(promotionInputSchema.parse(base).code).toBeNull()
    expect(refused({ ...base, value: 120 })).toEqual(['value'])
    expect(refused({ ...base, value: 12.345 })).toEqual(['value'])
    expect(refused({ ...base, kind: 'price', value: 99_000.5 })).toEqual(['value'])
    expect(refused({ ...base, kind: 'price', value: som(99_000) })).toEqual([])
    expect(refused({ ...base, endsOn: '2026-09-30' })).toEqual(['endsOn'])
    expect(refused({ ...base, endsOn: '2026-10-01' })).toEqual([])
  })

  it('starts and ends by itself, on the days it names', () => {
    const promotion = { startsOn: '2026-10-05', endsOn: '2026-10-07', isActive: true }
    expect(promotionState(promotion, '2026-10-04')).toBe('scheduled')
    expect(promotionState(promotion, '2026-10-05')).toBe('running')
    expect(promotionState(promotion, '2026-10-07')).toBe('running')
    expect(promotionState(promotion, '2026-10-08')).toBe('ended')
    expect(promotionState({ ...promotion, endsOn: null }, '2030-01-01')).toBe('running')
    expect(promotionState({ ...promotion, isActive: false }, '2026-10-06')).toBe('stopped')
  })

  it('covers a model that fits every condition it sets, and whatever is on its list', () => {
    const dress: PromoSubject = { productId: 'dress', categoryIds: ['dresses', 'women'], brandId: 'zara', season: 'ss' }
    const none = { productIds: [], categoryIds: [], brandIds: [], seasons: [] }
    // Nothing set: everything.
    expect(promotionCovers(none, dress)).toBe(true)
    // A category covers what is under it.
    expect(promotionCovers({ ...none, categoryIds: ['women'] }, dress)).toBe(true)
    expect(promotionCovers({ ...none, categoryIds: ['men'] }, dress)).toBe(false)
    // Several conditions: all of them.
    expect(promotionCovers({ ...none, categoryIds: ['women'], seasons: ['ss'] }, dress)).toBe(true)
    expect(promotionCovers({ ...none, categoryIds: ['women'], seasons: ['aw'] }, dress)).toBe(false)
    expect(promotionCovers({ ...none, brandIds: ['zara', 'hm'] }, dress)).toBe(true)
    expect(promotionCovers({ ...none, brandIds: ['hm'] }, { ...dress, brandId: null })).toBe(false)
    // On the list it is covered whatever else is asked; a list alone covers nothing but itself.
    expect(promotionCovers({ ...none, productIds: ['dress'], seasons: ['aw'] }, dress)).toBe(true)
    expect(promotionCovers({ ...none, productIds: ['scarf'] }, dress)).toBe(false)
  })
})

describe('what a promotion takes off a line', () => {
  it('is a share of it, or what brings every piece down to one price', () => {
    expect(promoOff(offer('percent', 20), som(100_000), 2)).toBe(som(40_000))
    expect(promoOff(offer('price', som(79_000)), som(100_000), 2)).toBe(som(42_000))
    // A price set above the thing's own takes nothing off.
    expect(promoOff(offer('price', som(120_000)), som(100_000), 2)).toBe(0)
  })

  it('is the most any one promotion gives: they are not added together', () => {
    const offers = [offer('percent', 20), offer('price', som(70_000)), offer('percent', 25)]
    expect(lineAuto(som(100_000), 1, offers, 0)).toMatchObject({
      auto: som(30_000),
      promoOff: som(30_000),
      ownOff: 0,
      promo: { id: 'price-7000000' },
    })
    expect(lineAuto(som(100_000), 1, [], 0)).toEqual({ auto: 0, promo: null, promoOff: 0, ownOff: 0 })
  })
})

describe("a promotion beside the customer's own discount", () => {
  it('gives way to it, or wins over it: whichever is more for the customer', () => {
    // 50% promotion, 20% of their own: 50% stays.
    expect(lineAuto(som(1_000_000), 1, [offer('percent', 50)], 20)).toMatchObject({
      auto: som(500_000),
      promoOff: som(500_000),
      ownOff: 0,
    })
    // 5% promotion, 10% of their own: theirs.
    const theirs = lineAuto(som(1_000_000), 1, [offer('percent', 5)], 10)
    expect(theirs).toEqual({ auto: som(100_000), promo: null, promoOff: 0, ownOff: som(100_000) })
    // Alone, each is what it is.
    expect(lineAuto(som(1_000_000), 1, [], 10).auto).toBe(som(100_000))
  })

  it('stacks only when the promotion says so, one after the other', () => {
    // 1 000 000 less 50% is 500 000, less 20% of that is 400 000: 60% in all, not 70%.
    const stacked = lineAuto(som(1_000_000), 1, [offer('percent', 50, { stackable: true })], 20)
    expect(stacked).toMatchObject({ auto: som(600_000), promoOff: som(500_000), ownOff: som(100_000) })
    expect(stacked.promo?.id).toBe('percent-50')
  })
})
