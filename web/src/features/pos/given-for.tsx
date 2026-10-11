import { formatMoney, overChangeLoss, tillWorth, type AnyCurrency, type RateBook } from '@erp/core'
import { useTranslation } from 'react-i18next'

import { MoneyInput } from '@/components/ui/money-input'
import { base, baseWords } from '@/lib/base'
import { cn } from '@/lib/cn'

const money = (minor: number) => formatMoney(minor, base(), { minor: 'auto' })
const plain = (minor: number) => formatMoney(minor, base(), { symbol: false, group: ' ' })

interface GivenForProps {
  /** The notes handed over, in their smallest coin; null while none have been typed. */
  amount: number | null
  currency: AnyCurrency
  /** What they are handed over for, in the base, where that was typed; null: the day's rate, or what is left. */
  value: number | null
  book: RateBook
  /** What is left to hand back once the other rows have given theirs. */
  rest: number
  /** How far under the rate a cashier may give alone, in percent. */
  limit: number
  /** Someone at the shop can allow more with their PIN. */
  mayAsk: boolean
  /** This person may go past the limit on their own word. */
  alone: boolean
  onChange: (value: number | null) => void
}

/**
 * What notes of another currency go back for when nothing is typed: what the day's rate makes them — or, when
 * that is more than there is left to give, what is left: "two dollars for the 25 000".
 */
export function givenWorth(
  amount: number,
  currency: AnyCurrency,
  value: number | null,
  rest: number,
  book: RateBook,
): number | null {
  const atRate = tillWorth(amount, currency, book)
  return value ?? (atRate !== null && rest > 0 && atRate > rest ? rest : atRate)
}

function reading({ amount, currency, value, book, rest, limit, alone }: GivenForProps) {
  const atRate = amount ? tillWorth(amount, currency, book) : null
  const worth = amount ? givenWorth(amount, currency, value, rest, book) : null
  const fx = worth !== null && atRate !== null ? worth - atRate : 0
  const far =
    !alone && !!amount && worth !== null && overChangeLoss([{ way: 'cash', currency, amount, base: worth, fx }], limit)
  return { atRate, worth, fx, far }
}

/**
 * The second sum of the pair where money goes back to the customer: what the notes are handed over for, in the
 * base. Left empty it is what the rate makes them (or what is left to give), shown faintly; typed, what was agreed.
 */
export function GivenInput(props: GivenForProps) {
  const { t } = useTranslation()
  const { amount, value, rest, onChange } = props
  const { atRate, worth, far } = reading(props)
  return (
    <MoneyInput
      aria-label={t('pos.takenFor', baseWords(t))}
      value={amount ? value : null}
      // Typed as what the rate makes it, nothing was agreed; nor is anything agreed for no notes.
      onChange={(next) => onChange(next === null || next === atRate || !amount ? null : next)}
      currency={base()}
      placeholder={worth === null ? undefined : plain(worth)}
      fillValue={rest}
      invalid={far}
    />
  )
}

/** What that gives or costs the shop against the day's rate, said under the pair. */
export function GivenNote(props: GivenForProps) {
  const { t } = useTranslation()
  const { limit, mayAsk } = props
  const { atRate, fx, far } = reading(props)
  return (
    <>
      {fx && atRate !== null ? (
        <p className={cn('tabular text-right text-xs', fx > 0 ? 'text-ok' : far ? 'text-bad' : 'text-warn')}>
          {t(fx > 0 ? 'pos.changeRateGain' : 'pos.changeRateLoss', {
            book: money(atRate),
            amount: money(Math.abs(fx)),
          })}
        </p>
      ) : null}
      {far ? (
        <p className="text-right text-xs text-bad">
          {t(mayAsk ? 'pos.rateLossAsk' : 'pos.changeLossStop', { percent: String(limit).replace('.', ',') })}
        </p>
      ) : null}
    </>
  )
}
