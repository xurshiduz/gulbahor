import { DOLLAR, type AnyCurrency } from '@erp/core'
import type { TFunction } from 'i18next'

/**
 * The currency the signed-in business keeps its books, prices and receipts
 * in: what every "so'm" on the screens is. One business at a time is signed in
 * on a screen, so it is kept here, set by the session as it loads — for the
 * many small helpers that format a sum outside any component. So'm until a
 * session says otherwise (and in tests, which have none).
 */
let current: AnyCurrency = 'UZS'

export const setBase = (currency: AnyCurrency) => {
  current = currency
}

/** The business's base currency. */
export const base = (): AnyCurrency => current

/** What the business keeps its costs in beside the base: every `…Usd` cost. The base where there is none. */
let costCurrent: AnyCurrency = 'USD'

export const setCost = (currency: AnyCurrency) => {
  costCurrent = currency
}

/** The business's cost currency. Dollars until a session says otherwise (and in tests, which have none). */
export const cost = (): AnyCurrency => costCurrent

/** Whether a sum in `currency` is dollars beside the base, not the base itself. */
export const dollarsBeside = (currency: AnyCurrency): boolean => currency === DOLLAR && current !== DOLLAR

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * The base as it goes into a sentence: its name ("so‘m", "tenge") and "in it" ("so‘mda", "в тенге"), each also
 * with a capital for the start of a label. Given whole to `t`, which takes the words its text asks for.
 */
export function baseWords(t: TFunction) {
  return currencyWords(t, current)
}

/** The same for any currency: "dollar", "Dollar", "dollarda", "Dollarda". */
export function currencyWords(t: TFunction, code: AnyCurrency) {
  const currency = t(`currencies.short.${code}`).toLowerCase()
  const inIt = t(`currencies.in.${code}`)
  return { currency, Currency: capital(currency), in: inIt, In: capital(inIt) }
}
