import type { AccountKind } from './pos'

/**
 * What the screens of a business are told the moment it happens, so that
 * whoever has to act on it hears at once, whatever screen they are on.
 * Every screen of the business hears these, so they carry no sums and
 * nothing a person may not see: what is waiting is then read through the
 * API by those who may read it.
 */

/** Money has been sent and waits for whoever takes it in to say it arrived. */
export interface MoneySentEvent {
  id: string
  number: string
  fromName: string
  toName: string
  /** A till's drawer is taken in at that till; a safe or a bank account by those who collect. */
  toKind: AccountKind
  toLocationId: string | null
  toRegisterId: string | null
  /** The one who sent it is not told about their own sending. */
  sentBy: string | null
}

/** Goods have left for another shop and wait there to be counted in. */
export interface GoodsSentEvent {
  id: string
  number: string
  fromName: string
  toName: string
  toLocationId: string
  sentBy: string | null
}

/**
 * Money has landed on one of the business's cards, by the bank's own word. Unlike the others this one says how
 * much (owner, 2026-10-12): whoever is taking a customer's transfer has to see that it came, and what came.
 * It says no more than that — not what is left on the card, and nothing of what leaves it.
 */
export interface CardInEvent {
  id: string
  /** Null for a card the business keeps no account for. */
  accountId: string | null
  /** The business's name for the card, or its last digits ("*5512"). */
  card: string
  /** Minor units. */
  amount: number
  currency: string
  /** When, by the bank's clock: "2026-10-12T10:20". */
  at: string | null
  /** The shops the card serves; none for every shop. */
  locationIds: string[]
}
