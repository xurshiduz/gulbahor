import {
  DEFAULT_ORG_SETTINGS,
  rateGap,
  settleLine,
  straysFromRate,
  type CurrencyCode,
  type LineWorth,
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
 * A line of money valued for the books: what it settles, what the money is
 * worth at the day's rate, and the difference between the two. An agreed
 * sum stands unless it strays from the rate further than this person may
 * go — then the words that say so come back instead.
 */
export function valueLine(
  amount: number,
  accountCurrency: CurrencyCode,
  targetCurrency: CurrencyCode,
  dayRate: number | null,
  agreed: number | null | undefined,
  limit: number | null,
): LineWorth | string {
  const worth = settleLine(amount, accountCurrency, targetCurrency, dayRate, agreed)
  if (worth.agreed && limit !== null && straysFromRate(worth, limit, dayRate)) {
    const gap = String(rateGap(worth)).replace('.', ',')
    return `Kelishilgan summa kun kursidan ${gap}% farq qiladi: ${limit}% dan ortig‘iga kurs qo‘yish ruxsati kerak`
  }
  return worth
}
