import {
  formatMoney,
  toBase,
  worthOf,
  type CurrencyCode,
  type PosContextDto,
  type RefundSettlement,
  type Settlement,
} from '@gulbahor/core'
import { ArrowLeft } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/controls'
import { Shortcut } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { cn } from '@/lib/cn'

import { changeText, enteredRows, tendersOf, type Returning, type TenderRow } from './pos-state'
import { TakenFor } from './taken-for'

const money = (minor: number, currency: CurrencyCode = 'UZS') => formatMoney(minor, currency, { minor: 'auto' })

/** The four ways money changes hands at a till; each has its key. */
export type TenderKind = 'cash' | 'usd' | 'card' | 'terminal'
export const kindOf = (row: TenderRow): TenderKind =>
  row.method === 'cash' ? (row.currency === 'USD' ? 'usd' : 'cash') : row.method
const KIND_LABELS: Record<TenderKind, string> = {
  cash: 'pos.payCash',
  usd: 'pos.payUsd',
  card: 'pos.payCard',
  terminal: 'pos.payTerminal',
}
const KIND_KEYS: Record<TenderKind, string> = { cash: 'f5', usd: 'f6', card: 'f7', terminal: 'f8' }

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
}

/**
 * The money, beside the receipt it pays. Every way of paying has its row,
 * ready to be typed into: so'm, dollars, each of the shop's cards, each
 * terminal. Enter walks the sums; once they cover the receipt, or when
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
}: TenderPanelProps) {
  const { t } = useTranslation()
  const rate = context.rate?.uzsPerUsd ?? null
  const entered = enteredRows(rows)
  const typed = tendersOf(entered, refunding)
  // What stands beside a sum (an agreed worth, a slip's number) is there as soon as the cursor is in its
  // row: appearing only once the sum was typed, Tab would have gone past where it was about to be.
  const [within, setWithin] = useState<string | null>(null)
  const covered = refunding
    ? refund.problem === null && refund.due === 0
    : settlement.problem === null && settlement.due === 0

  /** What is left for a row to cover once the others have paid theirs, in so'm. */
  const restFor = (row: TenderRow): number => {
    const others = typed
      .filter((_, index) => entered[index].key !== row.key)
      .reduce((sum, item) => sum + worthOf(item, rate), 0)
    return Math.max(0, due - others)
  }
  /** What a row would have to hold to cover the rest: what "=" fills in. */
  const fillOf = (row: TenderRow): number => {
    const rest = restFor(row)
    return row.currency === 'USD' && rate ? Math.ceil((rest * 100) / Math.round(rate * 100)) : rest
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

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-card">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">{refunding ? t('pos.toRefund') : t('pos.toPay')}</span>
          <span className={cn('tabular text-2xl font-semibold', refunding && 'text-warn')}>{money(due)}</span>
        </div>
        {rate && due ? (
          <p className="tabular text-right text-xs text-ink-3">
            ≈ {money(Math.ceil((due * 100) / Math.round(rate * 100)), 'USD')}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-3" onKeyDown={walk}>
        {rows.map((row) => {
          const kind = kindOf(row)
          const cap = returning?.found.caps.accounts.find((item) => item.accountId === row.accountId)
          // Paying, a card is one of the shop's; handing back, it is the one the receipt was paid with.
          const account = refunding
            ? cap
            : [...context.cards, ...context.terminals].find((item) => item.id === row.accountId)
          const noRate = row.currency === 'USD' && !rate
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
              <div className="flex items-center gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-ink-2">
                  <span className="truncate">
                    {account ? (
                      <>
                        {account.name}
                        {account.last4 ? <span className="font-code text-ink-3"> *{account.last4}</span> : null}
                      </>
                    ) : (
                      t(KIND_LABELS[kind])
                    )}
                    {limit !== null && kind !== 'usd' ? (
                      <span className="tabular text-ink-3">
                        {' ≤ '}
                        {formatMoney(limit, 'UZS', { minor: 'auto', symbol: false })}
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
                  // What dollars were agreed to be worth was agreed for that many of them.
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
                  className="w-44"
                />
              </div>
              {!refunding && row.method === 'terminal' && (row.amount || within === row.key) ? (
                <div data-enter-skip className="flex items-center justify-end gap-2">
                  <span className="text-xs text-ink-3">{t('pos.rrn')}</span>
                  <Input
                    value={row.reference}
                    maxLength={12}
                    onChange={(event) => onPatch(row.key, { reference: event.target.value })}
                    className="font-code w-44"
                  />
                </div>
              ) : null}
              {row.currency === 'USD' && rate && (row.amount || (!refunding && within === row.key)) ? (
                refunding ? (
                  <p className="tabular text-right text-xs text-ink-3">
                    = {money(toBase(row.amount as number, 'USD', rate))}
                  </p>
                ) : (
                  <TakenFor
                    dollars={row.amount}
                    value={row.value}
                    rate={rate}
                    rest={restFor(row)}
                    limit={context.maxRateLossPercent}
                    mayAsk={context.approvers.some((approver) => approver.discount)}
                    alone={context.mayOverDiscount}
                    onChange={(value) => onPatch(row.key, { value })}
                  />
                )
              ) : null}
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
          <p className="text-xs text-ink-3">{t(refunding ? 'pos.enterHintRefund' : 'pos.enterHint')}</p>
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
              {settlement.dueUsd ? ` · ${money(settlement.dueUsd, 'USD')}` : ''}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-3">{t('pos.change')}</span>
            <span className="flex items-center gap-2">
              {context.usd && rate ? (
                <Select
                  value={changeCurrency}
                  onChange={(value) => onChangeCurrency(value as CurrencyCode)}
                  options={[
                    { value: 'UZS', label: "so'm" },
                    { value: 'USD', label: '$' },
                  ]}
                  className="h-7 w-20 text-xs"
                />
              ) : null}
              <span className="tabular text-lg font-semibold text-ok">
                {changeText(settlement.changeUzs, settlement.changeUsd)}
              </span>
            </span>
          </div>
        )}
      </div>

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
