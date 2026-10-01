import type { CurrencyCode } from '@gulbahor/core'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useScanner } from '@/lib/scanner'

import { Combobox } from './combobox'
import { DateInput } from './date-input'
import { Form } from './form'
import { MoneyInput } from './money-input'
import { NumberInput } from './number-input'
import { PhoneInput } from './phone-input'

function Money({ onValue, fillValue }: { onValue: (value: number | null, currency: CurrencyCode) => void; fillValue?: number }) {
  const [value, setValue] = useState<number | null>(null)
  const [currency, setCurrency] = useState<CurrencyCode>('UZS')
  return (
    <MoneyInput
      value={value}
      currency={currency}
      fillValue={fillValue}
      onCurrencyChange={setCurrency}
      onChange={(next) => {
        setValue(next)
        onValue(next, currency)
      }}
    />
  )
}

describe('MoneyInput', () => {
  it('groups thousands while typing and reports minor units', async () => {
    const onValue = vi.fn()
    render(<Money onValue={onValue} />)
    const input = screen.getByRole('textbox')

    await userEvent.type(input, '1250000')
    expect(input).toHaveProperty('value', '1 250 000')

    await userEvent.tab()
    expect(onValue).toHaveBeenLastCalledWith(125_000_000, 'UZS')
  })

  it('calculates, previews the result and writes it back on Enter', async () => {
    const onValue = vi.fn()
    render(<Money onValue={onValue} />)
    const input = screen.getByRole('textbox')

    await userEvent.type(input, '1500000 - 10%')
    expect(screen.getByText(/= 1 350 000/)).toBeTruthy()

    await userEvent.keyboard('{Enter}')
    expect(onValue).toHaveBeenLastCalledWith(135_000_000, 'UZS')
    expect(input).toHaveProperty('value', '1 350 000')
  })

  it('understands shorthand and switches currency from what was typed', async () => {
    const onValue = vi.fn()
    render(<Money onValue={onValue} />)
    const input = screen.getByRole('textbox')

    await userEvent.type(input, '250k{Enter}')
    expect(onValue).toHaveBeenLastCalledWith(25_000_000, 'UZS')

    await userEvent.clear(input)
    await userEvent.type(input, '100${Enter}')
    expect(onValue).toHaveBeenLastCalledWith(10_000, 'UZS')
    expect(screen.getByRole('button', { name: '$' })).toBeTruthy()
    expect(input).toHaveProperty('value', '100,00')
  })

  it('keeps what was typed and says why when it is not an amount', async () => {
    const onValue = vi.fn()
    render(<Money onValue={onValue} />)
    const input = screen.getByRole('textbox')

    await userEvent.type(input, '12 / 0')
    await userEvent.tab()
    expect(input).toHaveProperty('value', '12 / 0')
    expect(screen.getByRole('alert').textContent).toMatch(/nolga/i)
  })

  it('fills in the remaining amount with "="', async () => {
    const onValue = vi.fn()
    render(<Money onValue={onValue} fillValue={7_500_000} />)
    await userEvent.type(screen.getByRole('textbox'), '=')
    expect(onValue).toHaveBeenLastCalledWith(7_500_000, 'UZS')
    expect(screen.getByRole('textbox')).toHaveProperty('value', '75 000')
  })
})

describe('NumberInput', () => {
  it('multiplies packs and steps with the arrows', async () => {
    const onChange = vi.fn()
    function Quantity() {
      const [value, setValue] = useState<number | null>(null)
      return <NumberInput value={value} onChange={(next) => (setValue(next), onChange(next))} />
    }
    render(<Quantity />)
    const input = screen.getByRole('textbox')

    await userEvent.type(input, '5*12{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(60)

    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith(61)
  })

  it('refuses a fraction of a piece', async () => {
    const onChange = vi.fn()
    render(<NumberInput value={null} onChange={onChange} />)
    await userEvent.type(screen.getByRole('textbox'), '2.5{Enter}')
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})

describe('PhoneInput', () => {
  function Phone({ onChange }: { onChange: (value: string) => void }) {
    const [value, setValue] = useState('')
    return <PhoneInput value={value} onChange={(next) => (setValue(next), onChange(next))} />
  }

  it('spaces the number as it is typed', async () => {
    const onChange = vi.fn()
    render(<Phone onChange={onChange} />)
    const input = screen.getByRole('textbox')
    await userEvent.type(input, '901234567')
    expect(input).toHaveProperty('value', '90 123 45 67')
    expect(onChange).toHaveBeenLastCalledWith('+998901234567')
  })

  it('accepts a pasted number in any shape', async () => {
    const onChange = vi.fn()
    render(<Phone onChange={onChange} />)
    const input = screen.getByRole('textbox')
    input.focus()
    await userEvent.paste('8 (90) 123-45-67')
    expect(input).toHaveProperty('value', '90 123 45 67')
    expect(onChange).toHaveBeenLastCalledWith('+998901234567')
  })
})

describe('DateInput', () => {
  it('reads typed shortcuts', async () => {
    const onChange = vi.fn()
    function Day() {
      const [value, setValue] = useState('')
      return <DateInput value={value} onChange={(next) => (setValue(next), onChange(next))} />
    }
    render(<Day />)
    const input = screen.getByRole('textbox')

    await userEvent.type(input, '15102025{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('2025-10-15')
    expect(input).toHaveProperty('value', '15.10.2025')

    await userEvent.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenLastCalledWith('2025-10-16')
  })
})

describe('Combobox', () => {
  const options = [
    { value: '1', label: "Anvar G'ofurov" },
    { value: '2', label: 'Дилноза Каримова' },
    { value: '3', label: 'Shohruh Abdullayev' },
  ]

  it('finds across scripts and keyboard layouts and picks with Enter', async () => {
    const onChange = vi.fn()
    render(<Combobox options={options} value={null} onChange={onChange} />)
    const input = screen.getByRole('combobox')

    await userEvent.type(input, 'dilnoza')
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Дилноза Каримова'])
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('2')

    await userEvent.type(input, 'фтмфк')
    expect(screen.getAllByRole('option')[0].textContent).toBe("Anvar G'ofurov")
  })

  it('offers to create what is not there', async () => {
    const onCreate = vi.fn()
    render(<Combobox options={options} value={null} onChange={() => {}} onCreate={onCreate} />)
    await userEvent.type(screen.getByRole('combobox'), 'Yangi hamkor{Enter}')
    expect(onCreate).toHaveBeenCalledWith('Yangi hamkor')
  })
})

describe('Form', () => {
  it('moves to the next field on Enter and submits from the last', async () => {
    const onSubmit = vi.fn()
    render(
      <Form onSubmit={onSubmit}>
        <input aria-label="first" />
        <input aria-label="second" />
      </Form>,
    )
    const first = screen.getByLabelText('first')
    const second = screen.getByLabelText('second')
    // jsdom does no layout, so every element reports no offsetParent; pretend they are visible.
    for (const field of [first, second]) {
      Object.defineProperty(field, 'offsetParent', { get: () => document.body })
    }

    first.focus()
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement).toBe(second)
    expect(onSubmit).not.toHaveBeenCalled()

    await userEvent.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

describe('useScanner', () => {
  function Scanner({ onScan }: { onScan: (code: string) => void }) {
    useScanner(onScan)
    return <input aria-label="name" defaultValue="Anvar" />
  }

  const press = (target: Element, key: string) => fireEvent.keyDown(target, { key })

  it('takes a fast burst ending in Enter as a scan and leaves the field as it was', () => {
    const onScan = vi.fn()
    render(<Scanner onScan={onScan} />)
    const input = screen.getByLabelText('name') as HTMLInputElement
    input.focus()

    // A reader types far faster than a person; all of this lands within a millisecond or two.
    for (const char of '4780012345678') {
      press(input, char)
      input.value += char
    }
    press(input, 'Enter')

    expect(onScan).toHaveBeenCalledWith('4780012345678')
    expect(input.value).toBe('Anvar')
  })

  it('leaves slow typing alone', async () => {
    const onScan = vi.fn()
    render(<Scanner onScan={onScan} />)
    const input = screen.getByLabelText('name')
    await userEvent.type(input, '12345{Enter}', { delay: 60 })
    expect(onScan).not.toHaveBeenCalled()
  })
})
