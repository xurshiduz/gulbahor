import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './api'

const KEY = ['preferences']

/**
 * A small setting remembered for this person on every device, such as which
 * columns a table shows. Reads come from one cached request; a write shows
 * at once and is saved in the background.
 */
export function usePreference<T>(key: string | null, fallback: T): [T, (value: T) => void] {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => api.get<Record<string, unknown>>('/me/preferences', undefined, signal),
    staleTime: Infinity,
    enabled: !!key,
    meta: { silent: true },
  })

  const mutation = useMutation({
    mutationFn: (value: T) => api.put(`/me/preferences/${key}`, { value }),
    meta: { silent: true },
  })

  const value = key && data && key in data ? (data[key] as T) : fallback

  const set = (next: T) => {
    if (!key) {
      return
    }
    queryClient.setQueryData<Record<string, unknown>>(KEY, (current) => ({ ...current, [key]: next }))
    mutation.mutate(next)
  }

  return [value, set]
}
