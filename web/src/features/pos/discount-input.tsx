import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'

/** How a number typed for a discount is meant: so many percent, or so much money. */
export type DiscountMode = 'percent' | 'amount'

/**
 * Which way a discount as it is written was meant: "10%" is a percentage, "5000" a sum. Null for an empty field
 * and for "=1 600 000" — the sum agreed on, which is neither.
 */
export function discountMode(text: string): DiscountMode | null {
  const written = text.trim()
  return !written || written.startsWith('=') ? null : written.endsWith('%') ? 'percent' : 'amount'
}

/** What the field shows of it: the number, without the unit the switch beside it names. */
export const discountShown = (text: string) => (discountMode(text) === 'percent' ? text.trim().slice(0, -1) : text)

/**
 * What typing `raw` writes while the switch stands at `mode`. A number takes the switch's unit; a "%" typed with
 * it turns the switch to percent; "=" names the sum agreed on, as ever.
 */
export function discountTyped(raw: string, mode: DiscountMode): { text: string; mode: DiscountMode } {
  const written = raw.trim()
  if (!written) {
    return { text: '', mode }
  }
  if (written.startsWith('=')) {
    return { text: raw, mode }
  }
  if (written.endsWith('%')) {
    return { text: written, mode: 'percent' }
  }
  return { text: mode === 'percent' ? `${written}%` : written, mode }
}

interface DiscountInputProps {
  /** The discount as it is kept: "10%", "5000", "=1 600 000" or nothing. */
  text: string
  onChange: (text: string) => void
  /** What a sum is counted in: stands on the switch beside "%". */
  unit: string
  invalid?: boolean
  className?: string
}

/**
 * A discount, with a switch that says how the number is meant: percent — as the field starts — or money. The
 * cashier types "10" and picks which; nothing has to be remembered about a "%" at the end, though one typed
 * turns the switch by itself.
 */
export function DiscountInput({ text, onChange, unit, invalid, className }: DiscountInputProps) {
  const { t } = useTranslation()
  const field = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<DiscountMode>(() => discountMode(text) ?? 'percent')
  // Written from elsewhere — a cart kept from before, a line's own sum — the switch says what stands there.
  const written = discountMode(text)
  const mode = written ?? picked

  const turn = (next: DiscountMode) => {
    setPicked(next)
    if (written && written !== next) {
      // The number stays, and is meant the other way.
      onChange(next === 'percent' ? `${text.trim()}%` : text.trim().slice(0, -1))
    }
    field.current?.focus()
  }

  return (
    <Input
      ref={field}
      value={discountShown(text)}
      inputMode="decimal"
      placeholder="0"
      invalid={invalid}
      onChange={(event) => {
        const next = discountTyped(event.target.value, mode)
        setPicked(next.mode)
        onChange(next.text)
      }}
      className={cn('text-right', className)}
      suffix={
        <span role="radiogroup" aria-label={t('pos.discountMode')} className="mr-0.5 flex shrink-0 gap-px">
          {(['percent', 'amount'] as const).map((each) => (
            <button
              key={each}
              type="button"
              role="radio"
              aria-checked={mode === each}
              data-discount-mode={each}
              // Reached with the mouse: Tab and Enter walk the fields, not their switches.
              tabIndex={-1}
              title={t(each === 'percent' ? 'pos.discountPercent' : 'pos.discountAmount')}
              onClick={() => turn(each)}
              className={cn(
                'h-6.5 rounded px-1.5 text-xs transition-colors',
                mode === each
                  ? 'bg-accent-soft font-medium text-accent-ink'
                  : 'text-ink-3 hover:bg-sunken hover:text-ink',
              )}
            >
              {each === 'percent' ? '%' : unit}
            </button>
          ))}
        </span>
      }
    />
  )
}
