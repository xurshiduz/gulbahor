import { formatMoney, type PosContextDto } from '@erp/core'
import { afterEach, describe, expect, it } from 'vitest'

import { kindOf } from '@/features/pos/tender-panel'
import { tenderRows } from '@/features/pos/pos-state'
import { i18n } from '@/i18n'

import { base, baseWords, dollarsBeside, setBase } from './base'
import { moneyCell } from './excel'

const t = i18n.t.bind(i18n)
const context = (usd: boolean) =>
  ({ usd, cards: [{ id: 'kaspi', kind: 'card', currency: 'KZT' }], terminals: [] }) as unknown as PosContextDto

describe('the base currency on the screens', () => {
  afterEach(() => setBase('UZS'))

  it('is so’m until a session says otherwise', () => {
    expect(base()).toBe('UZS')
    expect(t('pos.payCash', baseWords(t))).toBe('Naqd so‘m')
  })

  it('names the till’s rows and sums in tenge for a tenge business, dollars beside them', () => {
    setBase('KZT')
    expect(t('pos.payCash', baseWords(t))).toBe('Naqd tenge')
    expect(t('pos.takenFor', baseWords(t))).toBe('Tengeda hisoblanadi')
    expect(t('stand.allInBase', baseWords(t))).toBe('Hammasi tengeda')
    const rows = tenderRows(context(true))
    expect(rows.map((row) => [row.key, row.currency, kindOf(row)])).toEqual([
      ['cash', 'KZT', 'cash'],
      ['usd', 'USD', 'usd'],
      ['account:kaspi', 'KZT', 'card'],
    ])
    expect(dollarsBeside('USD')).toBe(true)
    expect(moneyCell(150_000, base())).toEqual({ value: 1500, format: '#,##0' })
    // Thousands are kept apart by a space that does not break.
    expect(formatMoney(150_000, base()).replace(/\s/g, ' ')).toBe('1 500 ₸')
  })

  it('has nothing beside the dollar where the dollar is the base', () => {
    setBase('USD')
    expect(dollarsBeside('USD')).toBe(false)
    const [cash] = tenderRows(context(false))
    expect([cash.currency, kindOf(cash)]).toEqual(['USD', 'cash'])
    expect(t('pos.payCash', baseWords(t))).toBe('Naqd dollar')
  })
})
