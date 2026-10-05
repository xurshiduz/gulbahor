import type { ProductDto, ProductImageDto } from '@gulbahor/core'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConfirmProvider } from '@/components/ui/dialog'
import { TooltipProvider } from '@/components/ui/feedback'
import { api } from '@/lib/api'

import { ProductImages } from './product-images'

const photo = (id: string, valueId: string | null = null): ProductImageDto => ({
  id,
  valueId,
  small: `/api/files/org/${id}/s.webp`,
  medium: `/api/files/org/${id}/m.webp`,
  large: `/api/files/org/${id}/l.webp`,
  blur: 'data:image/webp;base64,UklGRg==',
  width: 1600,
  height: 1200,
})

const COLORS = [
  { id: 'black', name: 'Qora' },
  { id: 'white', name: 'Oq' },
]

/** The gallery as the product's card holds it: its photographs come from what the screen knows of the model. */
function Card({
  start,
  canManage = true,
  colors = COLORS,
}: {
  start: ProductImageDto[]
  canManage?: boolean
  colors?: typeof COLORS
}) {
  const product = useQuery({
    queryKey: ['products', 'one', 'p1'],
    queryFn: () => ({ images: start }) as ProductDto,
    initialData: { images: start } as ProductDto,
    staleTime: Infinity,
  })
  return <ProductImages productId="p1" images={product.data.images} colors={colors} canManage={canManage} />
}

const shown = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <ConfirmProvider>{ui}</ConfirmProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  )

const order = () => screen.getAllByRole('figure').map((tile) => tile.querySelector('img')?.getAttribute('src'))

afterEach(() => vi.restoreAllMocks())

describe("a model's photographs", () => {
  it('stand in their order, the first marked as the face', () => {
    shown(<Card start={[photo('a', 'black'), photo('b')]} />)
    expect(order()).toEqual(['/api/files/org/a/m.webp', '/api/files/org/b/m.webp'])
    const [first, second] = screen.getAllByRole('figure')
    expect(within(first).getByText('Asosiy')).toBeTruthy()
    expect(within(second).queryByText('Asosiy')).toBeNull()
    // Each says which colour it shows.
    expect(within(first).getByRole('combobox').textContent).toContain('Qora')
    expect(within(second).getByRole('combobox').textContent).toContain('Hamma rang')
    expect(screen.getByText("Rasm qo'shish")).toBeTruthy()
  })

  it('makes another the face at once, and puts it back when the server will not have it', async () => {
    const user = userEvent.setup()
    const put = vi.spyOn(api, 'put').mockResolvedValueOnce([photo('b'), photo('a')])
    shown(<Card start={[photo('a'), photo('b')]} />)
    await user.click(screen.getByRole('button', { name: 'Asosiy qilish' }))
    expect(put).toHaveBeenCalledWith('/products/p1/images/order', { ids: ['b', 'a'] })
    await waitFor(() => expect(order()).toEqual(['/api/files/org/b/m.webp', '/api/files/org/a/m.webp']))

    put.mockRejectedValueOnce(new Error('offline'))
    await user.click(screen.getByRole('button', { name: 'Asosiy qilish' }))
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(order()).toEqual(['/api/files/org/b/m.webp', '/api/files/org/a/m.webp']))
  })

  it('asks before taking one away', async () => {
    const user = userEvent.setup()
    const remove = vi.spyOn(api, 'delete').mockResolvedValue([photo('b')])
    shown(<Card start={[photo('a'), photo('b')]} />)
    await user.click(screen.getAllByRole('button', { name: "O'chirish" })[0])
    expect(remove).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: "O'chirish" }))
    expect(remove).toHaveBeenCalledWith('/products/p1/images/a')
    await waitFor(() => expect(order()).toEqual(['/api/files/org/b/m.webp']))
  })

  it('is only looked at by those who may not change the catalogue', () => {
    shown(<Card start={[photo('a')]} canManage={false} colors={[]} />)
    expect(order()).toEqual(['/api/files/org/a/m.webp'])
    expect(screen.queryByText("Rasm qo'shish")).toBeNull()
    expect(screen.queryByRole('button', { name: "O'chirish" })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('waits for a model to be saved before it takes any', () => {
    shown(<ProductImages productId={null} images={[]} colors={[]} canManage />)
    expect(screen.getByText("Rasmlar tovar saqlangandan keyin qo'shiladi.")).toBeTruthy()
    expect(screen.queryByText("Rasm qo'shish")).toBeNull()
  })
})
