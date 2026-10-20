import {
  CURRENCIES,
  dueIn,
  exchange,
  formatMoney,
  tillWorth,
  worthOf,
  type AnyCurrency,
  type CardPickDto,
  type CurrencyCode,
  type RateBook,
  type PosContextDto,
  type RefundSettlement,
  type Settlement,
} from '@erp/core'
import { ArrowLeft, Eye, EyeOff, X } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Segments, Select } from '@/components/ui/controls'
import { DateInput } from '@/components/ui/date-input'
import { Shortcut } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { NoticePicks } from '@/features/cards/notice-picks'
import { Balance, Balances } from '@/features/customers/balance'
import { ReceivedNote, type ExchangeSums } from '@/features/money/exchange'
import type { ValuedLine } from '@/features/money/payment-lines'
import { base, baseWords, currencyWords } from '@/lib/base'
import { cn } from '@/lib/cn'

import { BalanceMove, ChangeRows, type ChangePanel } from './change-rows'
import { GivenInput, GivenNote } from './given-for'
import { OwnPair } from './own-pair'
import {
  changeLines,
  changeOf,
  changeWords,
  enteredRows,
  refundsOf,
  tendersOf,
  type Returning,
  type TenderRow,
} from './pos-state'
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
  /**
   * The currency the customer deals in, when it is not the base and the till keeps it: what is to pay is said in
   * it too, in full sight, and — nothing typed — it is what is meant.
   */
  prefer?: AnyCurrency | null
  /** Who is buying, and what stands on their balance in each currency: in sight beside the money. */
  balances?: { name: string; accounts: { currency: AnyCurrency; balance: number }[] } | null
  /** What the banks wrote of money landing on the shop's cards: a card's sum is picked from it. */
  picks?: CardPickDto[]
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
  /** They supply goods: writing on their account will ask for a manager's PIN. */
  asks?: boolean
  onChange: (sums: { amount: number | null; settled: number | null }) => void
}

/** One of the customer's accounts part of the sale may go on: a currency. */
export interface OnAccountRow {
  currency: AnyCurrency
  /**
   * What of the sale goes there, in the sale's money (`amount`), and — for an account in another currency — what
   * that is in the account's own where it was typed (`received`; null: the day's rate makes it).
   */
  sums: ExchangeSums
  /** The pair of sums where the account is in another currency than the sale; null where it is not. */
  line: ValuedLine | null
  /** What stands on the account now, in its currency: above zero they owe, below it the money is theirs (haqi). */
  balance: number | null
  /** Of what goes there now, in the account's currency: what their haqi covers, and what is lent. */
  prepaid: number
  lent: number
  /** Their haqi there, in the sale's money: what "=" takes first. */
  haqi: number
  /** Opened for this sale only: it may be taken off again. */
  removable: boolean
}

export interface OnAccount {
  /** Whose accounts. */
  name: string
  /** A line to each currency: the main account, every one with money of theirs on it, any added for the sale. */
  rows: OnAccountRow[]
  /** The currencies a line may still be opened in. */
  spare: AnyCurrency[]
  onAdd: (currency: AnyCurrency) => void
  onRemove: (currency: AnyCurrency) => void
  /** The most that can go there in all: what there is to pay. */
  max: number
  book: RateBook | null
  /** An agreed sum however far from the day's rate is this person's to make. */
  setsRates: boolean
  /** When what is lent falls due; null: never. One day for all of it. */
  dueDate: string | null
  /** Their debts are given no day: the day may be left empty. */
  noDue: boolean
  onDueDate: (date: string | null) => void
  /** Why a manager's word will be asked for, when it will. */
  warning: string | null
  onChange: (currency: AnyCurrency, sums: ExchangeSums) => void
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
  prefer = null,
  balances = null,
  picks = [],
}: TenderPanelProps) {
  const { t } = useTranslation()
  const accountId = useId()
  const keepId = useId()
  const dueId = useId()
  const sums = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const { book } = context
  /** One of a currency in the base at the day's rate, in its smallest coin; null with no rate. */
  const unit = (currency: AnyCurrency) => tillWorth(100, currency, book)
  const foreign = (row: TenderRow) => row.currency !== base()
  const entered = enteredRows(rows)
  // What stays on the account is not for the money to hand back.
  const keeping = refunding && keep ? Math.min(keep.amount ?? 0, keep.max) : 0
  const typed = refunding ? refundsOf(entered, due - keeping, book) : tendersOf(entered, false)
  // Handing back: a card the receipt was not paid with. Seldom wanted, so it keeps out of sight like a hidden row.
  const stranger = (row: TenderRow) =>
    refunding && row.method !== 'cash' && !returning?.found.caps.accounts.some((cap) => cap.accountId === row.accountId)
  // A hidden row stays out of sight unless it holds a sum — typed, or what is meant when nothing is typed.
  const tucked = (row: TenderRow) => {
    const place = tenderPlace(row)
    return (
      !!hiding &&
      !hiding.peek &&
      place !== null &&
      (hiding.hidden.includes(place) || stranger(row)) &&
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
    return place !== null && (!!hiding?.hidden.includes(place) || stranger(row))
  })
  // What stands beside a sum (an agreed worth, a slip's number) is there as soon as the cursor is in its
  // row: appearing only once the sum was typed, Tab would have gone past where it was about to be.
  const [within, setWithin] = useState<string | null>(null)
  const covered = refunding
    ? refund.problem === null && refund.due === 0
    : settlement.problem === null && settlement.due === 0

  // What goes on the accounts is not for the money to cover.
  const typedOn = onAccount ? onAccount.rows.reduce((sum, row) => sum + (row.sums.amount ?? 0), 0) : 0
  const owing = onAccount ? Math.min(typedOn, onAccount.max) : 0
  const lentOn = onAccount ? onAccount.rows.some((row) => row.lent > 0) : false
  // Paid over the sum, nothing is left to go on the account: what is over may stay there instead, as change kept.
  // The two are never offered at once — unless something was typed here already, to be taken off again.
  const lending = !!onAccount && (typedOn > 0 || !(change && change.over > 0))
  // Paid over the sum by someone with a balance: handed back, or left there? Nobody has said yet, and it is not
  // guessed — nothing is sold until the cashier says.
  const undecided = !refunding && !!change && change.over > 0 && change.mode === null
  /** The cursor goes to the choice that is waited for. */
  const toChoice = () => panel.current?.querySelector<HTMLElement>('[data-change-mode] [role="radio"]')?.focus()
  // What of the change goes into the customer's hand or to their card, in words: what stays on their balance is not.
  const handedBack = changeWords(
    changeOf(settlement).filter((part) => part.way !== 'account'),
    t,
  )

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

  // ── What each place holds now, and would after this: for whoever may see balances (`context.held`) ──
  const placeOf = (row: Pick<TenderRow, 'method' | 'currency' | 'accountId'>) =>
    row.method === 'cash' ? (context.drawers[row.currency] ?? `drawer:${row.currency}`) : row.accountId
  const moves = new Map<string, number>()
  if (context.held) {
    const move = (place: string | null, amount: number) => {
      if (place && amount) {
        moves.set(place, (moves.get(place) ?? 0) + amount)
      }
    }
    // Nothing typed: what is meant is what shows faintly in the rows.
    const meant = entered.length
      ? entered
      : rows.flatMap((row) => (suggested[row.key] ? [{ ...row, amount: suggested[row.key] }] : []))
    for (const row of meant) {
      move(placeOf(row), refunding ? -(row.amount ?? 0) : (row.amount ?? 0))
    }
    if (!refunding && !settlement.problem) {
      // The change leaves the places it is handed from: the base drawer, another drawer's notes, a card.
      move(placeOf({ method: 'cash', currency: base(), accountId: null }), -settlement.changeUzs)
      for (const line of change ? changeLines(change.rows, change.over, book) : []) {
        if (line.way !== 'account') {
          move(placeOf({ method: line.way, currency: line.currency, accountId: line.accountId }), -line.amount)
        }
      }
    }
  }

  // A field gives up what was typed into it on the same Enter that asks what to do next. What the rows
  // hold after that key is known only once they have been drawn again, so it is read from here.
  const state = {
    held: [...rows, ...(change?.rows ?? [])]
      .map((row) => `${row.key}:${row.amount ?? ''}:${row.value ?? ''}`)
      .join('|'),
    ready: !entered.length || covered,
    covered,
    undecided,
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
  const paired =
    rows.some((row) => foreign(row) && unit(row.currency) !== null) || !!onAccount?.rows.some((row) => row.line)
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
        // What was paid over the sum waits to be told where it goes: Enter asks, it does not sell.
        if (now.undecided) {
          toChoice()
        } else {
          onComplete()
        }
      } else {
        move(1)
      }
    })
  }

  /** Enter on the choice already made goes on to sell; on the other, it is the choice. */
  const sellOnChosen = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target
    if (
      event.key === 'Enter' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      target instanceof HTMLElement &&
      !!change?.mode &&
      target.dataset.segment === change.mode
    ) {
      event.preventDefault()
      onComplete()
    }
  }

  /** Enter in the account's sum takes it and goes back to the money: the rest is paid there, and sold from there. */
  const backToMoney = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey || !(target instanceof HTMLElement)) {
      return
    }
    // A sum on one of the accounts (`${accountId}-UZS`), or what is kept: Enter goes back to the money.
    if (!target.id.startsWith(`${accountId}-`) && target.id !== keepId) {
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
    <section
      ref={panel}
      className="@container flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-card"
    >
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">{refunding ? t('pos.toRefund') : t('pos.toPay')}</span>
          <span className={cn('tabular text-2xl font-semibold', refunding && 'text-warn')}>{money(due)}</span>
        </div>
        {/* In the customer's own currency it is said plainly; in the others the till takes, in passing. */}
        {prefer && due && unit(prefer) !== null ? (
          <p data-prefer className="tabular text-right text-base font-semibold text-ink-2">
            = {money(dueIn(due, prefer, book) as number, prefer)}
          </p>
        ) : null}
        {others.some((code) => code !== prefer) && due ? (
          <p className="tabular text-right text-xs text-ink-3">
            {others
              .filter((code) => code !== prefer)
              .map((code) => `≈ ${money(dueIn(due, code, book) as number, code)}`)
              .join(' · ')}
          </p>
        ) : null}
        {balances ? (
          <p data-balances className="tabular mt-1 text-right text-xs text-ink-3">
            {t('pos.customerBalances', { name: balances.name })}:{' '}
            {balances.accounts.some((item) => item.balance) ? (
              <Balances items={balances.accounts.filter((item) => item.balance)} />
            ) : (
              <Balance balance={0} currency={base()} />
            )}
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
          const account =
            (refunding ? cap : undefined) ??
            [...context.cards, ...context.terminals].find((item) => item.id === row.accountId)
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
                  // What money was agreed to be worth was agreed for that much of it; a sum typed over the bank's
                  // lets its notices go.
                  onChange={(amount) =>
                    onPatch(row.key, amount === row.amount ? { amount } : { amount, value: null, noticeIds: undefined })
                  }
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
              {!refunding && row.method === 'card' && row.accountId ? (
                <NoticePicks
                  picks={picks.filter((pick) => pick.accountId === row.accountId)}
                  chosen={row.noticeIds ?? []}
                  onChange={(noticeIds, sum) => onPatch(row.key, { amount: sum || null, value: null, noticeIds })}
                />
              ) : null}
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
              {context.held && moves.get(placeOf(row) as string) ? (
                <p data-held={row.key} className="tabular text-right text-xs text-ink-3">
                  {t('pos.heldMove', {
                    before: money(context.held[placeOf(row) as string] ?? 0, row.currency),
                    after: money(
                      (context.held[placeOf(row) as string] ?? 0) + (moves.get(placeOf(row) as string) ?? 0),
                      row.currency,
                    ),
                  })}
                </p>
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
          <p className="text-xs text-ink-3">
            {t(
              refunding ? 'pos.enterHintRefund' : 'pos.enterHint',
              // What is meant when nothing is typed: cash in the customer's currency where they have one here.
              prefer && !refunding && suggested[`cash:${prefer}`] ? currencyWords(t, prefer) : baseWords(t),
            )}
          </p>
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
              <span className={undecided ? 'font-medium text-warn' : 'text-ink-3'}>
                {undecided ? t('pos.overPaid') : t('pos.change')}
              </span>
              {/* What goes back into the customer's hand, or to their card: what stays with the shop is not change.
                  Nothing to hand back is said quietly — all of it stays on the balance, said below. Until the
                  cashier has said which, it is only money over the sum. */}
              <span
                data-change-said
                className={cn(
                  'tabular text-right',
                  undecided || handedBack ? 'text-lg font-semibold' : 'text-ink-3',
                  undecided
                    ? 'text-warn'
                    : settlement.problem === 'change_over'
                      ? 'text-bad'
                      : handedBack
                        ? 'text-ok'
                        : '',
                )}
              >
                {undecided ? money(change?.over ?? 0) : handedBack || money(0)}
              </span>
            </div>
            {/* What was paid over the sum is handed back, or left with the customer for next time: said, not guessed. */}
            {change && change.over > 0 ? (
              <div
                data-enter-skip
                data-change-mode
                data-undecided={undecided || undefined}
                className="flex flex-wrap items-center gap-2"
                onKeyDown={sellOnChosen}
              >
                {/* A choice of two, as wide as its words: it is not a heading of the panel. Waited for, it stands out. */}
                <Segments
                  value={change.mode}
                  onChange={change.onMode}
                  options={[
                    { value: 'give', label: t('pos.changeGive') },
                    { value: 'keep', label: t('pos.changeKeep') },
                  ]}
                  className={cn(
                    'h-7 w-fit [&>button]:flex-none [&>button]:px-3 [&>button]:text-xs',
                    undecided && 'border-warn outline-2 outline-warn/25',
                  )}
                />
                {undecided ? <span className="text-xs text-warn">{t('pos.changeChoose')}</span> : null}
                {/* Seldom wanted: notes of another currency, or a card, stay folded until asked for. */}
                {change.mode === 'give' && change.rows.some((row) => row.way !== 'account') ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => change.onOpen(!change.open)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-accent-ink hover:bg-accent-soft"
                  >
                    {change.open ? t('pos.changeAllCash', baseWords(t)) : t('pos.splitChange')}
                    {change.open ? null : <Shortcut combo="f10" />}
                  </button>
                ) : null}
              </div>
            ) : null}
            {change && change.over > 0 && change.mode === 'keep' && !change.keeper ? (
              <p data-keep-hint className="text-xs text-warn">
                {t('pos.keepChangePick')}
              </p>
            ) : null}
            {settlement.problem === 'change_over' ? (
              <p className="text-bad">{t('pos.changeOver', { amount: money(change?.over ?? 0) })}</p>
            ) : null}
            {change &&
            change.over > 0 &&
            (change.mode === 'keep' ? !!change.keeper : change.mode === 'give' && change.open) ? (
              <ChangeRows context={context} change={change} settlement={settlement} onKeyDown={walk} />
            ) : null}
          </>
        )}
      </div>

      {onAccount && lending ? (
        // Like lending, decided rather than fallen into: Enter does not walk into it.
        <div
          data-enter-skip
          data-on-account
          className="flex flex-col gap-1.5 border-t border-line pt-3"
          onKeyDown={backToMoney}
        >
          <div className="flex min-w-0 items-center gap-2 text-[13px] text-ink-2">
            <span className="min-w-0 truncate">
              {t('pos.onAccount')} · {onAccount.name}
            </span>
            {/* Another of their accounts, for this sale: "10 $ of theirs, the rest owed in so'm". */}
            {onAccount.spare.length ? (
              <Select
                // Picked, it is a line of its own: the box is empty again for the next.
                key={onAccount.spare.join()}
                value=""
                onChange={(value) => (value ? onAccount.onAdd(value as AnyCurrency) : undefined)}
                placeholder={t('pos.onAccountAdd')}
                options={onAccount.spare.map((code) => ({ value: code, label: currencyWords(t, code).Currency }))}
                className="ml-auto h-7 w-36 shrink-0 text-xs"
              />
            ) : null}
          </div>
          {onAccount.rows.map((row) => {
            const symbol = CURRENCIES[row.currency].symbol
            const id = `${accountId}-${row.currency}`
            // "=" takes what is theirs there first, as far as the sale goes; else what the money typed above and
            // the other lines leave.
            const others = onAccount.rows
              .filter((other) => other !== row)
              .reduce((sum, other) => sum + (other.sums.amount ?? 0), 0)
            const room = Math.max(0, Math.min(onAccount.max - others, (row.sums.amount ?? 0) + settlement.due))
            const fill = row.haqi > 0 ? Math.min(room, row.haqi) : room
            return (
              <div key={row.currency} data-on-account-row={row.currency} className="flex flex-col gap-1.5">
                <div className={ROW}>
                  <label htmlFor={id} className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2">
                    <span className="truncate">
                      {/* Heard whole by a screen reader: whose account, and which. */}
                      <span className="sr-only">
                        {t('pos.onAccount')} · {onAccount.name} · {symbol} ·{' '}
                      </span>
                      {t('pos.onAccountOf', { currency: currencyWords(t, row.currency).Currency })}
                    </span>
                    {row.removable ? (
                      <button
                        type="button"
                        tabIndex={-1}
                        title={t('pos.onAccountRemove')}
                        aria-label={t('pos.onAccountRemove')}
                        onClick={() => onAccount.onRemove(row.currency)}
                        className="shrink-0 rounded p-0.5 text-ink-3 hover:bg-sunken hover:text-ink"
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </label>
                  {row.line ? (
                    // A balance in another currency is written as cash of that currency is: its own sum, the
                    // rate, and what that is in the sale's money — the same columns as the money above.
                    <OwnPair
                      id={id}
                      currency={row.currency}
                      book={book}
                      own={row.sums.amount ? (row.sums.received ?? row.line.settled) : null}
                      typed={row.sums.received !== null}
                      value={row.sums.amount}
                      room={room}
                      // "=" takes what is theirs there first.
                      ownMost={row.balance !== null && row.balance < 0 ? -row.balance : null}
                      invalid={typedOn > onAccount.max}
                      strays={row.line.strays && !onAccount.setsRates}
                      onChange={(next) => onAccount.onChange(row.currency, { amount: next.value, received: next.own })}
                    />
                  ) : (
                    <MoneyInput
                      id={id}
                      value={row.sums.amount}
                      onChange={(amount) => onAccount.onChange(row.currency, { amount, received: null })}
                      currency={base()}
                      fillValue={fill || undefined}
                      invalid={typedOn > onAccount.max}
                    />
                  )}
                </div>
                {row.line ? (
                  <ReceivedNote
                    line={row.line}
                    book={onAccount.book}
                    setsRates={onAccount.setsRates}
                    className="text-right"
                  />
                ) : null}
                {/* What stands on their balance now — owed, or theirs to spend first — and after this sale, and of
                    it what their haqi covers and what is lent. */}
                {row.balance !== null || (row.sums.amount && (row.prepaid || row.lent)) ? (
                  <p
                    data-balance-move
                    className="tabular flex flex-wrap items-center justify-end gap-x-3 text-right text-xs text-ink-3"
                  >
                    {row.sums.amount && row.prepaid ? (
                      <span>{t('pos.fromCredit', { amount: money(row.prepaid, row.currency) })}</span>
                    ) : null}
                    {row.sums.amount && row.lent ? (
                      <span>{t('pos.lent', { amount: money(row.lent, row.currency) })}</span>
                    ) : null}
                    {row.balance !== null ? (
                      <BalanceMove
                        before={row.balance}
                        after={row.balance + (row.sums.amount ? row.prepaid + row.lent : 0)}
                        currency={row.currency}
                      />
                    ) : null}
                  </p>
                ) : null}
              </div>
            )
          })}
          {/* By when what is lent is to be paid: one day for all of it. */}
          {lentOn ? (
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-ink-3">
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
            </div>
          ) : null}
          {typedOn && onAccount.warning ? <p className="text-xs text-warn">{onAccount.warning}</p> : null}
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
            </label>
            {/* "=" keeps there whatever the money typed above has not handed back. */}
            {keep.currency !== base() && unit(keep.currency) !== null ? (
              // A balance in another currency: its own sum, the rate, and what that is of the money owed.
              <OwnPair
                id={keepId}
                currency={keep.currency}
                book={book}
                own={keeping ? (keep.settled ?? exchange(keeping, base(), keep.currency, book)) : null}
                typed={keep.settled !== null}
                value={keep.amount}
                room={Math.min(keep.max, (keep.amount ?? 0) + refund.due)}
                invalid={(keep.amount ?? 0) > keep.max}
                strays={keep.strays}
                onChange={(next) => keep.onChange({ amount: next.value, settled: next.own })}
              />
            ) : (
              <MoneyInput
                id={keepId}
                value={keep.amount}
                onChange={(amount) => keep.onChange({ amount, settled: null })}
                currency={base()}
                fillValue={Math.min(keep.max, (keep.amount ?? 0) + refund.due)}
                invalid={(keep.amount ?? 0) > keep.max}
              />
            )}
          </div>
          {/* What stands on their balance now, and what will once this much stays there. */}
          {keep.balance !== null ? (
            <p data-balance-move className="tabular text-right text-xs text-ink-3">
              <BalanceMove
                before={keep.balance}
                after={
                  keep.balance -
                  (keeping
                    ? (keep.settled ??
                      (keep.currency === base() ? keeping : (exchange(keeping, base(), keep.currency, book) ?? 0)))
                    : 0)
                }
                currency={keep.currency}
              />
            </p>
          ) : null}
          {keep.asks && keep.amount ? <p className="text-right text-xs text-warn">{t('pos.supplierKeepAsk')}</p> : null}
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
