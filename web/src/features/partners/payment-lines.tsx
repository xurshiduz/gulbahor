import { amountFor, formatMoney, settledFor, type CurrencyCode, type PaymentAccountDto } from '@gulbahor/core'
import { X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { MoneyInput } from '@/components/ui/money-input'
import { NumberInput } from '@/components/ui/number-input'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'

/**
 * The lines of a payment. Every place the money usually goes through has
 * its line ready: nothing is picked, a sum is typed where it belongs and
 * the rest is left empty. Where a place is in another currency than the one
 * being settled, the line has two fields side by side: what went through
 * it, and what that settles. Typing either works out the other from the
 * rate; typing the total works out the line in the partner's own currency.
 */

export interface PaymentRow {
  accountId: string
  /** In the account's currency. */
  amount: number | null
  /** So'm for a dollar, when it is not the day's rate. */
  rate: number | null
}

/** More lines than this are not laid out unasked: the rest are a pick away. */
export const READY_ROWS = 6

const KEPT_KEY = 'gb.pay.accounts'
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

const blank = (accountId: string): PaymentRow => ({ accountId, amount: null, rate: null })

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

/**
 * The lines a payment opens with: the places this computer paid through
 * before; failing that, the drawers of the till it sells at; failing that,
 * the first few there are. A till's so'm drawer stands before its dollar one.
 */
export function startRows(accounts: PaymentAccountDto[], kept: string[], tillId: string | null): PaymentRow[] {
  const known = kept.filter((id) => accounts.some((account) => account.id === id))
  if (known.length) {
    return known.map(blank)
  }
  const till = accounts.filter((account) => tillId !== null && account.registerId === tillId)
  return somFirst(till.length ? till : accounts.slice(0, READY_ROWS)).map((account) => blank(account.id))
}

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

/** A line as it will be valued: the account, the rate in force, and what it settles. */
export interface ValuedLine {
  row: PaymentRow
  account: PaymentAccountDto
  /** The line's own rate, or the day's. */
  rate: number | null
  /** The account is in another currency than the one being settled: the line has both fields. */
  changes: boolean
  /** In the currency being settled; null until it can be worked out. */
  settled: number | null
}

export function valueLines(
  rows: PaymentRow[],
  accounts: PaymentAccountDto[],
  currency: CurrencyCode | null,
  dayRate: number | null,
): ValuedLine[] {
  return rows.flatMap((row) => {
    const account = accounts.find((item) => item.id === row.accountId)
    if (!account) {
      return []
    }
    const rate = row.rate ?? dayRate
    const changes = !!currency && account.currency !== currency
    let settled: number | null = null
    if (currency && row.amount) {
      if (!changes) {
        settled = row.amount
      } else if (rate) {
        settled = settledFor(row.amount, account.currency, currency, rate).settled
      }
    }
    return [{ row, account, rate, changes, settled }]
  })
}

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
  currency: CurrencyCode,
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
  const amount = target.changes ? amountFor(rest, target.account.currency, currency, target.rate) : rest
  return { accountId: target.row.accountId, amount: amount || null }
}

/** What "=" puts into a line: the sum, in its own currency, that settles what the other lines leave owed. */
export function fillFor(
  line: ValuedLine,
  lines: ValuedLine[],
  owed: number,
  currency: CurrencyCode,
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
  return line.rate ? amountFor(rest, line.account.currency, currency, line.rate) || undefined : undefined
}

const money = (minor: number, currency: CurrencyCode) => formatMoney(minor, currency, { minor: 'auto' })
const typed = (minor: number, currency: CurrencyCode) => formatMoney(minor, currency, { symbol: false, group: ' ' })

interface PaymentLinesProps {
  /** Money coming in, or going out: only the headings differ. */
  kind: 'in' | 'out'
  lines: ValuedLine[]
  /** The places that have no line yet. */
  spare: PaymentAccountDto[]
  /** The currency being settled; null until it is known. */
  currency: CurrencyCode | null
  /** What this payment could settle of what is owed; null when that is not known, or nothing is. */
  owed: number | null
  onPatch: (accountId: string, change: Partial<PaymentRow>) => void
  onAdd: (accountId: string) => void
  onRemove: (accountId: string) => void
  /** The total was typed. False when the lines cannot make it up. */
  onTotal: (total: number) => boolean
  /** The day's rate stands unless someone allowed to sets another. */
  setsRates: boolean
  /** What the server would not take, by account. */
  problems?: Record<string, string>
  /** Puts the cursor in the first line that can take money. */
  autoFocus?: boolean
  /** A line just added: the cursor goes to it. */
  focusId?: string | null
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
  problems = {},
  autoFocus,
  focusId,
}: PaymentLinesProps) {
  const { t } = useTranslation()
  // A total the lines could not make up is put back as it was.
  const [refused, setRefused] = useState(0)
  const total = totalOf(lines)
  const first = lines.find((line) => line.account.open)

  return (
    <div className="flex flex-col gap-2">
      <div className={`${GRID} text-[11px] font-semibold tracking-[0.04em] text-ink-3 uppercase`}>
        <span>{kind === 'in' ? t('payments.accountIn') : t('payments.accountOut')}</span>
        {/* Whose money each field is, in words: the two are never mistaken for one another. */}
        <span className="text-right">{kind === 'in' ? t('payments.intoUs') : t('payments.outOfUs')}</span>
        <span className="text-right">{t('payments.rate')}</span>
        <span className="text-right">{kind === 'in' ? t('payments.fromPartner') : t('payments.toPartner')}</span>
        <span />
      </div>
      {lines.map((line) => {
        const { row, account, rate, changes, settled } = line
        const fill = owed !== null && currency && !row.amount ? fillFor(line, lines, owed, currency) : undefined
        return (
          <div key={row.accountId} className={`${GRID} items-center`}>
            <div className="flex min-w-0 items-baseline gap-2">
              <span className={cn('truncate text-[13px] font-medium', !account.open && 'text-ink-3')}>
                {account.name}
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
              onChange={(amount) => onPatch(row.accountId, { amount })}
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
                  <div data-enter-skip>
                    <NumberInput
                      value={row.rate}
                      onChange={(value) => onPatch(row.accountId, { rate: value })}
                      decimals={2}
                      max={1_000_000}
                      disabled={!account.open}
                      placeholder={rate ? rateText(rate) : '—'}
                      className="[&_input]:text-right"
                    />
                  </div>
                ) : (
                  <span className="tabular pr-2.5 text-right text-xs text-ink-3">{rate ? rateText(rate) : '—'}</span>
                )}
                {/* The second of the pair: typed, it works the first out from the rate. */}
                <MoneyInput
                  value={settled}
                  onChange={(value) =>
                    onPatch(row.accountId, {
                      amount: value && currency && rate ? amountFor(value, account.currency, currency, rate) : null,
                    })
                  }
                  currency={currency ?? 'UZS'}
                  disabled={!rate || !account.open}
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
              label: account.name,
              hint: account.balance === null ? account.currency : money(account.balance, account.currency),
            }))}
            value={null}
            onChange={(accountId) => (accountId ? onAdd(accountId) : undefined)}
            placeholder={t('payments.addAccount')}
          />
        </div>
      ) : null}
      {lines.some((line) => line.changes && !line.rate) ? (
        <p className="text-xs text-bad">{t('payments.noRate')}</p>
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
