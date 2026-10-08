import {
  CURRENCIES,
  formatMoney,
  paymentLabel,
  shiftCloseSchema,
  type AnyCurrency,
  type PosContextDto,
  type ShiftDto,
} from '@erp/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LockOpen } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Badge, Shortcut, Spinner } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { api } from '@/lib/api'
import { base, currencyWords } from '@/lib/base'
import { cn } from '@/lib/cn'
import { formatDateTime, formatNumber } from '@/lib/format'
import { toast } from '@/lib/toast'

import { emptyHandings, handingIn, HandoverFields, handoversOf, ownSafes } from './handover'

const refreshTill = (queryClient: ReturnType<typeof useQueryClient>) => {
  void queryClient.invalidateQueries({ queryKey: ['pos'] })
  void queryClient.invalidateQueries({ queryKey: ['shifts'] })
  void queryClient.invalidateQueries({ queryKey: ['money'] })
}

/** The cash typed for each drawer, as the server takes it: a drawer left empty was counted as nothing. */
type Counted = Partial<Record<AnyCurrency, number | null>>
const countedOf = (cash: Counted) =>
  Object.fromEntries(Object.entries(cash).filter((entry): entry is [string, number] => entry[1] !== null))

/** A field for each of the till's drawers, the base first. */
function DrawerFields({
  currencies,
  value,
  onChange,
  className = 'grid gap-4 sm:grid-cols-2',
}: {
  currencies: AnyCurrency[]
  value: Counted
  onChange: (value: Counted) => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div className={className}>
      {currencies.map((currency, index) => (
        <Field key={currency} label={t('pos.drawer', currencyWords(t, currency))} required={index === 0}>
          {(id) => (
            <MoneyInput
              id={id}
              autoFocus={index === 0}
              value={value[currency] ?? null}
              onChange={(amount) => onChange({ ...value, [currency]: amount })}
              currency={currency}
            />
          )}
        </Field>
      ))}
    </div>
  )
}

/** A till with no shift: count the drawers and start. */
export function OpenShift({ context }: { context: PosContextDto }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [cash, setCash] = useState<Counted>({})

  const open = useMutation({
    mutationFn: () => api.post<ShiftDto>('/shifts', { registerId: context.register.id, cash: countedOf(cash) }),
    onSuccess: (shift) => {
      toast.success(t('pos.shiftOpened', { number: shift.number }))
      refreshTill(queryClient)
    },
  })

  return (
    <div className="flex flex-1 items-start justify-center pt-[10vh]">
      <section className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-card">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
            <LockOpen className="size-5" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold">{t('pos.openShift')}</h2>
            <p className="text-xs text-ink-3">
              {context.register.name} · {context.register.locationName}
            </p>
          </div>
        </div>
        <p className="mb-4 text-[13px] text-ink-2">{t('pos.openShiftHint')}</p>
        <Form onSubmit={() => open.mutate()}>
          <DrawerFields
            currencies={context.currencies}
            value={cash}
            onChange={setCash}
            className="flex flex-col gap-4"
          />
          <Button type="submit" variant="primary" loading={open.isPending}>
            {t('pos.openShift')}
            <Shortcut combo="mod+enter" className="ml-1 opacity-70" />
          </Button>
        </Form>
      </section>
    </div>
  )
}

/** The closing count. It is blind: the drawer is counted before anyone is told what should be in it. */
export function CloseShiftDialog({ context, onClose }: { context: PosContextDto; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const shift = context.shift as ShiftDto
  const currencies = context.currencies
  const [cash, setCash] = useState<Counted>({})
  const [note, setNote] = useState('')
  // What the end of a shift hands over stays in its currency: an exchange is for the middle of one.
  const safes = ownSafes(context)
  const [handings, setHandings] = useState(() => emptyHandings(safes, currencies))
  /** What each terminal's end-of-day slip says, as far as the cashier typed it. */
  const [slips, setSlips] = useState<Record<string, number | null>>({})

  const close = useMutation({
    mutationFn: (input: unknown) => api.post<ShiftDto>(`/shifts/${shift.id}/close`, input),
    onSuccess: (closed) => {
      toast.success(t('pos.shiftClosed', { number: closed.number }))
      refreshTill(queryClient)
      onClose()
    },
  })

  const submit = () => {
    if ((cash[base()] ?? null) === null) {
      toast.error(t('pos.countFirst'))
      return
    }
    const handovers = handoversOf(handings)
    if (currencies.some((currency) => (handingIn(handings, currency).amount ?? 0) > (cash[currency] ?? 0))) {
      toast.error(t('pos.handoverOver'))
      return
    }
    const terminals = context.terminals.flatMap((terminal) => {
      const amount = slips[terminal.id]
      return amount === null || amount === undefined ? [] : [{ accountId: terminal.id, amount }]
    })
    const parsed = shiftCloseSchema.safeParse({ cash: countedOf(cash), note, handovers, terminals })
    if (parsed.success) {
      close.mutate(parsed.data)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('pos.closeShift', { number: shift.number })}
      description={t('pos.closeShiftHint')}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="close-shift-form" variant="primary" loading={close.isPending}>
            {t('pos.closeShiftAction')}
          </Button>
        </>
      }
    >
      <Form id="close-shift-form" onSubmit={submit}>
        <DrawerFields currencies={currencies} value={cash} onChange={setCash} />
        {/* What of the counted cash goes to the safe now; the rest stays in the drawer for the next shift. */}
        <HandoverFields
          safes={safes}
          value={handings}
          onChange={setHandings}
          currencies={currencies.filter((currency) => safes.some((safe) => safe.currency === currency))}
          limits={cash}
        />
        {context.terminals.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {context.terminals.map((terminal) => (
              <Field key={terminal.id} label={t('pos.terminalSlip', { name: terminal.name })}>
                {(id) => (
                  <MoneyInput
                    id={id}
                    value={slips[terminal.id] ?? null}
                    onChange={(amount) => setSlips((current) => ({ ...current, [terminal.id]: amount }))}
                    currency={base()}
                  />
                )}
              </Field>
            ))}
          </div>
        ) : null}
        <Field label={t('receipts.note')}>
          {(id) => <Input id={id} value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />}
        </Field>
        {shift.totals ? <ShiftReport shift={shift} /> : null}
      </Form>
    </Dialog>
  )
}

const Row = ({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: 'bad' | 'ok'
}) => (
  <div className="flex items-baseline justify-between gap-4 py-1">
    <span className="text-ink-3">{label}</span>
    <span
      className={cn('tabular', strong && 'font-semibold', tone === 'bad' && 'text-bad', tone === 'ok' && 'text-ok')}
    >
      {value}
    </span>
  </div>
)

const money = (minor: number, currency: AnyCurrency = base()) => formatMoney(minor, currency, { minor: 'auto' })

/** The Z-report: what was sold in a shift and how it was paid; for those who check it, the count against the books. */
export function ShiftReport({ shift }: { shift: ShiftDto }) {
  const { t } = useTranslation()
  const totals = shift.totals
  if (!totals) {
    return null
  }
  const currencies = [
    ...new Set([...shift.counts.map((count) => count.currency), ...totals.cash.map((moves) => moves.currency)]),
  ]
  const drawers = currencies
    .map((currency) => ({
      currency,
      count: shift.counts.find((count) => count.currency === currency),
      moves: totals.cash.find((moves) => moves.currency === currency),
    }))
    .filter(
      ({ currency, count, moves }) =>
        currency === base() ||
        !!(count?.opening || count?.counted || count?.expected || count?.diff) ||
        !!(
          moves &&
          (moves.in ||
            moves.out ||
            moves.partnersIn ||
            moves.partnersOut ||
            moves.debts ||
            moves.income ||
            moves.expenses ||
            moves.change)
        ),
    )
  const diff = (value: number | null, currency: AnyCurrency) =>
    value === null ? null : (
      <Row
        label={`${t('pos.diff')} (${CURRENCIES[currency].symbol})`}
        value={`${value > 0 ? '+' : ''}${money(value, currency)}`}
        strong
        tone={value < 0 ? 'bad' : value > 0 ? 'ok' : undefined}
      />
    )

  return (
    <div className="grid gap-x-8 gap-y-3 text-[13px] sm:grid-cols-2">
      <div>
        <p className="eyebrow mb-1">{t('pos.reportSales')}</p>
        <Row label={t('pos.reportCount')} value={formatNumber(totals.sales)} />
        <Row label={t('receipts.totalQty')} value={formatNumber(totals.qty)} />
        <Row label={t('pos.discount')} value={money(totals.discount)} />
        <Row label={t('pos.total')} value={money(totals.total)} strong />
        {totals.voided ? <Row label={t('pos.reportVoided')} value={formatNumber(totals.voided)} tone="bad" /> : null}
        {totals.returns ? (
          <Row
            label={`${t('sales.tabReturns')} (${formatNumber(totals.returns)})`}
            value={`−${money(totals.returned)}`}
            tone="bad"
          />
        ) : null}
      </div>
      <div>
        <p className="eyebrow mb-1">{t('pos.reportPayments')}</p>
        {totals.payments.length ? (
          totals.payments.map((payment) => (
            <Row
              key={`${payment.method}:${payment.accountName}:${payment.currency}`}
              // What went on a partner's account is no money in the drawer: whose account, and in both currencies.
              label={
                payment.method === 'partner'
                  ? `${paymentLabel(payment)} · ${payment.accountName}`
                  : paymentLabel(payment)
              }
              value={
                payment.method === 'partner' && payment.currency !== base()
                  ? `${money(payment.base)} (${money(payment.amount, payment.currency)})`
                  : money(payment.amount, payment.currency)
              }
            />
          ))
        ) : (
          <p className="py-1 text-ink-3">—</p>
        )}
        {totals.refunds.map((refund) => (
          <Row
            key={`back:${refund.method}:${refund.accountName}:${refund.currency}`}
            label={
              refund.method === 'debt'
                ? t('pos.offDebt')
                : refund.method === 'partner'
                  ? `${t('pos.offPartner')} · ${refund.accountName}`
                  : `${t('sales.refunded')}: ${paymentLabel(refund)}`
            }
            value={`−${money(refund.amount, refund.currency)}`}
          />
        ))}
        {totals.cash
          .filter((moves) => moves.change)
          .map((moves) => (
            <Row
              key={`change:${moves.currency}`}
              label={t('pos.changeGiven')}
              value={`−${money(moves.change, moves.currency)}`}
            />
          ))}
        {totals.rounding ? (
          <Row label={t('pos.rounding')} value={`${totals.rounding > 0 ? '+' : ''}${money(totals.rounding)}`} />
        ) : null}
      </div>
      {shift.terminals.length ? (
        <div className="sm:col-span-2">
          <p className="eyebrow mb-1">{t('pos.reportTerminals')}</p>
          <div className="grid gap-x-8 sm:grid-cols-2">
            {shift.terminals.map((terminal) => (
              <div key={terminal.accountId}>
                <Row
                  label={`${terminal.name}: ${t('pos.counted').toLowerCase()}`}
                  value={money(terminal.counted)}
                  strong
                />
                {terminal.expected !== null ? <Row label={t('pos.expected')} value={money(terminal.expected)} /> : null}
                {diff(terminal.diff, base())}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <p className="eyebrow mb-1">{t('pos.reportDrawer')}</p>
        <div className="grid gap-x-8 sm:grid-cols-2">
          {drawers.map(({ currency, count, moves }) => (
            <div key={currency}>
              {drawers.length > 1 ? (
                <p className="mt-1 text-xs font-medium text-ink-2">{currencyWords(t, currency).Currency}</p>
              ) : null}
              <Row label={t('pos.opening')} value={money(count?.opening ?? 0, currency)} />
              {moves?.in ? <Row label={t('pos.broughtIn')} value={`+${money(moves.in, currency)}`} /> : null}
              {moves?.out ? <Row label={t('pos.handedOut')} value={`−${money(moves.out, currency)}`} /> : null}
              {moves?.partnersIn ? (
                <Row label={t('pos.partnersIn')} value={`+${money(moves.partnersIn, currency)}`} />
              ) : null}
              {moves?.partnersOut ? (
                <Row label={t('pos.partnersOut')} value={`−${money(moves.partnersOut, currency)}`} />
              ) : null}
              {moves?.debts ? <Row label={t('pos.debtsIn')} value={`+${money(moves.debts, currency)}`} /> : null}
              {moves?.income ? <Row label={t('pos.otherIn')} value={`+${money(moves.income, currency)}`} /> : null}
              {moves?.expenses ? (
                <Row label={t('pos.expensesOut')} value={`−${money(moves.expenses, currency)}`} />
              ) : null}
              {count && count.counted !== null ? (
                <Row label={t('pos.counted')} value={money(count.counted, currency)} strong />
              ) : null}
              {count && count.expected !== null ? (
                <Row label={t('pos.expected')} value={money(count.expected, currency)} />
              ) : null}
              {diff(count?.diff ?? null, currency)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** A shift looked at after the fact: who, when, and its report. */
export function ShiftDialog({ shiftId, onClose }: { shiftId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const shift = useQuery({
    queryKey: ['shifts', 'one', shiftId],
    queryFn: ({ signal }) => api.get<ShiftDto>(`/shifts/${shiftId}`, undefined, signal),
  })
  const data = shift.data

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={data ? `${t('shifts.one')} ${data.number}` : t('shifts.one')}
      description={data ? `${data.registerName} · ${data.locationName}` : undefined}
      footer={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      {data ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]">
            <Badge tone={data.status === 'open' ? 'ok' : 'neutral'}>
              {data.status === 'open' ? t('shifts.open') : t('shifts.closed')}
            </Badge>
            <span className="text-ink-3">
              {t('shifts.openedAt')}: <span className="text-ink">{formatDateTime(data.openedAt)}</span> ·{' '}
              {data.openedByName}
            </span>
            {data.closedAt ? (
              <span className="text-ink-3">
                {t('shifts.closedAt')}: <span className="text-ink">{formatDateTime(data.closedAt)}</span> ·{' '}
                {data.closedByName}
              </span>
            ) : null}
          </div>
          {data.note ? <p className="text-[13px] text-ink-2">{data.note}</p> : null}
          <ShiftReport shift={data} />
        </div>
      ) : (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      )}
    </Dialog>
  )
}
