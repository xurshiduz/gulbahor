import {
  CURRENCIES,
  exchange,
  formatMoney,
  overChangeLoss,
  tillWorth,
  wholeNotes,
  type AnyCurrency,
  type PosContextDto,
  type Settlement,
} from '@erp/core'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { MoneyInput } from '@/components/ui/money-input'
import { Balance } from '@/features/customers/balance'
import { base, baseWords, currencyWords } from '@/lib/base'
import { cn } from '@/lib/cn'

import { OwnPair } from './own-pair'
import { changeLines, type ChangeRow } from './pos-state'
import { RATE, ROW, UNDER } from './tender-grid'

const money = (minor: number, currency: AnyCurrency = base()) => formatMoney(minor, currency, { minor: 'auto' })
const plain = (minor: number, currency: AnyCurrency = base()) =>
  formatMoney(minor, currency, { symbol: false, group: ' ' })

/** A customer's balance now, and what it will be once this is written. */
export function BalanceMove({ before, after, currency }: { before: number; after: number; currency: AnyCurrency }) {
  const { t } = useTranslation()
  // Nothing written there yet: what stands now, once — not "x → x".
  return (
    <>
      {t('pos.balanceOf')}: <Balance balance={before} currency={currency} />
      {after !== before ? (
        <>
          {' → '}
          <Balance balance={after} currency={currency} />
        </>
      ) : null}
    </>
  )
}

/** The change, where the cashier says how it goes back: what there is to give, and a row for each way beside cash in the base. */
export interface ChangePanel {
  /** The ways it can go back beside cash in the base, each with what was typed into it. */
  rows: ChangeRow[]
  onPatch: (key: string, patch: Partial<ChangeRow>) => void
  /**
   * What is done with what was paid over the sum: handed back — in cash, or as the rows say — or left on the
   * customer's balance, theirs to spend next time. Null: there is someone whose balance it could stay on, and
   * the cashier has not said which yet — it is theirs to say, and nothing is sold until they have.
   */
  mode: ChangeMode | null
  onMode: (mode: ChangeMode) => void
  /** Handing back: the rows for other ways than cash in the base are out. */
  open: boolean
  onOpen: (open: boolean) => void
  /** What was paid over the sum, in the base. */
  over: number
  /**
   * Whose balance it may be left on, and what stands there now in its currency. `asks`: they supply goods,
   * and writing on their balance will ask for a manager's PIN.
   */
  keeper: { name: string; balance: number | null; asks?: boolean } | null
  /** Sending it from a card will ask for a manager's PIN. */
  cardAsks: boolean
}

export type ChangeMode = 'give' | 'keep'

/** A sum the till works out itself, drawn where a field would stand: read, not typed. */
function Counted({ value, label }: { value: number | null; label: string }) {
  return (
    <output
      data-counted
      aria-label={label}
      className="tabular flex h-8.5 items-center justify-end rounded-md border border-dashed border-line-strong bg-sunken/60 text-[13px]"
    >
      <span className="pr-1 pl-2.5 font-medium text-ink">{value === null ? '—' : plain(value)}</span>
      <span className="pr-2.5 pl-1 text-xs text-ink-3">{CURRENCIES[base()].symbol}</span>
    </output>
  )
}

interface ChangeRowsProps {
  context: PosContextDto
  change: ChangePanel
  settlement: Settlement
  /** Enter and the arrows walk these sums as they walk the money's. */
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}

/**
 * How the change goes back when not all of it is cash in the base: a row for
 * every way, cash in the base among them. Another drawer's notes are typed in
 * their own currency and go for what the day's rate makes them, or for a
 * worth agreed — "two dollars for the 25 000"; a part sent from a card, in the
 * card's; a part kept on the customer's balance, in the balance's own, with
 * what that is in the sale's money beside it. Cash in the base is whatever
 * the others leave: counted in its row for the cashier, not typed.
 */
export function ChangeRows({ context, change, settlement, onKeyDown }: ChangeRowsProps) {
  const { t } = useTranslation()
  const { book } = context
  const { onPatch, over } = change
  const written = changeLines(change.rows, over, book)
  // Handing back, the ways money leaves the shop; leaving it with the customer, their balance alone.
  const rows = change.rows.filter((row) => (row.way === 'account') === (change.mode === 'keep'))
  const worthOf = (line: (typeof written)[number]) => line.value ?? tillWorth(line.amount, line.currency, book) ?? 0
  /** What is left to give once the other rows have taken theirs. */
  const restFor = (row: ChangeRow) =>
    Math.max(0, over - written.reduce((sum, line) => sum + (line.key === row.key ? 0 : worthOf(line)), 0))
  const mayAsk = context.approvers.some((approver) => approver.discount)
  // What nobody named is cash in the base, rounded to the till's step: `exact` is what it would be to the coin.
  const exact = settlement.changeUzs + settlement.rounding
  // Why the row holds what it holds, under its name: it is what the others leave — and, rounded, what that was.
  const restWhy =
    !settlement.problem && settlement.rounding
      ? t('pos.changeRounded', { exact: money(exact) })
      : t('pos.changeRestHint')
  const rest = (
    <div data-change-rest className={ROW}>
      <span className="min-w-0 text-[13px] text-ink-2">
        <span className="block truncate">{t('pos.payCash', baseWords(t))}</span>
        <span className="tabular block truncate text-xs text-ink-3" title={restWhy}>
          {restWhy}
        </span>
      </span>
      <Counted value={settlement.problem ? null : settlement.changeUzs} label={t('pos.changeRest', baseWords(t))} />
    </div>
  )

  return (
    <div data-change className="flex flex-col gap-2" onKeyDown={onKeyDown}>
      {/* Handing back, cash in the base leads, as it does among the ways of paying. */}
      {change.mode === 'give' ? rest : null}
      {rows.map((row) => {
        const line = written.find((item) => item.key === row.key)
        const foreign = row.currency !== base()
        const unit = foreign ? tillWorth(100, row.currency, book) : null
        const atRate = line ? tillWorth(line.amount, line.currency, book) : null
        const fx = line && atRate !== null ? worthOf(line) - atRate : 0
        // Given away past what a cashier may give alone: a manager's word will be asked for.
        const far =
          !!line &&
          !context.mayOverDiscount &&
          overChangeLoss([{ ...line, base: worthOf(line), fx }], context.maxRateLossPercent)
        const card = row.way === 'card' ? context.cards.find((item) => item.id === row.accountId) : null
        const keeper = row.way === 'account' ? change.keeper : null
        // What the account takes for the part kept there, at the day's rate.
        const derived =
          row.way === 'account' && foreign && row.value ? exchange(row.value, base(), row.currency, book) : null
        return (
          <div key={row.key} data-change-row={row.key} className="flex flex-col gap-1.5">
            <div className={ROW}>
              <span className="min-w-0 text-[13px] text-ink-2">
                {row.way === 'account' ? (
                  // Whose balance, on a line of its own: the cell is narrow, and the name is what must be read.
                  <>
                    <span className="block truncate">{t('pos.changeKeepRow')}</span>
                    <span className="block truncate text-xs text-ink-3" title={keeper?.name}>
                      {keeper?.name}
                    </span>
                  </>
                ) : (
                  <span className="block truncate">
                    {row.way === 'cash' ? (
                      t('pos.payCash', currencyWords(t, row.currency))
                    ) : (
                      <>
                        {t('pos.changeFromCard', { name: card?.name ?? '' })}
                        {card?.last4 ? <span className="font-code text-ink-3"> *{card.last4}</span> : null}
                      </>
                    )}
                  </span>
                )}
              </span>
              {row.way === 'account' ? (
                foreign ? (
                  // A balance in another currency: its own sum, the rate, and what that is of the change.
                  <OwnPair
                    label={t('pos.changeToAccount', { name: keeper?.name ?? '' })}
                    currency={row.currency}
                    book={book}
                    own={row.value ? (row.amount ?? derived) : null}
                    typed={row.amount !== null}
                    value={row.value}
                    room={restFor(row)}
                    strays={far}
                    onChange={(sums) => onPatch(row.key, { amount: sums.own, value: sums.value })}
                  />
                ) : (
                  <MoneyInput
                    value={row.value}
                    onChange={(value) => onPatch(row.key, { value, amount: null })}
                    currency={base()}
                    fillValue={restFor(row)}
                    aria-label={t('pos.changeToAccount', { name: keeper?.name ?? '' })}
                  />
                )
              ) : (
                <MoneyInput
                  value={row.amount}
                  // A worth agreed was agreed for that much of it.
                  onChange={(amount) => onPatch(row.key, amount === row.amount ? { amount } : { amount, value: null })}
                  currency={row.currency}
                  // A till keeps no coins of another currency: whole notes of it.
                  fillValue={foreign ? wholeNotes(restFor(row), row.currency, book) : restFor(row)}
                  aria-label={
                    row.way === 'cash'
                      ? t('pos.payCash', currencyWords(t, row.currency))
                      : t('pos.changeFromCard', { name: card?.name ?? '' })
                  }
                />
              )}
              {row.way !== 'account' && foreign && unit !== null ? (
                <>
                  <span className={RATE} title={`1 ${CURRENCIES[row.currency].symbol} = ${money(unit)}`}>
                    {plain(unit)}
                  </span>
                  <span className={UNDER}>{t('pos.takenFor', baseWords(t))}</span>
                  {/* The second sum of the pair is a Tab away: Enter walks the first. */}
                  <div data-enter-skip>
                    <MoneyInput
                      value={row.amount ? row.value : null}
                      onChange={(next) =>
                        onPatch(row.key, { value: next === null || next === atRate || !row.amount ? null : next })
                      }
                      currency={base()}
                      // What it goes for when nothing is typed: the day's rate, or what is left to give.
                      placeholder={line ? plain(worthOf(line)) : undefined}
                      fillValue={restFor(row)}
                      invalid={far}
                      aria-label={t('pos.takenFor', baseWords(t))}
                    />
                  </div>
                </>
              ) : null}
            </div>
            {line && fx && atRate !== null ? (
              <p className={cn('tabular text-right text-xs', fx > 0 ? 'text-ok' : far ? 'text-bad' : 'text-warn')}>
                {t(fx > 0 ? 'pos.changeRateGain' : 'pos.changeRateLoss', {
                  book: money(atRate),
                  amount: money(Math.abs(fx)),
                })}
              </p>
            ) : null}
            {far ? (
              <p className="text-right text-xs text-bad">
                {t(mayAsk ? 'pos.rateLossAsk' : 'pos.changeLossStop', {
                  percent: String(context.maxRateLossPercent).replace('.', ','),
                })}
              </p>
            ) : null}
            {/* What stands on their balance now, and what will once this is written. */}
            {keeper && keeper.balance !== null ? (
              <p data-balance-move className="tabular text-right text-xs text-ink-3">
                <BalanceMove
                  before={keeper.balance}
                  after={keeper.balance - (line?.amount ?? 0)}
                  currency={row.currency}
                />
              </p>
            ) : null}
            {row.way === 'card' && line && change.cardAsks ? (
              <p className="text-right text-xs text-warn">{t('pos.cardChangeAsk')}</p>
            ) : null}
            {keeper?.asks && line ? <p className="text-right text-xs text-warn">{t('pos.supplierKeepAsk')}</p> : null}
          </div>
        )
      })}
      {/* Left on the balance, what it does not take is still cash to hand back; all of it left there, there is
          none, and nothing to say. */}
      {change.mode === 'keep' && (settlement.changeUzs || settlement.problem) ? rest : null}
    </div>
  )
}
