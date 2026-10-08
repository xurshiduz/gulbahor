import { CURRENCIES, receiptRateWay, type AnyCurrency } from '@erp/core'
import { useTranslation } from 'react-i18next'

import { Field } from '@/components/ui/field'
import { NumberInput } from '@/components/ui/number-input'
import { base } from '@/lib/base'
import { formatNumber } from '@/lib/format'

interface ReceiptRateFieldProps {
  currency: AnyCurrency
  value: number | null
  onChange: (rate: number | null) => void
  /** The day's rate, the same way round: shown beside a rate typed otherwise. */
  dayRate: number | null
  error?: string
  disabled?: boolean
}

/**
 * The one rate a receipt in another currency asks for, written the way the
 * business writes its rates, the dearer first: "1 ¥ = ? so'm", or in a dollar
 * business "1 $ = ? ¥".
 */
export function ReceiptRateField({ currency, value, onChange, dayRate, error, disabled }: ReceiptRateFieldProps) {
  const { t } = useTranslation()
  const [one, of] = receiptRateWay(currency, base()) === 'in' ? [currency, base()] : [base(), currency]
  return (
    <Field
      label={t('receipts.rate', { one: CURRENCIES[one].symbol, of: CURRENCIES[of].symbol })}
      hint={dayRate !== null && dayRate !== value ? t('receipts.dayRate', { rate: formatNumber(dayRate) }) : undefined}
      error={error}
      required
    >
      {(id) => (
        <NumberInput
          id={id}
          value={value}
          onChange={onChange}
          decimals={6}
          suffix={CURRENCIES[of].symbol}
          invalid={!!error}
          disabled={disabled}
        />
      )}
    </Field>
  )
}
