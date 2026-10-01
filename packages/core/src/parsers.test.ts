import { describe, expect, it } from 'vitest'

import { formatDate, parseDateInput, type LocalDate } from './date'
import { formatPhoneTyping, parsePhone } from './phone'
import { matchScore, queryKeys, searchKey } from './text'

const today: LocalDate = { year: 2026, month: 10, day: 1 }
const date = (input: string) => {
  const result = parseDateInput(input, today)
  return result.ok ? formatDate(result.date) : result.error
}

describe('parseDateInput', () => {
  it('understands words and offsets', () => {
    expect(date('b')).toBe('01.10.2026')
    expect(date('k')).toBe('30.09.2026')
    expect(date('л')).toBe('30.09.2026')
    expect(date('-3')).toBe('28.09.2026')
    expect(date('+1')).toBe('02.10.2026')
  })

  it('understands digits with and without separators', () => {
    expect(date('15')).toBe('15.10.2026')
    expect(date('1510')).toBe('15.10.2026')
    expect(date('510')).toBe('05.10.2026')
    expect(date('151025')).toBe('15.10.2025')
    expect(date('15102025')).toBe('15.10.2025')
    expect(date('15.10')).toBe('15.10.2026')
    expect(date('15/10/25')).toBe('15.10.2025')
    expect(date('2025-10-15')).toBe('15.10.2025')
  })

  it('rejects impossible dates', () => {
    expect(date('3102')).toBe('invalid')
    expect(date('29.02.2025')).toBe('invalid')
    expect(date('abc')).toBe('invalid')
  })
})

describe('parsePhone', () => {
  it('accepts every common shape', () => {
    for (const input of ['901234567', '+998 90 123 45 67', '998901234567', '8 90 123-45-67', '(90) 123-45-67']) {
      expect(parsePhone(input)).toMatchObject({ ok: true, e164: '+998901234567', display: '+998 90 123 45 67' })
    }
  })

  it('says when a number is incomplete', () => {
    expect(parsePhone('90 123 45')).toMatchObject({ ok: false, error: 'incomplete' })
  })

  it('formats while typing', () => {
    expect(formatPhoneTyping('90123')).toBe('90 123')
    expect(formatPhoneTyping('+998901234567')).toBe('90 123 45 67')
  })
})

describe('search keys', () => {
  it('folds Cyrillic, apostrophes and case into one key', () => {
    expect(searchKey('Анвар')).toBe('anvar')
    expect(searchKey("O'g'il")).toBe(searchKey('Oʻg‘il'))
    expect(searchKey('Ўғил')).toBe('ogil')
    expect(searchKey('Futbolka, QORA / XL')).toBe('futbolka qora xl')
    expect(searchKey('Елена')).toBe(searchKey('Yelena'))
  })

  it('matches words in any order', () => {
    const key = searchKey('Futbolka Polo qora XL')
    expect(matchScore(queryKeys('qora futbolka xl'), key)).toBeGreaterThan(0)
    expect(matchScore(queryKeys('qizil'), key)).toBe(0)
  })

  it('recovers from the wrong keyboard layout', () => {
    // "anvar" typed with the Russian layout on
    expect(matchScore(queryKeys('фтмфк'), searchKey('Anvar'))).toBeGreaterThan(0)
    // "Анвар" typed with the Latin layout on
    expect(matchScore(queryKeys('fydfh'), searchKey('Анвар'))).toBeGreaterThan(0)
  })

  it('ranks exact and prefix matches first', () => {
    const keys = queryKeys('anvar')
    expect(matchScore(keys, 'anvar')).toBeGreaterThan(matchScore(keys, 'anvar aka'))
    expect(matchScore(keys, 'anvar aka')).toBeGreaterThan(matchScore(keys, 'dilshod anvarov'))
  })
})
