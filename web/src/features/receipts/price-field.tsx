import {
  CURRENCIES,
  formatMoney,
  formulaText,
  parsePriceEntry,
  priceBy,
  type AnyCurrency,
  type LinePrice,
  type PriceRounding,
  type ReceiptPrice,
} from '@erp/core'
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { PLAIN, regroup } from '@/components/ui/money-input'
import { cn } from '@/lib/cn'

interface PriceFieldProps {
  id?: string
  /** What is typed: a sum, a formula, or nothing. */
  value: LinePrice | null
  onChange: (value: LinePrice | null) => void
  currency: AnyCurrency
  /** What the receipt makes of the field as it stands (`receiptPrice`). */
  worked: ReceiptPrice
  /** The model's price of this type now. */
  standing: number | null
  /** What a formula typed here starts from, and how what it gives is rounded: the answer is shown as it is typed. */
  basis: { cost: number | null; retail: number | null }
  rounding: PriceRounding
  /** The retail price's own field: it is not worked out from itself. */
  ownRetail?: boolean
  disabled?: boolean
}

type Problem = 'below_cost' | 'invalid' | 'circular'

const PROBLEMS: Record<Problem, string> = {
  below_cost: 'receipts.priceBelowCost',
  invalid: 'receipts.priceInvalid',
  circular: 'receipts.priceCircular',
}

const same = (a: LinePrice | null, b: LinePrice | null) => JSON.stringify(a) === JSON.stringify(b)

/**
 * A selling price on a receipt. A sum is typed as anywhere else ("250 000", "250k"); a formula is typed as it is
 * said — "30%", "+5 000", "30% + 5 000" from what the goods cost, "ch −15%" from the retail price — and is worked
 * out again whenever the cost changes. Left empty, the field shows what posting will do by itself: the price a
 * rule gives new goods, in full and marked with where it comes from, or, faintly, the price that stands.
 * "=" takes what is offered and makes it a typed sum.
 */
export function PriceField({
  id,
  value,
  onChange,
  currency,
  worked,
  standing,
  basis,
  rounding,
  ownRetail,
  disabled,
}: PriceFieldProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<Problem | null>(null)

  const sum = (minor: number) => formatMoney(minor, currency, { symbol: false, group: ' ' })
  const typedText = () =>
    value === null ? '' : 'amount' in value ? sum(value.amount) : formulaText(value.formula, currency, true)

  // What stands in the field while nobody is typing: the sum typed, or what a formula — typed, or a rule's — gives.
  const set = value && 'amount' in value ? value.amount : worked.price
  const offered = worked.offered ?? (value === null ? worked.price : null)
  const mark =
    value && 'formula' in value
      ? formulaText(value.formula, currency, true)
      : value === null && worked.price !== null && worked.source
        ? t(`receipts.source.${worked.source}`)
        : null
  // A price that stands and is left alone shows faintly — and says what it is, so that it is not taken for
  // something this receipt typed or is about to set.
  const stands = value === null && set === null && standing !== null

  const read = (typed: string): { entry: LinePrice | null } | { problem: Problem } => {
    const result = parsePriceEntry(typed)
    if (!result.ok) {
      return { problem: result.error }
    }
    if (ownRetail && result.entry && 'formula' in result.entry && result.entry.formula.base === 'retail') {
      return { problem: 'circular' }
    }
    return { entry: result.entry }
  }

  const commit = () => {
    const result = read(text)
    if ('problem' in result) {
      // The text stays as typed so that it can be put right; what the field held before stands meanwhile.
      setProblem(result.problem)
      return
    }
    setProblem(null)
    if (!same(result.entry, value)) {
      onChange(result.entry)
    }
  }

  const pendingCaret = useRef<number | null>(null)
  const handleChange = (raw: string, caret: number | null) => {
    setProblem(null)
    if (!PLAIN.test(raw)) {
      setText(raw)
      return
    }
    const { text: grouped, caret: nextCaret } = regroup(raw, caret ?? raw.length)
    pendingCaret.current = nextCaret
    setText(grouped)
  }
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
    if (event.key === '=' && offered !== null && !text.trim()) {
      event.preventDefault()
      setText(sum(offered))
      onChange({ amount: offered })
    }
  }

  // What the text being typed comes to, said before it is taken.
  const typing = focused && text.trim() ? read(text.trim()) : null
  const entry = typing && 'entry' in typing ? typing.entry : null
  const preview =
    entry && 'formula' in entry
      ? priceBy(entry.formula, basis, rounding)
      : entry && !PLAIN.test(text.trim())
        ? entry.amount
        : null

  const editing = focused || problem !== null
  const symbol = CURRENCIES[currency].symbol

  return (
    <div className="relative" data-price-field data-source={value === null ? (worked.source ?? undefined) : 'typed'}>
      <div
        className={cn(
          'flex h-8.5 w-full items-center rounded-md border border-line-strong bg-surface transition-colors hover:border-control',
          'focus-within:border-accent focus-within:outline-2 focus-within:outline-accent/25',
          problem && 'border-bad focus-within:border-bad focus-within:outline-bad/25',
          disabled && 'bg-sunken',
        )}
      >
        {mark && !editing ? (
          <span
            data-price-mark
            title={mark}
            onClick={() => ref.current?.focus()}
            className="min-w-0 shrink truncate pl-1.5 text-[11px] text-accent-ink select-none"
          >
            {mark}
          </span>
        ) : stands && !editing ? (
          <span
            data-price-mark="standing"
            title={t('receipts.standingHint')}
            onClick={() => ref.current?.focus()}
            className="min-w-0 shrink truncate pl-1.5 text-[11px] text-ink-3 select-none"
          >
            {t('receipts.standing')}
          </span>
        ) : null}
        <input
          ref={ref}
          id={id}
          type="text"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={problem ? true : undefined}
          value={editing ? text : set === null ? '' : sum(set)}
          placeholder={standing !== null ? sum(standing) : offered !== null ? sum(offered) : '0'}
          onChange={(event) => handleChange(event.target.value, event.target.selectionStart)}
          onFocus={(event) => {
            if (!problem) {
              setText(typedText())
            }
            setFocused(true)
            const input = event.target
            window.setTimeout(() => input.select())
          }}
          onBlur={() => {
            setFocused(false)
            commit()
          }}
          onKeyDown={handleKeyDown}
          className="tabular h-full min-w-[4.75rem] flex-1 bg-transparent pr-1 pl-1.5 text-right text-[13px] text-ink outline-none placeholder:text-ink-3 disabled:text-ink-3"
        />
        <span className="shrink-0 pr-2 pl-0.5 text-xs text-ink-3 select-none">{symbol}</span>
      </div>
      {problem ? (
        <div
          role="alert"
          className="absolute top-full right-0 z-20 mt-1 w-56 rounded-md bg-bad px-2 py-1 text-xs font-medium text-white shadow-float"
        >
          {t(problem === 'below_cost' && ownRetail ? 'receipts.priceBelowCostRetail' : PROBLEMS[problem])}
        </div>
      ) : preview !== null ? (
        <div className="tabular pointer-events-none absolute top-full right-0 z-20 mt-1 rounded-md bg-ink px-2 py-1 text-xs font-medium whitespace-nowrap text-surface shadow-float">
          = {sum(preview)} {symbol}
        </div>
      ) : focused && !text.trim() ? (
        <div
          data-price-hint
          className="pointer-events-none absolute top-full right-0 z-20 mt-1 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-surface shadow-float"
        >
          {t(ownRetail ? 'receipts.priceHintRetail' : 'receipts.priceHint')}
        </div>
      ) : null}
    </div>
  )
}
