import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { DiscountInput, discountMode, discountShown, discountTyped } from './discount-input'
import { discountOf } from './pos-state'

const som = (amount: number) => amount * 100

/** The field as a cart line holds it: the discount is kept as it is written. */
function Field({ start = '', onText }: { start?: string; onText?: (text: string) => void }) {
  const [text, setText] = useState(start)
  return (
    <DiscountInput
      text={text}
      unit="so‘m"
      onChange={(next) => {
        setText(next)
        onText?.(next)
      }}
    />
  )
}

const mode = (which: 'percent' | 'amount') =>
  document.querySelector(`[data-discount-mode="${which}"]`) as HTMLButtonElement
const chosen = () => (mode('percent').getAttribute('aria-checked') === 'true' ? 'percent' : 'amount')

describe('how a discount is written', () => {
  it('is read by its unit: percent, a sum, or the sum agreed on', () => {
    expect(discountMode('10%')).toBe('percent')
    expect(discountMode('5000')).toBe('amount')
    expect(discountMode('')).toBeNull()
    expect(discountMode('=1 600 000')).toBeNull()
    expect(discountShown('10%')).toBe('10')
    expect(discountShown('5000')).toBe('5000')
    expect(discountShown('=1 600 000')).toBe('=1 600 000')
  })

  it('takes the unit the switch stands at, unless a "%" or "=" says otherwise', () => {
    expect(discountTyped('10', 'percent')).toEqual({ text: '10%', mode: 'percent' })
    expect(discountTyped('5000', 'amount')).toEqual({ text: '5000', mode: 'amount' })
    expect(discountTyped('10%', 'amount')).toEqual({ text: '10%', mode: 'percent' })
    expect(discountTyped('=90000', 'percent')).toEqual({ text: '=90000', mode: 'percent' })
    expect(discountTyped('', 'amount')).toEqual({ text: '', mode: 'amount' })
  })
})

describe('the discount field', () => {
  it('starts in percent: a number typed is so many percent', async () => {
    let text = ''
    render(<Field onText={(next) => (text = next)} />)
    expect(chosen()).toBe('percent')
    await userEvent.type(screen.getByRole('textbox'), '10')
    expect(text).toBe('10%')
    // The field shows the number; the switch says what it is.
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('10')
    expect(discountOf(text, som(200_000))).toBe(som(20_000))
  })

  it('turns to money with the switch, and the number already there is meant the other way', async () => {
    let text = ''
    render(<Field onText={(next) => (text = next)} />)
    await userEvent.click(mode('amount'))
    expect(chosen()).toBe('amount')
    // The cursor is back in the field: the switch is not a stop of its own.
    expect(document.activeElement).toBe(screen.getByRole('textbox'))
    await userEvent.type(screen.getByRole('textbox'), '5000')
    expect(text).toBe('5000')
    expect(discountOf(text, som(200_000))).toBe(som(5000))
    await userEvent.click(mode('percent'))
    expect(text).toBe('5000%')
    await userEvent.clear(screen.getByRole('textbox'))
    await userEvent.type(screen.getByRole('textbox'), '5')
    expect(text).toBe('5%')
  })

  it('follows what stands in it: a sum kept from before, or a "%" typed', async () => {
    let text = ''
    render(<Field start="15000" onText={(next) => (text = next)} />)
    expect(chosen()).toBe('amount')
    await userEvent.clear(screen.getByRole('textbox'))
    await userEvent.type(screen.getByRole('textbox'), '7%')
    expect(text).toBe('7%')
    expect(chosen()).toBe('percent')
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('7')
  })
})
