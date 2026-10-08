import { DOLLAR, isDollar, type AnyCurrency } from '@erp/core'

import type { Actor } from '../auth/actor'

/**
 * Whether the till takes dollars beside the base: the business has switched them on, and they are not its
 * base. Until the till takes any currency (V9, 9d) the dollar is the one it takes beside the base.
 */
export const takesDollars = (actor: Pick<Actor, 'base' | 'currencies'>): boolean =>
  actor.base !== DOLLAR && actor.currencies.includes(DOLLAR)

/** Prices may be in the base or in any currency the business has switched on: the till counts them in the base. */
export const pricedIn = (currency: AnyCurrency, actor: Pick<Actor, 'base' | 'currencies'>): boolean =>
  currency === actor.base || actor.currencies.includes(currency)

export const PRICE_CURRENCY = 'Narx asosiy valyuta yoki yoqilgan valyutada bo‘ladi'

/**
 * What a till may be paid in: the base, or dollars beside it where the business takes them. Anything
 * else is refused with the reason, worded for the field it was in; null when it may.
 */
export function tillCurrencyProblem(
  currency: AnyCurrency,
  actor: Pick<Actor, 'base' | 'currencies'>,
  rate: number | null,
): string | null {
  if (currency === actor.base) {
    return null
  }
  if (!isDollar(currency, actor.base)) {
    return 'Bu valyuta qabul qilinmaydi'
  }
  if (!takesDollars(actor)) {
    return 'Dollar yoqilmagan: Pul → Kurslar'
  }
  return rate ? null : 'Dollar kursi qo‘yilmagan'
}
