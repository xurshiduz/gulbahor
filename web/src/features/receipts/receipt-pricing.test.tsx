import type { PriceTypeDto, ReceiptPricing } from '@erp/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { PricingBar, type PricingCount } from './receipt-pricing'

const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

const type = (
  id: string,
  name: string,
  kind: PriceTypeDto['kind'],
  formula: PriceTypeDto['formula'],
): PriceTypeDto => ({
  id,
  name,
  kind,
  currency: 'UZS',
  roundStep: 100_000,
  roundEnding: 0,
  tillAccess: 'none',
  skipsFloor: false,
  formula,
  isActive: true,
})
const types = [
  type('retail', 'Chakana', 'retail', { base: 'cost', percent: 50, amount: 0 }),
  type('wholesale', 'Ulgurji', 'other', { base: 'retail', percent: -10, amount: 0 }),
  type('family', 'Oila', 'other', null),
  type('floor', 'Minimal', 'min', null),
]
const counts: Record<string, PricingCount> = {
  retail: { fresh: 12, replaced: 0, kept: 3 },
  wholesale: { fresh: 15, replaced: 0, kept: 0 },
}

function Held({
  start = {},
  onChange,
}: {
  start?: Record<string, ReceiptPricing>
  onChange: (pricing: unknown) => void
}) {
  const [pricing, setPricing] = useState(start)
  return (
    <PricingBar
      types={types}
      retailId="retail"
      pricing={pricing}
      onChange={(next) => {
        setPricing(next)
        onChange(next)
      }}
      editable
      counts={counts}
    />
  )
}

const shown = (start?: Record<string, ReceiptPricing>) => {
  const onChange = vi.fn()
  render(<Held start={start} onChange={onChange} />)
  return onChange
}
const chips = () => [...document.querySelectorAll('[data-pricing-bar] > button')].map((chip) => plain(chip.textContent))

describe('how a receipt prices its goods', () => {
  it('says of each price type how it is worked out when nothing is said', () => {
    shown()
    expect(chips()).toEqual([
      'Chakana: tannarx + 50%',
      'Ulgurji: chakana − 10%',
      'Oila: Qoidalar bo‘yicha',
      'Minimal: qo‘lda',
    ])
  })

  it('gives this one receipt a formula of its own, and says what posting will do', async () => {
    const onChange = shown()
    await userEvent.click(screen.getByRole('button', { name: /Chakana/ }))
    expect(screen.getByRole('dialog', { name: 'Chakana — shu kirim uchun' })).toBeTruthy()
    expect(plain(document.querySelector('[data-pricing-count]')?.textContent)).toBe(
      'Yangi narx qo‘yiladi: 12 ta tovar · narxi bor, o‘zgarmaydi: 3 ta',
    )
    await userEvent.click(screen.getByRole('radio', { name: 'Shu kirim formulasi' }))
    const percent = document.querySelector('[data-formula] input') as HTMLInputElement
    await userEvent.type(percent, '80{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({
      retail: { skip: false, formula: { base: 'cost', percent: 80, amount: 0 }, all: false },
    })
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenLastCalledWith({
      retail: { skip: false, formula: { base: 'cost', percent: 80, amount: 0 }, all: true },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Tayyor' }))
    expect(chips()[0]).toBe('Chakana: tannarx + 80% · shu kirim uchun · narxi borlarga ham')
  })

  it('leaves a price type out of a receipt, and goes back to the rules', async () => {
    const onChange = shown()
    await userEvent.click(screen.getByRole('button', { name: /Ulgurji/ }))
    await userEvent.click(screen.getByRole('radio', { name: 'Qo‘yilmaydi' }))
    expect(onChange).toHaveBeenLastCalledWith({ wholesale: { skip: true, formula: null, all: false } })
    // Nothing is worked out, so there is nothing for it to reach.
    expect(screen.queryByRole('checkbox')).toBeNull()
    await userEvent.click(screen.getByRole('radio', { name: 'Qoidalar bo‘yicha' }))
    // What says nothing is not kept.
    expect(onChange).toHaveBeenLastCalledWith({})
  })

  it('says of a receipt already written what it said', () => {
    shown({
      floor: { skip: false, formula: { base: 'cost', percent: 5, amount: 0 }, all: false },
      family: { skip: true, formula: null, all: false },
    })
    expect(chips().slice(2)).toEqual(['Oila: bu kirimda qo‘yilmaydi', 'Minimal: tannarx + 5% · shu kirim uchun'])
  })
})
