import { formatMoney, overRateLoss, rateGain, tillWorth, type AnyCurrency, type RateBook, type Tender } from '@erp/core'
import { useTranslation } from 'react-i18next'

import { MoneyInput } from '@/components/ui/money-input'
import { base, baseWords } from '@/lib/base'
import { cn } from '@/lib/cn'

const money = (minor: number) => formatMoney(minor, base(), { minor: 'auto' })
const plain = (minor: number) => formatMoney(minor, base(), { symbol: false, group: ' ' })

interface TakenForProps {
  /** The money tendered, in its smallest coin; null while none has been typed yet. */
  amount: number | null
  currency: AnyCurrency
  /** What it was agreed to be worth, in the base; null while it is worth what the rate makes it. */
  value: number | null
  book: RateBook
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

/** What the money comes to against the day's rate, and whether that is further than this person may go alone. */
function reading({
  amount,
  currency,
  value,
  book,
  limit,
  alone,
}: Pick<TakenForProps, 'amount' | 'currency' | 'value' | 'book' | 'limit' | 'alone'>) {
  const tender: Tender | null = amount ? { method: 'cash', currency, amount, value } : null
  return {
    worth: amount ? tillWorth(amount, currency, book) : null,
    gain: tender ? rateGain(tender, book) : 0,
    over: !alone && !!tender && overRateLoss([tender], book, limit),
  }
}

/**
 * The second sum of the pair: what the dollars are taken for, in so'm. Left empty they are worth what the day's
 * rate makes them, which the field shows faintly; typed over, it is what the customer and the shop agreed.
 */
export function TakenInput({ className, ...props }: TakenForProps & { className?: string }) {
  const { t } = useTranslation()
  const { amount, value, rest, onChange } = props
  const { worth, over } = reading(props)
  return (
    <MoneyInput
      aria-label={t('pos.takenFor', baseWords(t))}
      value={amount ? value : null}
      // Typed as what the rate makes it, nothing was agreed; nor is anything agreed for no money.
      onChange={(next) => onChange(next === null || next === worth || !amount ? null : next)}
      placeholder={worth === null ? undefined : plain(worth)}
      fillValue={rest}
      invalid={over}
      className={className}
    />
  )
}

/** What an agreed worth gives or costs against the day's rate, said under the pair. */
export function TakenNote(props: TakenForProps) {
  const { t } = useTranslation()
  const { amount, value, limit, mayAsk } = props
  const { gain, over } = reading(props)
  return (
    <>
      {amount && value !== null && gain ? (
        <p className={cn('tabular text-right text-xs', gain > 0 ? 'text-ok' : over ? 'text-bad' : 'text-warn')}>
          {t(gain > 0 ? 'pos.rateGain' : 'pos.rateLoss', {
            // The base for one of it, as the agreed worth makes it.
            rate: formatMoney(Math.round((value * 100) / amount), base(), { minor: 'auto', symbol: false }),
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
        <span className="text-xs text-ink-3">{t('pos.takenFor', baseWords(t))}</span>
        <TakenInput {...props} className="w-40" />
      </div>
      <TakenNote {...props} />
    </div>
  )
}
