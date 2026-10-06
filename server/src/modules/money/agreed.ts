import {
  CURRENCIES,
  DEFAULT_ORG_SETTINGS,
  DOLLAR,
  missingRate,
  rateGap,
  settleLine,
  straysFromRate,
  type AnyCurrency,
  type LineWorth,
  type RateBook,
} from '@gulbahor/core'
import type { EntityManager } from 'typeorm'

import { Organization } from '../../database/entities'
import { can, type Actor } from '../auth/actor'

/**
 * How far from the day's rate this person may agree a sum, in percent.
 * Null for someone who sets rates: what they agree is the rate.
 */
export async function rateLimit(em: EntityManager, actor: Actor): Promise<number | null> {
  if (can(actor, 'money.rates')) {
    return null
  }
  const org = await em.findOneByOrFail(Organization, { id: actor.orgId })
  return { ...DEFAULT_ORG_SETTINGS, ...org.settings }.maxRateLossPercent
}

/**
 * Whose rate is wanting before money in these currencies can be counted, in
 * the words a person reads under the field; null when none is. Money is
 * never counted at a rate nobody set.
 */
export function wantingRate(book: RateBook, ...currencies: AnyCurrency[]): string | null {
  for (const currency of currencies) {
    const missing = missingRate(currency, book)
    if (missing) {
      return missing === DOLLAR ? 'Dollar kursi qo‘yilmagan' : `${CURRENCIES[missing].name} kursi qo‘yilmagan`
    }
  }
  return null
}

/**
 * A line of money valued for the books: what it settles, what the money is
 * worth at the day's rates, and the difference between the two. An agreed
 * sum stands unless it strays from the rate further than this person may
 * go — then the words that say so come back instead.
 */
export function valueLine(
  amount: number,
  accountCurrency: AnyCurrency,
  targetCurrency: AnyCurrency,
  book: RateBook,
  agreed: number | null | undefined,
  limit: number | null,
): LineWorth | string {
  const worth = settleLine(amount, accountCurrency, targetCurrency, book, agreed)
  if (worth.agreed && limit !== null && straysFromRate(worth, limit)) {
    const gap = String(rateGap(worth)).replace('.', ',')
    return `Kelishilgan summa kun kursidan ${gap}% farq qiladi: ${limit}% dan ortig‘iga kurs qo‘yish ruxsati kerak`
  }
  return worth
}
