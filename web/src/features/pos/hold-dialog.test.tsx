import type { HoldDto } from '@erp/core'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConfirmProvider } from '@/components/ui/dialog'
import { api, ApiError } from '@/lib/api'

import { HoldCard, holdGoods } from './hold-card'
import { HoldDialog } from './hold-dialog'

const REGISTER = '11111111-1111-4111-8111-111111111111'
const CUSTOMER = '22222222-2222-4222-8222-222222222222'
const SHIRT = '33333333-3333-4333-8333-333333333333'
const JEANS = '44444444-4444-4444-8444-444444444444'
const HOLD = '55555555-5555-4555-8555-555555555555'

const hold = (patch: Partial<HoldDto> = {}): HoldDto => ({
  id: HOLD,
  number: 'BQ-000007',
  status: 'active',
  locationId: 'shop',
  locationName: 'Gulbahor 1',
  customerId: CUSTOMER,
  customerName: 'Dilnoza Karimova',
  customerPhone: '+998901234567',
  dueDate: '2026-10-15',
  overdue: false,
  note: 'Juma kuni keladi',
  priceTypeId: null,
  total: 49_000_000,
  qty: 3,
  lines: [
    {
      id: 'a',
      variantId: SHIRT,
      productId: 'p1',
      name: 'Ko‘ylak',
      label: 'Oq, M',
      sku: 'KY-001',
      qty: 2,
      price: 12_000_000,
    },
    { id: 'b', variantId: JEANS, productId: 'p2', name: 'Jinsi', label: '', sku: 'JN-002', qty: 1, price: 25_000_000 },
  ],
  saleId: null,
  saleNumber: null,
  createdByName: 'Kassir Aziza',
  createdAt: '2026-10-12T09:30:00.000Z',
  closedByName: null,
  closedAt: null,
  ...patch,
})

/** What is written there, with the spaces money is grouped by read as plain ones. */
const plain = (element: Element | null) => element?.textContent?.replace(/\s/g, ' ')

afterEach(() => vi.restoreAllMocks())

describe('HoldDialog', () => {
  const open = (onDone = vi.fn()) => {
    render(
      <HoldDialog
        registerId={REGISTER}
        customer={{ id: CUSTOMER, name: 'Dilnoza Karimova' }}
        priceTypeId={null}
        lines={[
          { variantId: SHIRT, qty: 2 },
          { variantId: JEANS, qty: 1 },
        ]}
        total={49_000_000}
        today="2026-10-12"
        due="2026-10-15"
        onClose={() => undefined}
        onDone={onDone}
      />,
    )
    return onDone
  }

  it('says whom and what is set aside, offers a day, and sends the cart as it is', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(hold() as never)
    const onDone = open()
    expect(screen.getByRole('dialog', { name: 'Band qilish · Dilnoza Karimova' })).toBeTruthy()
    expect(plain(document.querySelector('[data-hold-goods]'))).toBe('3 dona tovar · 490 000 so‘m')
    const day = screen.getByLabelText(/Qaysi kungacha/) as HTMLInputElement
    expect(day.value).toBe('15.10.2026')

    await userEvent.type(screen.getByLabelText('Izoh'), 'Juma kuni keladi')
    await userEvent.click(screen.getByRole('button', { name: 'Band qilish' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith(
      '/holds',
      expect.objectContaining({
        registerId: REGISTER,
        customerId: CUSTOMER,
        priceTypeId: null,
        dueDate: '2026-10-15',
        note: 'Juma kuni keladi',
        lines: [
          { variantId: SHIRT, qty: 2 },
          { variantId: JEANS, qty: 1 },
        ],
      }),
    )
    // No money was said to be left: the payment window is not asked for.
    expect(onDone.mock.calls[0]?.[1]).toBe(false)
  })

  it('goes on to taking money when the customer leaves some', async () => {
    vi.spyOn(api, 'post').mockResolvedValue(hold() as never)
    const onDone = open()
    await userEvent.click(screen.getByRole('button', { name: 'Band qilib, to‘lov olish' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onDone.mock.calls[0]?.[1]).toBe(true)
  })

  it('moves the day with the arrows, and never before today', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(hold() as never)
    const onDone = open()
    const day = screen.getByLabelText(/Qaysi kungacha/) as HTMLInputElement
    await userEvent.click(day)
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(day.value).toBe('17.10.2026')
    // A day that has passed is not taken: the field keeps the last good one.
    await userEvent.clear(day)
    await userEvent.type(day, '01.10.2026')
    await userEvent.click(screen.getByRole('button', { name: 'Band qilish' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0]?.[1]).toMatchObject({ dueDate: '2026-10-17' })
  })

  it('says what the server said, and stays open for another try with the same key', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockRejectedValueOnce(
        new ApiError(400, 'VALIDATION', 'Xato', {
          'lines.0.qty': 'Ko‘ylak: qoldiq yetarli emas (bor 2, band qilingan 1)',
        }),
      )
      .mockResolvedValueOnce(hold() as never)
    const onDone = open()
    await userEvent.click(screen.getByRole('button', { name: 'Band qilish' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Ko‘ylak: qoldiq yetarli emas (bor 2, band qilingan 1)')
    expect(onDone).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Band qilish' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    const keys = post.mock.calls.map((call) => (call[1] as { clientKey: string }).clientKey)
    expect(keys[0]).toBe(keys[1])
  })
})

describe('HoldCard', () => {
  const show = (shown: HoldDto, mayAct = true) => {
    const onSell = vi.fn()
    const onChanged = vi.fn()
    render(
      <ConfirmProvider>
        <HoldCard
          hold={shown}
          today="2026-10-12"
          mayAct={mayAct}
          onClose={() => undefined}
          onSell={onSell}
          onChanged={onChanged}
        />
      </ConfirmProvider>,
    )
    return { onSell, onChanged }
  }

  it('shows for whom, until when and which goods, and sells them', async () => {
    const { onSell } = show(hold())
    expect(screen.getByRole('dialog', { name: 'BQ-000007 · Dilnoza Karimova' })).toBeTruthy()
    expect(screen.getByText('Band')).toBeTruthy()
    expect(screen.getByText('Juma kuni keladi')).toBeTruthy()
    expect(screen.getByText('KY-001')).toBeTruthy()
    expect(plain(document.querySelector('[data-hold-total]'))).toBe('490 000 so‘m')
    await userEvent.click(screen.getByRole('button', { name: 'Sotish' }))
    expect(onSell).toHaveBeenCalledWith(expect.objectContaining({ id: HOLD }))
  })

  it('moves the day only when it has been changed', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue(hold({ dueDate: '2026-10-16' }) as never)
    const { onChanged } = show(hold({ overdue: true, dueDate: '2026-10-10' }))
    expect(screen.getByText('Muddati o‘tgan')).toBeTruthy()
    const save = screen.getByRole('button', { name: 'Muddatni o‘zgartirish' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)

    const day = screen.getByLabelText('Qaysi kungacha') as HTMLInputElement
    await userEvent.clear(day)
    await userEvent.type(day, '16.10.2026{Enter}')
    expect(save.disabled).toBe(false)
    await userEvent.click(save)
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(put).toHaveBeenCalledWith(`/holds/${HOLD}/due`, { dueDate: '2026-10-16' })
  })

  it('lets the goods go only after being asked', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(hold({ status: 'released' }) as never)
    const { onChanged } = show(hold())
    await userEvent.click(screen.getByRole('button', { name: 'Bo‘shatish' }))
    expect(await screen.findByText('BQ-000007 bo‘shatilsinmi?')).toBeTruthy()
    expect(post).not.toHaveBeenCalled()
    const asked = screen.getAllByRole('button', { name: 'Bo‘shatish' })
    await userEvent.click(asked[asked.length - 1] as HTMLElement)
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith(`/holds/${HOLD}/release`)
  })

  it('has nothing to press once it is over, or for someone who does not sell', () => {
    show(
      hold({
        status: 'taken',
        saleNumber: 'SR-000041',
        closedByName: 'Kassir Aziza',
        closedAt: '2026-10-14T11:00:00.000Z',
      }),
    )
    expect(screen.getByText('Sotildi')).toBeTruthy()
    expect(screen.getByText(/chek SR-000041/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sotish' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Bo‘shatish' })).toBeNull()
    expect(screen.queryByLabelText('Qaysi kungacha')).toBeNull()
  })

  it('is only read by someone who may not sell', () => {
    show(hold(), false)
    expect(screen.queryByRole('button', { name: 'Sotish' })).toBeNull()
    expect(screen.queryByLabelText('Qaysi kungacha')).toBeNull()
  })
})

describe('holdGoods', () => {
  const more = (n: number) => `va yana ${n} ta`
  it('names the first thing and counts the rest', () => {
    expect(holdGoods(hold(), more)).toBe('Ko‘ylak · Oq, M va yana 1 ta')
    expect(holdGoods({ lines: hold().lines.slice(1) }, more)).toBe('Jinsi')
    expect(holdGoods({ lines: [] }, more)).toBe('')
  })
})
