import {
  CURRENCIES,
  dueIn,
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
import { ArrowLeft } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/controls'
import { DateInput } from '@/components/ui/date-input'
import { Shortcut } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { ReceivedInput, ReceivedNote, type ExchangeSums } from '@/features/money/exchange'
import { pairSentence, rateText, type ValuedLine } from '@/features/partners/payment-lines'
import { base, baseWords, currencyWords } from '@/lib/base'
import { cn } from '@/lib/cn'

import { changeText, enteredRows, tendersOf, type Returning, type TenderRow } from './pos-state'
import { TakenInput, TakenNote } from './taken-for'

const money = (minor: number, currency: CurrencyCode = base()) => formatMoney(minor, currency, { minor: 'auto' })

/**
 * A row of the panel, as a row of the payment window: what is paid with, the sum, and — where the sum is in
 * another currency than what it pays — the rate and the second sum of the pair. In a panel too narrow for
 * four columns the second sum goes under the first.
 */
const ROW = 'grid grid-cols-[minmax(0,1fr)_11rem] items-center gap-2 @xl:grid-cols-[minmax(0,1fr)_11rem_6.5rem_11rem]'
const RATE = 'tabular hidden pr-2.5 text-right text-xs text-ink-3 @xl:block'
/** Says what the second sum is where there is no heading over it. */
const UNDER = 'text-right text-xs text-ink-3 @xl:hidden'

/** The four ways money changes hands at a till: cash in the base, cash in another currency, a card, a terminal. */
export type TenderKind = 'cash' | 'other' | 'card' | 'terminal'
export const kindOf = (row: TenderRow): TenderKind =>
  row.method === 'cash' ? (row.currency !== base() ? 'other' : 'cash') : row.method
const KIND_KEYS: Record<TenderKind, string> = { cash: 'f5', other: 'f6', card: 'f7', terminal: 'f8' }

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
  changeCurrency: CurrencyCode
  onChangeCurrency: (currency: CurrencyCode) => void
  /** What the button that ends it says: "Sotish", "Qaytarish", "Almashtirish". */
  action: string
  busy: boolean
  onComplete: () => void
  onBack: () => void
  /** Leaving part of it owing: offered when someone on the books is buying. */
  lend?: Lending | null
  /** Goods brought back on a receipt that still leaves something owing: so much comes off the debt, not out of the drawer. */
  offDebt?: number
  /** Putting part of it on a partner's account: offered when a partner is buying. */
  onAccount?: OnAccount | null
  /** Goods brought back on a receipt that put something on a partner's account: so much comes off it there. */
  offPartner?: number
}

export interface OnAccount {
  /** Whose account. */
  name: string
  currency: AnyCurrency
  sums: ExchangeSums
  /** The pair of sums where the account is in another currency than the sale; null where it is not. */
  line: ValuedLine | null
  /** The most that can go there: what there is to pay. */
  max: number
  book: RateBook | null
  /** An agreed sum however far from the day's rate is this person's to make. */
  setsRates: boolean
  /** Why a manager's word will be asked for, when it will. */
  warning: string | null
  onChange: (sums: ExchangeSums) => void
}

export interface Lending {
  amount: number | null
  dueDate: string
  /** The most that can be left owing: what there is to pay. */
  max: number
  /** What the customer owes already. */
  owed: number
  /** Why a manager's word will be asked for, when it will. */
  warning: string | null
  onAmount: (amount: number | null) => void
  onDueDate: (date: string) => void
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
  changeCurrency,
  onChangeCurrency,
  action,
  busy,
  onComplete,
  onBack,
  lend = null,
  offDebt = 0,
  onAccount = null,
  offPartner = 0,
}: TenderPanelProps) {
  const { t } = useTranslation()
  const lendId = useId()
  const accountId = useId()
  const dueId = useId()
  const sums = useRef<HTMLDivElement>(null)
  const { book } = context
  /** One of a currency in the base at the day's rate, in its smallest coin; null with no rate. */
  const unit = (currency: AnyCurrency) => tillWorth(100, currency, book)
  const foreign = (row: TenderRow) => row.currency !== base()
  const entered = enteredRows(rows)
  const typed = tendersOf(entered, refunding)
  // What stands beside a sum (an agreed worth, a slip's number) is there as soon as the cursor is in its
  // row: appearing only once the sum was typed, Tab would have gone past where it was about to be.
  const [within, setWithin] = useState<string | null>(null)
  const covered = refunding
    ? refund.problem === null && refund.due === 0
    : settlement.problem === null && settlement.due === 0

  // What is left owing is not for the money to cover.
  const owing =
    (lend ? Math.min(lend.amount ?? 0, lend.max) : 0) +
    (onAccount ? Math.min(onAccount.sums.amount ?? 0, onAccount.max) : 0)

  /** What is left for a row to cover once the others have paid theirs, in so'm. */
  const restFor = (row: TenderRow): number => {
    const others = typed
      .filter((_, index) => entered[index].key !== row.key)
      .reduce((sum, item) => sum + (worthOf(item, book) ?? 0), 0)
    return Math.max(0, due - owing - others)
  }
  /** What a row would have to hold to cover the rest: what "=" fills in. */
  const fillOf = (row: TenderRow): number => {
    const rest = restFor(row)
    return foreign(row) ? (dueIn(rest, row.currency, book) ?? rest) : rest
  }

  // A field gives up what was typed into it on the same Enter that asks what to do next. What the rows
  // hold after that key is known only once they have been drawn again, so it is read from here.
  const state = {
    held: rows.map((row) => `${row.key}:${row.amount ?? ''}:${row.value ?? ''}`).join('|'),
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

  /** Enter in the sum lent takes it and goes back to the money: the rest is paid there, and sold from there. */
  const backToMoney = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey || !(target instanceof HTMLElement)) {
      return
    }
    if (target.id !== lendId) {
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
        {rows.map((row) => {
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
          const first = rows.find((item) => kindOf(item) === kind) === row
          return (
            <div
              key={row.key}
              data-tender={row.key}
              data-kind={kind}
              onFocus={() => setWithin(row.key)}
              className="flex flex-col gap-1.5"
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
                      <span className="tabular pr-2.5 text-right text-[13px] text-ink-3">
                        {row.amount ? money(tillWorth(row.amount, row.currency, book) as number) : ''}
                      </span>
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
              {foreign(row) && unit(row.currency) !== null && !refunding ? <TakenNote {...takenFor(row)} /> : null}
            </div>
          )
        })}
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
        ) : settlement.problem === 'non_cash_over' ? (
          <p className="text-bad">{t('pos.nonCashOver')}</p>
        ) : settlement.due > 0 ? (
          <div className="flex items-baseline justify-between text-bad">
            <span>{t('pos.due')}</span>
            <span className="tabular font-semibold">
              {money(settlement.due)}
              {others.length ? ` · ${money(dueIn(settlement.due, others[0], book) as number, others[0])}` : ''}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-3">{t('pos.change')}</span>
            <span className="flex items-center gap-2">
              {others.length ? (
                <Select
                  value={changeCurrency}
                  onChange={(value) => onChangeCurrency(value as CurrencyCode)}
                  options={[base(), ...others].map((code) => ({ value: code, label: CURRENCIES[code].symbol }))}
                  className="h-7 w-20 text-xs"
                />
              ) : null}
              <span className="tabular text-lg font-semibold text-ok">
                {changeText(settlement.changeUzs, settlement.changeOther, settlement.changeCurrency)}
              </span>
            </span>
          </div>
        )}
      </div>

      {lend ? (
        // Not one of the sums Enter walks: lending is decided, not fallen into.
        <div
          data-enter-skip
          data-lend
          className="flex flex-col gap-1.5 border-t border-line pt-3"
          onKeyDown={backToMoney}
        >
          <div className={ROW}>
            <label htmlFor={lendId} className="min-w-0 text-[13px] text-ink-2">
              {t('pos.debt')}
              {lend.owed ? (
                <span className="text-xs text-ink-3"> · {t('pos.debtOwed', { amount: money(lend.owed) })}</span>
              ) : null}
            </label>
            {/* "=" leaves owing whatever the money typed above has not covered. */}
            <MoneyInput
              id={lendId}
              value={lend.amount}
              onChange={lend.onAmount}
              currency={base()}
              fillValue={Math.min(lend.max, (lend.amount ?? 0) + settlement.due)}
              invalid={(lend.amount ?? 0) > lend.max}
            />
            {lend.amount ? (
              <>
                <label htmlFor={dueId} className="text-right text-xs text-ink-3">
                  {t('pos.debtDue')}
                </label>
                <DateInput id={dueId} value={lend.dueDate} onChange={lend.onDueDate} warnPast />
              </>
            ) : null}
          </div>
          {lend.amount && lend.warning ? <p className="text-xs text-warn">{lend.warning}</p> : null}
        </div>
      ) : null}
      {onAccount ? (
        // Like lending, decided rather than fallen into: Enter does not walk into it.
        <div
          data-enter-skip
          data-on-account
          className="flex flex-col gap-1.5 border-t border-line pt-3"
          onKeyDown={backToMoney}
        >
          <div className={ROW}>
            <label htmlFor={accountId} className="min-w-0 truncate text-[13px] text-ink-2">
              {t('pos.onAccount')} · {onAccount.name}
            </label>
            {/* "=" puts on the account whatever the money typed above has not covered. */}
            <MoneyInput
              id={accountId}
              value={onAccount.sums.amount}
              // What goes there in the sale's money is the anchor: typed, the partner's sum follows afresh.
              onChange={(amount) => onAccount.onChange({ amount, received: null })}
              currency={base()}
              fillValue={Math.min(onAccount.max, (onAccount.sums.amount ?? 0) + settlement.due)}
              invalid={(onAccount.sums.amount ?? 0) > onAccount.max}
            />
            {onAccount.line ? (
              // The pair: what goes on the account in the sale's money, the rate, and what the partner's
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
          {onAccount.sums.amount && onAccount.warning ? <p className="text-xs text-warn">{onAccount.warning}</p> : null}
        </div>
      ) : null}
      {offPartner ? (
        <div className="flex items-baseline justify-between border-t border-line pt-3 text-[13px]">
          <span className="text-ink-2">{t('pos.offPartner')}</span>
          <span className="tabular font-medium">{money(offPartner)}</span>
        </div>
      ) : null}
      {offDebt ? (
        <div className="flex items-baseline justify-between border-t border-line pt-3 text-[13px]">
          <span className="text-ink-2">{t('pos.offDebt')}</span>
          <span className="tabular font-medium">{money(offDebt)}</span>
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
