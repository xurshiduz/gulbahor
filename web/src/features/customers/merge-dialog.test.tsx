import type { CustomerBriefDto, CustomerDto } from '@erp/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '@/lib/api'

import { MergeDialog } from './merge-dialog'

const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

const brief = (id: string, name: string, more: Partial<CustomerBriefDto> = {}): CustomerBriefDto => ({
  id,
  name,
  currency: 'UZS',
  isSupplier: false,
  isActive: true,
  phoneTail: null,
  tags: [],
  note: null,
  lastReceiptOn: null,
  ...more,
})

const account = (currency: 'UZS' | 'USD', balance: number) => ({
  currency,
  balance,
  owed: Math.max(0, balance),
  credit: Math.max(0, -balance),
  overdue: 0,
  overdueSince: null,
  nextDue: null,
  nextDueAmount: 0,
})

/** The second card of someone: she owes 75 000 so'm on it, and has 10 $ of her own. */
const twin = {
  id: 'twin',
  name: 'Nodira opa',
  balances: [account('UZS', 7_500_000), account('USD', -1000)],
} as unknown as CustomerDto

const shown = (onClose = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MergeDialog customer={twin} onClose={onClose} />
    </QueryClientProvider>,
  )
  return onClose
}

/** The book: the card itself, the one it belongs with, and a supplier. */
const book = () =>
  vi.spyOn(api, 'get').mockImplementation(async (path: string) => {
    if (path === '/customers/brief') {
      return [brief('twin', 'Nodira opa'), brief('first', 'Nodira', { phoneTail: '4567' }), brief('textile', 'Textile')]
    }
    return { id: 'first', name: 'Nodira', balances: [account('UZS', 5_000_000)] }
  })

afterEach(() => vi.restoreAllMocks())

describe('making two cards of one person one', () => {
  it('says what will happen, and what goes across, before anything is done', async () => {
    book()
    shown()
    const note = () => plain(document.querySelector('[data-merge-note]')?.textContent)
    expect(note()).toContain('«Nodira opa» kartasi yopiladi va qaytarib ochilmaydi')
    // What they owe has a minus; what is theirs stands as it is.
    expect(note()).toContain('O‘tadigan qoldiq: −75 000 so‘m, 10,00 $')
    expect(screen.getByRole('button', { name: 'Birlashtirish' })).toBeTruthy()
  })

  it('offers everyone but the card itself, and sends it into whoever is picked', async () => {
    book()
    const post = vi.spyOn(api, 'post').mockResolvedValueOnce({ id: 'first', name: 'Nodira' })
    const onClose = shown()
    const field = screen.getByRole('combobox')
    await userEvent.click(field)
    await waitFor(() => expect(screen.getByText('Nodira')).toBeTruthy())
    // The card is not offered to itself.
    expect(screen.queryByRole('option', { name: /Nodira opa/ })).toBeNull()
    await userEvent.click(screen.getByText('Nodira'))
    // What stands on the account it goes to is said under the field.
    await waitFor(() => expect(plain(document.body.textContent)).toContain('−50 000 so‘m'))
    await userEvent.click(screen.getByRole('button', { name: 'Birlashtirish' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/customers/twin/merge', { intoId: 'first' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('does nothing until someone is picked, and says what the server would not have', async () => {
    book()
    const post = vi
      .spyOn(api, 'post')
      .mockRejectedValueOnce(new ApiError(400, 'VALIDATION', 'Xato', { intoId: 'Nodira arxivda' }))
    const onClose = shown()
    await userEvent.click(screen.getByRole('button', { name: 'Birlashtirish' }))
    expect(post).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByText('Nodira'))
    await userEvent.click(screen.getByRole('button', { name: 'Birlashtirish' }))
    await waitFor(() => expect(screen.getByText('Nodira arxivda')).toBeTruthy())
    expect(onClose).not.toHaveBeenCalled()
  })
})
