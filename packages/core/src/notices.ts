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
