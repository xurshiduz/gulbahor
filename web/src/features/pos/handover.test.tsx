import type { AccountDto, RateBook } from '@erp/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { emptyHandings, handingIn, HandoverFields, handingLine, handoversOf, type Handings } from './handover'

const som = (amount: number) => amount * 100

const safe = (id: string, name: string, currency: 'UZS' | 'USD') => ({ id, name, currency, kind: 'safe' }) as AccountDto

describe('handing cash over', () => {
  const safes = [safe('s1', 'Seyf', 'UZS'), safe('s2', 'Seyf $', 'USD')]

  it('goes to the only safe of its currency without being asked which', () => {
    expect(emptyHandings(safes, ['UZS', 'USD'])).toEqual({
      UZS: { amount: null, toAccountId: 's1', received: null },
      USD: { amount: null, toAccountId: 's2', received: null },
    })
    // No safe for dollars: there is nowhere to hand them over to — unless they may be changed on the way.
    expect(emptyHandings([safes[0]], ['UZS', 'USD']).USD?.toAccountId).toBeNull()
    expect(emptyHandings([safes[0]], ['UZS', 'USD'], true).USD?.toAccountId).toBe('s1')
  })

  it('sends only what holds a sum', () => {
    const handings: Handings = {
      UZS: { amount: som(350_000), toAccountId: 's1' },
      USD: { amount: null, toAccountId: 's2' },
    }
    expect(handoversOf(handings)).toEqual([{ toAccountId: 's1', amount: som(350_000) }])
    expect(handoversOf(emptyHandings(safes, ['UZS', 'USD']))).toEqual([])
  })

  it('has a field for each currency with a safe, and says when more is handed over than was counted', async () => {
    let latest: Handings | null = null
    function Fields() {
      const [value, setValue] = useState(() => emptyHandings(safes, ['UZS', 'USD']))
      latest = value
      return (
        <HandoverFields
          safes={safes}
          value={value}
          onChange={setValue}
          currencies={['UZS', 'USD']}
          limits={{ UZS: som(400_000), USD: 0 }}
        />
      )
    }
    render(<Fields />)
    const uzs = screen.getByLabelText('Topshiriladigan so‘m')
    expect(screen.getByLabelText('Topshiriladigan dollar')).toBeTruthy()

    await userEvent.type(uzs, '350000{Tab}')
    expect((latest as Handings | null)?.UZS).toEqual({ amount: som(350_000), toAccountId: 's1', received: null })
    expect(screen.queryByText('Sanalgan puldan ko‘p topshirib bo‘lmaydi')).toBeNull()

    await userEvent.clear(uzs)
    await userEvent.type(uzs, '450000{Tab}')
    expect(screen.getByText('Sanalgan puldan ko‘p topshirib bo‘lmaydi')).toBeTruthy()
  })

  it('changes money on the way to a safe of another currency, with a second sum under it', async () => {
    const book: RateBook = { base: 'UZS', rates: { USD: { against: 'UZS', way: 'in', value: 12_850 } } }
    const changing = { book, limit: 2, setsRates: false }
    let latest: Handings | null = null
    function Fields() {
      const [value, setValue] = useState(() => emptyHandings([safes[1]], ['UZS'], true))
      latest = value
      return (
        <HandoverFields safes={[safes[1]]} value={value} onChange={setValue} currencies={['UZS']} changing={changing} />
      )
    }
    render(<Fields />)
    await userEvent.type(screen.getByLabelText('Topshiriladigan so‘m'), '1000000{Tab}')
    const into = screen.getByLabelText('Kiradi (Dollar)') as HTMLInputElement
    expect(into.value).toBe('77,82')
    await userEvent.clear(into)
    await userEvent.type(into, '78{Tab}')
    expect(latest).toMatchObject({ UZS: { amount: som(1_000_000), toAccountId: 's2', received: 7800 } })
    expect(handingLine('UZS', handingIn(latest as unknown as Handings, 'UZS'), safes, changing)).toMatchObject({
      agreed: true,
    })
  })
})
