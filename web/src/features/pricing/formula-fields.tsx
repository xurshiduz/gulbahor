import type { AnyCurrency, PriceFormula } from '@erp/core'
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/controls'
import { MoneyInput } from '@/components/ui/money-input'
import { NumberInput } from '@/components/ui/number-input'

/**
 * How a formula is entered: what the price is worked out from and which way it goes — or `none`, where nothing
 * is worked out (a price type kept by hand, a rule that says nothing of this type, "by the rules").
 */
export type FormulaWay = 'none' | 'cost' | 'retail_less' | 'retail_more' | 'fixed'

export interface FormulaRow {
  way: FormulaWay
  /** Never negative: the way says the direction. */
  percent: number | null
  /** The sum beside the percentage — the way says whether it is added or taken off — or the price named outright. */
  amount: number | null
}

export const NO_FORMULA: FormulaRow = { way: 'none', percent: null, amount: null }

export function formulaRowOf(formula: PriceFormula | null | undefined): FormulaRow {
  if (!formula) {
    return NO_FORMULA
  }
  if (formula.base === 'fixed') {
    return { way: 'fixed', percent: null, amount: formula.amount }
  }
  const down = formula.base === 'retail' && (formula.percent < 0 || (!formula.percent && formula.amount < 0))
  return {
    way: formula.base === 'cost' ? 'cost' : down ? 'retail_less' : 'retail_more',
    percent: Math.abs(formula.percent) || null,
    amount: Math.abs(formula.amount) || null,
  }
}

/** The formula a row stands for; null where nothing is to be worked out, or a price is named and none was typed. */
export function formulaOf(row: FormulaRow): PriceFormula | null {
  if (row.way === 'none') {
    return null
  }
  if (row.way === 'fixed') {
    return row.amount ? { base: 'fixed', percent: 0, amount: row.amount } : null
  }
  const sign = row.way === 'retail_less' ? -1 : 1
  return {
    base: row.way === 'cost' ? 'cost' : 'retail',
    // Nothing is nothing, whichever way it points: never "minus zero".
    percent: row.percent ? sign * row.percent : 0,
    amount: row.amount ? sign * row.amount : 0,
  }
}

interface FormulaFieldsProps {
  value: FormulaRow
  onChange: (value: FormulaRow) => void
  /** What the sums are in: the price type's currency. */
  currency: AnyCurrency
  /** What "nothing is worked out" is called here: "Qo‘lda", "—", "Qoidalar bo‘yicha". */
  noneLabel: string
  /** The ways offered. The retail price is never worked out from itself; a price type names no price outright. */
  ways?: readonly FormulaWay[]
  invalid?: boolean
  autoFocus?: boolean
}

const ALL: readonly FormulaWay[] = ['none', 'cost', 'retail_less', 'retail_more', 'fixed']

/**
 * A formula as three fields in a row: what the price is worked out from, by how many percent, and with what sum —
 * "Tannarxdan · 30% · + 5 000", "Chakanadan arzon · 15%", "Belgilangan narx · 180 000".
 */
export function FormulaFields({
  value,
  onChange,
  currency,
  noneLabel,
  ways = ALL,
  invalid,
  autoFocus,
}: FormulaFieldsProps) {
  const { t } = useTranslation()
  const labels: Record<FormulaWay, string> = {
    none: noneLabel,
    cost: t('pricing.wayCost'),
    retail_less: t('pricing.wayRetailLess'),
    retail_more: t('pricing.wayRetailMore'),
    fixed: t('pricing.wayFixed'),
  }
  const worked = value.way === 'cost' || value.way === 'retail_less' || value.way === 'retail_more'

  return (
    <div data-formula className="grid items-start gap-2 sm:grid-cols-[minmax(11rem,1.4fr)_7rem_minmax(8rem,1fr)]">
      <Select
        value={value.way}
        onChange={(way) => onChange({ ...value, way: way as FormulaWay })}
        options={ways.map((way) => ({ value: way, label: labels[way] }))}
      />
      {worked ? (
        <NumberInput
          autoFocus={autoFocus}
          value={value.percent}
          onChange={(percent) => onChange({ ...value, percent })}
          decimals={2}
          max={value.way === 'retail_less' ? 99 : 10_000}
          suffix="%"
          placeholder="0"
          invalid={invalid}
        />
      ) : (
        <span />
      )}
      {value.way === 'none' ? (
        <span />
      ) : (
        <MoneyInput
          value={value.amount}
          onChange={(amount) => onChange({ ...value, amount })}
          currency={currency}
          // Beside a percentage the sum is extra; alone, it is the price.
          placeholder={worked ? t(value.way === 'retail_less' ? 'pricing.sumOff' : 'pricing.sumOn') : undefined}
          invalid={invalid && value.way === 'fixed'}
          aria-label={value.way === 'fixed' ? t('pricing.wayFixed') : t('pricing.amount')}
        />
      )}
    </div>
  )
}
