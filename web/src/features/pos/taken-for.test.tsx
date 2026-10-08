import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { TakenFor } from './taken-for'

const som = (amount: number) => amount * 100
const usd = (amount: number) => amount * 100
/** Thousands are kept apart by a space that does not break: here it is only a space. */
const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ')

/** Fifty dollars on a till whose cashier may go 2% over the rate alone. */
function Dollars({
  rate,
  rest = 0,
  alone = false,
  mayAsk = true,
}: {
  rate: number
  rest?: number
  alone?: boolean
  mayAsk?: boolean
}) {
  const [value, setValue] = useState<number | null>(null)
  return (
    <>
      <TakenFor
        amount={usd(50)}
        currency="USD"
        value={value}
        book={{ base: 'UZS', rates: { USD: { against: 'UZS', way: 'in', value: rate } } }}
        rest={rest}
        limit={2}
        mayAsk={mayAsk}
        alone={alone}
        onChange={setValue}
      />
      <output aria-label="taken for">{value === null ? 'rate' : value / 100}</output>
    </>
  )
}

describe('dollars taken for an agreed worth', () => {
  it('are worth what the rate makes them until something else is typed', async () => {
    render(<Dollars rate={12_100} />)
    const field = screen.getByRole('textbox') as HTMLInputElement
    expect(plain(field.placeholder)).toBe('605 000')
    expect(screen.getByLabelText('taken for').textContent).toBe('rate')

    // Less than the rate makes them: the shop is left with the difference.
    await userEvent.type(field, '600000{Enter}')
    expect(screen.getByLabelText('taken for').textContent).toBe('600000')
    expect(plain(screen.getByText(/foyda/).textContent)).toBe('1 $ = 12 000 · kurs farqidan foyda 5 000 so‘m')

    // Typed as what the rate makes them, nothing was agreed.
    await userEvent.clear(field)
    await userEvent.type(field, '605000{Enter}')
    expect(screen.getByLabelText('taken for').textContent).toBe('rate')
    expect(screen.queryByText(/kurs farqidan/)).toBeNull()
  })

  it('are filled with what is left of the sale by "="', async () => {
    render(<Dollars rate={11_800} rest={som(600_000)} />)
    const field = screen.getByRole('textbox') as HTMLInputElement
    await userEvent.type(field, '=')
    expect(screen.getByLabelText('taken for').textContent).toBe('600000')
    // 590 000 at the rate: 10 000 dearer, 1,7%, the cashier's own to give.
    expect(plain(screen.getByText(/zarar/).textContent)).toBe('1 $ = 12 000 · kurs farqidan zarar 10 000 so‘m')
    expect(field.getAttribute('aria-invalid')).not.toBe('true')
    expect(screen.queryByText(/rahbar/)).toBeNull()
  })

  it("say so when the loss is past the limit and a manager's word will be asked", async () => {
    const { unmount } = render(<Dollars rate={11_800} />)
    await userEvent.type(screen.getByRole('textbox'), '620000{Enter}')
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText(/rahbar tasdig‘i so‘raladi/)).toBeTruthy()
    unmount()

    // With nobody to ask it cannot be done at all.
    const none = render(<Dollars rate={11_800} mayAsk={false} />)
    await userEvent.type(screen.getByRole('textbox'), '620000{Enter}')
    expect(screen.getByText(/olib bo‘lmaydi/)).toBeTruthy()
    none.unmount()

    // Who may go over the limit is told nothing: it is theirs to give.
    render(<Dollars rate={11_800} alone />)
    await userEvent.type(screen.getByRole('textbox'), '620000{Enter}')
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).not.toBe('true')
    expect(screen.queryByText(/rahbar/)).toBeNull()
  })
})
