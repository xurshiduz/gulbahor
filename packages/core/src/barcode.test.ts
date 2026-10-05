import { describe, expect, it } from 'vitest'

import { barRuns, code128, CODE128_PATTERNS, code128Width, ean13 } from './barcode'

describe('code128', () => {
  it('has a table that holds together', () => {
    expect(CODE128_PATTERNS).toHaveLength(107)
    expect(new Set(CODE128_PATTERNS).size).toBe(107)
    const widths = (pattern: string) => [...pattern].map(Number)
    for (const pattern of CODE128_PATTERNS.slice(0, 106)) {
      expect(pattern).toMatch(/^[1-4]{6}$/)
      expect(widths(pattern).reduce((sum, width) => sum + width, 0)).toBe(11)
      // The bars of a symbol always come to an even number of modules.
      const bars = widths(pattern).filter((_, index) => index % 2 === 0)
      expect(bars.reduce((sum, width) => sum + width, 0) % 2).toBe(0)
    }
    expect(widths(CODE128_PATTERNS[106]).reduce((sum, width) => sum + width, 0)).toBe(13)
  })

  it('draws a receipt number', () => {
    const bars = code128('CH-000123') as string
    expect(bars).toHaveLength(code128Width('CH-000123'))
    // Start B, then C, H and the dash as they are always drawn.
    expect(bars.startsWith('11010010000' + '10001000110' + '11000101000' + '10011011100')).toBe(true)
    // Every zero the same, and the stop at the end.
    expect(bars.slice(44, 77)).toBe('10011101100'.repeat(3))
    expect(bars.endsWith('1100011101011')).toBe(true)
  })

  it('works the check symbol out of what it carries', () => {
    // "A": (104 + 33 × 1) mod 103 = 34, the symbol of "B".
    expect(code128('A')).toBe('11010010000' + '10100011000' + '10001011000' + '1100011101011')
  })

  it('carries printable ASCII and nothing else', () => {
    expect(code128('')).toBeNull()
    expect(code128('Ko‘ylak')).toBeNull()
    expect(code128('чек')).toBeNull()
  })
})

describe('ean13', () => {
  it('draws thirteen digits in ninety-five modules', () => {
    const bars = ean13('2000000000015') as string
    expect(bars).toHaveLength(95)
    expect(bars.startsWith('101')).toBe(true)
    expect(bars.slice(45, 50)).toBe('01010')
    expect(bars.endsWith('101')).toBe(true)
    // First digit 2: the left half goes L L G G L G. A zero is 0001101 one way and 0100111 the other.
    expect(bars.slice(3, 45)).toBe(['0001101', '0001101', '0100111', '0100111', '0001101', '0100111'].join(''))
    // The right half: 0 0 0 0 1 5.
    expect(bars.slice(50, 92)).toBe(['1110010', '1110010', '1110010', '1110010', '1100110', '1001110'].join(''))
  })

  it('takes nothing but thirteen digits', () => {
    expect(ean13('200000000001')).toBeNull()
    expect(ean13('20000000000AB')).toBeNull()
  })
})

describe('barRuns', () => {
  it('gathers the modules into bars', () => {
    expect(barRuns('1101000111')).toEqual([
      { at: 0, width: 2 },
      { at: 3, width: 1 },
      { at: 7, width: 3 },
    ])
    expect(barRuns('000')).toEqual([])
  })
})
