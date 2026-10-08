import { bookOf, type CurrenciesDto, type RateBook } from '@erp/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { api } from '@/lib/api'

/** The currencies of the business and the rate in force of each, as the server has them. */
export const useCurrencies = () =>
  useQuery({
    queryKey: ['money', 'currencies'],
    queryFn: ({ signal }) => api.get<CurrenciesDto>('/currencies', undefined, signal),
  })

/**
 * The day's rates, for valuing money on a screen before it is sent: what
 * the server will value it by, unless a rate changes in between — and then
 * the server says so. Null until they are known.
 */
export function useRateBook(): RateBook | null {
  const currencies = useCurrencies()
  return useMemo(() => (currencies.data ? bookOf(currencies.data) : null), [currencies.data])
}

/**
 * Every rate in force on a day, as one book: what a receipt of that day values
 * a third currency at. The last day's while another is fetched.
 */
export const useBookOn = (date: string) =>
  useQuery({
    queryKey: ['money', 'book', date],
    queryFn: ({ signal }) => api.get<RateBook>('/currencies/book', { on: date }, signal),
    placeholderData: keepPreviousData,
  })
