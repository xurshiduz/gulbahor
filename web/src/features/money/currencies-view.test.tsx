import type { CurrenciesDto, CurrencyDto } from '@erp/core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import '@/i18n'

import { CurrenciesView, rateSentence } from './currencies-view'

const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

const currency = (code: string, part: Partial<CurrencyDto>): CurrencyDto =>
  ({
    code,
    base: false,
    fixed: false,
    form: { against: 'USD', way: 'per' },
    rate: null,
    worth: null,
    missing: null,
    stale: false,
    held: false,
    carries: [],
    ...part,
  }) as CurrencyDto

const set = (against: string, way: 'per' | 'in', value: number, date = '2026-10-06') =>
  ({ against, way, value, date, setByName: 'Odiljon' }) as CurrencyDto['rate']

/** A shop in Tashkent: so'm its base, dollars at the tills, yuan named against the dollar, roubles straight in so'm. */
const currencies: CurrenciesDto = {
  base: 'UZS',
  active: [
    currency('UZS', { base: true, fixed: true, form: null }),
    currency('USD', {
      fixed: true,
      form: { against: 'UZS', way: 'in' },
      rate: set('UZS', 'in', 12_650),
      worth: '12650.00',
    }),
    currency('CNY', { rate: set('USD', 'per', 7.25), worth: '1744.83' }),
    currency('RUB', { form: { against: 'UZS', way: 'in' }, rate: set('UZS', 'in', 135), worth: '135.00' }),
    currency('KZT', { missing: 'KZT' }),
  ],
  available: ['EUR', 'TRY', 'GBP'],
}

const handlers = () => ({ onRate: vi.fn(), onEnable: vi.fn(), onDisable: vi.fn() })

const show = (part: Partial<Parameters<typeof CurrenciesView>[0]> = {}, data = currencies) => {
  const on = handlers()
  render(<CurrenciesView currencies={data} today="2026-10-06" canManage canRate {...on} {...part} />)
  return on
}
const row = (code: string) => document.querySelector(`[data-currency="${code}"]`) as HTMLElement
const field = (code: string) => within(row(code)).getByRole('textbox') as HTMLInputElement

describe('a rate as a sentence', () => {
  it('reads the way it is said aloud, whichever way round it is written', () => {
    expect(plain(rateSentence('CNY', { against: 'USD', way: 'per' }, 7.25))).toBe('1 $ = 7,25 ¥')
    expect(plain(rateSentence('EUR', { against: 'USD', way: 'in' }, 1.08))).toBe('1 € = 1,08 $')
    expect(plain(rateSentence('RUB', { against: 'UZS', way: 'in' }, 135))).toBe('1 ₽ = 135 so‘m')
    expect(plain(rateSentence('CNY', { against: 'USD', way: 'per' }))).toBe('1 $ = … ¥')
  })
})

describe('the currencies of a business', () => {
  it('are a line each: the base without a rate, the others with the one number they have', () => {
    show()
    expect(plain(row('UZS').textContent)).toContain('asosiy valyuta')
    expect(within(row('UZS')).queryByRole('textbox')).toBeNull()
    // The sentence is written around the field; the field holds what was last set.
    expect(plain(row('USD').textContent)).toContain('1 $ =')
    expect(field('USD').value).toBe('12650')
    expect(plain(row('CNY').textContent)).toContain('1 $ =')
    expect(field('CNY').value).toBe('7,25')
    expect(plain(row('RUB').textContent)).toContain('1 ₽ =')
    expect(field('RUB').value).toBe('135')
  })

  it('show what one of a currency comes to in the base only where that had to be worked out', () => {
    show()
    expect(plain(row('CNY').querySelector('[data-worth]')?.textContent)).toBe('1 ¥ ≈ 1 744,83 so‘m')
    // Written in so'm, the rate is the worth: there is nothing to add.
    expect(row('RUB').querySelector('[data-worth]')).toBeNull()
    expect(row('USD').querySelector('[data-worth]')).toBeNull()
  })

  it('say who set a rate and when, and what stands in the way of a currency without one', () => {
    const data: CurrenciesDto = {
      ...currencies,
      active: [
        currencies.active[0],
        currency('USD', { fixed: true, form: { against: 'UZS', way: 'in' }, missing: 'USD' }),
        currency('CNY', { rate: set('USD', 'per', 7.25), missing: 'USD' }),
        currency('EUR', {
          form: { against: 'USD', way: 'in' },
          rate: set('USD', 'in', 1.08, '2026-09-01'),
          stale: true,
        }),
      ],
    }
    show({}, data)
    const note = (code: string) => plain(row(code).querySelector('[data-note]')?.textContent)
    expect(note('USD')).toBe('Kursi kiritilmagan: bu valyutada amal bajarilmaydi')
    // Its own rate is there; the one it is written against is not.
    expect(note('CNY')).toBe(
      'AQSH dollari kursi kiritilmagan: usiz qiymatini hisoblab bo‘lmaydi · 06.10.2026 · Odiljon',
    )
    expect(note('EUR')).toBe('01.09.2026 · Odiljon · uzoq vaqt yangilanmagan')
  })

  it('remind that the tills’ own rate is yesterday’s until today’s is set', () => {
    show({ today: '2026-10-07' })
    expect(plain(row('USD').querySelector('[data-note]')?.textContent)).toBe(
      '06.10.2026 · Odiljon · bugungisi kiritilmagan',
    )
    // The others are not asked for every morning.
    expect(plain(row('CNY').querySelector('[data-note]')?.textContent)).toBe('06.10.2026 · Odiljon')
  })

  it('send a rate when it is changed, and nothing when it is not', async () => {
    const on = show()
    await userEvent.type(field('CNY'), '{Enter}')
    expect(on.onRate).not.toHaveBeenCalled()
    await userEvent.clear(field('CNY'))
    await userEvent.type(field('CNY'), '7,31{Enter}')
    expect(on.onRate).toHaveBeenCalledTimes(1)
    expect(on.onRate.mock.calls[0][0]).toMatchObject({ code: 'CNY' })
    expect(on.onRate.mock.calls[0][1]).toBe(7.31)
  })

  it('start an empty field where the rate in force was written another way', () => {
    const data: CurrenciesDto = {
      ...currencies,
      active: [
        currencies.active[0],
        currencies.active[1],
        // Asked for in so'm from now on; the rate in force is still the one named against the dollar.
        currency('CNY', { form: { against: 'UZS', way: 'in' }, rate: set('USD', 'per', 7.25), worth: '1744.83' }),
      ],
    }
    show({}, data)
    expect(field('CNY').value).toBe('')
    expect(plain(row('CNY').querySelector('[data-note]')?.textContent)).toBe(
      'Hozirgi kurs: 1 $ = 7,25 ¥ · 06.10.2026 · Odiljon',
    )
  })

  it('are only read by someone who may neither set rates nor switch currencies', () => {
    show({ canManage: false, canRate: false })
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(plain(row('CNY').textContent)).toContain('1 $ = 7,25 ¥')
    expect(screen.queryByPlaceholderText('Valyuta qo‘shish…')).toBeNull()
  })

  it('offer what can still be switched on, by name', () => {
    show()
    expect(screen.getByPlaceholderText('Valyuta qo‘shish…')).toBeTruthy()
    // With every currency on, there is nothing to offer.
    show({}, { ...currencies, available: [] })
    expect(screen.getAllByPlaceholderText('Valyuta qo‘shish…')).toHaveLength(1)
  })
})
