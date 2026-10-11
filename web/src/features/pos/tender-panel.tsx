import {
  CURRENCIES,
  dueIn,
  exchange,
  formatMoney,
  tillWorth,
  worthOf,
  type AnyCurrency,
  type CurrencyCode,
  type RateBook,
  type PosContextDto,
  type RefundSettlement,
  type Settlement,
} from '@erp/core'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/controls'
import { DateInput } from '@/components/ui/date-input'
import { Shortcut } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { ReceivedInput, ReceivedNote, type ExchangeSums } from '@/features/money/exchange'
import { pairSentence, rateText, type ValuedLine } from '@/features/money/payment-lines'
import { base, baseWords, currencyWords } from '@/lib/base'
import { cn } from '@/lib/cn'

import { ChangeRows, type ChangePanel } from './change-rows'
import { GivenInput, GivenNote } from './given-for'
import { changeOf, changeWords, enteredRows, refundsOf, tendersOf, type Returning, type TenderRow } from './pos-state'
import { TakenInput, TakenNote } from './taken-for'
import { RATE, ROW, UNDER } from './tender-grid'

const money = (minor: number, currency: CurrencyCode = base()) => formatMoney(minor, currency, { minor: 'auto' })

/** The four ways money changes hands at a till: cash in the base, cash in another currency, a card, a terminal. */
export type TenderKind = 'cash' | 'other' | 'card' | 'terminal'
export const kindOf = (row: TenderRow): TenderKind =>
  row.method === 'cash' ? (row.currency !== base() ? 'other' : 'cash') : row.method
const KIND_KEYS: Record<TenderKind, string> = { cash: 'f5', other: 'f6', card: 'f7', terminal: 'f8' }

/** The key a row is hidden by (`placeKey`): cash of another currency by its currency, a card or terminal by itself. */
export const tenderPlace = (row: TenderRow): string | null =>
  row.method === 'cash' ? (row.currency === base() ? null : `cash:${row.currency}`) : row.accountId

/** Rows a person keeps out of sight: back while they hold a sum, or while `peek` is on. */
export interface Hiding {
  hidden: string[]
  onChange: (hidden: string[]) => void
  peek: boolean
  onPeek: (peek: boolean) => void
}

interface TenderPanelProps {
  context: PosContextDto
  /** A row for each way of paying, with what has been typed into it. */
  rows: TenderRow[]
  onPatch: (key: string, patch: Partial<TenderRow>) => void
  /** The receipt goods are coming back on, when there is one. */
  returning: Returning | null
  /** Money goes back to the customer, not in from them. */
  refunding: boolean
  /** What is to be taken, or handed back, in so'm. */
  due: number
  /** What is taken as meant when nothing is typed. */
  suggested: Record<string, number>
  settlement: Settlement
  refund: RefundSettlement
  /** How the change goes back when not all of it is cash in the base; without it, all of it is. */
  change?: ChangePanel | null
  /** What the button that ends it says: "Sotish", "Qaytarish", "Almashtirish". */
  action: string
  busy: boolean
  onComplete: () => void
  onBack: () => void
  /** Putting part of it on the customer's account — out of what is theirs there, the rest as a debt: offered when a customer is buying. */
  onAccount?: OnAccount | null
  /** Goods brought back on a receipt that put something on a customer's account: so much comes off it there. */
  offAccount?: number
  /** Seldom used rows kept out of sight; none hidden without it. */
  hiding?: Hiding | null
  /** Handing back: so much of it may stay on the customer's account instead. Offered when there is someone whose. */
  keep?: KeepPanel | null
}

/** What of the money owed for goods brought back stays on the customer's account. */
export interface KeepPanel {
  /** Whose account. */
  name: string
  currency: AnyCurrency
  /** What stands there now, in its currency: above zero they owe, below it the money is theirs. */
  balance: number | null
  /** So much of what is owed, in the base. */
  amount: number | null
  /** What that comes to on the account, in its currency, where it was agreed; null: the day's rate. */
  settled: number | null
  /** The most that can stay there: what there is to hand back. */
  max: number
  /** The agreed sum lies further from the rate than a cashier may go alone. */
  strays: boolean
  onChange: (sums: { amount: number | null; settled: number | null }) => void
}

export interface OnAccount {
  /** Whose account. */
  name: string
  currency: AnyCurrency
  /** The currencies the business keeps: the sale may go on the customer's account in any of them. */
  currencies?: AnyCurrency[]
  onCurrency?: (currency: AnyCurrency) => void
  sums: ExchangeSums
  /** The pair of sums where the account is in another currency than the sale; null where it is not. */
  line: ValuedLine | null
  /** The most that can go there: what there is to pay. */
  max: number
  book: RateBook | null
  /** An agreed sum however far from the day's rate is this person's to make. */
  setsRates: boolean
  /** What stands on the account now, in its currency: above zero they owe, below it the money is theirs (haqi). */
  balance: number | null
  /** Of what goes there now, in the account's currency: what their haqi covers, and what is lent. */
  prepaid: number
  lent: number
  /** When what is lent falls due; null: never. */
  dueDate: string | null
  /** Their debts are given no day: the day may be left empty. */
  noDue: boolean
  onDueDate: (date: string | null) => void
  /** Why a manager's word will be asked for, when it will. */
  warning: string | null
  onChange: (sums: ExchangeSums) => void
}

/**
 * The money, beside the receipt it pays. Every way of paying has its row,
 * ready to be typed into: cash in each currency the till takes, each of the
 * shop's cards, each terminal. Enter walks the sums; once they cover the receipt, or when
 * nothing was typed at all (cash, exactly), Enter ends the sale.
 */
export function TenderPanel({
  context,
  rows,
  onPatch,
  returning,
  refunding,
  due,
  suggested,
  settlement,
  refund,
  change = null,
  action,
  busy,
  onComplete,
  onBack,
  onAccount = null,
  offAccount = 0,
  hiding = null,
  keep = null,
}: TenderPanelProps) {
  const { t } = useTranslation()
  const accountId = useId()
  const keepId = useId()
  const dueId = useId()
  const sums = useRef<HTMLDivElement>(null)
  const { book } = context
  /** One of a currency in the base at the day's rate, in its smallest coin; null with no rate. */
  const unit = (currency: AnyCurrency) => tillWorth(100, currency, book)
  const foreign = (row: TenderRow) => row.currency !== base()
  const entered = enteredRows(rows)
  // What stays on the account is not for the money to hand back.
  const keeping = refunding && keep ? Math.min(keep.amount ?? 0, keep.max) : 0
  const typed = refunding ? refundsOf(entered, due - keeping, book) : tendersOf(entered, false)
  // A hidden row stays out of sight unless it holds a sum — typed, or what is meant when nothing is typed.
  const tucked = (row: TenderRow) => {
    const place = tenderPlace(row)
    return (
      !!hiding &&
      !hiding.peek &&
      place !== null &&
      hiding.hidden.includes(place) &&
      !row.amount &&
      !(!entered.length && suggested[row.key])
    )
  }
  const shown = rows.filter((row) => !tucked(row))
  const away = rows.filter(tucked)
  /** A row as the line under the sums names it when it is out of sight. */
  const nameOf = (row: TenderRow): string => {
    if (row.method === 'cash') {
      return t('pos.payCash', currencyWords(t, row.currency))
    }
    const account =
      [...context.cards, ...context.terminals].find((item) => item.id === row.accountId) ??
      returning?.found.caps.accounts.find((item) => item.accountId === row.accountId)
    return account
      ? `${account.name}${account.last4 ? ` *${account.last4}` : ''}`
      : t(row.method === 'card' ? 'pos.payCard' : 'pos.payTerminal')
  }
  const anyHidden = rows.some((row) => {
    const place = tenderPlace(row)
    return place !== null && !!hiding?.hidden.includes(place)
  })
  // What stands beside a sum (an agreed worth, a slip's number) is there as soon as the cursor is in its
  // row: appearing only once the sum was typed, Tab would have gone past where it was about to be.
  const [within, setWithin] = useState<string | null>(null)
  const covered = refunding
    ? refund.problem === null && refund.due === 0
    : settlement.problem === null && settlement.due === 0

  // What goes on the account is not for the money to cover.
  const owing = onAccount ? Math.min(onAccount.sums.amount ?? 0, onAccount.max) : 0

  /** What is left for a row to cover once the others have paid theirs, in so'm. */
  const restFor = (row: TenderRow): number => {
    const others = typed
      .filter((_, index) => entered[index].key !== row.key)
      .reduce((sum, item) => sum + (worthOf(item, book) ?? 0), 0)
    return Math.max(0, due - owing - keeping - others)
  }
  /** What a row would have to hold to cover the rest: what "=" fills in. */
  const fillOf = (row: TenderRow): number => {
    const rest = restFor(row)
    return foreign(row) ? (dueIn(rest, row.currency, book) ?? rest) : rest
  }

  // A field gives up what was typed into it on the same Enter that asks what to do next. What the rows
  // hold after that key is known only once they have been drawn again, so it is read from here.
  const state = {
    held: [...rows, ...(change?.rows ?? [])]
      .map((row) => `${row.key}:${row.amount ?? ''}:${row.value ?? ''}`)
      .join('|'),
    ready: !entered.length || covered,
    covered,
  }
  const latest = useRef(state)
  useLayoutEffect(() => {
    latest.current = state
  })

  /** The second sum of the pair: what money of another currency is taken for, and what that makes of the rate. */
  const takenFor = (row: TenderRow) => ({
    amount: row.amount,
    currency: row.currency,
    value: row.value,
    book,
    rest: restFor(row),
    limit: context.maxRateLossPercent,
    mayAsk: context.approvers.some((approver) => approver.discount),
    alone: context.mayOverDiscount,
    onChange: (value: number | null) => onPatch(row.key, { value }),
  })
  /** The same pair where money goes back: what the notes are handed over for. */
  const givenFor = (row: TenderRow) => ({ ...takenFor(row), rest: restFor(row) })
  // Somewhere on the panel a sum has a second one beside it: the columns are named then.
  const paired = rows.some((row) => foreign(row) && unit(row.currency) !== null) || !!onAccount?.line
  // What is to pay, said in each other currency the till takes too.
  const others = context.currencies.filter((code) => code !== base() && unit(code) !== null)

  /** Enter and ↓ go on to the next sum, ↑ back to the one before; Enter with nothing left to type ends the sale. */
  const walk = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target
    if (event.ctrlKey || event.metaKey || event.altKey || !(target instanceof HTMLInputElement)) {
      return
    }
    // Enter walks the sums; what is beside them (an agreed worth, a slip's number) is reached with Tab.
    const fields = [...event.currentTarget.querySelectorAll<HTMLInputElement>('input:not(:disabled)')].filter(
      (field) => field === target || !field.closest('[data-enter-skip]'),
    )
    const move = (step: number) => {
      const next = fields[fields.indexOf(target) + step]
      next?.focus()
      next?.select()
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key !== 'Enter') {
      return
    }
    event.preventDefault()
    const before = latest.current.held
    window.setTimeout(() => {
      const now = latest.current
      if (now.held !== before) {
        // Something was typed. Still short, the next sum is asked for; covered, the change is there to be
        // read, and the next Enter ends it.
        if (!now.covered) {
          move(1)
        }
      } else if (now.ready) {
        onComplete()
      } else {
        move(1)
      }
    })
  }

  /** Enter in the account's sum takes it and goes back to the money: the rest is paid there, and sold from there. */
  const backToMoney = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey || !(target instanceof HTMLElement)) {
      return
    }
    if (target.id !== accountId && target.id !== keepId) {
      return
    }
    event.preventDefault()
    window.setTimeout(() => {
      const first = sums.current?.querySelector<HTMLInputElement>('input:not(:disabled)')
      first?.focus()
      first?.select()
    })
  }

  return (
    <section className="@container flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-card">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">{refunding ? t('pos.toRefund') : t('pos.toPay')}</span>
          <span className={cn('tabular text-2xl font-semibold', refunding && 'text-warn')}>{money(due)}</span>
        </div>
        {others.length && due ? (
          <p className="tabular text-right text-xs text-ink-3">
            {others.map((code) => `≈ ${money(dueIn(due, code, book) as number, code)}`).join(' · ')}
          </p>
        ) : null}
      </div>

      <div ref={sums} className="flex flex-col gap-2 border-t border-line pt-3" onKeyDown={walk}>
        {paired ? (
          <div className={cn(ROW, 'hidden text-[11px] font-semibold tracking-[0.04em] text-ink-3 uppercase @xl:grid')}>
            <span>{t('pos.tenderWay')}</span>
            <span className="text-right">{refunding ? t('pos.toRefund') : t('pos.tenderGiven')}</span>
            <span className="text-right">{t('payments.rate')}</span>
            <span className="text-right">{t('pos.tenderWorth', baseWords(t))}</span>
          </div>
        ) : null}
        {shown.map((row) => {
          const kind = kindOf(row)
          const cap = returning?.found.caps.accounts.find((item) => item.accountId === row.accountId)
          // Paying, a card is one of the shop's; handing back, it is the one the receipt was paid with.
          const account = refunding
            ? cap
            : [...context.cards, ...context.terminals].find((item) => item.id === row.accountId)
          const noRate = foreign(row) && unit(row.currency) === null
          // How much may go back this way, for someone who must hand it back the way it was paid.
          const limit =
            refunding && returning && !returning.found.free
              ? row.method === 'cash'
                ? returning.found.caps.cash
                : (cap?.left ?? 0)
              : null
          // The key takes the cursor to the first row of its kind; the rest are an arrow away.
          const first = shown.find((item) => kindOf(item) === kind) === row
          const place = hiding ? tenderPlace(row) : null
          const isHidden = place !== null && !!hiding?.hidden.includes(place)
          return (
            <div
              key={row.key}
              data-tender={row.key}
              data-kind={kind}
              onFocus={() => setWithin(row.key)}
              className="group flex flex-col gap-1.5"
            >
              <div className={ROW}>
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2">
                  <span className="truncate">
                    {account ? (
                      <>
                        {account.name}
                        {account.last4 ? <span className="font-code text-ink-3"> *{account.last4}</span> : null}
                      </>
                    ) : kind === 'cash' || kind === 'other' ? (
                      t('pos.payCash', currencyWords(t, row.currency))
                    ) : (
                      t(kind === 'card' ? 'pos.payCard' : 'pos.payTerminal')
                    )}
                    {limit !== null && kind !== 'other' ? (
                      <span className="tabular text-ink-3">
                        {' ≤ '}
                        {formatMoney(limit, base(), { minor: 'auto', symbol: false })}
                      </span>
                    ) : null}
                  </span>
                  {account && kind === 'terminal' ? (
                    <span className="shrink-0 text-xs text-ink-3">{t('pos.payTerminal')}</span>
                  ) : null}
                  {first ? <Shortcut combo={KIND_KEYS[kind]} /> : null}
                  {place !== null && hiding ? (
                    // Out of sight until it is wanted; a hidden one shown for now may be shown always again.
                    <button
                      type="button"
                      tabIndex={-1}
                      title={isHidden ? t('pos.showRow') : t('pos.hideRow')}
                      aria-label={isHidden ? t('pos.showRow') : t('pos.hideRow')}
                      onClick={() =>
                        hiding.onChange(
                          isHidden ? hiding.hidden.filter((key) => key !== place) : [...hiding.hidden, place],
                        )
                      }
                      className={cn(
                        'ml-auto shrink-0 rounded p-0.5 text-ink-3 hover:bg-sunken hover:text-ink focus-visible:opacity-100',
                        isHidden ? 'opacity-100' : 'opacity-40 group-hover:opacity-100',
                      )}
                    >
                      {isHidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </button>
                  ) : null}
                </span>
                <MoneyInput
                  value={row.amount}
                  // What money was agreed to be worth was agreed for that much of it.
                  onChange={(amount) => onPatch(row.key, amount === row.amount ? { amount } : { amount, value: null })}
                  currency={row.currency}
                  fillValue={fillOf(row)}
                  disabled={noRate}
                  // Nothing typed anywhere: what shows faintly here is what is meant.
                  placeholder={
                    noRate
                      ? t('pos.noRateShort')
                      : !entered.length && suggested[row.key]
                        ? formatMoney(suggested[row.key], row.currency, { minor: 'auto', symbol: false })
                        : undefined
                  }
                />
                {foreign(row) && unit(row.currency) !== null ? (
                  // The pair: the money, the day's rate, and what it is taken for in the base.
                  <>
                    <span
                      className={RATE}
                      title={`1 ${CURRENCIES[row.currency].symbol} = ${money(unit(row.currency) as number)}`}
                    >
                      {formatMoney(unit(row.currency) as number, base(), { minor: 'auto', symbol: false })}
                    </span>
                    <span className={UNDER}>{t('pos.takenFor', baseWords(t))}</span>
                    {refunding ? (
                      // Handed back for what the rate makes them, or for a worth agreed: a Tab away.
                      <div data-enter-skip>
                        <GivenInput {...givenFor(row)} />
                      </div>
                    ) : (
                      // Enter walks the sums given; what they are taken for is a Tab away.
                      <div data-enter-skip>
                        <TakenInput {...takenFor(row)} />
                      </div>
                    )}
                  </>
                ) : null}
              </div>
              {!refunding && row.method === 'terminal' && (row.amount || within === row.key) ? (
                <div data-enter-skip className="flex items-center justify-end gap-2">
                  <span className="text-xs text-ink-3">{t('pos.rrn')}</span>
                  <Input
                    value={row.reference}
                    maxLength={12}
                    onChange={(event) => onPatch(row.key, { reference: event.target.value })}
                    className="font-code w-[11rem]"
                  />
                </div>
              ) : null}
              {foreign(row) && unit(row.currency) !== null ? (
                refunding ? (
                  <GivenNote {...givenFor(row)} />
                ) : (
                  <TakenNote {...takenFor(row)} />
                )
              ) : null}
            </div>
          )
        })}
        {/* What is out of sight is named, and comes back with a click (or its key); then it folds away again. */}
        {hiding && (away.length || (hiding.peek && anyHidden)) ? (
          <div data-enter-skip className="flex justify-end">
            <button
              type="button"
              tabIndex={-1}
              onClick={() => hiding.onPeek(!hiding.peek)}
              className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink"
            >
              {hiding.peek ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {hiding.peek ? t('pos.foldHidden') : t('pos.hiddenRows', { names: away.map(nameOf).join(', ') })}
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-line pt-3 text-[13px]">
        {entered.length ? (
          <div className="flex items-baseline justify-between text-ink-3">
            <span>{refunding ? t('pos.handed') : t('pos.paid')}</span>
            <span className="tabular">{money(refunding ? refund.paid : settlement.paid)}</span>
          </div>
        ) : null}
        {!entered.length ? (
          <p className="text-xs text-ink-3">{t(refunding ? 'pos.enterHintRefund' : 'pos.enterHint', baseWords(t))}</p>
        ) : refunding ? (
          refund.problem === 'over' ? (
            <p className="text-bad">{t('pos.refundOver')}</p>
          ) : refund.due > 0 ? (
            <p className="text-bad">{t('pos.refundDue', { amount: money(refund.due) })}</p>
          ) : null
        ) : settlement.problem === 'terminal_over' ? (
          <p className="text-bad">{t('pos.terminalOver')}</p>
        ) : settlement.due > 0 ? (
          <div className="flex items-baseline justify-between text-bad">
            <span>{t('pos.due')}</span>
            <span className="tabular font-semibold">
              {money(settlement.due)}
              {others.length ? ` · ${money(dueIn(settlement.due, others[0], book) as number, others[0])}` : ''}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-ink-3">
                {t('pos.change')}
                {/* Seldom wanted: the rows stay folded until asked for. */}
                {change && change.rows.length && change.over > 0 ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => change.onOpen(!change.open)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-accent-ink hover:bg-accent-soft"
                  >
                    {change.open ? t('pos.changeAllCash') : t('pos.splitChange')}
                    {change.open ? null : <Shortcut combo="f10" />}
                  </button>
                ) : null}
              </span>
              <span
                className={cn(
                  'tabular text-right text-lg font-semibold',
                  settlement.problem === 'change_over' ? 'text-bad' : 'text-ok',
                )}
              >
                {changeWords(changeOf(settlement), t) || money(0)}
              </span>
            </div>
            {settlement.problem === 'change_over' ? (
              <p className="text-bad">{t('pos.changeOver', { amount: money(change?.over ?? 0) })}</p>
            ) : null}
            {change?.open && change.over > 0 ? (
              <ChangeRows context={context} change={change} settlement={settlement} onKeyDown={walk} />
            ) : null}
          </>
        )}
      </div>

      {onAccount ? (
        // Like lending, decided rather than fallen into: Enter does not walk into it.
        <div
          data-enter-skip
          data-on-account
          className="flex flex-col gap-1.5 border-t border-line pt-3"
          onKeyDown={backToMoney}
        >
          <div className={ROW}>
            <label htmlFor={accountId} className="min-w-0 text-[13px] text-ink-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">
                  {t('pos.onAccount')} · {onAccount.name}
                </span>
                {/* Which of their accounts: their main currency's unless another is picked for this sale. */}
                {onAccount.onCurrency && (onAccount.currencies?.length ?? 0) > 1 ? (
                  <Select
                    value={onAccount.currency}
                    onChange={(value) => onAccount.onCurrency?.(value as AnyCurrency)}
                    options={(onAccount.currencies ?? []).map((code) => ({
                      value: code,
                      label: CURRENCIES[code].symbol,
                    }))}
                    className="h-7 w-20 shrink-0 text-xs"
                  />
                ) : null}
              </span>
              {/* What stands there already: what they owe, or what is theirs to spend first. */}
              {onAccount.balance ? (
                <span className={cn('block text-xs', onAccount.balance > 0 ? 'text-ink-3' : 'text-ok')}>
                  {onAccount.balance > 0
                    ? t('pos.debtOwed', { amount: money(onAccount.balance, onAccount.currency) })
                    : t('pos.creditHeld', { amount: money(-onAccount.balance, onAccount.currency) })}
                </span>
              ) : null}
            </label>
            {/* "=" puts on the account whatever the money typed above has not covered. */}
            <MoneyInput
              id={accountId}
              value={onAccount.sums.amount}
              // What goes there in the sale's money is the anchor: typed, the account's sum follows afresh.
              onChange={(amount) => onAccount.onChange({ amount, received: null })}
              currency={base()}
              fillValue={Math.min(onAccount.max, (onAccount.sums.amount ?? 0) + settlement.due)}
              invalid={(onAccount.sums.amount ?? 0) > onAccount.max}
            />
            {onAccount.line ? (
              // The pair: what goes on the account in the sale's money, the rate, and what the account's
              // account takes for it in its own.
              <>
                <span
                  className={RATE}
                  title={
                    onAccount.line.pair && onAccount.line.dayRate
                      ? pairSentence(onAccount.line.pair, onAccount.line.dayRate)
                      : undefined
                  }
                >
                  {onAccount.line.dayRate ? rateText(onAccount.line.dayRate) : '—'}
                </span>
                <span className={UNDER}>{t('pos.onAccountIn', { currency: onAccount.currency })}</span>
                <ReceivedInput
                  line={onAccount.line}
                  sums={onAccount.sums}
                  toCurrency={onAccount.currency}
                  onChange={onAccount.onChange}
                  setsRates={onAccount.setsRates}
                  label={t('pos.onAccountIn', { currency: onAccount.currency })}
                />
              </>
            ) : null}
          </div>
          {onAccount.line ? (
            <ReceivedNote
              line={onAccount.line}
              book={onAccount.book}
              setsRates={onAccount.setsRates}
              className="text-right"
            />
          ) : null}
          {/* What their haqi covers and what is lent, and by when the lent part is to be paid. */}
          {onAccount.sums.amount && (onAccount.prepaid || onAccount.lent) ? (
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-ink-3">
              {onAccount.prepaid ? (
                <span className="tabular">
                  {t('pos.fromCredit', { amount: money(onAccount.prepaid, onAccount.currency) })}
                </span>
              ) : null}
              {onAccount.lent ? (
                <>
                  <span className="tabular">
                    {t('pos.lent', { amount: money(onAccount.lent, onAccount.currency) })}
                  </span>
                  <label htmlFor={dueId}>{t('pos.debtDue')}</label>
                  <span className="w-36">
                    <DateInput
                      id={dueId}
                      value={onAccount.dueDate ?? ''}
                      onChange={(date) => onAccount.onDueDate(date || null)}
                      warnPast
                    />
                  </span>
                  {onAccount.noDue && !onAccount.dueDate ? <span>{t('pos.noDue')}</span> : null}
                </>
              ) : null}
            </div>
          ) : null}
          {onAccount.sums.amount && onAccount.warning ? <p className="text-xs text-warn">{onAccount.warning}</p> : null}
        </div>
      ) : null}
      {refunding && keep ? (
        // Decided, not fallen into: Enter walks the money, and this is a Tab away.
        <div
          data-enter-skip
          data-keep
          className="flex flex-col gap-1.5 border-t border-line pt-3"
          onKeyDown={backToMoney}
        >
          <div className={ROW}>
            <label htmlFor={keepId} className="min-w-0 text-[13px] text-ink-2">
              <span className="block truncate">{t('pos.keepOnAccount', { name: keep.name })}</span>
              {keep.balance ? (
                <span className={cn('block text-xs', keep.balance > 0 ? 'text-ink-3' : 'text-ok')}>
                  {keep.balance > 0
                    ? t('pos.debtOwed', { amount: money(keep.balance, keep.currency) })
                    : t('pos.creditHeld', { amount: money(-keep.balance, keep.currency) })}
                </span>
              ) : null}
            </label>
            {/* "=" keeps there whatever the money typed above has not handed back. */}
            <MoneyInput
              id={keepId}
              value={keep.amount}
              onChange={(amount) => keep.onChange({ amount, settled: null })}
              currency={base()}
              fillValue={Math.min(keep.max, (keep.amount ?? 0) + refund.due)}
              invalid={(keep.amount ?? 0) > keep.max}
            />
            {keep.currency !== base() && unit(keep.currency) !== null ? (
              <>
                <span className={RATE}>
                  {formatMoney(unit(keep.currency) as number, base(), { minor: 'auto', symbol: false })}
                </span>
                <span className={UNDER}>{t('pos.onAccountIn', { currency: keep.currency })}</span>
                <MoneyInput
                  aria-label={t('pos.onAccountIn', { currency: keep.currency })}
                  value={keeping ? keep.settled : null}
                  onChange={(settled) => keep.onChange({ amount: keep.amount, settled })}
                  currency={keep.currency}
                  placeholder={
                    keeping && exchange(keeping, base(), keep.currency, book) !== null
                      ? formatMoney(exchange(keeping, base(), keep.currency, book) as number, keep.currency, {
                          symbol: false,
                          group: ' ',
                        })
                      : undefined
                  }
                  invalid={keep.strays}
                />
              </>
            ) : null}
          </div>
          {keep.strays ? (
            <p className="text-right text-xs text-bad">
              {t(context.approvers.some((approver) => approver.discount) ? 'pos.rateLossAsk' : 'pos.changeLossStop', {
                percent: String(context.maxRateLossPercent).replace('.', ','),
              })}
            </p>
          ) : null}
        </div>
      ) : null}
      {offAccount ? (
        <div className="flex items-baseline justify-between border-t border-line pt-3 text-[13px]">
          <span className="text-ink-2">{t('pos.offAccount')}</span>
          <span className="tabular font-medium">{money(offAccount)}</span>
        </div>
      ) : null}

      <Button variant="primary" className="h-11 text-sm" loading={busy} onClick={onComplete}>
        {action}
        <Shortcut combo="f9" className="ml-1 opacity-70" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft />
        {t('pos.backToCart')}
        <Shortcut combo="escape" className="ml-1" />
      </Button>
    </section>
  )
}
