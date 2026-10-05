import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { AgreedSum } from './agreed'
import { discountOf } from './pos-state'

const som = (amount: number) => amount * 100
/** Thousands are kept apart by a space that does not break: here it is only a space. */
const plain = (text: string) => text.replace(/\s/g, ' ')

/** The discount field and the agreed sum beside it, as the till keeps them: one text for both. */
function Sale({ base, start = '' }: { base: number; start?: string }) {
  const [text, setText] = useState(start)
  return (
    <>
      <AgreedSum text={text} base={base} onChange={setText} />
      <output aria-label="discount text">{text}</output>
      <output aria-label="comes off">{discountOf(text, base) / 100}</output>
    </>
  )
}

describe('the sum agreed on', () => {
  it('is typed, and what comes off is the rest', async () => {
    render(<Sale base={som(1_770_000)} />)
    const field = screen.getByRole('textbox') as HTMLInputElement
    // Empty, the field shows what the goods come to.
    expect(plain(field.placeholder)).toBe('1 770 000')

    await userEvent.type(field, '1600000{Enter}')
    expect(screen.getByLabelText('discount text').textContent).toBe('=1 600 000')
    expect(screen.getByLabelText('comes off').textContent).toBe('170000')

    // Cleared, nothing comes off.
    await userEvent.clear(field)
    await userEvent.tab()
    expect(screen.getByLabelText('discount text').textContent).toBe('')
  })

  it('is picked from the round sums offered', async () => {
    render(<Sale base={som(1_770_000)} />)
    const offered = screen.getAllByRole('button').map((button) => plain(button.textContent ?? ''))
    expect(offered).toEqual(['1 700 000', '1 600 000'])

    await userEvent.click(screen.getByRole('button', { name: /1.700.000/ }))
    expect(screen.getByLabelText('comes off').textContent).toBe('70000')
    expect(plain((screen.getByRole('textbox') as HTMLInputElement).value)).toBe('1 700 000')
  })

  it('leaves a discount written as a percentage alone, and shows a sum above the goods as wrong', async () => {
    render(<Sale base={som(500_000)} start="10%" />)
    const field = screen.getByRole('textbox') as HTMLInputElement
    // A percentage is not an agreed sum: the field stays empty and nothing is rewritten on leaving it.
    expect(field.value).toBe('')
    await userEvent.click(field)
    await userEvent.tab()
    expect(screen.getByLabelText('discount text').textContent).toBe('10%')

    await userEvent.type(field, '600000{Enter}')
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('comes off').textContent).toBe('0')
  })
})
