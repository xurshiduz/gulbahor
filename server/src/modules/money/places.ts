import type { Actor } from '../auth/actor'

/** An account, as far as where it may be used goes. */
interface Placed {
  /** The shops it serves; empty for every shop. */
  locationIds: string[]
}

/** Whether an account is offered at a shop's tills. */
export const servesShop = (account: Placed, locationId: string): boolean =>
  !account.locationIds.length || account.locationIds.includes(locationId)

/** Whether a person may use an account: it serves every shop, or one of the shops they work in. */
export const mayUse = (actor: Actor, account: Placed): boolean =>
  !account.locationIds.length ||
  actor.allLocations ||
  account.locationIds.some((locationId) => actor.locationIds.includes(locationId))
