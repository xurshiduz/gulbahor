import type { AccountDto } from '@gulbahor/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { emptyHandings, HandoverFields, handoversOf, type Handings } from './handover'

const som = (amount: number) => amount * 100

const safe = (id: string, name: string, currency: 'UZS' | 'USD') => ({ id, name, currency, kind: 'safe' }) as AccountDto

describe('handing cash over', () => {
  const safes = [safe('s1', 'Seyf', 'UZS'), safe('s2', 'Seyf $', 'USD')]

  it('goes to the only safe of its currency without being asked which', () => {
    expect(emptyHandings(safes)).toEqual({
      UZS: { amount: null, toAccountId: 's1' },
      USD: { amount: null, toAccountId: 's2' },
    })
    // No safe for dollars: there is nowhere to hand them over to.
    expect(emptyHandings([safes[0]]).USD.toAccountId).toBeNull()
  })

  it('sends only what holds a sum', () => {
    const handings: Handings = {
      UZS: { amount: som(350_000), toAccountId: 's1' },
      USD: { amount: null, toAccountId: 's2' },
    }
    expect(handoversOf(handings)).toEqual([{ toAccountId: 's1', amount: som(350_000) }])
    expect(handoversOf(emptyHandings(safes))).toEqual([])
  })

  it('has a field for each currency with a safe, and says when more is handed over than was counted', async () => {
    let latest: Handings | null = null
    function Fields() {
      const [value, setValue] = useState(() => emptyHandings(safes))
      latest = value
      return <HandoverFields safes={safes} value={value} onChange={setValue} limits={{ UZS: som(400_000), USD: 0 }} />
    }
    render(<Fields />)
    const uzs = screen.getByLabelText("Topshiriladigan so'm")
    expect(screen.getByLabelText('Topshiriladigan dollar')).toBeTruthy()

    await userEvent.type(uzs, '350000{Tab}')
    expect((latest as Handings | null)?.UZS).toEqual({ amount: som(350_000), toAccountId: 's1' })
    expect(screen.queryByText("Sanalgan puldan ko'p topshirib bo'lmaydi")).toBeNull()

    await userEvent.clear(uzs)
    await userEvent.type(uzs, '450000{Tab}')
    expect(screen.getByText("Sanalgan puldan ko'p topshirib bo'lmaydi")).toBeTruthy()
  })
})
