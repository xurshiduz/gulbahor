import {
  formatMoney,
  ratesOf,
  type AccountDto,
  type AnyCurrency,
  type MoneyTransferDto,
  type PaymentAccountDto,
  type RateBook,
} from '@gulbahor/core'
import { useTranslation } from 'react-i18next'

import { Field } from '@/components/ui/field'
import { MoneyInput } from '@/components/ui/money-input'
import {
  agreedOf,
  currencyShort,
  moneyFor,
  pairSentence,
  rateText,
  valueLines,
  type ValuedLine,
} from '@/features/partners/payment-lines'
import { cn } from '@/lib/cn'

/**
 * Money carried from a place in one currency to a place in another: an
 * exchange. Its two sums are a pair, as in a payment: what leaves is the
 * anchor; what enters follows from the day's rate until it is typed over,
 * and then it is what the two sides agreed. Typed while nothing leaves yet,
 * it asks how much has to leave for it, and the rate says.
 */

/** What leaves, and what was typed for what enters: null while that is left to the day's rate. */
export interface ExchangeSums {
  amount: number | null
  received: number | null
}

/**
 * The exchange as it will be valued: the line of a payment whose money is
 * what leaves and whose settled sum is what enters. Null where nothing is
 * changed — one currency, or a place not picked yet.
 */
export function exchangeLine(
  from: Pick<AccountDto, 'id' | 'currency'> | null,
  toCurrency: AnyCurrency | null,
  sums: ExchangeSums,
  book: RateBook | null,
  /** How far from the day's rate this person may agree a sum, in percent. */
  limit: number,
): ValuedLine | null {
  if (!from || !toCurrency || from.currency === toCurrency) {
    return null
  }
  const row = { accountId: from.id, amount: sums.amount, rate: null, settled: sums.received }
  // A place money leaves always takes it here: whether it may is the server's to say.
  const place = { ...from, open: true, till: null } as PaymentAccountDto
  return valueLines([row], [place], toCurrency, book ?? ratesOf(null), limit)[0] ?? null
}

/** What typing the sum that enters makes of the pair. */
export function typeReceived(line: ValuedLine, sums: ExchangeSums, value: number | null, toCurrency: AnyCurrency) {
  if (value === null) {
    return { ...sums, received: null }
  }
  if (sums.amount) {
    return { ...sums, received: value }
  }
  const amount = moneyFor(line, value, toCurrency)
  return amount ? { amount, received: value } : { ...sums, received: null }
}

/** What the server is asked to take as agreed: nothing while the day's rate makes it. */
export const receivedOf = (line: ValuedLine | null): number | null => (line ? agreedOf(line) : null)

const money = (minor: number, currency: AnyCurrency) => formatMoney(minor, currency, { minor: 'auto' })

/** What a transfer moves: "1 000 $", or "1 000 $ → 7 250 ¥" where it is an exchange. */
export const transferSums = (transfer: Pick<MoneyTransferDto, 'amount' | 'currency' | 'toAmount' | 'toCurrency'>) =>
  money(transfer.amount, transfer.currency) +
  (transfer.toCurrency === transfer.currency ? '' : ` → ${money(transfer.toAmount, transfer.toCurrency)}`)

interface ReceivedFieldProps {
  line: ValuedLine
  sums: ExchangeSums
  toCurrency: AnyCurrency
  onChange: (sums: ExchangeSums) => void
  book: RateBook | null
  /** This person sets rates: an agreement however far from the day's is theirs to make. */
  setsRates: boolean
  error?: string
  label?: string
  /** The width of the sum's field; the whole of its place where it stands in a column of its own. */
  className?: string
}

/** What an agreed sum gives or costs against the day's rate, said under the pair; nothing while the rate makes it. */
export function ReceivedNote({
  line,
  book,
  setsRates,
  className,
}: Pick<ReceivedFieldProps, 'line' | 'book' | 'setsRates' | 'className'>) {
  const { t } = useTranslation()
  if (!line.agreed || line.gap < 0.1 || !line.dayRate) {
    return null
  }
  const base = ratesOf(book).base
  // Money leaving that is worth more than what enters is the business's loss.
  const gain = -line.fx
  const tooFar = line.strays && !setsRates
  return (
    <p data-agreed className={cn('text-xs', tooFar ? 'text-bad' : gain < 0 ? 'text-warn' : 'text-ok', className)}>
      {t(gain < 0 ? 'payments.agreedLoss' : 'payments.agreedGain', {
        agreed: line.rate ? rateText(line.rate) : '—',
        rate: rateText(line.dayRate),
        percent: String(line.gap).replace('.', ','),
        amount: money(Math.abs(gain), base),
      })}
      {tooFar ? ` ${t('payments.agreedTooFar')}` : ''}
    </p>
  )
}

/**
 * The second sum of a pair alone, for a row that has its first sum beside it and says the rate itself: named
 * for a reader of the screen, with no label of its own drawn.
 */
export function ReceivedInput({
  line,
  sums,
  toCurrency,
  onChange,
  setsRates,
  error,
  label,
  className,
  id,
}: Omit<ReceivedFieldProps, 'book'> & { id?: string }) {
  const tooFar = line.strays && !setsRates
  return (
    <MoneyInput
      id={id}
      aria-label={id ? undefined : label}
      value={line.settled}
      onChange={(value) => onChange(typeReceived(line, sums, value, toCurrency))}
      currency={toCurrency}
      disabled={!line.dayRate}
      invalid={!!error || tooFar}
      className={className}
    />
  )
}

/**
 * The second sum of an exchange, and under it the day's rate and what an
 * agreed sum gives or costs against it — said before the money is sent.
 */
export function ReceivedField({
  line,
  sums,
  toCurrency,
  onChange,
  book,
  setsRates,
  error,
  label,
  className = 'w-48',
}: ReceivedFieldProps) {
  const { t } = useTranslation()
  return (
    <Field
      label={label ?? t('money.exchangeIn', { currency: currencyShort(toCurrency, t) })}
      error={error}
      hint={
        line.pair && line.dayRate
          ? t('money.exchangeDayRate', { rate: pairSentence(line.pair, line.dayRate) })
          : t('payments.noRate')
      }
    >
      {(id) => (
        <div className="flex flex-col gap-1">
          <ReceivedInput
            id={id}
            line={line}
            sums={sums}
            toCurrency={toCurrency}
            onChange={onChange}
            setsRates={setsRates}
            error={error}
            className={className}
          />
          <ReceivedNote line={line} book={book} setsRates={setsRates} />
        </div>
      )}
    </Field>
  )
}
