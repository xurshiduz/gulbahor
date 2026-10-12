import { formatMoney, type AnyCurrency, type CustomerBriefDto, type CustomerDto } from '@erp/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

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

/** What stands between the business and a customer, in words: "qarzi 570,95 $" when they owe, "haqi …" when they are owed. */
export function useDebtText() {
  const { t } = useTranslation()
  const money = (minor: number, currency: AnyCurrency) => formatMoney(minor, currency, { minor: 'auto' })
  return (balance: number, currency: AnyCurrency) =>
    balance > 0
      ? t('payments.owes', { amount: money(balance, currency) })
      : balance < 0
        ? t('payments.owed', { amount: money(-balance, currency) })
        : t('payments.even')
}
