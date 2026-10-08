import { CARD_NUMBER_DIGITS, formatCardNumber } from '@gulbahor/core'
import { forwardRef, type ChangeEvent } from 'react'

import { Input, type InputProps } from './input'

export interface CardNumberInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  /** "9860 1234 5678 9012", or what has been typed so far, or "". */
  value: string
  onChange: (value: string) => void
}

/**
 * A card number. Only digits go in, sixteen at most, spaced in fours as
 * they are typed; a pasted "9860-1234-5678-9012" is cleaned. The cursor
 * stays after the digit it stood after, and deleting a space takes the
 * digit beside it.
 */
export const CardNumberInput = forwardRef<HTMLInputElement, CardNumberInputProps>(function CardNumberInput(
  { value, onChange, className, ...props },
  ref,
) {
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const raw = input.value
    let digits = digitsOf(raw)
    let before = digitsOf(raw.slice(0, input.selectionStart ?? raw.length)).length
    const kind = (event.nativeEvent as InputEvent).inputType
    if (kind?.startsWith('delete') && digits === digitsOf(value)) {
      // Only a space went: the digit beside it goes too, or the key would seem to do nothing.
      if (kind === 'deleteContentBackward' && before > 0) {
        digits = digits.slice(0, before - 1) + digits.slice(before)
        before -= 1
      } else if (kind === 'deleteContentForward') {
        digits = digits.slice(0, before) + digits.slice(before + 1)
      }
    }
    digits = digits.slice(0, CARD_NUMBER_DIGITS)
    const next = formatCardNumber(digits)
    const at = caretAfter(next, Math.min(before, digits.length))
    // Written here, not left to the re-render, so the cursor is not thrown to the end.
    input.value = next
    input.setSelectionRange(at, at)
    onChange(next)
  }

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="numeric"
      placeholder="0000 0000 0000 0000"
      value={value}
      onChange={change}
      className={className ?? 'font-code'}
      {...props}
    />
  )
})

function digitsOf(text: string): string {
  return text.replace(/\D/g, '')
}

/** Where the cursor stands after the n-th digit of a spaced number. */
function caretAfter(text: string, digits: number): number {
  let seen = 0
  for (let i = 0; i < text.length && digits > 0; i++) {
    if (text[i] !== ' ' && ++seen === digits) {
      return i + 1
    }
  }
  return digits > 0 ? text.length : 0
}
