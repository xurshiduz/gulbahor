import type { CustomerBriefDto, CustomerDto } from '@erp/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { api } from '@/lib/api'

/**
 * Customers to pick among where one is named — a payment, a receipt's supplier: found on the server as the name
 * is typed (the book is too long to hold), those who supply goods first when asked, and the ones already picked
 * always among them.
 */
export function useCustomerChoices(picked: (string | null | undefined)[], suppliersFirst = false, enabled = true) {
  const [q, setQ] = useState('')
  const ids = [...new Set(picked.filter((id): id is string => !!id))].sort().join(',')
  const query = useQuery({
    queryKey: ['customers', 'brief', suppliersFirst, q, ids],
    queryFn: ({ signal }) =>
      api.get<CustomerBriefDto[]>(
        '/customers/brief',
        { q: q || undefined, supplier: suppliersFirst ? 'first' : undefined, ids: ids || undefined },
        signal,
      ),
    placeholderData: keepPreviousData,
    enabled,
  })
  return { choices: query.data ?? [], search: setQ, loaded: !!query.data }
}

/** A customer's card, with their accounts for whoever may see them. */
export const useCustomer = (id: string | null) =>
  useQuery({
    queryKey: ['customers', 'one', id],
    queryFn: ({ signal }) => api.get<CustomerDto>(`/customers/${id}`, undefined, signal),
    enabled: !!id,
  })
