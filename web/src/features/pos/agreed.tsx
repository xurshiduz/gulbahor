import { formatMoney } from '@gulbahor/core'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Shortcut } from '@/components/ui/feedback'
import { MoneyInput } from '@/components/ui/money-input'

import { agreedOf, agreedText, badDiscount, roundTotals } from './pos-state'

const plain = (minor: number) => formatMoney(minor, 'UZS', { symbol: false, group: ' ' })

interface AgreedSumProps {
  /** The sale's discount as it is written: "10%", "5000" or "=1 600 000". */
  text: string
  /** What the goods come to after their own discounts. */
  base: number
  onChange: (text: string) => void
}

/**
 * "Make it a round 1 600 000." The customer names the sum; the cashier
 * types it, or picks one of the round sums offered, and what comes off is
 * whatever is left. It is written into the same field a discount is.
 */
export const AgreedSum = forwardRef<HTMLInputElement, AgreedSumProps>(function AgreedSum(
  { text, base, onChange },
  ref,
) {
  const { t } = useTranslation()
  const agreed = agreedOf(text)

  return (
    <>
      <div className="mt-2 flex items-center justify-between gap-3 text-[13px] text-ink-3">
        <span className="flex items-center gap-1.5">
          {t('pos.agreed')}
          <Shortcut combo="f3" />
        </span>
        <MoneyInput
          ref={ref}
          value={agreed}
          onChange={(sum) => onChange(sum === null ? '' : agreedText(sum))}
          placeholder={plain(base)}
          invalid={agreed !== null && badDiscount(text, base)}
          className="w-36"
        />
      </div>
      <div className="mt-1.5 flex justify-end gap-1.5">
        {roundTotals(base).map((sum) => (
          <button
            key={sum}
            type="button"
            tabIndex={-1}
            onClick={() => onChange(agreedText(sum))}
            className="tabular rounded-md border border-line px-2 py-0.5 text-xs text-ink-2 hover:border-line-strong hover:bg-sunken"
          >
            {plain(sum)}
          </button>
        ))}
      </div>
    </>
  )
})
