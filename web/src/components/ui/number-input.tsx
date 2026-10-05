import { parseQuantity } from '@gulbahor/core'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

import { controlClass } from './input'

export interface NumberInputProps {
  id?: string
  value: number | null
  onChange: (value: number | null) => void
  /** 0 for goods counted in pieces; more for goods sold by weight or length. */
  decimals?: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  invalid?: boolean
  disabled?: boolean
  placeholder?: string
  autoFocus?: boolean
  className?: string
}

const display = (value: number | null, decimals: number) =>
  value === null ? '' : decimals ? String(Number(value.toFixed(decimals))).replace('.', ',') : String(value)

/**
 * A quantity field: "5*12" becomes 60, the arrow keys step up and down,
 * and piece goods refuse fractions.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { id, value, onChange, decimals = 0, min = 0, max, step = 1, suffix, invalid, disabled, placeholder, autoFocus, className },
  forwardedRef,
) {
  const { t } = useTranslation()
  const ref = useRef<HTMLInputElement>(null)
  useImperativeHandle(forwardedRef, () => ref.current as HTMLInputElement)

  const [text, setText] = useState(() => display(value, decimals))
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)

  const emitted = useRef<number | null>(value)
  const emit = (next: number | null) => {
    emitted.current = next
    if (next !== value) {
      onChange(next)
    }
  }

  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value
      setText(display(value, decimals))
      setError(null)
    }
  }, [value, decimals])

  const clamp = (next: number) => Math.min(max ?? Infinity, Math.max(min, next))

  const parsed = text.trim() ? parseQuantity(text, decimals) : null
  const preview = focused && parsed?.ok && parsed.isExpression ? display(parsed.value, decimals) : null

  const commit = () => {
    if (!text.trim()) {
      setError(null)
      emit(null)
      return
    }
    const result = parseQuantity(text, decimals)
    if (!result.ok) {
      setError(result.error === 'not_integer' ? t('input.quantityWhole') : t('input.amountInvalid'))
      emit(null)
      return
    }
    const next = clamp(result.value)
    setError(null)
    setText(display(next, decimals))
    emit(next)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commit()
      return
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const current = parsed?.ok ? parsed.value : (value ?? 0)
      const next = clamp(current + (event.key === 'ArrowUp' ? step : -step))
      setError(null)
      setText(display(next, decimals))
      emit(next)
    }
  }

  const bad = invalid || !!error

  return (
    <div className={cn('relative', className)}>
      {/* With a unit after it the frame is around both, so that a long unit takes its own room and never lies under the number. */}
      <div
        className={cn(
          suffix && 'flex h-8.5 items-center rounded-md border border-line-strong bg-surface transition-colors hover:border-control',
          suffix && 'focus-within:border-accent focus-within:outline-2 focus-within:outline-accent/25',
          suffix && bad && 'border-bad focus-within:border-bad focus-within:outline-bad/25',
          suffix && disabled && 'bg-sunken',
        )}
        onMouseDown={(event) => {
          // A press on the unit is a press on the field.
          if (suffix && event.target !== ref.current) {
            event.preventDefault()
            ref.current?.focus()
          }
        }}
      >
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode={decimals ? 'decimal' : 'numeric'}
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={bad || undefined}
        value={text}
        onChange={(event) => {
          setError(null)
          setText(event.target.value)
        }}
        onFocus={(event) => {
          setFocused(true)
          event.target.select()
        }}
        onBlur={() => {
          setFocused(false)
          commit()
        }}
        onKeyDown={handleKeyDown}
        className={cn(controlClass, 'tabular text-right', suffix && 'min-w-0 flex-1 border-0 bg-transparent pr-0 focus:outline-0')}
      />
      {suffix ? <span className="shrink-0 pr-2.5 pl-1.5 text-xs text-ink-3 select-none">{suffix}</span> : null}
      </div>
      {preview !== null ? (
        <div className="tabular pointer-events-none absolute top-full right-0 z-20 mt-1 rounded-md bg-ink px-2 py-1 text-xs font-medium text-surface shadow-float">
          = {preview}
        </div>
      ) : error ? (
        <div role="alert" className="absolute top-full right-0 z-20 mt-1 rounded-md bg-bad px-2 py-1 text-xs font-medium text-white shadow-float">
          {error}
        </div>
      ) : null}
    </div>
  )
})
