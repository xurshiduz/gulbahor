import type { AttributeDto, ProductDto } from '@gulbahor/core'
import { describe, expect, it } from 'vitest'

import {
  carryOver,
  emptyState,
  keyOf,
  orderedKeys,
  removedCount,
  stateOf,
  toVariantInputs,
  withAxes,
  withDraft,
  withSelected,
  withVariants,
} from './product-state'

const value = (id: string) => ({ id, name: id, hex: null, isActive: true })
const attributes: AttributeDto[] = [
  { id: 'color', name: 'Rang', kind: 'color', isActive: true, values: ['black', 'white'].map(value) },
  { id: 'size', name: "O'lcham", kind: 'size', isActive: true, values: ['S', 'M', 'L'].map(value) },
]

const saved = {
  id: 'p1',
  axisIds: ['color', 'size'],
  variants: [
    { id: 'v1', valueIds: ['black', 'S'], sku: '1001-01', barcodes: ['2000000000015'], isActive: true, prices: [] },
    { id: 'v2', valueIds: ['black', 'M'], sku: '1001-02', barcodes: ['2000000000022'], isActive: true, prices: [] },
  ],
} as unknown as ProductDto

describe('the variants of a new model', () => {
  it('ticks every combination of a value as it is picked, in the order of the lists', () => {
    let state = emptyState(['color', 'size'])
    state = withSelected(state, 0, ['white', 'black'])
    expect(orderedKeys(state, attributes)).toEqual([])

    // Sizes picked out of order still run S, M, L.
    state = withSelected(state, 1, ['L', 'S'])
    expect(orderedKeys(state, attributes)).toEqual(['black|S', 'black|L', 'white|S', 'white|L'])
  })

  it('keeps an unticked combination unticked when another value is added', () => {
    let state = withSelected(withSelected(emptyState(['color', 'size']), 0, ['black', 'white']), 1, ['S'])
    state = withVariants(state, ['white|S'], false)
    state = withSelected(state, 1, ['S', 'M'])
    expect(orderedKeys(state, attributes)).toEqual(['black|S', 'black|M', 'white|M'])
  })

  it('drops the variants of a value that is taken away', () => {
    let state = withSelected(withSelected(emptyState(['color', 'size']), 0, ['black', 'white']), 1, ['S', 'M'])
    state = withSelected(state, 0, ['white'])
    expect(orderedKeys(state, attributes)).toEqual(['white|S', 'white|M'])
  })

  it('has exactly one variant when there are no axes', () => {
    const state = emptyState([])
    expect(orderedKeys(state, attributes)).toEqual([''])
    expect(toVariantInputs(state, [''])).toEqual([
      { id: null, valueIds: [], sku: null, barcodes: [], isActive: true, prices: [] },
    ])
  })

  it('keeps the values of an axis that stays when the axes change', () => {
    let state = withSelected(withSelected(emptyState(['color', 'size']), 0, ['black']), 1, ['S', 'M'])
    state = withAxes(state, ['size'])
    expect(orderedKeys(state, attributes)).toEqual(['S', 'M'])
  })

  it('carries the axes and values over to the next model, but not what was typed', () => {
    let state = withSelected(withSelected(emptyState(['color', 'size']), 0, ['black']), 1, ['S'])
    state = withDraft(state, 'black|S', { sku: 'X-1', barcodes: ['12345678'] })
    const next = carryOver(state)
    expect(orderedKeys(next, attributes)).toEqual(['black|S'])
    expect(next.variants['black|S']).toMatchObject({ id: null, sku: '', barcodes: [] })
  })
})

describe('the variants of a saved model', () => {
  it('brings a variant unticked by mistake back as itself', () => {
    let state = stateOf(saved)
    state = withVariants(state, [keyOf(['black', 'M'])], false)
    expect(removedCount(state)).toBe(1)
    state = withVariants(state, [keyOf(['black', 'M'])], true)
    expect(removedCount(state)).toBe(0)
    expect(state.variants['black|M'].id).toBe('v2')
  })

  it('sends an article only when it was changed, so automatic ones can follow the model', () => {
    let state = stateOf(saved)
    state = withDraft(state, 'black|M', { sku: 'CUSTOM' })
    state = withSelected(state, 1, ['S', 'M', 'L'])
    const inputs = toVariantInputs(state, orderedKeys(state, attributes))
    expect(inputs.map((input) => [input.id, input.sku])).toEqual([
      ['v1', null],
      ['v2', 'CUSTOM'],
      [null, null],
    ])
  })
})
