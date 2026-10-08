import type { AnyCurrency } from '@erp/core'

import { usePreference } from '@/lib/preferences'

/**
 * What a person keeps out of sight where money is taken and paid, because
 * they seldom use it: the cash of a currency at every till ("cash:CNY"), or
 * one account — a card, a terminal, a bank account, a safe. Kept for the
 * person on every device. A hidden place comes back whenever it holds a sum,
 * or when it is asked for.
 */
export const useHiddenPlaces = () => usePreference<string[]>('places.hidden', [])

/** The key a place is hidden by: a till's drawer by its currency, anything else by itself. */
export const placeKey = (account: { id: string; registerId: string | null; currency: AnyCurrency }) =>
  account.registerId ? `cash:${account.currency}` : account.id
