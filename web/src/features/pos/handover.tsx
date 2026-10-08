import {
  CURRENCIES as CURRENCY_LIST,
  tillCurrencies,
  type AccountDto,
  type CurrencyCode,
  type MoneyTransferDto,
  type PosContextDto,
  type RateBook,
} from '@erp/core'
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
import { exchangeLine, ReceivedField, receivedOf, transferSums } from '@/features/money/exchange'
import { useRateBook } from '@/features/money/rates'
import { TransferButtons } from '@/features/money/transfers'
import { api } from '@/lib/api'
import { base, baseWords, dollarsBeside } from '@/lib/base'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'
import { uuid } from '@/lib/uuid'

/** The currencies a till's drawers hold: the base, and dollars beside it. */
const tillOwn = (): CurrencyCode[] => tillCurrencies(base())

const NOTHING: Handing = { amount: null, toAccountId: null, received: null }

/** What is being handed over in one currency: how much, to which safe, and — to a safe of another currency — what enters it, if agreed. */
export interface Handing {
  amount: number | null
  toAccountId: string | null
  /** Typed over the day's rate where the safe holds another currency; null while the rate makes it. */
  received?: number | null
}

export type Handings = Partial<Record<CurrencyCode, Handing>>

/** What is handed over in a currency: nothing, where nothing was. */
export const handingIn = (value: Handings, currency: CurrencyCode): Handing => value[currency] ?? NOTHING

/**
 * Nothing handed over yet; where there is one safe for a currency, it is
 * the one. Where money may change on the way and the shop has a single
 * safe, that safe is the one for every currency.
 */
export function emptyHandings(safes: AccountDto[], anyCurrency = false): Handings {
  const only = (currency: CurrencyCode) =>
    safes.find((safe) => safe.currency === currency)?.id ?? (anyCurrency && safes.length === 1 ? safes[0].id : null)
  return Object.fromEntries(
    tillOwn().map((currency) => [currency, { amount: null, toAccountId: only(currency), received: null }]),
  )
}

/** The safes of the till's own currencies: what the end of a shift hands over to, money unchanged. */
export const ownSafes = (context: Pick<PosContextDto, 'safes' | 'drawers'>) =>
  context.safes.filter((safe) => tillOwn().some((currency) => currency === safe.currency && context.drawers[currency]))

/** What changing money on the way needs: the day's rates and how far this person may agree from them. */
export interface Changing {
  book: RateBook | null
  limit: number
  setsRates: boolean
}

/** The handing of one currency as an exchange, where its safe holds another; null where nothing is changed. */
export function handingLine(currency: CurrencyCode, handing: Handing, safes: AccountDto[], changing: Changing) {
  const to = safes.find((safe) => safe.id === handing.toAccountId)
  return exchangeLine(
    { id: currency, currency },
    to?.currency ?? null,
    { amount: handing.amount, received: handing.received ?? null },
    changing.book,
    changing.limit,
  )
}

interface HandoverFieldsProps {
  safes: AccountDto[]
  value: Handings
  onChange: (value: Handings) => void
  /** The most that can be handed over in each currency, when the screen knows it: what was just counted. */
  limits?: Partial<Record<CurrencyCode, number | null>>
  autoFocus?: boolean
  /** The currencies handed over, where they are not simply those with a safe: the till's drawers. */
  currencies?: CurrencyCode[]
  /** Money may go to a safe of another currency, changed on the way at the day's rate or a sum agreed. */
  changing?: Changing
}

/**
 * The sums handed over, a row for each currency: what leaves the drawer, the safe it goes to and — to a safe of
 * another currency — the second sum of the pair beside them, as in a payment.
 */
export function HandoverFields({
  safes,
  value,
  onChange,
  limits,
  autoFocus,
  currencies: given,
  changing,
}: HandoverFieldsProps) {
  const { t } = useTranslation()
  const currencies = given ?? tillOwn().filter((currency) => safes.some((safe) => safe.currency === currency))
  const patch = (currency: CurrencyCode, change: Partial<Handing>) =>
    onChange({ ...value, [currency]: { ...handingIn(value, currency), ...change } })

  return (
    <div className="flex flex-col gap-4">
      {currencies.map((currency, index) => {
        // A safe of the drawer's own currency first; those of another only where money may change on the way.
        const options = [
          ...safes.filter((safe) => safe.currency === currency),
          ...(changing ? safes.filter((safe) => safe.currency !== currency) : []),
        ]
        const limit = limits?.[currency]
        const handing = handingIn(value, currency)
        const over = limit !== null && limit !== undefined && (handing.amount ?? 0) > limit
        const line = changing ? handingLine(currency, handing, safes, changing) : null
        const to = safes.find((safe) => safe.id === handing.toAccountId)
        return (
          <div key={currency} className={cn('grid items-start gap-3', changing ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
            <Field
              label={dollarsBeside(currency) ? t('pos.handoverUsd') : t('pos.handoverUzs', baseWords(t))}
              error={over ? t('pos.handoverOver') : undefined}
            >
              {(id) => (
                <MoneyInput
                  id={id}
                  autoFocus={autoFocus && index === 0}
                  value={handing.amount}
                  // What leaves is the anchor: typed, what enters follows from the rate afresh.
                  onChange={(amount) => patch(currency, { amount, received: null })}
                  currency={currency}
                  fillValue={limit ?? undefined}
                  invalid={over}
                />
              )}
            </Field>
            <Field label={t('money.transferTo')}>
              {(id) =>
                options.length > 1 ? (
                  <Select
                    id={id}
                    value={handing.toAccountId ?? ''}
                    onChange={(toAccountId) => patch(currency, { toAccountId, received: null })}
                    options={options.map((safe) => ({
                      value: safe.id,
                      label:
                        safe.currency === currency
                          ? safe.name
                          : `${safe.name} (${CURRENCY_LIST[safe.currency].symbol})`,
                    }))}
                  />
                ) : (
                  <span id={id} className="flex h-8.5 items-center gap-1 text-[13px] text-ink-2">
                    <ArrowRight className="size-3.5 text-ink-3" />
                    {options[0]?.name}
                  </span>
                )
              }
            </Field>
            {line && to && changing ? (
              <ReceivedField
                line={line}
                sums={{ amount: handing.amount, received: handing.received ?? null }}
                toCurrency={to.currency}
                onChange={(sums) => patch(currency, sums)}
                book={changing.book}
                setsRates={changing.setsRates}
                className="w-full"
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/** The handovers that hold a sum, as the server takes them. */
export function handoversOf(value: Handings): { toAccountId: string; amount: number }[] {
  return tillOwn().flatMap((currency) => {
    const { amount, toAccountId } = handingIn(value, currency)
    return amount && toAccountId ? [{ toAccountId, amount }] : []
  })
}

/**
 * Handing cash from the drawer over to the safe in the middle of a shift.
 * The money leaves the drawer at once and reaches the safe when whoever
 * keeps it says it arrived. To a safe of another currency it is changed on
 * the way, at the day's rate or at a sum agreed.
 */
export function HandoverDialog({
  context,
  limit,
  setsRates,
  onClose,
}: {
  context: PosContextDto
  limit: number
  setsRates: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const book = useRateBook()
  const changing: Changing = { book, limit, setsRates }
  const currencies = tillOwn().filter((currency) => context.drawers[currency])
  const [handings, setHandings] = useState(() => emptyHandings(context.safes, true))
  const [note, setNote] = useState('')
  // One key for each currency: a handover sent twice is still made once.
  const [keys] = useState(() => Object.fromEntries(tillOwn().map((currency) => [currency, uuid()])))

  const send = useMutation({
    mutationFn: async () => {
      const sent: MoneyTransferDto[] = []
      for (const currency of currencies) {
        const handing = handingIn(handings, currency)
        if (!handing.amount || !handing.toAccountId) {
          continue
        }
        sent.push(
          await api.post<MoneyTransferDto>('/money/transfers', {
            clientKey: keys[currency],
            fromAccountId: context.drawers[currency],
            toAccountId: handing.toAccountId,
            amount: handing.amount,
            received: receivedOf(handingLine(currency, handing, context.safes, changing)),
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
      toast.success(t('pos.handedOver', { amount: sent.map(transferSums).join(' + ') }))
      onClose()
    },
  })

  const submit = () => (handoversOf(handings).length ? send.mutate() : toast.error(t('pos.handoverNothing')))

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('pos.handoverTitle')}
      size="lg"
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
        <HandoverFields
          safes={context.safes}
          value={handings}
          onChange={setHandings}
          currencies={currencies}
          changing={changing}
          autoFocus
        />
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
            <span className="tabular font-semibold">{transferSums(transfer)}</span>
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
