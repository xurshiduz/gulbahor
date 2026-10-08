import { DOLLAR, isDollar, type AnyCurrency } from '@erp/core'

import type { Actor } from '../auth/actor'

/**
 * Whether the business takes dollars beside its base: it has switched them on, and they are not its base.
 * A dollar business has nothing beside its dollars — no second drawer, no rate to set.
 */
export const takesDollars = (actor: Pick<Actor, 'base' | 'modules'>): boolean =>
  actor.base !== DOLLAR && actor.modules.includes('usd')

/**
 * What a till or a price may be in: the base, or dollars beside it where the business takes them. Anything
 * else is refused with the reason, worded for the field it was in; null when it may.
 */
export function tillCurrencyProblem(
  currency: AnyCurrency,
  actor: Pick<Actor, 'base' | 'modules'>,
  rate: number | null,
): string | null {
  if (currency === actor.base) {
    return null
  }
  if (!isDollar(currency, actor.base)) {
    return 'Bu valyuta qabul qilinmaydi'
  }
  if (!takesDollars(actor)) {
    return 'Dollar bilan ishlash yoqilmagan'
  }
  return rate ? null : 'Dollar kursi qo‘yilmagan'
}
