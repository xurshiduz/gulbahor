import { tillWorth, type AnyCurrency, type RateBook } from '@erp/core'

import type { Register } from '../../database/entities'
import type { Actor } from '../auth/actor'
import { wantingRate } from './agreed'

/** Prices may be in the base or in any currency the business has switched on: the till counts them in the base. */
export const pricedIn = (currency: AnyCurrency, actor: Pick<Actor, 'base' | 'currencies'>): boolean =>
  currency === actor.base || actor.currencies.includes(currency)

export const PRICE_CURRENCY = 'Narx asosiy valyuta yoki yoqilgan valyutada bo‘ladi'

/** The currencies a till takes cash in: the base first, then those it was given that the business still has. */
export function tillCurrenciesOf(
  actor: Pick<Actor, 'base' | 'currencies'>,
  register: Pick<Register, 'currencies'>,
): AnyCurrency[] {
  return [actor.base, ...register.currencies.filter((code) => code !== actor.base && actor.currencies.includes(code))]
}

/**
 * What a till may be paid or pay out in: one of its currencies, and one the day's rates can value. Anything else
 * is refused with the reason, worded for the field it was in; null when it may.
 */
export function tillCurrencyProblem(currency: AnyCurrency, till: AnyCurrency[], book: RateBook): string | null {
  if (!till.includes(currency)) {
    return 'Bu valyuta bu kassada qabul qilinmaydi'
  }
  return tillWorth(100, currency, book) === null ? (wantingRate(book, currency) ?? 'Kurs qo‘yilmagan') : null
}
