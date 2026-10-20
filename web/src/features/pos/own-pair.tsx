import { CURRENCIES, exchange, formatMoney, tillWorth, type AnyCurrency, type RateBook } from '@erp/core'
import { useTranslation } from 'react-i18next'

import { MoneyInput } from '@/components/ui/money-input'
import { base, baseWords } from '@/lib/base'

import { RATE, UNDER } from './tender-grid'

const money = (minor: number) => formatMoney(minor, base(), { minor: 'auto' })
const plain = (minor: number) => formatMoney(minor, base(), { symbol: false, group: ' ' })

/** The two sums of a customer's balance kept in another currency than the sale. */
export interface OwnSums {
  /** In the balance's own currency, where it was typed; null: what the rate makes of `value`. */
  own: number | null
  /** In the sale's money. */
  value: number | null
}

interface OwnPairProps {
  id?: string
  /** What the first sum is, for a reader of the screen (a row with a label of its own passes `id` instead). */
  label?: string
  currency: AnyCurrency
  book: RateBook
  /** In the balance's own currency: typed, or what the rate makes of `value`. */
  own: number | null
  /** `own` was typed: a worth typed after it is agreed for it, as with notes of another currency. */
  typed: boolean
  /** In the sale's money: what goes on the balance, or comes off it. */
  value: number | null
  /** What is left for this row to take, in the sale's money: what "=" fills in. */
  room: number
  /** The most of the balance's own that "=" offers: what is theirs there, where that is spent first. */
  ownMost?: number | null
  invalid?: boolean
  /** The pair lies further from the day's rate than this person may agree alone. */
  strays?: boolean
  onChange: (sums: OwnSums) => void
}

/**
 * A balance kept in another currency, written as cash of that currency is: its own sum first, then the day's
 * rate, then what that is in the sale's money — the same three columns as every row of money above it. The
 * first sum is the anchor: typed, the second follows from the rate; the second typed over it is what was
 * agreed for it. Typed alone, the second asks how much of the balance's own it comes to, and the rate says.
 */
export function OwnPair({
  id,
  label,
  currency,
  book,
  own,
  typed,
  value,
  room,
  ownMost = null,
  invalid,
  strays,
  onChange,
}: OwnPairProps) {
  const { t } = useTranslation()
  const unit = tillWorth(100, currency, book)
  // What rounding to the balance's smallest coin leaves is nobody's agreement: a sum within a coin of what is
  // left to take stands for all of it.
  const coin = Math.ceil(tillWorth(1, currency, book) ?? 0)
  const worthOf = (sum: number) => {
    const atRate = tillWorth(sum, currency, book) ?? 0
    return room > 0 && Math.abs(atRate - room) < coin ? room : atRate
  }
  const covers = room > 0 ? (exchange(room, base(), currency, book) ?? 0) : 0
  const fill = ownMost === null ? covers : Math.min(ownMost, covers)
  return (
    <>
      <MoneyInput
        id={id}
        aria-label={id ? undefined : label}
        value={own}
        // Typed again as it stands, nothing changes: a worth agreed for it is not lost to a Tab.
        onChange={(next) => {
          if (next !== own) {
            onChange(next ? { own: next, value: worthOf(next) } : { own: null, value: null })
          }
        }}
        currency={currency}
        fillValue={fill || undefined}
        invalid={invalid}
        disabled={unit === null}
        placeholder={unit === null ? t('pos.noRateShort') : undefined}
      />
      {unit !== null ? (
        <>
          <span className={RATE} title={`1 ${CURRENCIES[currency].symbol} = ${money(unit)}`}>
            {plain(unit)}
          </span>
          <span className={UNDER}>{t('pos.takenFor', baseWords(t))}</span>
          {/* The second sum of the pair is a Tab away: Enter walks the first. */}
          <div data-enter-skip>
            <MoneyInput
              aria-label={t('pos.takenFor', baseWords(t))}
              value={value}
              onChange={(next) => {
                if (next === value) {
                  return
                }
                if (next === null) {
                  // Taken away, a sum typed in the balance's own goes for what the rate makes it again.
                  onChange(typed && own ? { own, value: worthOf(own) } : { own: null, value: null })
                } else {
                  onChange({ own: typed ? own : null, value: next })
                }
              }}
              currency={base()}
              fillValue={room || undefined}
              invalid={strays}
            />
          </div>
        </>
      ) : null}
    </>
  )
}
