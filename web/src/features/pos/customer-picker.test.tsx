import type { PosCustomerDto } from '@erp/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { CustomerPicker } from './customer-picker'

const nodira: PosCustomerDto = {
  id: 'c1',
  name: 'Nodira Karimova',
  phone: '+998901234567',
  groups: ['Oila', 'Doimiy'],
  reminders: ['Chek berish kerak'],
  discountPercent: 7,
  discountReason: 'Sodiqlik 7%',
  priceType: { id: 'family', name: 'Oila' },
  noDebt: false,
  noLayaway: false,
  noExchange: true,
  debt: { owed: 0, overdue: 0, dueDate: null },
}

/** The picker as the till holds it: one customer, or none. */
function Counter({ onAsked }: { onAsked?: (q: string) => void }) {
  const [customer, setCustomer] = useState<PosCustomerDto | null>(null)
  vi.spyOn(api, 'get').mockImplementation(((_path: string, params?: Record<string, unknown>) => {
    const q = String(params?.q ?? '')
    onAsked?.(q)
    return Promise.resolve(q.startsWith('90') || q.toLowerCase().startsWith('nod') ? [nodira] : [])
  }) as typeof api.get)
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CustomerPicker registerId="r1" value={customer} onChange={setCustomer} />
      <output aria-label="customer">{customer?.name ?? 'none'}</output>
    </QueryClientProvider>
  )
}

afterEach(() => vi.restoreAllMocks())

/** Thousands are kept apart by a space that does not break: here it is only a space. */
const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ')

describe('who is at the counter', () => {
  it('is found by a few digits of their phone, and picked with Enter', async () => {
    const asked = vi.fn()
    render(<Counter onAsked={asked} />)
    const field = screen.getByRole('textbox', { name: 'Mijoz' })
    await userEvent.type(field, '9')
    // One character asks nobody.
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(asked).not.toHaveBeenCalled()

    await userEvent.type(field, '012')
    await waitFor(() => expect(screen.getByText('Nodira Karimova')).toBeTruthy())
    expect(asked).toHaveBeenLastCalledWith('9012')
    await userEvent.keyboard('{Enter}')
    expect(screen.getByLabelText('customer').textContent).toBe('Nodira Karimova')
    // Picked, they stand where the field was, with their number.
    expect(screen.queryByRole('textbox', { name: 'Mijoz' })).toBeNull()
    expect(screen.getByText(/\+998 90 123 45 67/)).toBeTruthy()
    // With them come their groups, and what the groups ask the cashier to remember.
    expect(screen.getByText(/Oila, Doimiy/)).toBeTruthy()
    expect(screen.getByRole('note').textContent).toBe('Chek berish kerak')

    // Taken off again, the field is back.
    await userEvent.click(screen.getByRole('button', { name: 'Mijozni olib tashlash' }))
    expect(screen.getByLabelText('customer').textContent).toBe('none')
    expect(screen.getByRole('textbox', { name: 'Mijoz' })).toBeTruthy()
  })

  it('is written down on the spot when nobody is found, with what was typed in its field', async () => {
    const saved = vi.spyOn(api, 'post').mockResolvedValue({ id: 'c2', name: 'Sardor', phone: '+998977000001' } as never)
    render(<Counter />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Mijoz' }), '977000001')
    await waitFor(() => expect(screen.getByText('Yangi mijoz qo‘shish')).toBeTruthy())
    await userEvent.keyboard('{Enter}')

    // Digits were typed: they are the phone, and the cursor waits at the name.
    const name = await screen.findByLabelText(/Ismi/)
    expect(document.activeElement).toBe(name)
    await userEvent.type(name, 'Sardor{Enter}')
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    // The till writes down who they are and where; groups are for those who keep the base.
    expect(saved.mock.calls[0]).toEqual([
      '/pos/customers',
      expect.objectContaining({ name: 'Sardor', phone: '+998977000001', registerId: 'r1', groupIds: [] }),
    ])
    await waitFor(() => expect(screen.getByLabelText('customer').textContent).toBe('Sardor'))
  })

  it('is seen to owe, with the way to take it there and then', async () => {
    const takes = vi.fn()
    const owing = (debt: PosCustomerDto['debt']) => (
      <QueryClientProvider client={new QueryClient()}>
        <CustomerPicker
          registerId="r1"
          value={{ ...nodira, reminders: [], debt }}
          onChange={() => undefined}
          onPayDebt={takes}
        />
      </QueryClientProvider>
    )
    const { rerender } = render(owing({ owed: 45_000_000, overdue: 0, dueDate: '2026-11-04' }))
    expect(plain(screen.getByRole('note').textContent)).toContain('Qarzi: 450 000 so‘m')
    expect(screen.getByRole('note').textContent).not.toContain('muddati o‘tgani')
    await userEvent.click(screen.getByRole('button', { name: 'To‘lov olish' }))
    expect(takes).toHaveBeenCalledTimes(1)

    // What is past its day is said apart: it is why more may not be lent.
    rerender(owing({ owed: 45_000_000, overdue: 20_000_000, dueDate: '2026-09-01' }))
    expect(plain(screen.getByRole('note').textContent)).toContain('muddati o‘tgani 200 000 so‘m')

    // Nothing owed, nothing said.
    rerender(owing({ owed: 0, overdue: 0, dueDate: null }))
    expect(screen.queryByRole('note')).toBeNull()
  })
})
