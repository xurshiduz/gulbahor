import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { ApiError } from './api'

/**
 * Failures surface as a toast unless the caller handles them. Field errors
 * belong next to their fields, so a validation failure stays quiet here.
 */
function report(error: unknown, silent?: unknown) {
  if (silent || !(error instanceof ApiError) || error.isAuth || error.code === 'VALIDATION') {
    return
  }
  toast.error(error.message)
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => report(error, query.meta?.silent),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => report(error, mutation.meta?.silent),
  }),
  defaultOptions: {
    queries: {
      // The socket says when something changed, so data can be trusted until then.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (failures, error) => failures < 2 && error instanceof ApiError && (error.status === 0 || error.status >= 500),
    },
    mutations: { retry: false },
  },
})
