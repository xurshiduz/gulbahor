import {
  CURRENCIES as CURRENCY_LIST,
  type AccountDto,
  type AnyCurrency,
  type MoneyTransferDto,
  type PosContextDto,
  type RateBook,
} from '@erp/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
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
import { api, ApiError } from '@/lib/api'
import { currencyWords } from '@/lib/base'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'
import { uuid } from '@/lib/uuid'

const NOTHING: Handing = { amount: null, toAccountId: null, received: null }

/** What is being handed over in one currency: how much, to which safe, and — to a safe of another currency — what enters it, if agreed. */
export interface Handing {
  amount: number | null
  toAccountId: string | null
  /** Typed over the day's rate where the safe holds another currency; null while the rate makes it. */
  received?: number | null
}

export type Handings = Partial<Record<AnyCurrency, Handing>>

/** What is handed over in a currency: nothing, where nothing was. */
export const handingIn = (value: Handings, currency: AnyCurrency): Handing => value[currency] ?? NOTHING

/**
 * Nothing handed over yet from the drawers of `currencies`; where there is
 * one safe for a currency, it is the one. Where money may change on the
 * way and the shop has a single safe, that safe is the one for every
 * currency.
 */
export function emptyHandings(safes: AccountDto[], currencies: AnyCurrency[], anyCurrency = false): Handings {
  // The shop's own safe before one kept for every shop (the owner's own cash, say).
  const own = [...safes].sort((a, b) => Number(!a.locationIds.length) - Number(!b.locationIds.length))
  const only = (currency: AnyCurrency) =>
    own.find((safe) => safe.currency === currency)?.id ?? (anyCurrency && safes.length === 1 ? safes[0].id : null)
  return Object.fromEntries(
    currencies.map((currency) => [currency, { amount: null, toAccountId: only(currency), received: null }]),
  )
}

/** The safes of the till's own currencies: what the end of a shift hands over to, money unchanged. */
export const ownSafes = (context: Pick<PosContextDto, 'safes' | 'drawers' | 'currencies'>) =>
  context.safes.filter((safe) => context.currencies.includes(safe.currency) && context.drawers[safe.currency])

/** What changing money on the way needs: the day's rates and how far this person may agree from them. */
export interface Changing {
  book: RateBook | null
  limit: number
  setsRates: boolean
}

/** The handing of one currency as an exchange, where its safe holds another; null where nothing is changed. */
export function handingLine(currency: AnyCurrency, handing: Handing, safes: AccountDto[], changing: Changing) {
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
  limits?: Partial<Record<AnyCurrency, number | null>>
  autoFocus?: boolean
  /** The drawers handed over from, a row for each. */
  currencies: AnyCurrency[]
  /** Money may go to a safe of another currency, changed on the way at the day's rate or a sum agreed. */
  changing?: Changing
  /**
   * The drawers this person keeps out of sight (`cash:CNY`, the same list as at the till). The first currency —
   * the base — is never hidden, nor one with a sum in it.
   */
  hiding?: { hidden: string[]; onChange: (hidden: string[]) => void }
  /** What the server said of a currency's sum ("Hisobda buncha pul yo‘q"), shown under it. */
  errors?: Partial<Record<AnyCurrency, string>>
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
  currencies,
  changing,
  hiding,
  errors,
}: HandoverFieldsProps) {
  const { t } = useTranslation()
  const [peek, setPeek] = useState(false)
  const patch = (currency: AnyCurrency, change: Partial<Handing>) =>
    onChange({ ...value, [currency]: { ...handingIn(value, currency), ...change } })
  const keyOf = (currency: AnyCurrency) => `cash:${currency}`
  const isHidden = (currency: AnyCurrency) => !!hiding?.hidden.includes(keyOf(currency))
  const away = currencies.filter(
    (currency, index) => index > 0 && isHidden(currency) && !handingIn(value, currency).amount,
  )
  const shown = peek ? currencies : currencies.filter((currency) => !away.includes(currency))
  const flip = (currency: AnyCurrency) =>
    hiding?.onChange(
      isHidden(currency) ? hiding.hidden.filter((key) => key !== keyOf(currency)) : [...hiding.hidden, keyOf(currency)],
    )

  return (
    <div className="flex flex-col gap-4">
      {shown.map((currency, index) => {
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
              label={t('pos.handoverIn', currencyWords(t, currency))}
              error={over ? t('pos.handoverOver') : errors?.[currency]}
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
              {(id) => (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    {options.length > 1 ? (
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
                    )}
                  </div>
                  {hiding && currency !== currencies[0] ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      title={isHidden(currency) ? t('pos.showRow') : t('pos.hideRow')}
                      aria-label={isHidden(currency) ? t('pos.showRow') : t('pos.hideRow')}
                      onClick={() => flip(currency)}
                      className="shrink-0 rounded p-1 text-ink-3 hover:bg-sunken hover:text-ink"
                    >
                      {isHidden(currency) ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </button>
                  ) : null}
                </div>
              )}
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
      {away.length || (peek && hiding?.hidden.length) ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setPeek(!peek)}
          className="inline-flex items-center gap-1.5 self-start text-xs text-ink-3 hover:text-ink"
        >
          {peek ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {peek
            ? t('pos.foldHidden')
            : t('pos.hiddenRows', { names: away.map((currency) => t(`currencies.short.${currency}`)).join(', ') })}
        </button>
      ) : null}
    </div>
  )
}

/** The handovers that hold a sum, as the server takes them. */
export function handoversOf(value: Handings): { toAccountId: string; amount: number }[] {
  return Object.values(value).flatMap((handing) =>
    handing?.amount && handing.toAccountId ? [{ toAccountId: handing.toAccountId, amount: handing.amount }] : [],
  )
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
  hiding,
  onClose,
}: {
  context: PosContextDto
  limit: number
  setsRates: boolean
  hiding?: HandoverFieldsProps['hiding']
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const book = useRateBook()
  const changing: Changing = { book, limit, setsRates }
  const currencies = context.currencies.filter((currency) => context.drawers[currency])
  const [handings, setHandings] = useState(() => emptyHandings(context.safes, currencies, true))
  const [note, setNote] = useState('')
  // One key for each currency: a handover sent twice is still made once.
  const [keys] = useState(() => Object.fromEntries(currencies.map((currency) => [currency, uuid()])))

  // Refusals of the server, by the currency whose sum they are about.
  const [refused, setRefused] = useState<Partial<Record<AnyCurrency, string>>>({})

  const send = useMutation({
    // Shown here, under the sum: the app's own notice stays quiet on a refusal of a field.
    meta: { silent: true },
    mutationFn: async () => {
      setRefused({})
      const sent: MoneyTransferDto[] = []
      for (const currency of currencies) {
        const handing = handingIn(handings, currency)
        if (!handing.amount || !handing.toAccountId) {
          continue
        }
        try {
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
        } catch (error) {
          throw Object.assign(error as Error, { currency, sent })
        }
      }
      return sent
    },
    onError: (error: Error & { currency?: AnyCurrency; sent?: MoneyTransferDto[] }) => {
      const fields = error instanceof ApiError ? error.fields : undefined
      const said = fields ? Object.values(fields)[0] : undefined
      if (said && error.currency) {
        setRefused({ [error.currency]: said })
      } else {
        toast.error(error.message)
      }
      // What went before the refused one did go: it is said, and the till shows it on its way.
      if (error.sent?.length) {
        toast.success(t('pos.handedOver', { amount: error.sent.map(transferSums).join(' + ') }))
        for (const key of ['pos', 'money', 'shifts']) {
          void queryClient.invalidateQueries({ queryKey: [key] })
        }
      }
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
          hiding={hiding}
          errors={refused}
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
