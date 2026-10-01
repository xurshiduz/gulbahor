import { formatPhoneTyping, parsePhone } from '@gulbahor/core'
import { forwardRef, useEffect, useState, type ClipboardEvent } from 'react'

import { Input } from './input'

export interface PhoneInputProps {
  id?: string
  /** "+998901234567", or what has been typed so far, or "". */
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  disabled?: boolean
  autoFocus?: boolean
  onBlur?: () => void
}

const typed = (value: string) => formatPhoneTyping(value.startsWith('+998') ? value.slice(4) : value)

/**
 * An Uzbek phone number. "+998" is always there; the rest is spaced as it is
 * typed. Pasting a number in any shape works: "8 90 123-45-67",
 * "998901234567", "(90) 123 45 67".
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { id, value, onChange, invalid, disabled, autoFocus, onBlur },
  ref,
) {
  const [text, setText] = useState(() => typed(value))

  useEffect(() => {
    setText((current) => (digitsOf(current) === digitsOf(typed(value)) ? current : typed(value)))
  }, [value])

  const update = (next: string) => {
    setText(next)
    const digits = digitsOf(next)
    onChange(digits ? `+998${digits}` : '')
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = parsePhone(event.clipboardData.getData('text'))
    if (pasted.ok) {
      event.preventDefault()
      update(typed(pasted.national))
    }
  }

  return (
    <Input
      ref={ref}
      id={id}
      type="tel"
      inputMode="numeric"
      prefix="+998"
      placeholder="90 123 45 67"
      value={text}
      invalid={invalid}
      disabled={disabled}
      autoFocus={autoFocus}
      onChange={(event) => update(typed(event.target.value))}
      onPaste={handlePaste}
      onBlur={onBlur}
      className="tabular"
    />
  )
})

function digitsOf(text: string): string {
  return text.replace(/\D/g, '')
}
