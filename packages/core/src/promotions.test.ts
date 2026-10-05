import { describe, expect, it } from 'vitest'

import {
  cartAutos,
  lineAuto,
  promoOff,
  promotionCovers,
  promotionInputSchema,
  promotionState,
  type PromoOffer,
  type PromoSubject,
} from './promotions'

const som = (amount: number) => amount * 100

const offer = (kind: PromoOffer['kind'], value: number, more: Partial<PromoOffer> = {}): PromoOffer => ({
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
    // "1+1" is a percentage off the second; so many pieces or more has to say how many.
    expect(refused({ ...base, kind: 'pair', value: 100 })).toEqual([])
    expect(refused({ ...base, kind: 'pair', value: 150 })).toEqual(['value'])
    expect(refused({ ...base, kind: 'quantity', value: 10 })).toEqual(['minQty'])
    expect(refused({ ...base, kind: 'quantity', value: 10, minQty: 1 })).toEqual(['minQty'])
    expect(refused({ ...base, kind: 'quantity', value: 10, minQty: 3 })).toEqual([])
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

describe('a promotion that looks at the whole cart', () => {
  const pair = offer('pair', 100)
  const line = (price: number, qty: number, offers: PromoOffer[] = [pair]) => ({ price, qty, offers })
  const offs = (lines: ReturnType<typeof line>[], ownPercent = 0) =>
    cartAutos(lines, ownPercent).map((auto) => auto.auto)

  it('gives the cheaper of every two pieces, and leaves an odd one out as it is', () => {
    // One piece: nothing to pair it with.
    expect(offs([line(som(200_000), 1)])).toEqual([0])
    // Two of the same: the second is free.
    expect(offs([line(som(200_000), 2)])).toEqual([som(200_000)])
    // Three: one pair, and one left over.
    expect(offs([line(som(200_000), 3)])).toEqual([som(200_000)])
    // A dress and a scarf: the scarf is the cheaper of the two.
    expect(offs([line(som(200_000), 1), line(som(50_000), 1)])).toEqual([0, som(50_000)])
    // Dearest first, two by two: 200 with 150 (150 free), 100 with 50 (50 free).
    expect(offs([line(som(50_000), 1), line(som(200_000), 1), line(som(100_000), 1), line(som(150_000), 1)])).toEqual([
      som(50_000),
      0,
      0,
      som(150_000),
    ])
  })

  it('may take only a part off the second, and counts only the pieces it covers', () => {
    const half = offer('pair', 50)
    expect(offs([line(som(200_000), 2, [half])])).toEqual([som(100_000)])
    // The scarf is not in the promotion: the dress has nothing to be paired with.
    expect(offs([line(som(200_000), 1), line(som(50_000), 1, [])])).toEqual([0, 0])
    // Cloth by the metre is not "the second piece".
    expect(offs([line(som(200_000), 1.5)])).toEqual([0])
  })

  it('takes so much off every piece once enough of them are taken', () => {
    const three = offer('quantity', 10, { minQty: 3 })
    const lines = (count: number) => [line(som(100_000), count, [three]), line(som(50_000), 1, [three])]
    expect(offs(lines(1))).toEqual([0, 0])
    // Two shirts and a scarf are three pieces.
    expect(offs(lines(2))).toEqual([som(20_000), som(5000)])
    const [first] = cartAutos(lines(2), 0)
    expect(first).toMatchObject({ promoOff: som(20_000), promo: { id: three.id } })
  })

  it('stands beside the other promotions and the customer like any other: the most for each line', () => {
    const twenty = offer('percent', 20)
    // The dress is 20% off either way; as the cheaper of the pair the scarf is free, which beats its 20%.
    const autos = cartAutos([line(som(200_000), 1, [pair, twenty]), line(som(50_000), 1, [pair, twenty])], 0)
    expect(autos.map((auto) => [auto.promo?.kind, auto.promoOff])).toEqual([
      ['percent', som(40_000)],
      ['pair', som(50_000)],
    ])
    // Her own 30% is more than nothing on the dress, and less than the free scarf.
    const hers = cartAutos([line(som(200_000), 1), line(som(50_000), 1)], 30)
    expect(hers.map((auto) => [auto.promoOff, auto.ownOff])).toEqual([
      [0, som(60_000)],
      [som(50_000), 0],
    ])
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
