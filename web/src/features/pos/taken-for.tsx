import { formatMoney, overRateLoss, rateGain, toBase, type Tender } from '@gulbahor/core'
import { useTranslation } from 'react-i18next'

import { MoneyInput } from '@/components/ui/money-input'
import { cn } from '@/lib/cn'

const money = (minor: number) => formatMoney(minor, 'UZS', { minor: 'auto' })
const plain = (minor: number) => formatMoney(minor, 'UZS', { symbol: false, group: ' ' })

interface TakenForProps {
  /** The dollars tendered, in cents; null while none have been typed yet. */
  dollars: number | null
  /** What they were agreed to be worth, in so'm; null while they are worth what the rate makes them. */
  value: number | null
  rate: number
  /** What is left of the sale once the other tenders have paid theirs: what "=" fills in. */
  rest: number
  /** How far over the rate a cashier may go alone, in percent. */
  limit: number
  /** Someone at the shop can allow more with their PIN. */
  mayAsk: boolean
  /** This person may go over the limit on their own word. */
  alone: boolean
  onChange: (value: number | null) => void
}

/** What the dollars come to against the day's rate, and whether that is further than this person may go alone. */
function reading({
  dollars,
  value,
  rate,
  limit,
  alone,
}: Pick<TakenForProps, 'dollars' | 'value' | 'rate' | 'limit' | 'alone'>) {
  const tender: Tender | null = dollars ? { method: 'cash', currency: 'USD', amount: dollars, value } : null
  return {
    book: dollars ? toBase(dollars, 'USD', rate) : null,
    gain: tender ? rateGain(tender, rate) : 0,
    over: !alone && !!tender && overRateLoss([tender], rate, limit),
  }
}

/**
 * The second sum of the pair: what the dollars are taken for, in so'm. Left empty they are worth what the day's
 * rate makes them, which the field shows faintly; typed over, it is what the customer and the shop agreed.
 */
export function TakenInput({ className, ...props }: TakenForProps & { className?: string }) {
  const { t } = useTranslation()
  const { dollars, value, rest, onChange } = props
  const { book, over } = reading(props)
  return (
    <MoneyInput
      aria-label={t('pos.takenFor')}
      value={dollars ? value : null}
      // Typed as what the rate makes them, nothing was agreed; nor is anything agreed for no dollars.
      onChange={(next) => onChange(next === null || next === book || !dollars ? null : next)}
      placeholder={book === null ? undefined : plain(book)}
      fillValue={rest}
      invalid={over}
      className={className}
    />
  )
}

/** What an agreed worth gives or costs against the day's rate, said under the pair. */
export function TakenNote(props: TakenForProps) {
  const { t } = useTranslation()
  const { dollars, value, limit, mayAsk } = props
  const { gain, over } = reading(props)
  return (
    <>
      {dollars && value !== null && gain ? (
        <p className={cn('tabular text-right text-xs', gain > 0 ? 'text-ok' : over ? 'text-bad' : 'text-warn')}>
          {t(gain > 0 ? 'pos.rateGain' : 'pos.rateLoss', {
            // So'm for a dollar, as the agreed worth makes it.
            rate: formatMoney(Math.round((value * 100) / dollars), 'UZS', { minor: 'auto', symbol: false }),
            amount: money(Math.abs(gain)),
          })}
        </p>
      ) : null}
      {over ? (
        <p className="text-right text-xs text-bad">
          {t(mayAsk ? 'pos.rateLossAsk' : 'pos.rateLossStop', { percent: String(limit).replace('.', ',') })}
        </p>
      ) : null}
    </>
  )
}

/**
 * "Call the 50 dollars 600 000." Under the dollars a cashier types what the
 * customer and the shop agreed they are worth; left empty they are worth
 * what the day's rate makes them, which the field shows faintly. The
 * difference is the rate's: the shop's gain or its loss, never the sale's.
 */
export function TakenFor(props: TakenForProps) {
  const { t } = useTranslation()
  return (
    <div data-enter-skip className="flex flex-col gap-1">
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-ink-3">{t('pos.takenFor')}</span>
        <TakenInput {...props} className="w-40" />
      </div>
      <TakenNote {...props} />
    </div>
  )
}
