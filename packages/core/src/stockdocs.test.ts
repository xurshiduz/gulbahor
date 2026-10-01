import { describe, expect, it } from 'vitest'

import { stockDocInputSchema } from './stockdocs'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const V1 = '33333333-3333-4333-8333-333333333333'
const V2 = '44444444-4444-4444-8444-444444444444'

const base = { locationId: A, docDate: '2026-10-01', lines: [{ variantId: V1, qty: 2 }] }

/** The fields a document was refused for. */
const refused = (input: unknown) => {
  const result = stockDocInputSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
}

describe('stockDocInputSchema', () => {
  it('wants a transfer to go somewhere else', () => {
    expect(refused({ ...base, kind: 'transfer' })).toEqual(['toLocationId'])
    expect(refused({ ...base, kind: 'transfer', toLocationId: A })).toEqual(['toLocationId'])
    expect(refused({ ...base, kind: 'transfer', toLocationId: B })).toEqual([])
  })

  it('wants a reason for a write-off', () => {
    expect(refused({ ...base, kind: 'writeoff' })).toEqual(['reason'])
    expect(refused({ ...base, kind: 'writeoff', reason: 'defect' })).toEqual([])
  })

  it('takes a zero only in a count, where it means "looked, found none"', () => {
    const lines = [{ variantId: V1, qty: 0 }]
    expect(refused({ ...base, kind: 'count', lines })).toEqual([])
    expect(refused({ ...base, kind: 'writeoff', reason: 'loss', lines })).toEqual(['lines.0.qty'])
    expect(refused({ ...base, kind: 'transfer', toLocationId: B, lines })).toEqual(['lines.0.qty'])
  })

  it('refuses the same variant twice and more than three decimals', () => {
    const twice = [
      { variantId: V1, qty: 1 },
      { variantId: V2, qty: 1 },
      { variantId: V1, qty: 3 },
    ]
    expect(refused({ ...base, kind: 'count', lines: twice })).toEqual(['lines.2.variantId'])
    expect(refused({ ...base, kind: 'count', lines: [{ variantId: V1, qty: 1.2345 }] })).toEqual(['lines.0.qty'])
    expect(refused({ ...base, kind: 'count', lines: [{ variantId: V1, qty: 1.235 }] })).toEqual([])
  })

  it('fills in what was left out', () => {
    expect(stockDocInputSchema.parse({ ...base, kind: 'count' })).toMatchObject({
      toLocationId: null,
      reason: null,
      fullCount: false,
    })
  })
})
