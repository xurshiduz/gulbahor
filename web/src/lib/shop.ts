import { useQuery } from '@tanstack/react-query'

import { api } from './api'
import { usePreference } from './preferences'

/** Written into a page's address when "all places" is picked there over a place picked for the whole system. */
export const ALL_SHOPS = 'all'

export interface ShopOption {
  id: string
  name: string
}

/** The places this person works in: what the shop picker offers. */
export function useMyShops() {
  return useQuery({
    queryKey: ['locations', 'options'],
    queryFn: ({ signal }) => api.get<ShopOption[]>('/locations/options', undefined, signal),
    staleTime: 60_000,
  })
}

/**
 * The place picked in the top bar for the whole system, for this person on every device; null: every place.
 * A place no longer theirs counts as none.
 */
export function useGlobalShop(): [string | null, (id: string | null) => void] {
  const [picked, setPicked] = usePreference<string | null>('shop.global', null)
  const shops = useMyShops()
  const known = picked && shops.data ? (shops.data.some((shop) => shop.id === picked) ? picked : null) : picked
  return [known, setPicked]
}

/**
 * A page's place filter: what its address says, or — nothing said there — the place picked in the top bar.
 * `locationId` is what the page asks the server for (undefined: every place); `toUrl` turns what is picked on
 * the page into what its address keeps, so "all" there overrides the top bar's place.
 */
export function useShopFilter(fromUrl: string | undefined) {
  const [shop] = useGlobalShop()
  const locationId = fromUrl === ALL_SHOPS ? undefined : (fromUrl ?? shop ?? undefined)
  const toUrl = (id: string | null | undefined): string | undefined => id || (shop ? ALL_SHOPS : undefined)
  return { locationId, toUrl }
}
