import {
  formatMoney,
  type AccountDto,
  type AnyCurrency,
  type CurrencyCode,
  type MoneyTransferDto,
  type PosContextDto,
} from '@gulbahor/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { TransferButtons } from '@/features/money/transfers'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'
import { uuid } from '@/lib/uuid'

const money = (minor: number, currency: AnyCurrency) => formatMoney(minor, currency, { minor: 'auto' })

const CURRENCIES: CurrencyCode[] = ['UZS', 'USD']

/** What is being handed over in one currency: how much, and to which safe. */
export interface Handing {
  amount: number | null
  toAccountId: string | null
}

export type Handings = Record<CurrencyCode, Handing>

/** Nothing handed over yet; where there is one safe for a currency, it is the one. */
export function emptyHandings(safes: AccountDto[]): Handings {
  const only = (currency: CurrencyCode) => safes.find((safe) => safe.currency === currency)?.id ?? null
  return { UZS: { amount: null, toAccountId: only('UZS') }, USD: { amount: null, toAccountId: only('USD') } }
}

interface HandoverFieldsProps {
  safes: AccountDto[]
  value: Handings
  onChange: (value: Handings) => void
  /** The most that can be handed over in each currency, when the screen knows it: what was just counted. */
  limits?: Partial<Record<CurrencyCode, number | null>>
  autoFocus?: boolean
}

/** The sums handed over, one field for each currency the shop has a safe for. */
export function HandoverFields({ safes, value, onChange, limits, autoFocus }: HandoverFieldsProps) {
  const { t } = useTranslation()
  const currencies = CURRENCIES.filter((currency) => safes.some((safe) => safe.currency === currency))
  const patch = (currency: CurrencyCode, change: Partial<Handing>) =>
    onChange({ ...value, [currency]: { ...value[currency], ...change } })

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {currencies.map((currency, index) => {
        const options = safes.filter((safe) => safe.currency === currency)
        const limit = limits?.[currency]
        const over = limit !== null && limit !== undefined && (value[currency].amount ?? 0) > limit
        return (
          <Field
            key={currency}
            label={currency === 'USD' ? t('pos.handoverUsd') : t('pos.handoverUzs')}
            error={over ? t('pos.handoverOver') : undefined}
          >
            {(id) => (
              <div className="flex flex-col gap-1.5">
                <MoneyInput
                  id={id}
                  autoFocus={autoFocus && index === 0}
                  value={value[currency].amount}
                  onChange={(amount) => patch(currency, { amount })}
                  currency={currency}
                  fillValue={limit ?? undefined}
                  invalid={over}
                />
                {options.length > 1 ? (
                  <Select
                    value={value[currency].toAccountId ?? ''}
                    onChange={(toAccountId) => patch(currency, { toAccountId })}
                    options={options.map((safe) => ({ value: safe.id, label: safe.name }))}
                  />
                ) : (
                  <span className="flex items-center gap-1 text-xs text-ink-3">
                    <ArrowRight className="size-3" />
                    {options[0]?.name}
                  </span>
                )}
              </div>
            )}
          </Field>
        )
      })}
    </div>
  )
}

/** The handovers that hold a sum, as the server takes them. */
export function handoversOf(value: Handings): { toAccountId: string; amount: number }[] {
  return CURRENCIES.flatMap((currency) => {
    const { amount, toAccountId } = value[currency]
    return amount && toAccountId ? [{ toAccountId, amount }] : []
  })
}

/**
 * Handing cash from the drawer over to the safe in the middle of a shift.
 * The money leaves the drawer at once and reaches the safe when whoever
 * keeps it says it arrived.
 */
export function HandoverDialog({ context, onClose }: { context: PosContextDto; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [handings, setHandings] = useState(() => emptyHandings(context.safes))
  const [note, setNote] = useState('')
  // One key for each currency: a handover sent twice is still made once.
  const [keys] = useState(() => ({ UZS: uuid(), USD: uuid() }))

  const send = useMutation({
    mutationFn: async () => {
      const sent: MoneyTransferDto[] = []
      for (const currency of CURRENCIES) {
        const { amount, toAccountId } = handings[currency]
        if (!amount || !toAccountId) {
          continue
        }
        sent.push(
          await api.post<MoneyTransferDto>('/money/transfers', {
            clientKey: keys[currency],
            fromAccountId: context.drawers[currency],
            toAccountId,
            amount,
            note,
          }),
        )
      }
      return sent
    },
    onSuccess: (sent) => {
      for (const key of ['pos', 'money', 'shifts']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
      toast.success(t('pos.handedOver', { amount: sent.map((item) => money(item.amount, item.currency)).join(' + ') }))
      onClose()
    },
  })

  const submit = () => (handoversOf(handings).length ? send.mutate() : toast.error(t('pos.handoverNothing')))

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('pos.handoverTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="handover-form" variant="primary" loading={send.isPending}>
            {t('pos.handover')}
          </Button>
        </>
      }
    >
      <Form id="handover-form" onSubmit={submit}>
        <HandoverFields safes={context.safes} value={handings} onChange={setHandings} autoFocus />
        <Field label={t('receipts.note')}>
          {(id) => <Input id={id} value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />}
        </Field>
      </Form>
    </Dialog>
  )
}

/** Money on its way from this till or to it: the cashier says it arrived, refuses it, or takes back what they sent. */
export function WaitingTransfers({ transfers }: { transfers: MoneyTransferDto[] }) {
  if (!transfers.length) {
    return null
  }
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-warn/40 bg-warn-soft p-3 text-[13px]">
      {transfers.map((transfer) => (
        <div key={transfer.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="min-w-0 flex-1">
            <span className="tabular font-semibold">{money(transfer.amount, transfer.currency)}</span>
            <span className="text-ink-2">
              {' · '}
              {transfer.fromAccountName} → {transfer.toAccountName}
            </span>
            {transfer.sentByName ? <span className="text-xs text-ink-3"> · {transfer.sentByName}</span> : null}
          </span>
          <TransferButtons transfer={transfer} />
        </div>
      ))}
    </section>
  )
}
