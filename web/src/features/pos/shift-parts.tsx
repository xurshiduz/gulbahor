import { formatMoney, paymentLabel, shiftCloseSchema, type PosContextDto, type ShiftDto } from '@gulbahor/core'
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
import { cn } from '@/lib/cn'
import { formatDateTime, formatNumber } from '@/lib/format'
import { toast } from '@/lib/toast'

import { emptyHandings, HandoverFields, handoversOf } from './handover'

const refreshTill = (queryClient: ReturnType<typeof useQueryClient>) => {
  void queryClient.invalidateQueries({ queryKey: ['pos'] })
  void queryClient.invalidateQueries({ queryKey: ['shifts'] })
  void queryClient.invalidateQueries({ queryKey: ['money'] })
}

/** A till with no shift: count the drawer and start. */
export function OpenShift({ context }: { context: PosContextDto }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [cashUzs, setCashUzs] = useState<number | null>(null)
  const [cashUsd, setCashUsd] = useState<number | null>(null)

  const open = useMutation({
    mutationFn: () =>
      api.post<ShiftDto>('/shifts', { registerId: context.register.id, cashUzs: cashUzs ?? 0, cashUsd: cashUsd ?? 0 }),
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
          <Field label={t('pos.drawerUzs')} required>
            {(id) => <MoneyInput id={id} autoFocus value={cashUzs} onChange={setCashUzs} currency="UZS" />}
          </Field>
          {context.usd ? (
            <Field label={t('pos.drawerUsd')}>
              {(id) => <MoneyInput id={id} value={cashUsd} onChange={setCashUsd} currency="USD" />}
            </Field>
          ) : null}
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
  const [cashUzs, setCashUzs] = useState<number | null>(null)
  const [cashUsd, setCashUsd] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [handings, setHandings] = useState(() => emptyHandings(context.safes))
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
    if (cashUzs === null) {
      toast.error(t('pos.countFirst'))
      return
    }
    const handovers = handoversOf(handings)
    if ((handings.UZS.amount ?? 0) > cashUzs || (handings.USD.amount ?? 0) > (cashUsd ?? 0)) {
      toast.error(t('pos.handoverOver'))
      return
    }
    const terminals = context.terminals.flatMap((terminal) => {
      const amount = slips[terminal.id]
      return amount === null || amount === undefined ? [] : [{ accountId: terminal.id, amount }]
    })
    const parsed = shiftCloseSchema.safeParse({ cashUzs, cashUsd: cashUsd ?? 0, note, handovers, terminals })
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('pos.drawerUzs')} required>
            {(id) => <MoneyInput id={id} autoFocus value={cashUzs} onChange={setCashUzs} currency="UZS" />}
          </Field>
          {context.usd ? (
            <Field label={t('pos.drawerUsd')}>
              {(id) => <MoneyInput id={id} value={cashUsd} onChange={setCashUsd} currency="USD" />}
            </Field>
          ) : null}
        </div>
        {/* What of the counted cash goes to the safe now; the rest stays in the drawer for the next shift. */}
        <HandoverFields
          safes={context.safes}
          value={handings}
          onChange={setHandings}
          limits={{ UZS: cashUzs, USD: cashUsd }}
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
                    currency="UZS"
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

const money = (minor: number, currency: 'UZS' | 'USD' = 'UZS') => formatMoney(minor, currency, { minor: 'auto' })

/** The Z-report: what was sold in a shift and how it was paid; for those who check it, the count against the books. */
export function ShiftReport({ shift }: { shift: ShiftDto }) {
  const { t } = useTranslation()
  const totals = shift.totals
  if (!totals) {
    return null
  }
  const diff = (value: number | null, currency: 'UZS' | 'USD') =>
    value === null ? null : (
      <Row
        label={`${t('pos.diff')} (${currency === 'USD' ? '$' : 'so‘m'})`}
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
              label={paymentLabel(payment)}
              value={money(payment.amount, payment.currency)}
            />
          ))
        ) : (
          <p className="py-1 text-ink-3">—</p>
        )}
        {totals.refunds.map((refund) => (
          <Row
            key={`back:${refund.method}:${refund.accountName}:${refund.currency}`}
            label={refund.method === 'debt' ? t('pos.offDebt') : `${t('sales.refunded')}: ${paymentLabel(refund)}`}
            value={`−${money(refund.amount, refund.currency)}`}
          />
        ))}
        {totals.changeUzs ? <Row label={t('pos.changeGiven')} value={`−${money(totals.changeUzs)}`} /> : null}
        {totals.changeUsd ? <Row label={t('pos.changeGiven')} value={`−${money(totals.changeUsd, 'USD')}`} /> : null}
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
                {diff(terminal.diff, 'UZS')}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <p className="eyebrow mb-1">{t('pos.reportDrawer')}</p>
        <div className="grid gap-x-8 sm:grid-cols-2">
          <div>
            <Row label={t('pos.opening')} value={money(shift.openingUzs)} />
            {totals.inUzs ? <Row label={t('pos.broughtIn')} value={`+${money(totals.inUzs)}`} /> : null}
            {totals.outUzs ? <Row label={t('pos.handedOut')} value={`−${money(totals.outUzs)}`} /> : null}
            {totals.partnersInUzs ? (
              <Row label={t('pos.partnersIn')} value={`+${money(totals.partnersInUzs)}`} />
            ) : null}
            {totals.partnersOutUzs ? (
              <Row label={t('pos.partnersOut')} value={`−${money(totals.partnersOutUzs)}`} />
            ) : null}
            {totals.debtsUzs ? <Row label={t('pos.debtsIn')} value={`+${money(totals.debtsUzs)}`} /> : null}
            {totals.incomeUzs ? <Row label={t('pos.otherIn')} value={`+${money(totals.incomeUzs)}`} /> : null}
            {totals.expensesUzs ? <Row label={t('pos.expensesOut')} value={`−${money(totals.expensesUzs)}`} /> : null}
            {shift.countedUzs !== null ? <Row label={t('pos.counted')} value={money(shift.countedUzs)} strong /> : null}
            {shift.expectedUzs !== null ? <Row label={t('pos.expected')} value={money(shift.expectedUzs)} /> : null}
            {diff(shift.diffUzs, 'UZS')}
          </div>
          {shift.openingUsd ||
          shift.countedUsd ||
          shift.expectedUsd ||
          totals.inUsd ||
          totals.outUsd ||
          totals.partnersInUsd ||
          totals.partnersOutUsd ||
          totals.debtsUsd ||
          totals.incomeUsd ||
          totals.expensesUsd ? (
            <div>
              <Row label={t('pos.opening')} value={money(shift.openingUsd, 'USD')} />
              {totals.inUsd ? <Row label={t('pos.broughtIn')} value={`+${money(totals.inUsd, 'USD')}`} /> : null}
              {totals.outUsd ? <Row label={t('pos.handedOut')} value={`−${money(totals.outUsd, 'USD')}`} /> : null}
              {totals.partnersInUsd ? (
                <Row label={t('pos.partnersIn')} value={`+${money(totals.partnersInUsd, 'USD')}`} />
              ) : null}
              {totals.partnersOutUsd ? (
                <Row label={t('pos.partnersOut')} value={`−${money(totals.partnersOutUsd, 'USD')}`} />
              ) : null}
              {totals.debtsUsd ? <Row label={t('pos.debtsIn')} value={`+${money(totals.debtsUsd, 'USD')}`} /> : null}
              {totals.incomeUsd ? <Row label={t('pos.otherIn')} value={`+${money(totals.incomeUsd, 'USD')}`} /> : null}
              {totals.expensesUsd ? (
                <Row label={t('pos.expensesOut')} value={`−${money(totals.expensesUsd, 'USD')}`} />
              ) : null}
              {shift.countedUsd !== null ? (
                <Row label={t('pos.counted')} value={money(shift.countedUsd, 'USD')} strong />
              ) : null}
              {shift.expectedUsd !== null ? (
                <Row label={t('pos.expected')} value={money(shift.expectedUsd, 'USD')} />
              ) : null}
              {diff(shift.diffUsd, 'USD')}
            </div>
          ) : null}
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
