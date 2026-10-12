import { receiptPrice, type LinePrice, type ReceiptPrice, type RuledMarkup } from '@erp/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { PriceField } from './price-field'

const som = (amount: number) => amount * 100
const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

const rounding = { step: som(1000), ending: 0 }
const basis = { cost: som(80_500), retail: som(121_000) }
const own: RuledMarkup = { priceTypeId: 'retail', base: 'cost', percent: 50, amount: 0, rule: null }

interface Setup {
  typed?: LinePrice | null
  standing?: number | null
  rule?: RuledMarkup | null
  ownRetail?: boolean
}

/** The field as a receipt holds it: what is typed is kept, and what the receipt makes of it worked out anew. */
function Held({
  typed = null,
  standing = null,
  rule = own,
  ownRetail,
  onChange,
}: Setup & { onChange: (value: LinePrice | null) => void }) {
  const [value, setValue] = useState<LinePrice | null>(typed)
  const worked: ReceiptPrice = receiptPrice({
    typed: value,
    receipt: null,
    rule,
    standing,
    ...basis,
    rounding,
    floor: false,
  })
  return (
    <PriceField
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      currency="UZS"
      worked={worked}
      standing={standing}
      basis={basis}
      rounding={rounding}
      ownRetail={ownRetail}
    />
  )
}

const shown = (setup: Setup = {}) => {
  const onChange = vi.fn()
  render(<Held {...setup} onChange={onChange} />)
  return { onChange, input: screen.getAllByRole('textbox').at(-1) as HTMLInputElement }
}
const mark = () => plain(document.querySelector('[data-price-mark]')?.textContent)

describe('a selling price on a receipt', () => {
  it('shows new goods the price their rule gives, in full, and says where it comes from', () => {
    const { input } = shown()
    expect(plain(input.value)).toBe('121 000')
    expect(mark()).toBe('odatiy')
    expect(document.querySelector('[data-price-field]')?.getAttribute('data-source')).toBe('own')
  })

  it('names a rule for goods of a kind, and leaves a price that stands faint', () => {
    shown({ rule: { ...own, rule: 'Ko‘ylaklar' } })
    expect(mark()).toBe('qoida')

    const { input } = shown({ standing: som(150_000) })
    // Nothing is set: the price that stands shows faintly, and is said to be the one that stands.
    expect(plain([...document.querySelectorAll('[data-price-mark]')].at(-1)?.textContent)).toBe('hozirgi')
    expect(input.value).toBe('')
    expect(plain(input.placeholder)).toBe('150 000')
  })

  it('takes a formula as it is typed, says what it comes to, and keeps it beside the price', async () => {
    const { input, onChange } = shown()
    await userEvent.click(input)
    // The field opens empty for typing, with a word on what may be typed.
    expect(input.value).toBe('')
    expect(plain(document.querySelector('[data-price-hint]')?.textContent)).toContain('ch −15%')
    await userEvent.type(input, '30%')
    expect(plain(document.body.textContent)).toContain('= 105 000 so‘m')
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ formula: { base: 'cost', percent: 30, amount: 0 } })
    await userEvent.tab()
    expect(plain(input.value)).toBe('105 000')
    expect(mark()).toBe('30%')
    // Opened again, it is the formula that is there to be changed.
    await userEvent.click(input)
    expect(input.value).toBe('30%')
  })

  it('works a price out from the retail one, and takes a sum as a sum', async () => {
    const { input, onChange } = shown({ rule: null })
    await userEvent.click(input)
    await userEvent.type(input, 'ch -15%{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ formula: { base: 'retail', percent: -15, amount: 0 } })
    await userEvent.tab()
    // 121 000 less 15% is 102 850: up to the thousand.
    expect(plain(input.value)).toBe('103 000')
    expect(mark()).toBe('ch −15%')

    await userEvent.click(input)
    await userEvent.clear(input)
    await userEvent.type(input, '250000{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ amount: som(250_000) })
    await userEvent.tab()
    expect(plain(input.value)).toBe('250 000')
    expect(mark()).toBe('')
  })

  it('takes what is offered with "=", and goes back to it when emptied', async () => {
    const { input, onChange } = shown({ standing: som(150_000) })
    await userEvent.click(input)
    await userEvent.keyboard('=')
    // The rule's price, where another stands: now typed, and so set.
    expect(onChange).toHaveBeenLastCalledWith({ amount: som(121_000) })
    await userEvent.clear(input)
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('refuses a markdown from cost and the retail price out of itself, and changes nothing', async () => {
    const { input, onChange } = shown()
    await userEvent.click(input)
    await userEvent.type(input, '-5%{Enter}')
    expect(screen.getAllByRole('alert').at(-1)?.textContent).toContain('Tannarxdan past narx')
    expect(onChange).not.toHaveBeenCalled()
    // What was typed stays to be put right.
    expect(input.value).toBe('-5%')

    const retail = shown({ ownRetail: true })
    await userEvent.click(retail.input)
    await userEvent.type(retail.input, 'ch -10%{Enter}')
    expect(screen.getAllByRole('alert').at(-1)?.textContent).toContain('Chakana narx chakanadan hisoblanmaydi')
    expect(retail.onChange).not.toHaveBeenCalled()
  })
})
