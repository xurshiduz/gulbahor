import {
  amountFor,
  CURRENCIES,
  dayPairRate,
  formatCardNumber,
  formatMoney,
  pairBook,
  pairRate,
  rateGap,
  ratesOf,
  settledFor,
  settleLine,
  straysFromRate,
  type AnyCurrency,
  type Pair,
  type PaymentAccountDto,
  type PayTill,
  type Rates,
} from '@gulbahor/core'
import type { TFunction } from 'i18next'
import { X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Select } from '@/components/ui/controls'
import { Field } from '@/components/ui/field'
import { MoneyInput } from '@/components/ui/money-input'
import { NumberInput } from '@/components/ui/number-input'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'

/**
 * The lines of a payment. Every place the money usually goes through has
 * its line ready: nothing is picked, a sum is typed where it belongs and
 * the rest is left empty. Where a place is in another currency than the one
 * being settled, the line has two fields side by side: what went through
 * it, and what that settles.
 *
 * The two are a pair, and the first is the anchor: it is the money that was
 * handed over, and nothing but the person typing it ever changes it. Typed,
 * it works the second out from the rate. The second may then be typed over
 * — "take these 100 dollars for 1 200 000" — and both stand as they were
 * said; the rate is what they make between them, and what lies between
 * that and the day's rate is shown under the line as gained or given away.
 * Typing the total works out the line in the partner's own currency.
 */

export interface PaymentRow {
  accountId: string
  /** In the account's currency: what went through it. */
  amount: number | null
  /** So'm for a dollar, typed by someone who sets rates; null for the day's. */
  rate: number | null
  /** What the line settles, typed over what the rate made it; null while it is left to the rate. */
  settled: number | null
}

/** More lines than this are not laid out unasked: the rest are a pick away. */
export const READY_ROWS = 6

const KEPT_KEY = 'gb.pay.accounts'
const PICKED_KEY = 'gb.pay.till'
/** The till this computer sells at, as the till screen keeps it. */
const TILL_KEY = 'gb.pos.register'

function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** The places this computer pays through, in the order they were added. */
export const keptAccounts = (): string[] => {
  const kept = stored<unknown>(KEPT_KEY, [])
  return Array.isArray(kept) ? kept.filter((id): id is string => typeof id === 'string') : []
}

export const keepAccounts = (rows: PaymentRow[]) => {
  try {
    localStorage.setItem(KEPT_KEY, JSON.stringify(rows.map((row) => row.accountId)))
  } catch {
    // The lines still stand for this payment.
  }
}

export const tillHere = (): string | null => stored<string | null>(TILL_KEY, null)

/** The till this computer paid through last, when it has no till of its own. */
export const lastTill = (): string | null => stored<string | null>(PICKED_KEY, null)

export const keepTill = (tillId: string) => {
  try {
    localStorage.setItem(PICKED_KEY, JSON.stringify(tillId))
  } catch {
    // The till still stands for this payment.
  }
}

const blank = (accountId: string): PaymentRow => ({ accountId, amount: null, rate: null, settled: null })

/** The same order, but each till's so'm drawer before its dollar one. */
function somFirst(accounts: PaymentAccountDto[]): PaymentAccountDto[] {
  const place = (account: PaymentAccountDto, index: number) =>
    account.registerId ? accounts.findIndex((other) => other.registerId === account.registerId) : index
  return accounts
    .map((account, index) => ({ account, index }))
    .sort(
      (a, b) =>
        place(a.account, a.index) - place(b.account, b.index) ||
        Number(a.account.currency === 'USD') - Number(b.account.currency === 'USD') ||
        a.index - b.index,
    )
    .map((item) => item.account)
}

/** A place that is no till's drawer: a card, a safe, a bank account. */
const apart = (account: PaymentAccountDto) => !account.registerId

/**
 * The lines a payment opens with: the drawers of the till it goes through,
 * so'm before dollars, and after them the other places this computer paid
 * through before. The drawers of other tills are never among them: a
 * business with ten tills would open on twenty lines. With no till and
 * nothing remembered, the first few places there are.
 */
export function startRows(accounts: PaymentAccountDto[], kept: string[], tillId: string | null): PaymentRow[] {
  const drawers = somFirst(accounts.filter((account) => tillId !== null && account.registerId === tillId))
  const others = kept.flatMap((id) => accounts.filter((account) => account.id === id && apart(account)))
  const rows = [...drawers, ...others]
  return (rows.length ? rows : accounts.filter(apart).slice(0, READY_ROWS)).map((account) => blank(account.id))
}

/** The same lines for another till: its drawers in place of the ones that stood there, empty. */
export function switchTill(rows: PaymentRow[], accounts: PaymentAccountDto[], tillId: string): PaymentRow[] {
  const kept = rows.filter((row) => accounts.some((account) => account.id === row.accountId && apart(account)))
  const drawers = somFirst(accounts.filter((account) => account.registerId === tillId))
  return [...drawers.map((account) => blank(account.id)), ...kept]
}

/** The places still to be offered under "another account": those with no line, and no till's drawer among them. */
export const sparePlaces = (accounts: PaymentAccountDto[], rows: PaymentRow[]): PaymentAccountDto[] =>
  accounts.filter((account) => apart(account) && !rows.some((row) => row.accountId === account.id))

export const patchRow = (rows: PaymentRow[], accountId: string, change: Partial<PaymentRow>): PaymentRow[] =>
  rows.map((row) => (row.accountId === accountId ? { ...row, ...change } : row))

export const addRow = (rows: PaymentRow[], accountId: string): PaymentRow[] =>
  rows.some((row) => row.accountId === accountId) ? rows : [...rows, blank(accountId)]

export const removeRow = (rows: PaymentRow[], accountId: string): PaymentRow[] =>
  rows.filter((row) => row.accountId !== accountId)

/** The same lines with nothing typed: for the next payment. */
export const clearRows = (rows: PaymentRow[]): PaymentRow[] => rows.map((row) => blank(row.accountId))

/** 12650.5 -> "12 650,5" */
export const rateText = (rate: number) => {
  const [, fraction] = String(rate).split('.')
  return formatNumber(rate) + (fraction ? `,${fraction}` : '')
}

/** A currency in one word, as a place is named by it: "So'm", "Dollar", "Yuan". */
export const currencyShort = (code: AnyCurrency, t: TFunction) => t(`currencies.short.${code}`, { defaultValue: code })

/**
 * A place as a payment names it: by what it holds and how — "So'm naqd",
 * "Dollar naqd" — since the till it belongs to is chosen above the lines.
 * A card is told from another by its number; a safe, a bank account and a
 * terminal by their own names.
 */
export function placeName(
  account: Pick<PaymentAccountDto, 'kind' | 'currency' | 'name' | 'last4' | 'cardNumber'>,
  t: TFunction,
): string {
  const held = t(`places.${account.kind}`, { currency: currencyShort(account.currency, t), defaultValue: account.name })
  if (account.kind === 'cash') {
    return held
  }
  if (account.kind === 'card') {
    const which = account.cardNumber
      ? formatCardNumber(account.cardNumber)
      : account.last4
        ? `${account.name} *${account.last4}`
        : account.name
    return `${held} (${which})`
  }
  return `${held} (${account.name})`
}

/** A line as it will be valued: the account, the rate in force, and what it settles. */
export interface ValuedLine {
  row: PaymentRow
  account: PaymentAccountDto
  /** The rate the line's two sums make: its own when they were agreed, the day's otherwise. */
  rate: number | null
  /** How that rate reads — "1 $ = so many ¥"; null where no currency is changed, or the two cannot be valued. */
  pair: Pair | null
  /** The day's rate between the line's two currencies, read the same way. */
  dayRate: number | null
  /** The account is in another currency than the one being settled: the line has both fields. */
  changes: boolean
  /** In the currency being settled; null until it can be worked out. */
  settled: number | null
  /** The line settles something other than what the day's rate makes of its money: it goes to the server as agreed. */
  agreed: boolean
  /**
   * What the money is worth at the day's rate over what it settles, in the
   * base: more than nothing when the money is worth more. Who gains by it
   * depends on which way the money goes.
   */
  fx: number
  /** How far the two lie apart, in percent of the money's worth. */
  gap: number
  /** Further than the business lets anyone agree to: it takes someone who sets rates. */
  strays: boolean
}

export function valueLines(
  rows: PaymentRow[],
  accounts: PaymentAccountDto[],
  currency: AnyCurrency | null,
  /** The day's rates: all of them, or the dollar's alone where nothing else is kept. */
  rates: Rates,
  /** How far from the day's rate anyone may agree a sum, in percent. */
  limit = 0,
): ValuedLine[] {
  const book = ratesOf(rates)
  return rows.flatMap((row) => {
    const account = accounts.find((item) => item.id === row.accountId)
    if (!account) {
      return []
    }
    const changes = !!currency && account.currency !== currency
    const day = changes && currency ? dayPairRate(account.currency, currency, book) : null
    // With no rate for the day, so'm and dollars still read the one way anyone reads them.
    const pair: Pair | null = day
      ? { one: day.one, of: day.of }
      : changes && [account.currency, currency].every((code) => code === 'UZS' || code === 'USD')
        ? { one: 'USD', of: 'UZS' }
        : null
    const rate = row.rate ?? day?.value ?? null
    const plain = {
      row,
      account,
      rate,
      pair,
      dayRate: day?.value ?? null,
      changes,
      agreed: false,
      fx: 0,
      gap: 0,
      strays: false,
    }
    if (!currency || !row.amount) {
      return [{ ...plain, settled: null }]
    }
    if (!changes) {
      return [{ ...plain, settled: row.amount }]
    }
    // A sum typed over the rate stands; otherwise the line's own rate, or the day's, makes it.
    const typed = row.settled
    const by = row.rate && pair ? pairBook(pair, row.rate) : day ? book : null
    const made = by ? settledFor(row.amount, account.currency, currency, by).settled : null
    const settled = typed ?? made
    if (settled === null || !day) {
      return [{ ...plain, settled }]
    }
    const worth = settleLine(row.amount, account.currency, currency, book, settled)
    return [
      {
        ...plain,
        rate: typed ? pairRate(row.amount, account.currency, typed, pair) : rate,
        settled,
        agreed: worth.agreed,
        fx: worth.fx,
        gap: worth.agreed ? rateGap(worth) : 0,
        strays: worth.agreed && straysFromRate(worth, limit),
      },
    ]
  })
}

/** The money a line has to hold to settle so much, at the rate the line goes by; nothing where it has none. */
function moneyFor(line: ValuedLine, settled: number, currency: AnyCurrency): number {
  return line.rate && line.pair
    ? amountFor(settled, line.account.currency, currency, pairBook(line.pair, line.rate))
    : 0
}

/** What a line asks the server to take as agreed; nothing while it is left to the day's rate. */
export const agreedOf = (line: ValuedLine): number | null => (line.agreed ? line.settled : null)

export const totalOf = (lines: ValuedLine[]) => lines.reduce((sum, line) => sum + (line.settled ?? 0), 0)

/**
 * The total typed instead of a sum. The line in the partner's own currency
 * takes what the others leave of it: 240 to settle, 135 of it brought in
 * so'm, so 105 in dollars. Where there is no such line the first one that
 * can take money does, at its rate. Null when no line can take it, or when
 * the others already settle more than the total.
 */
export function spreadTotal(
  lines: ValuedLine[],
  total: number,
  currency: AnyCurrency,
): { accountId: string; amount: number | null } | null {
  const open = lines.filter((line) => line.account.open)
  const target = open.find((line) => !line.changes) ?? open.find((line) => line.rate)
  if (!target) {
    return null
  }
  const rest = total - totalOf(lines.filter((line) => line !== target))
  if (rest < 0) {
    return null
  }
  const amount = target.changes ? moneyFor(target, rest, currency) : rest
  return { accountId: target.row.accountId, amount: amount || null }
}

/** What "=" puts into a line: the sum, in its own currency, that settles what the other lines leave owed. */
export function fillFor(
  line: ValuedLine,
  lines: ValuedLine[],
  owed: number,
  currency: AnyCurrency,
): number | undefined {
  if (!line.account.open) {
    return undefined
  }
  const rest = owed - totalOf(lines.filter((other) => other !== line))
  if (rest <= 0) {
    return undefined
  }
  if (!line.changes) {
    return rest
  }
  return moneyFor(line, rest, currency) || undefined
}

const money = (minor: number, currency: AnyCurrency) => formatMoney(minor, currency, { minor: 'auto' })
const typed = (minor: number, currency: AnyCurrency) => formatMoney(minor, currency, { symbol: false, group: ' ' })

/** A rate as its pair reads: "1 $ = 7,25 ¥". */
const pairSentence = (pair: Pair, value: number) =>
  `1 ${CURRENCIES[pair.one].symbol} = ${rateText(value)} ${CURRENCIES[pair.of].symbol}`

interface PaymentLinesProps {
  /** Money coming in, or going out: only the headings differ. */
  kind: 'in' | 'out'
  lines: ValuedLine[]
  /** The places that have no line yet. */
  spare: PaymentAccountDto[]
  /** The currency being settled; null until it is known. */
  currency: AnyCurrency | null
  /** What this payment could settle of what is owed; null when that is not known, or nothing is. */
  owed: number | null
  onPatch: (accountId: string, change: Partial<PaymentRow>) => void
  onAdd: (accountId: string) => void
  onRemove: (accountId: string) => void
  /** The total was typed. False when the lines cannot make it up. */
  onTotal: (total: number) => boolean
  /** The day's rate stands unless someone allowed to sets another. */
  setsRates: boolean
  /** The day's rates: what an agreed sum is measured against. All of them, or the dollar's alone. */
  dayRate?: Rates
  /** What the server would not take, by account. */
  problems?: Record<string, string>
  /** Puts the cursor in the first line that can take money. */
  autoFocus?: boolean
  /** A line just added: the cursor goes to it. */
  focusId?: string | null
  /**
   * Other words over the two sums, where the other side is not a partner: an
   * expense is not "out of the partner's account" but simply worth so much.
   */
  headings?: { ours: string; theirs: string }
}

/**
 * Which till the cash goes through. It always stands there, chosen, even
 * when there is only one: the lines say "so'm in cash" and "dollars in
 * cash", and this says whose drawer that is. The shop is named beside the
 * till where the tills are in more than one shop; a till whose shift is
 * closed says so, since its drawers will take nothing.
 */
export function TillField({
  tills,
  value,
  onChange,
}: {
  tills: PayTill[]
  value: string | null
  onChange: (tillId: string) => void
}) {
  const { t } = useTranslation()
  if (!tills.length) {
    return null
  }
  const shops = new Set(tills.map((till) => till.locationName)).size
  return (
    <Field label={t('payments.till')}>
      {(id) => (
        // Rarely changed: Enter walks past it to the money.
        <div data-enter-skip>
          <Select
            id={id}
            value={value ?? ''}
            onChange={onChange}
            options={tills.map((till) => ({
              value: till.id,
              label:
                (shops > 1 && till.locationName ? `${till.locationName} · ${till.name}` : till.name) +
                (till.open ? '' : ` — ${t('payments.tillClosed')}`),
            }))}
          />
        </div>
      )}
    </Field>
  )
}

const GRID = 'grid grid-cols-[minmax(0,1fr)_11rem_6.5rem_11rem_1.75rem] gap-2'

export function PaymentLines({
  kind,
  lines,
  spare,
  currency,
  owed,
  onPatch,
  onAdd,
  onRemove,
  onTotal,
  setsRates,
  dayRate = null,
  problems = {},
  autoFocus,
  focusId,
  headings,
}: PaymentLinesProps) {
  const { t } = useTranslation()
  // What a difference comes to is said in the currency the books are kept in.
  const base = ratesOf(dayRate).base
  // Money coming in that is worth more than it settles is the business's gain; going out, the other way round.
  const gainOf = (line: ValuedLine) => (kind === 'in' ? line.fx : -line.fx)
  // A total the lines could not make up is put back as it was.
  const [refused, setRefused] = useState(0)
  const total = totalOf(lines)
  const first = lines.find((line) => line.account.open)

  return (
    <div className="flex flex-col gap-2">
      <div className={`${GRID} text-[11px] font-semibold tracking-[0.04em] text-ink-3 uppercase`}>
        <span>{kind === 'in' ? t('payments.accountIn') : t('payments.accountOut')}</span>
        {/* Whose money each field is, in words: the two are never mistaken for one another. */}
        <span className="text-right">
          {headings?.ours ?? (kind === 'in' ? t('payments.intoUs') : t('payments.outOfUs'))}
        </span>
        <span className="text-right">{t('payments.rate')}</span>
        <span className="text-right">
          {headings?.theirs ?? (kind === 'in' ? t('payments.fromPartner') : t('payments.toPartner'))}
        </span>
        <span />
      </div>
      {lines.map((line) => {
        const { row, account, rate, changes, settled } = line
        const fill = owed !== null && currency && !row.amount ? fillFor(line, lines, owed, currency) : undefined
        // The rate column says the day's rate, always: a rate made by an agreed sum is said in words under the line,
        // where nobody takes it for the day's. Only a rate typed into the column itself stands in it.
        const ownRate = row.rate
        const gain = gainOf(line)
        // The number in the rate column is one of the dearer currency in so many of the cheaper: said whole on hover.
        const said = line.pair && line.dayRate ? pairSentence(line.pair, line.dayRate) : undefined
        return (
          <div key={row.accountId} className={`${GRID} items-center`}>
            <div className="flex min-w-0 items-baseline gap-2">
              <span
                title={placeName(account, t)}
                className={cn('truncate text-[13px] font-medium', !account.open && 'text-ink-3')}
              >
                {placeName(account, t)}
              </span>
              <span className="tabular ml-auto shrink-0 text-xs text-ink-3">
                {!account.open
                  ? t('payments.shiftClosed')
                  : account.balance !== null
                    ? money(account.balance, account.currency)
                    : ''}
              </span>
            </div>
            <MoneyInput
              autoFocus={focusId ? focusId === row.accountId : autoFocus && line === first}
              value={row.amount}
              // The money is the anchor: typed, it has what it settles worked out afresh.
              onChange={(amount) => onPatch(row.accountId, { amount, settled: null })}
              currency={account.currency}
              disabled={!account.open}
              invalid={!!problems[row.accountId]}
              fillValue={fill}
              placeholder={fill === undefined ? undefined : typed(fill, account.currency)}
            />
            {changes ? (
              <>
                {setsRates ? (
                  // A rate of its own is the exception: Enter passes it by, Tab stops at it.
                  <div data-enter-skip title={said}>
                    <NumberInput
                      value={ownRate}
                      onChange={(value) => onPatch(row.accountId, { rate: value, settled: null })}
                      // So'm for a dollar are kept to the tiyin; a handful of yuan for a dollar to four places.
                      decimals={line.dayRate !== null && line.dayRate < 100 ? 4 : 2}
                      max={1_000_000}
                      disabled={!account.open || !line.pair}
                      placeholder={line.dayRate ? rateText(line.dayRate) : '—'}
                      className={cn('[&_input]:text-right', line.strays && '[&_input]:text-warn')}
                    />
                  </div>
                ) : (
                  <span className="tabular pr-2.5 text-right text-xs text-ink-3" title={said}>
                    {line.dayRate ? rateText(line.dayRate) : '—'}
                  </span>
                )}
                {/*
                  The second of the pair. Typed while the first holds a sum, it is what the two sides agreed:
                  the first is left as it is and the rate follows. Typed while the first is empty, it asks
                  how much money that takes, and the first is worked out from the rate.
                */}
                <MoneyInput
                  value={settled}
                  onChange={(value) => {
                    if (value === null) {
                      onPatch(row.accountId, { settled: null })
                    } else if (row.amount) {
                      onPatch(row.accountId, { settled: value, rate: null })
                    } else {
                      const amount = currency ? moneyFor(line, value, currency) : 0
                      onPatch(row.accountId, amount ? { amount, settled: value } : { settled: null })
                    }
                  }}
                  currency={currency ?? 'UZS'}
                  disabled={!line.dayRate || !account.open}
                  invalid={line.strays && !setsRates}
                />
              </>
            ) : (
              <>
                <span />
                <span className="tabular pr-2.5 text-right text-[13px] text-ink-3">
                  {settled !== null && currency ? money(settled, currency) : ''}
                </span>
              </>
            )}
            <Button
              variant="ghost"
              size="iconSm"
              tabIndex={-1}
              aria-label={t('payments.removeLine')}
              onClick={() => onRemove(row.accountId)}
            >
              <X />
            </Button>
            {/* What an agreed sum gives or costs against the day's rate: said before it is saved, not found afterwards. */}
            {line.agreed && line.gap >= 0.1 && line.dayRate ? (
              <p
                data-agreed={row.accountId}
                className={cn(
                  'col-span-full -mt-1 text-right text-xs',
                  line.strays && !setsRates ? 'text-bad' : gain < 0 ? 'text-warn' : 'text-ok',
                )}
              >
                {t(gain < 0 ? 'payments.agreedLoss' : 'payments.agreedGain', {
                  agreed: rate ? rateText(rate) : '—',
                  rate: rateText(line.dayRate),
                  percent: String(line.gap).replace('.', ','),
                  amount: money(Math.abs(gain), base),
                })}
                {line.strays && !setsRates ? ` ${t('payments.agreedTooFar')}` : ''}
              </p>
            ) : null}
            {problems[row.accountId] ? (
              <p className="col-span-full -mt-1 text-xs text-bad">{problems[row.accountId]}</p>
            ) : null}
          </div>
        )
      })}
      {spare.length ? (
        <div className={GRID} data-enter-skip>
          <Combobox
            options={spare.map((account) => ({
              value: account.id,
              label: placeName(account, t),
              hint: account.balance === null ? account.currency : money(account.balance, account.currency),
            }))}
            value={null}
            onChange={(accountId) => (accountId ? onAdd(accountId) : undefined)}
            placeholder={t('payments.addAccount')}
          />
        </div>
      ) : null}
      {/* Said quietly while the dollar line is empty; in red once something is typed there that cannot be valued. */}
      {lines.some((line) => line.changes && !line.rate) ? (
        <p
          className={cn(
            'text-xs',
            lines.some((line) => line.changes && !line.rate && line.row.amount) ? 'text-bad' : 'text-ink-3',
          )}
        >
          {t('payments.noRate')}
        </p>
      ) : null}
      <div className={`${GRID} items-center border-t border-line pt-2`}>
        <span className="col-span-3 pr-1 text-right text-[13px] font-semibold">{t('payments.total')}</span>
        <MoneyInput
          key={refused}
          value={total || null}
          onChange={(value) => {
            if (value === null || !onTotal(value)) {
              setRefused((count) => count + 1)
            }
          }}
          currency={currency ?? 'UZS'}
          disabled={!currency || !first}
        />
        <span />
      </div>
    </div>
  )
}
