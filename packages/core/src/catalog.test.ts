import { describe, expect, it } from 'vitest'

import {
  barcodeSchema,
  combinations,
  ean13CheckDigit,
  internalBarcode,
  isValidEan13,
  productInputSchema,
} from './catalog'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('barcodes', () => {
  it('computes the EAN-13 check digit', () => {
    expect(ean13CheckDigit('400638133393')).toBe(1)
    expect(ean13CheckDigit('590123412345')).toBe(7)
    expect(isValidEan13('4006381333931')).toBe(true)
    expect(isValidEan13('4006381333932')).toBe(false)
    expect(isValidEan13('40063813339')).toBe(false)
  })

  it('makes in-store codes that scan as valid EAN-13', () => {
    expect(internalBarcode(1)).toBe('2000000000015')
    for (const sequence of [1, 7, 42, 999, 123_456_789, 9_999_999_999]) {
      const code = internalBarcode(sequence)
      expect(code).toHaveLength(13)
      expect(code.startsWith('20')).toBe(true)
      expect(isValidEan13(code)).toBe(true)
    }
    expect(() => internalBarcode(0)).toThrow()
    expect(() => internalBarcode(10_000_000_000)).toThrow()
  })

  it('reads a typed code the way a scanner would send it', () => {
    expect(barcodeSchema.parse(' 4006 3813 33931 ')).toBe('4006381333931')
    expect(barcodeSchema.safeParse('12').success).toBe(false)
    expect(barcodeSchema.safeParse('штрих-код').success).toBe(false)
  })
})

describe('combinations', () => {
  it('lists every variant the axes describe, in axis order', () => {
    expect(
      combinations([
        ['qora', 'oq'],
        ['S', 'M'],
      ]),
    ).toEqual([
      ['qora', 'S'],
      ['qora', 'M'],
      ['oq', 'S'],
      ['oq', 'M'],
    ])
    expect(combinations([])).toEqual([[]])
    expect(combinations([['qora'], []])).toEqual([])
  })
})

describe('productInputSchema', () => {
  const base = { name: 'Futbolka', axisIds: [id(1), id(2)] }

  it('accepts a model whose variants match its axes', () => {
    const result = productInputSchema.safeParse({
      ...base,
      variants: [{ valueIds: [id(10), id(20)], barcodes: ['4006381333931'] }, { valueIds: [id(10), id(21)] }],
    })
    expect(result.success).toBe(true)
    expect(result.data?.unit).toBe('pcs')
    expect(result.data?.variants[1].barcodes).toEqual([])
  })

  it('refuses a variant with the wrong number of values, a repeated variant and a repeated barcode', () => {
    const paths = (variants: unknown[]) => {
      const result = productInputSchema.safeParse({ ...base, variants })
      return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
    }
    expect(paths([{ valueIds: [id(10)] }])).toEqual(['variants.0.valueIds'])
    expect(paths([{ valueIds: [id(10), id(20)] }, { valueIds: [id(10), id(20)] }])).toEqual(['variants.1.valueIds'])
    expect(
      paths([
        { valueIds: [id(10), id(20)], barcodes: ['12345678'] },
        { valueIds: [id(10), id(21)], barcodes: ['1234 5678'] },
      ]),
    ).toEqual(['variants.1.barcodes.0'])
  })

  it('needs exactly the axes it names, and at least one variant', () => {
    expect(productInputSchema.safeParse({ name: 'Sharf', axisIds: [], variants: [{ valueIds: [] }] }).success).toBe(
      true,
    )
    expect(productInputSchema.safeParse({ name: 'Sharf', axisIds: [], variants: [] }).success).toBe(false)
    expect(
      productInputSchema.safeParse({ ...base, axisIds: [id(1), id(1)], variants: [{ valueIds: [id(10), id(11)] }] })
        .success,
    ).toBe(false)
  })
})
