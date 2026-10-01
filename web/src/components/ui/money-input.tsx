import { CURRENCIES, formatMoney, parseAmount, type AmountError, type CurrencyCode } from '@gulbahor/core'
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

export interface MoneyInputProps {
  id?: string
  /** Minor units: tiyin or cents. */
  value: number | null
  onChange: (value: number | null) => void
  currency?: CurrencyCode
  /** When given, typing "100$" or "100 so'm" switches the currency. */
  onCurrencyChange?: (currency: CurrencyCode) => void
  /** What "=" fills in: usually the amount still to be paid. */
  fillValue?: number
  invalid?: boolean
  disabled?: boolean
  placeholder?: string
  autoFocus?: boolean
  className?: string
}

const ERROR_KEYS: Record<AmountError, string> = {
  empty: 'input.amountInvalid',
  invalid: 'input.amountInvalid',
  negative: 'input.amountNegative',
  too_large: 'input.amountTooLarge',
  division_by_zero: 'input.divisionByZero',
  currency_conflict: 'input.currencyConflict',
  not_integer: 'input.amountInvalid',
}

/** A plain number being typed: digits, grouping spaces, at most one decimal mark with two digits. */
const PLAIN = /^[\d ]*(?:[.,]\d{0,2})?$/

const display = (minor: number | null, currency: CurrencyCode) =>
  minor === null ? '' : formatMoney(minor, currency, { symbol: false, group: ' ' })

/**
 * A money field. It groups thousands while you type, understands "250k",
 * "1,5 mln", "120000*3" and "1 500 000 - 10%", shows the result before you
 * commit, and reads any pasted format. The value it reports is always an
 * integer in minor units.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { id, value, onChange, currency = 'UZS', onCurrencyChange, fillValue, invalid, disabled, placeholder, autoFocus, className },
  forwardedRef,
) {
  const { t } = useTranslation()
  const ref = useRef<HTMLInputElement>(null)
  useImperativeHandle(forwardedRef, () => ref.current as HTMLInputElement)

  const [text, setText] = useState(() => display(value, currency))
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<AmountError | null>(null)

  // What this field last reported. A value that differs from it was set from outside
  // (a form reset, "fill the rest") and replaces whatever is in the field.
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
      setText(display(value, currency))
      setError(null)
    }
  }, [value, currency])

  // A new currency changes how the same amount is written.
  useEffect(() => {
    if (document.activeElement !== ref.current && emitted.current !== null) {
      setText(display(emitted.current, currency))
    }
  }, [currency])

  const parsed = text.trim() ? parseAmount(text) : null
  const preview = focused && parsed?.ok && (parsed.isExpression || !PLAIN.test(text.trim())) ? display(parsed.minor, parsed.currency ?? currency) : null

  const commit = () => {
    if (!text.trim()) {
      setError(null)
      emit(null)
      return
    }
    const result = parseAmount(text)
    if (!result.ok) {
      // The text stays as typed so it can be corrected; the field reports no value.
      setError(result.error)
      emit(null)
      return
    }
    setError(null)
    const nextCurrency = result.currency && result.currency !== currency && onCurrencyChange ? result.currency : currency
    if (nextCurrency !== currency) {
      onCurrencyChange?.(nextCurrency)
    }
    setText(display(result.minor, nextCurrency))
    emit(result.minor)
  }

  const pendingCaret = useRef<number | null>(null)

  const handleChange = (raw: string, caret: number | null) => {
    setError(null)
    if (!PLAIN.test(raw)) {
      setText(raw)
      return
    }
    const { text: grouped, caret: nextCaret } = regroup(raw, caret ?? raw.length)
    pendingCaret.current = nextCaret
    setText(grouped)
  }

  // Regrouping moves the digits; the caret goes back after the same digit in the same
  // commit that writes the new text, so the next keystroke always lands where it should.
  useLayoutEffect(() => {
    if (pendingCaret.current !== null && document.activeElement === ref.current) {
      ref.current?.setSelectionRange(pendingCaret.current, pendingCaret.current)
    }
    pendingCaret.current = null
  }, [text])

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commit()
      return
    }
    if (event.key === '=' && fillValue !== undefined && !text.trim()) {
      event.preventDefault()
      setText(display(fillValue, currency))
      emit(fillValue)
    }
  }

  const bad = invalid || !!error
  const symbol = CURRENCIES[currency].symbol

  return (
    <div className={cn('relative', className)}>
      <div
        className={cn(
          'flex h-8.5 w-full items-center rounded-md border border-line-strong bg-surface transition-colors hover:border-control',
          'focus-within:border-accent focus-within:outline-2 focus-within:outline-accent/25',
          bad && 'border-bad focus-within:border-bad focus-within:outline-bad/25',
          disabled && 'bg-sunken',
        )}
      >
        <input
          ref={ref}
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder ?? '0'}
          aria-invalid={bad || undefined}
          value={text}
          onChange={(event) => handleChange(event.target.value, event.target.selectionStart)}
          onFocus={(event) => {
            setFocused(true)
            event.target.select()
          }}
          onBlur={() => {
            setFocused(false)
            commit()
          }}
          onKeyDown={handleKeyDown}
          className="tabular h-full min-w-0 flex-1 bg-transparent pr-1 pl-2.5 text-right text-[13px] text-ink outline-none placeholder:text-ink-3 disabled:text-ink-3"
        />
        {onCurrencyChange ? (
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => onCurrencyChange(currency === 'UZS' ? 'USD' : 'UZS')}
            className="mr-1 flex h-6 shrink-0 items-center rounded px-1.5 text-xs font-medium text-ink-2 hover:bg-sunken"
          >
            {symbol}
          </button>
        ) : (
          <span className="shrink-0 pr-2.5 pl-1 text-xs text-ink-3 select-none">{symbol}</span>
        )}
      </div>
      {preview !== null ? (
        <div className="tabular pointer-events-none absolute top-full right-0 z-20 mt-1 rounded-md bg-ink px-2 py-1 text-xs font-medium text-surface shadow-float">
          = {preview} {CURRENCIES[parsed?.ok && parsed.currency ? parsed.currency : currency].symbol}
        </div>
      ) : error && error !== 'empty' ? (
        <div role="alert" className="absolute top-full right-0 z-20 mt-1 rounded-md bg-bad px-2 py-1 text-xs font-medium text-white shadow-float">
          {t(ERROR_KEYS[error])}
        </div>
      ) : null}
    </div>
  )
})

/** Re-groups the whole part into thousands and keeps the caret after the same digit. */
function regroup(raw: string, caret: number): { text: string; caret: number } {
  const significantBefore = raw.slice(0, caret).replace(/ /g, '').length
  const [whole, ...rest] = raw.replace(/ /g, '').split(/([.,])/)
  const trimmed = whole.replace(/^0+(?=\d)/, '')
  const dropped = whole.length - trimmed.length
  const grouped = trimmed.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  // A space typed after the number is the start of a calculation ("1 500 000 - 10%"); keep it.
  const trailing = /\d $/.test(raw) && caret === raw.length ? ' ' : ''
  const text = grouped + rest.join('') + trailing
  if (trailing) {
    return { text, caret: text.length }
  }

  let remaining = Math.max(0, significantBefore - Math.min(dropped, significantBefore))
  let position = 0
  while (position < text.length && remaining > 0) {
    if (text[position] !== ' ') {
      remaining--
    }
    position++
  }
  return { text, caret: position }
}
