import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PinInput } from './pin-input'

function Field({ onComplete, refused }: { onComplete?: (pin: string) => void; refused?: number }) {
  const [value, setValue] = useState('')
  return <PinInput aria-label="PIN kod" value={value} onChange={setValue} onComplete={onComplete} refused={refused} />
}

const field = () => screen.getByLabelText('PIN kod') as HTMLInputElement
const boxes = () => [...document.querySelectorAll('[data-pin-box]')].map((box) => box.getAttribute('data-pin-box'))

afterEach(() => vi.restoreAllMocks())

describe('a PIN', () => {
  it('has a box to each of its four digits, filled as they are typed and never showing them', async () => {
    render(<Field />)
    expect(boxes()).toEqual(['empty', 'empty', 'empty', 'empty'])
    await userEvent.type(field(), '48')
    expect(boxes()).toEqual(['filled', 'filled', 'empty', 'empty'])
    expect(document.body.textContent).not.toContain('4')
    await userEvent.keyboard('{Backspace}')
    expect(boxes()).toEqual(['filled', 'empty', 'empty', 'empty'])
    // Nothing a browser keeps passwords for: the sign-in password must never land here.
    expect(field().type).toBe('text')
    expect(field().autocomplete).toBe('off')
    expect(field().inputMode).toBe('numeric')
  })

  it('holds digits alone, and no more than four', async () => {
    render(<Field />)
    await userEvent.type(field(), '4a8 2-19')
    expect(field().value).toBe('4821')
    expect(boxes()).toEqual(['filled', 'filled', 'filled', 'filled'])
  })

  it('is handed over as the last digit goes in', async () => {
    const done = vi.fn()
    render(<Field onComplete={done} />)
    await userEvent.type(field(), '482')
    expect(done).not.toHaveBeenCalled()
    await userEvent.keyboard('1')
    expect(done).toHaveBeenCalledTimes(1)
    expect(done).toHaveBeenCalledWith('4821')
    // Corrected, it is handed over again.
    await userEvent.keyboard('{Backspace}7')
    expect(done).toHaveBeenLastCalledWith('4827')
  })

  it('is taken whole when pasted', async () => {
    const done = vi.fn()
    render(<Field onComplete={done} />)
    field().focus()
    await userEvent.paste('48 21')
    expect(field().value).toBe('4821')
    expect(done).toHaveBeenCalledWith('4821')
  })

  it('shakes when it is refused, and buzzes where there is something to buzz with', () => {
    const buzz = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: buzz, configurable: true })
    const { rerender } = render(<Field refused={0} />)
    const row = () => document.querySelector('[data-pin] > div') as HTMLElement
    expect(row().className).not.toContain('animate-shake')
    expect(buzz).not.toHaveBeenCalled()

    rerender(<Field refused={1} />)
    expect(row().className).toContain('animate-shake')
    expect(buzz).toHaveBeenCalledTimes(1)
    // The same refusal drawn again is not another one.
    rerender(<Field refused={1} />)
    expect(buzz).toHaveBeenCalledTimes(1)
    Reflect.deleteProperty(navigator, 'vibrate')
  })
})
