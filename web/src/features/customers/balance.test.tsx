import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Balance, balanceText } from './balance'

const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

describe('a customer’s balance', () => {
  it('is what they owe with a minus, and what is theirs as it stands', () => {
    expect(plain(balanceText(5_000_000, 'UZS'))).toBe('−50 000 so‘m')
    expect(plain(balanceText(-1_000, 'USD'))).toBe('10,00 $')
    expect(plain(balanceText(0, 'UZS'))).toBe('0 so‘m')
  })

  it('is red when they owe and green when something is theirs', () => {
    const { container } = render(
      <>
        <Balance balance={100} currency="UZS" />
        <Balance balance={-100} currency="UZS" />
      </>,
    )
    const [owes, theirs] = container.querySelectorAll('[data-balance]')
    expect(owes.className).toContain('text-bad')
    expect(theirs.className).toContain('text-ok')
  })
})
