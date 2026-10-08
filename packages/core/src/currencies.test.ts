import { describe, expect, it } from 'vitest'

import {
  baseWorth,
  currencyRateInputSchema,
  exchange,
  isRateJump,
  mayBeWrittenAgainst,
  missingRate,
  rateFormChoices,
  rateWording,
  rebase,
  shownWorth,
  usualRateForm,
  worthInBase,
  type RateBook,
  type RateForm,
} from './currencies'
import { ALL_CURRENCY_CODES, CURRENCIES, formatMoney } from './money'
import { toBase } from './pos'

const som = (value: number) => Math.round(value * 100)
const units = (value: number) => Math.round(value * 100)

/** A shop in Tashkent: books in so'm, dollars kept, yuan and euros named against the dollar, roubles straight in so'm. */
const book: RateBook = {
  base: 'UZS',
  rates: {
    USD: { against: 'UZS', way: 'in', value: 12_650 },
    CNY: { against: 'USD', way: 'per', value: 7.25 },
    EUR: { against: 'USD', way: 'in', value: 1.08 },
    RUB: { against: 'UZS', way: 'in', value: 135 },
  },
}

describe('the currencies a business may switch on', () => {
  it('are a list that is given: each with a name and a sign of its own', () => {
    expect(ALL_CURRENCY_CODES).toHaveLength(16)
    expect(ALL_CURRENCY_CODES).toEqual(expect.arrayContaining(['UZS', 'USD', 'EUR', 'CNY', 'RUB', 'KZT', 'KGS', 'TJS']))
    expect(new Set(ALL_CURRENCY_CODES.map((code) => CURRENCIES[code].name)).size).toBe(16)
    expect(formatMoney(150_000, 'TJS').replace(/\s/g, ' ')).toBe('1 500 SM')
    expect(formatMoney(150_050, 'GBP').replace(/\s/g, ' ')).toBe('1 500,50 £')
  })
})

describe('a rate as it is written', () => {
  it('reads with the dearer currency first, so the number is a large one', () => {
    expect(usualRateForm('USD', 'UZS')).toEqual({ against: 'UZS', way: 'in' })
    expect(rateWording('USD', { against: 'UZS', way: 'in' })).toEqual({ one: 'USD', of: 'UZS' })
    expect(usualRateForm('CNY', 'UZS')).toEqual({ against: 'UZS', way: 'in' })
    expect(usualRateForm('RUB', 'KZT')).toEqual({ against: 'KZT', way: 'in' })
    // Against a dearer one it reads the other way about: "1 $ = 7,25 ¥", "1 $ = 12 650 so'm".
    expect(usualRateForm('CNY', 'USD')).toEqual({ against: 'USD', way: 'per' })
    expect(rateWording('CNY', { against: 'USD', way: 'per' })).toEqual({ one: 'USD', of: 'CNY' })
    expect(usualRateForm('UZS', 'USD')).toEqual({ against: 'USD', way: 'per' })
    expect(usualRateForm('EUR', 'USD')).toEqual({ against: 'USD', way: 'in' })
  })

  it('may be written against the base or any currency that does not lean on it, both ways round', () => {
    const forms = {
      USD: { against: 'UZS' as const, way: 'in' as const },
      CNY: { against: 'USD' as const, way: 'per' as const },
      EUR: { against: 'UZS' as const, way: 'in' as const },
    }
    expect(rateFormChoices('USD', 'UZS', forms)).toEqual([
      { against: 'UZS', way: 'in' },
      { against: 'UZS', way: 'per' },
      // Not against the yuan: the yuan hangs on the dollar.
      { against: 'EUR', way: 'per' },
      { against: 'EUR', way: 'in' },
    ])
    expect(rateFormChoices('CNY', 'UZS', forms).map((form) => form.against)).toEqual([
      'UZS',
      'UZS',
      'USD',
      'USD',
      'EUR',
      'EUR',
    ])
  })

  it('keeps six decimals and no more, and is more than nothing', () => {
    const parse = (value: number) => currencyRateInputSchema.safeParse({ value }).success
    expect(parse(7.25)).toBe(true)
    expect(parse(0.010824)).toBe(true)
    expect(parse(0.0108245)).toBe(false)
    expect(parse(0)).toBe(false)
    expect(parse(-7)).toBe(false)
  })

  it('may lean on another currency only if that one comes down to the base without it', () => {
    const forms: Partial<Record<string, RateForm>> = {
      USD: { against: 'UZS', way: 'in' },
      CNY: { against: 'USD', way: 'per' },
    }
    expect(mayBeWrittenAgainst('RUB', 'UZS', forms, 'UZS')).toBe(true)
    expect(mayBeWrittenAgainst('RUB', 'USD', forms, 'UZS')).toBe(true)
    // Through the yuan, which is through the dollar: longer, and still sound.
    expect(mayBeWrittenAgainst('RUB', 'CNY', forms, 'UZS')).toBe(true)
    // Against itself, against one that is not switched on, or round in a ring.
    expect(mayBeWrittenAgainst('RUB', 'RUB', forms, 'UZS')).toBe(false)
    expect(mayBeWrittenAgainst('RUB', 'KZT', forms, 'UZS')).toBe(false)
    expect(mayBeWrittenAgainst('USD', 'CNY', forms, 'UZS')).toBe(false)
    // The base has no rate to write.
    expect(mayBeWrittenAgainst('UZS', 'USD', forms, 'UZS')).toBe(false)
  })
})

describe('what a currency is worth in the base', () => {
  it('is worked out through the dollar from the two numbers that were typed', () => {
    // 1 000 ¥ × 12 650 / 7,25 = 1 744 827,586… so'm: rounded once, at the end.
    expect(worthInBase(units(1000), 'CNY', book)).toBe(som(1_744_827.59))
    // A rate rounded on the way ("1 ¥ ≈ 1 745 so'm") would have made it 1 745 000.
    expect(shownWorth('CNY', book)).toBe('1744.83')
    expect(worthInBase(units(1000), 'CNY', book)).not.toBe(som(1_745_000))
  })

  it('multiplies where the currency is named in the other', () => {
    // 100 € × 1,08 × 12 650 = 1 366 200 so'm.
    expect(worthInBase(units(100), 'EUR', book)).toBe(som(1_366_200))
  })

  it('does not ask about the dollar where the rate is written in the base', () => {
    expect(worthInBase(units(1000), 'RUB', book)).toBe(som(135_000))
    const { USD: _gone, ...rest } = book.rates
    expect(worthInBase(units(1000), 'RUB', { base: 'UZS', rates: rest })).toBe(som(135_000))
  })

  it('values dollars exactly as the books already do, and the base as itself', () => {
    for (const amount of [1, 33, 9_999, 123_456_789, -4_550]) {
      for (const rate of [12_650, 11_821.18, 12_999.99]) {
        const dollars: RateBook = { base: 'UZS', rates: { USD: { against: 'UZS', way: 'in', value: rate } } }
        expect(worthInBase(amount, 'USD', dollars)).toBe(toBase(amount, 'USD', rate, 'UZS'))
      }
    }
    expect(worthInBase(som(1_500_000), 'UZS', { base: 'UZS', rates: {} })).toBe(som(1_500_000))
  })

  it('follows the dollar without being typed again', () => {
    const dearer: RateBook = { ...book, rates: { ...book.rates, USD: { against: 'UZS', way: 'in', value: 13_000 } } }
    expect(worthInBase(units(1000), 'CNY', dearer)).toBe(som(1_793_103.45))
    // What is written in the base stays where it was put.
    expect(worthInBase(units(1000), 'RUB', dearer)).toBe(som(135_000))
  })

  it('is the same sum whichever currency the books are kept in', () => {
    // A shop in Almaty: tenge its base, the dollar 480 tenge, the yuan named against the dollar.
    const almaty: RateBook = {
      base: 'KZT',
      rates: { USD: { against: 'KZT', way: 'in', value: 480 }, CNY: { against: 'USD', way: 'per', value: 7.25 } },
    }
    expect(worthInBase(units(100), 'USD', almaty)).toBe(units(48_000))
    // 1 000 ¥ × 480 / 7,25 = 66 206,896… tenge.
    expect(worthInBase(units(1000), 'CNY', almaty)).toBe(units(66_206.9))
    // Books kept in dollars: the yuan is named against the base itself, and there is nothing in between.
    const dollars: RateBook = { base: 'USD', rates: { CNY: { against: 'USD', way: 'per', value: 7.25 } } }
    expect(worthInBase(units(7250), 'CNY', dollars)).toBe(units(1000))
  })
})

describe('a rate that is wanting', () => {
  it('is never taken for one to one: the currency cannot be valued, and whose rate is wanting is said', () => {
    const none: RateBook = { base: 'UZS', rates: {} }
    expect(missingRate('UZS', none)).toBeNull()
    expect(missingRate('USD', none)).toBe('USD')
    expect(worthInBase(units(100), 'USD', none)).toBeNull()
    // Its own rate was never set.
    expect(missingRate('KZT', book)).toBe('KZT')
    expect(baseWorth('KZT', book)).toBeNull()
    // Its own is there; the dollar's it hangs on is not.
    const { USD: _gone, ...rest } = book.rates
    const noDollar: RateBook = { base: 'UZS', rates: rest }
    expect(missingRate('CNY', noDollar)).toBe('USD')
    expect(worthInBase(units(100), 'CNY', noDollar)).toBeNull()
    expect(exchange(units(100), 'CNY', 'USD', noDollar)).toBeNull()
  })

  it('is what two currencies written against each other both have', () => {
    const ring: RateBook = {
      base: 'UZS',
      rates: { CNY: { against: 'RUB', way: 'in', value: 12 }, RUB: { against: 'CNY', way: 'per', value: 12 } },
    }
    expect(missingRate('CNY', ring)).not.toBeNull()
    expect(baseWorth('RUB', ring)).toBeNull()
  })
})

describe('one currency as so much of another', () => {
  it('is carried across in one step, without stopping at the base to be rounded', () => {
    // 7 250 ¥ at 7,25 to the dollar are 1 000 $, whatever the dollar costs.
    expect(exchange(units(7250), 'CNY', 'USD', book)).toBe(units(1000))
    expect(exchange(units(1000), 'USD', 'CNY', book)).toBe(units(7250))
    // 100 € = 108 $ = 783 ¥.
    expect(exchange(units(100), 'EUR', 'CNY', book)).toBe(units(783))
    expect(exchange(units(55), 'CNY', 'CNY', book)).toBe(units(55))
  })

  it('rounds once, to the smallest coin of what is taken', () => {
    // 1 000 so'm / 12 650 = 0,079 05… $
    expect(exchange(som(1000), 'UZS', 'USD', book)).toBe(8)
    // 100 ¥ / 7,25 = 13,793 1… $
    expect(exchange(units(100), 'CNY', 'USD', book)).toBe(1379)
  })
})

describe('a rate far from the one before it', () => {
  it('is asked about: a slip of the hand moves it more than a market does', () => {
    expect(isRateJump(12_650, 12_700)).toBe(false)
    expect(isRateJump(12_650, 1_265)).toBe(true)
    expect(isRateJump(12_650, 126_500)).toBe(true)
    expect(isRateJump(7.25, 7.31)).toBe(false)
    expect(isRateJump(7.25, 0.138)).toBe(true)
    // The first rate ever has nothing to be far from.
    expect(isRateJump(null, 12_650)).toBe(false)
  })
})

describe('another base, taken before any money is written', () => {
  /** So'm the base, the dollar 12 650, the tenge 26,35 so'm, the yuan named against the dollar. */
  const book: RateBook = {
    base: 'UZS',
    rates: {
      USD: { against: 'UZS', way: 'in', value: 12_650 },
      KZT: { against: 'UZS', way: 'in', value: 26.35 },
      CNY: { against: 'USD', way: 'per', value: 7.25 },
    },
  }

  it('gives the old base a rate in the new one, the number that was typed where it can', () => {
    // "1 tenge = 26,35 so'm": the so'm is the cheaper, and reads the other way about.
    expect(rebase(book, 'KZT')).toEqual({ against: 'KZT', way: 'per', value: 26.35 })
    expect(rebase(book, 'USD')).toEqual({ against: 'USD', way: 'per', value: 12_650 })
  })

  it('carries a dollar business into tenge by the tenge’s rate', () => {
    const dollars: RateBook = { base: 'USD', rates: { KZT: { against: 'USD', way: 'per', value: 480 } } }
    expect(rebase(dollars, 'KZT')).toEqual({ against: 'KZT', way: 'in', value: 480 })
  })

  it('cannot say anything of a currency it has no rate for', () => {
    expect(rebase(book, 'RUB')).toBeNull()
    expect(rebase({ base: 'UZS', rates: {} }, 'USD')).toBeNull()
  })
})
