import { PIN_LENGTH } from '@erp/core'
import { forwardRef, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/cn'

export interface PinInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  /** The last digit is in: it is handed over at once, so nobody has to press Enter. */
  onComplete?: (value: string) => void
  /** Wrong: the boxes are red until something is typed again. */
  invalid?: boolean
  /** Counted up each time a PIN is refused: the boxes shake, and a phone buzzes. */
  refused?: number
  disabled?: boolean
  autoFocus?: boolean
  /** `lg` stands alone on a screen of its own; `md` sits in a form among other fields. */
  size?: 'md' | 'lg'
  'aria-label'?: string
}

const BOX = {
  md: 'h-8.5 w-9',
  lg: 'size-12',
}

/**
 * A PIN, a box to a digit. Underneath it is one field that cannot be seen:
 * typing, Backspace, pasting and a phone's number pad work as in any other,
 * and the boxes only show how far it has got. Digits are never drawn — a
 * till's screen faces the customer.
 */
export const PinInput = forwardRef<HTMLInputElement, PinInputProps>(function PinInput(
  { id, value, onChange, onComplete, invalid, refused = 0, disabled, autoFocus, size = 'md', ...props },
  ref,
) {
  const [focused, setFocused] = useState(false)
  // The box the next digit goes into; full, it is the last one.
  const active = Math.min(value.length, PIN_LENGTH - 1)

  const buzzed = useRef(refused)
  useEffect(() => {
    if (refused !== buzzed.current) {
      buzzed.current = refused
      // Phones only; a desktop has nothing to buzz with and says so by not having the function.
      navigator.vibrate?.([60, 40, 60])
    }
  }, [refused])

  return (
    <div className="relative inline-flex" data-pin>
      {/* Keyed by the refusals so that each one starts the shake anew; the field itself stays put and keeps the cursor. */}
      <div
        key={refused}
        aria-hidden
        className={cn('flex', size === 'lg' ? 'gap-2.5' : 'gap-1.5', refused > 0 && 'motion-safe:animate-shake')}
      >
        {Array.from({ length: PIN_LENGTH }, (_, index) => {
          const filled = index < value.length
          const current = focused && index === active
          return (
            <span
              key={index}
              data-pin-box={filled ? 'filled' : 'empty'}
              className={cn(
                'flex items-center justify-center rounded-md border bg-surface transition-colors',
                BOX[size],
                invalid ? 'border-bad' : current ? 'border-accent' : 'border-line-strong',
                current && (invalid ? 'outline-2 outline-bad/25' : 'outline-2 outline-accent/25'),
                disabled && 'bg-sunken',
              )}
            >
              {filled ? (
                <span className={cn('rounded-full bg-ink', size === 'lg' ? 'size-2.5' : 'size-2')} />
              ) : current ? (
                <span className={cn('w-px animate-caret bg-ink', size === 'lg' ? 'h-5' : 'h-4')} />
              ) : null}
            </span>
          )
        })}
      </div>
      <input
        ref={ref}
        id={id}
        // Not a password field: a browser that keeps the sign-in password would offer it here, or put it in.
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
        // No `maxLength`: it would cut a pasted "48 21" short before the space is taken out of it.
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        value={value}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH)
          if (next === value) {
            return
          }
          onChange(next)
          if (next.length === PIN_LENGTH) {
            onComplete?.(next)
          }
        }}
        // Typing always goes on from the end: there is no cursor to be seen anywhere else.
        onSelect={(event) => {
          const field = event.currentTarget
          if (field.selectionStart !== field.value.length || field.selectionEnd !== field.value.length) {
            field.setSelectionRange(field.value.length, field.value.length)
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 size-full cursor-text opacity-0 disabled:cursor-default"
        {...props}
      />
    </div>
  )
})
