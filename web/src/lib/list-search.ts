import { z } from 'zod'

/**
 * What every list keeps in the address bar: page, page size, sorting and the
 * search text. A reload, the back button or a shared link all land on the
 * same view. Values that do not parse fall back to the defaults instead of
 * breaking the page.
 */
export const listSearch = {
  page: z.number().int().min(1).default(1).catch(1),
  size: z.number().int().min(1).max(200).default(20).catch(20),
  sort: z.string().optional().catch(undefined),
  order: z.enum(['asc', 'desc']).default('asc').catch('asc'),
  q: z.string().optional().catch(undefined),
  /** Which dialog is open: "new", or the id of the row being edited. */
  edit: z.string().optional().catch(undefined),
}

export const LIST_DEFAULTS = { page: 1, size: 20, order: 'asc' as const }

export interface ListState {
  page: number
  size: number
  sort?: string
  order: 'asc' | 'desc'
  q?: string
}

/** Changing a filter, the search or the sorting goes back to the first page. */
export function withFilter<T extends ListState>(previous: T, patch: Partial<T>): T {
  return { ...previous, ...patch, page: 1 }
}
