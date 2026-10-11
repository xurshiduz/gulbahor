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
import { base, baseWords, currencyWords } from '@/lib/base'
import { cn } from '@/lib/cn'

import { changeLines, type ChangeRow } from './pos-state'
import { RATE, ROW, UNDER } from './tender-grid'

const money = (minor: number, currency: AnyCurrency = base()) => formatMoney(minor, currency, { minor: 'auto' })
const plain = (minor: number, currency: AnyCurrency = base()) =>
  formatMoney(minor, currency, { symbol: false, group: ' ' })

/** The change, where the cashier says how it goes back: what there is to give, and a row for each way beside cash in the base. */
export interface ChangePanel {
  /** The ways it can go back beside cash in the base, each with what was typed into it. */
  rows: ChangeRow[]
  onPatch: (key: string, patch: Partial<ChangeRow>) => void
  /** The rows are out. */
  open: boolean
  onOpen: (open: boolean) => void
  /** What was paid over the sum, in the base. */
  over: number
  /** Whose account a part may be kept on, and what stands there now in its currency. */
  keeper: { name: string; balance: number | null } | null
  /** Sending it from a card will ask for a manager's PIN. */
  cardAsks: boolean
}

interface ChangeRowsProps {
  context: PosContextDto
  change: ChangePanel
  settlement: Settlement
  /** Enter and the arrows walk these sums as they walk the money's. */
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}

/**
 * How the change goes back when not all of it is cash in the base. Another
 * drawer's notes are typed in their own currency and go for what the day's
 * rate makes them, or for a worth agreed — "two dollars for the 25 000"; a
 * part kept on the customer's account is typed in the base; a part sent from
 * a card, in the card's. Whatever is left is cash in the base, as ever.
 */
export function ChangeRows({ context, change, settlement, onKeyDown }: ChangeRowsProps) {
  const { t } = useTranslation()
  const { book } = context
  const { rows, onPatch, over } = change
  const written = changeLines(rows, over, book)
  const worthOf = (line: (typeof written)[number]) => line.value ?? tillWorth(line.amount, line.currency, book) ?? 0
  /** What is left to give once the other rows have taken theirs. */
  const restFor = (row: ChangeRow) =>
    Math.max(0, over - written.reduce((sum, line) => sum + (line.key === row.key ? 0 : worthOf(line)), 0))
  const mayAsk = context.approvers.some((approver) => approver.discount)

  return (
    <div data-change className="flex flex-col gap-2" onKeyDown={onKeyDown}>
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
                <span className="block truncate">
                  {row.way === 'cash' ? (
                    t('pos.payCash', currencyWords(t, row.currency))
                  ) : row.way === 'account' ? (
                    t('pos.changeToAccount', { name: keeper?.name ?? '' })
                  ) : (
                    <>
                      {t('pos.changeFromCard', { name: card?.name ?? '' })}
                      {card?.last4 ? <span className="font-code text-ink-3"> *{card.last4}</span> : null}
                    </>
                  )}
                </span>
                {keeper?.balance ? (
                  <span className={cn('block text-xs', keeper.balance > 0 ? 'text-ink-3' : 'text-ok')}>
                    {keeper.balance > 0
                      ? t('pos.debtOwed', { amount: money(keeper.balance, row.currency) })
                      : t('pos.creditHeld', { amount: money(-keeper.balance, row.currency) })}
                  </span>
                ) : null}
              </span>
              {row.way === 'account' ? (
                // Kept on the account in the sale's money: that is the anchor, the account's own sum follows.
                <MoneyInput
                  value={row.value}
                  onChange={(value) => onPatch(row.key, value === row.value ? { value } : { value, amount: null })}
                  currency={base()}
                  fillValue={restFor(row)}
                  aria-label={t('pos.changeToAccount', { name: keeper?.name ?? '' })}
                />
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
              {foreign && unit !== null ? (
                <>
                  <span className={RATE} title={`1 ${CURRENCIES[row.currency].symbol} = ${money(unit)}`}>
                    {plain(unit)}
                  </span>
                  <span className={UNDER}>
                    {row.way === 'account'
                      ? t('pos.onAccountIn', { currency: row.currency })
                      : t('pos.takenFor', baseWords(t))}
                  </span>
                  {/* The second sum of the pair is a Tab away: Enter walks the first. */}
                  <div data-enter-skip>
                    {row.way === 'account' ? (
                      <MoneyInput
                        value={row.value ? row.amount : null}
                        // Typed as what the rate makes it, nothing was agreed.
                        onChange={(next) =>
                          onPatch(row.key, { amount: next === null || next === derived || !row.value ? null : next })
                        }
                        currency={row.currency}
                        placeholder={derived === null ? undefined : plain(derived, row.currency)}
                        invalid={far}
                        aria-label={t('pos.onAccountIn', { currency: row.currency })}
                      />
                    ) : (
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
                    )}
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
            {row.way === 'card' && line && change.cardAsks ? (
              <p className="text-right text-xs text-warn">{t('pos.cardChangeAsk')}</p>
            ) : null}
          </div>
        )
      })}
      {/* What nobody named is cash in the base: counted for the cashier, not typed. */}
      <div className={ROW}>
        <span className="truncate text-[13px] text-ink-2">{t('pos.changeRest', baseWords(t))}</span>
        <span className="tabular pr-2.5 text-right text-[13px] font-medium">
          {settlement.problem ? '—' : money(settlement.changeUzs)}
        </span>
      </div>
    </div>
  )
}
