import {
  CUSTOMER_PAYMENT_KIND_LABELS,
  CUSTOMER_PAYMENT_KINDS,
  CUSTOMER_PAYMENT_STATUS_LABELS,
  CUSTOMER_PAYMENT_STATUSES,
  customerAdjustInputSchema,
  customerExchangeInputSchema,
  customerOpeningInputSchema,
  customerPaymentInputSchema,
  customerTransferInputSchema,
  defaultTill,
  formatMoney,
  tillsOf,
  worthInBase,
  type AnyCurrency,
  type ApprovalInput,
  type CustomerBalance,
  type CustomerDto,
  type CustomerPaymentDto,
  type CustomerPaymentKind,
  type CustomerStatementDto,
  type MoneyCategoryDto,
  type Page as PageOf,
  type PaymentAccountDto,
  type PosCustomerDto,
} from '@erp/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Ban, Banknote, Users, Wrench } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterCombo, FilterDates, FilterSelect } from '@/components/ui/column-filters'
import { Combobox } from '@/components/ui/combobox'
import { DateInput } from '@/components/ui/date-input'
import { Checkbox, Select } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut, Spinner } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Page, SearchInput } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { currencyName } from '@/features/money/currencies-view'
import { exchangeLine, ReceivedField, receivedOf, type ExchangeSums } from '@/features/money/exchange'
import { placeKey, useHiddenPlaces } from '@/features/money/hidden-places'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { fetchAll, moneyCell, timeCell } from '@/lib/excel'
import { formatDateTime, formatDay } from '@/lib/format'
import { useRateBook } from '@/features/money/rates'
import { ApprovalDialog } from '@/features/pos/approval'
import { useHotkey } from '@/lib/hotkeys'
import { toast } from '@/lib/toast'
import { uuid } from '@/lib/uuid'

import { useCustomerChoices } from './choices'

import {
  addRow,
  agreedOf,
  clearRows,
  currencyShort,
  patchRow,
  PaymentLines,
  rateText,
  removeRow,
  spreadTotal,
  startRows,
  tillHere,
  totalOf,
  valueLines,
  type PaymentRow,
  keepTill,
  lastTill,
  sparePlaces,
  switchTill,
  TillField,
} from '@/features/money/payment-lines'

const route = getRouteApi('/payments')

const money = (minor: number, currency: AnyCurrency) => formatMoney(minor, currency, { minor: 'auto' })

const refresh = (queryClient: ReturnType<typeof useQueryClient>) => {
  for (const key of ['customer-payments', 'customers', 'money', 'pos', 'shifts']) {
    void queryClient.invalidateQueries({ queryKey: [key] })
  }
}

/** What stands between the business and a customer, in words: "qarzi 570,95 $" when they owe, "haqi …" when they are owed. */
export function useDebtText() {
  const { t } = useTranslation()
  return (balance: number, currency: AnyCurrency) =>
    balance > 0
      ? t('payments.owes', { amount: money(balance, currency) })
      : balance < 0
        ? t('payments.owed', { amount: money(-balance, currency) })
        : t('payments.even')
}

/** A customer's card, with their accounts for whoever may see them. */
const useCustomer = (id: string | null) =>
  useQuery({
    queryKey: ['customers', 'one', id],
    queryFn: ({ signal }) => api.get<CustomerDto>(`/customers/${id}`, undefined, signal),
    enabled: !!id,
  })

/** What a customer owes in one currency; null for a person who may not see it. */
const balanceIn = (balances: CustomerBalance[] | null | undefined, currency: AnyCurrency | null) =>
  !balances || !currency ? null : (balances.find((item) => item.currency === currency)?.balance ?? 0)

/** The currencies a customer's money may be counted in: the business's, their main one first. */
function useKept() {
  const { me } = useSession()
  return [me.org.baseCurrency, ...me.org.currencies.filter((code) => code !== me.org.baseCurrency)]
}

// ───────────────────────────── A payment, entered ─────────────────────────────

interface PaymentDialogProps {
  /** The customer the payment is with, when it is opened from their account. */
  customerId?: string
  /** Which of their accounts: their main currency's unless said. */
  currency?: AnyCurrency
  kind?: 'in' | 'out'
  /**
   * The customer at the till: known from the till itself, so a cashier with no say over customers' accounts
   * takes what they bring, into the till's own places.
   */
  buyer?: PosCustomerDto
  /** The till it is opened at: its shop's terminals are among the places, and a manager's word is given here. */
  registerId?: string
  /** Who at this till may let a customer's own money be handed back out of its drawer, with their PIN. */
  approvers?: { id: string; name: string }[]
  onClose: () => void
  /** The money is in: whoever opened this may want to know the customer again. */
  onSaved?: () => void
}

/**
 * Money changing hands with a customer. The places it usually goes through
 * stand ready, a line each: a sum is typed where it belongs. The payment
 * settles one of the customer's accounts — their main currency's unless
 * another is picked. Where a place is in another currency than that, its
 * line has two fields side by side: what went through it, and how much of
 * the account that settles. Typing either works out the other from the rate.
 */
export function PaymentDialog({
  customerId: fixedCustomer,
  currency: fixedCurrency,
  kind: startKind = 'in',
  buyer,
  registerId,
  approvers = [],
  onClose,
  onSaved,
}: PaymentDialogProps) {
  const { t } = useTranslation()
  const { can, me } = useSession()
  const queryClient = useQueryClient()
  const debtText = useDebtText()
  const kept = useKept()
  const [kind, setKind] = useState<'in' | 'out'>(startKind)
  const [customerId, setCustomerId] = useState<string | null>(fixedCustomer ?? null)
  const [pickedCurrency, setPickedCurrency] = useState<AnyCurrency | null>(fixedCurrency ?? null)
  // Until a line is touched they are the ones this computer usually pays through.
  const [rows, setRows] = useState<PaymentRow[] | null>(null)
  const [added, setAdded] = useState<string | null>(null)
  const [note, setNote] = useState('')
  // One payment, one key: sent twice, it is still made once.
  const [clientKey, setClientKey] = useState(uuid)
  // Payments entered one after another: each starts with the cursor where the first did.
  const [round, setRound] = useState(0)

  const { choices, search } = useCustomerChoices([customerId], false, !buyer)
  const customer = useCustomer(buyer ? null : customerId).data
  const balances = buyer ? buyer.accounts : customer?.balances
  // The account it settles: the one picked, else the customer's main one.
  const currency = pickedCurrency ?? buyer?.currency ?? customer?.currency ?? null
  const accounts = useQuery({
    queryKey: ['customer-payments', 'accounts', registerId ?? null],
    queryFn: ({ signal }) =>
      api.get<PaymentAccountDto[]>('/customer-payments/accounts', registerId ? { registerId } : undefined, signal),
  })
  // Paying out with no right to: a customer's own money, out of a drawer — alone for whoever takes payments, on
  // a manager's word for a cashier.
  const mayHandBack = can('customers.pay_out') || can('customers.receive') || approvers.length > 0
  const needsWord = kind === 'out' && !can('customers.pay_out') && !can('customers.receive')
  const [asking, setAsking] = useState<{ input: Record<string, unknown>; keys: string[]; more: boolean } | null>(null)
  // The small remainder of the debt let go with this payment.
  const [forgiving, setForgiving] = useState(false)
  // The day's rates, all of them: a line may be in any currency the business keeps.
  const dayRate = useRateBook()
  const setsRates = can('money.rates')
  const balance = balanceIn(balances, currency)
  const places = useMemo(() => accounts.data ?? [], [accounts.data])

  // The till the money goes through: the one picked here, else the one that stands to reason.
  const tills = useMemo(() => tillsOf(places), [places])
  const [pickedTill, setPickedTill] = useState<string | null>(null)
  const tillId = tills.some((till) => till.id === pickedTill) ? pickedTill : defaultTill(tills, tillHere(), lastTill())
  // What this person keeps out of sight: a seldom used drawer or account, back from "another account" when wanted.
  const [hidden, setHidden] = useHiddenPlaces()
  const shown = useMemo(() => rows ?? startRows(places, tillId, hidden), [rows, places, tillId, hidden])
  const pickTill = (id: string) => {
    setPickedTill(id)
    keepTill(id)
    setRows(switchTill(shown, places, id, hidden))
  }
  const valued = valueLines(shown, places, currency, dayRate, me.org.settings.maxRateLossPercent)
  const total = totalOf(valued)
  const noRate = valued.some((line) => line.changes && !line.rate && line.row.amount)

  /** What the server would not take, under the line it is about. */
  const [problems, setProblems] = useState<Record<string, string>>({})

  const patch = (accountId: string, change: Partial<PaymentRow>) => {
    setRows(patchRow(shown, accountId, change))
    setProblems((current) => {
      if (!(accountId in current)) {
        return current
      }
      const { [accountId]: _fixed, ...rest } = current
      return rest
    })
  }
  // A place taken off the lines stays off for this person, on every device, until it is added again.
  const hide = (accountId: string) => {
    const place = places.find((account) => account.id === accountId)
    if (place && !hidden.includes(placeKey(place))) {
      setHidden([...hidden, placeKey(place)])
    }
  }
  const unhide = (accountId: string) => {
    const place = places.find((account) => account.id === accountId)
    if (place && hidden.includes(placeKey(place))) {
      setHidden(hidden.filter((key) => key !== placeKey(place)))
    }
  }

  // Ctrl+Shift+Enter saves and stays for the next payment; Ctrl+Enter saves and closes.
  const again = useRef(false)
  useEffect(() => {
    const mark = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        again.current = event.shiftKey
      }
    }
    window.addEventListener('keydown', mark, true)
    return () => window.removeEventListener('keydown', mark, true)
  }, [])
  // Listed in the help sheet; the form itself answers the key.
  useHotkey('mod+shift+enter', () => false, { label: t('payments.saveMore'), group: t('payments.title') })

  const save = useMutation({
    // `keys`: the lines in the order they were sent, to put the server's answer under the right one.
    mutationFn: ({ input }: { input: unknown; keys: string[]; more: boolean }) =>
      api.post<CustomerPaymentDto>('/customer-payments', input),
    onSuccess: (payment, { more }) => {
      refresh(queryClient)
      onSaved?.()
      toast.success(t('payments.saved', { number: payment.number }))
      if (!more) {
        onClose()
        return
      }
      setRows(clearRows(shown))
      setCustomerId(fixedCustomer ?? null)
      setPickedCurrency(fixedCurrency ?? null)
      setNote('')
      setProblems({})
      setAdded(null)
      setClientKey(uuid())
      setRound((count) => count + 1)
    },
    onError: (error, { keys }) => {
      if (!(error instanceof ApiError)) {
        return
      }
      if (error.code === 'RATE_CHANGED') {
        // The rate moved while the dialog was open: the sums are worked out again from the new one.
        void queryClient.invalidateQueries({ queryKey: ['money'] })
      }
      const found: Record<string, string> = {}
      const other: string[] = []
      for (const [path, message] of Object.entries(error.fields ?? {})) {
        const index = /^lines\.(\d+)\./.exec(path)?.[1]
        const key = index === undefined ? undefined : keys[Number(index)]
        if (key) {
          found[key] = message
        } else {
          other.push(message)
        }
      }
      setProblems(found)
      if (other[0]) {
        toast.error(other[0])
      }
    },
  })

  const submit = () => {
    const more = again.current
    again.current = false
    if (!customerId || !currency) {
      toast.error(t('payments.pickCustomer'))
      return
    }
    const filled = valued.filter((line) => line.row.amount)
    if (!filled.length) {
      toast.error(t('payments.nothing'))
      return
    }
    if (noRate) {
      toast.error(t('payments.noRate'))
      return
    }
    const parsed = customerPaymentInputSchema.safeParse({
      clientKey,
      customerId,
      currency,
      kind,
      lines: filled.map((line) => ({
        accountId: line.row.accountId,
        amount: line.row.amount,
        settled: agreedOf(line),
      })),
      settled: total,
      ...(forgiven ? { forgive: forgiven } : {}),
      ...(registerId ? { registerId } : {}),
      note,
    })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? t('payments.nothing'))
      return
    }
    const keys = filled.map((line) => line.row.accountId)
    if (needsWord) {
      // The manager comes to this screen and types their PIN: the payment waits for it.
      setAsking({ input: parsed.data, keys, more })
      return
    }
    save.mutate({ input: parsed.data, keys, more })
  }
  const approve = (approval: ApprovalInput) => {
    if (asking) {
      save.mutate({ input: { ...asking.input, approval }, keys: asking.keys, more: asking.more })
      setAsking(null)
    }
  }

  const typeTotal = (wanted: number) => {
    if (!currency) {
      return false
    }
    const taken = spreadTotal(valued, wanted, currency)
    if (!taken) {
      toast.error(t(valued.some((line) => line.account.open) ? 'payments.totalTooSmall' : 'payments.pickAccount'))
      return false
    }
    patch(taken.accountId, { amount: taken.amount, settled: null })
    return true
  }

  // What they owe when paying, what they are owed when being paid: the most this payment has to settle.
  const debt = balance === null ? null : kind === 'in' ? balance : -balance
  const owing = balance === null ? null : balance + (kind === 'in' ? -total : total)
  // A remainder no bigger than change is rounded by may be let go as the money is taken.
  const forgivable =
    kind === 'in' && total > 0 && owing !== null && owing > 0 && currency && dayRate
      ? (worthInBase(owing, currency, dayRate) ?? Infinity) <= me.org.settings.changeRoundStep
      : false
  const forgiven = forgiving && forgivable && owing ? owing : 0
  const after = owing === null ? null : owing - forgiven

  if (asking) {
    // In the payment's place, not over it: the PIN's cursor is its own.
    return (
      <ApprovalDialog
        approvers={approvers}
        reason={t('payments.payOutWord', { amount: money(total, currency ?? me.org.baseCurrency) })}
        onApprove={approve}
        onClose={() => setAsking(null)}
      />
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={kind === 'in' ? t('payments.takeIn') : t('payments.payOut')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={save.isPending && save.variables?.more}
            disabled={save.isPending}
            onClick={() => {
              again.current = true
              document.querySelector<HTMLFormElement>('#payment-form')?.requestSubmit()
            }}
          >
            {t('payments.saveMore')}
            <Shortcut combo="mod+shift+enter" className="ml-1 opacity-70" />
          </Button>
          <Button
            type="submit"
            form="payment-form"
            variant="primary"
            loading={save.isPending && !save.variables?.more}
            disabled={save.isPending}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form key={round} id="payment-form" onSubmit={submit}>
        <div
          className={cn(
            'grid gap-4',
            tills.length > 1
              ? 'sm:grid-cols-[12rem_minmax(0,1fr)_9rem_minmax(0,1fr)_14rem]'
              : 'sm:grid-cols-[12rem_minmax(0,1fr)_9rem_minmax(0,1fr)]',
          )}
        >
          <Field label={t('payments.kind')}>
            {(id) => (
              <div data-enter-skip>
                <Select
                  id={id}
                  value={kind}
                  onChange={(value) => setKind(value as 'in' | 'out')}
                  // Only the ways money may go for this person: one who takes payments need not pay any out.
                  options={[
                    ...(can('customers.receive') || kind === 'in'
                      ? [{ value: 'in', label: t('payments.takeIn') }]
                      : []),
                    ...(mayHandBack || kind === 'out' ? [{ value: 'out', label: t('payments.payOut') }] : []),
                  ]}
                />
              </div>
            )}
          </Field>
          <Field label={t('payments.customer')} required>
            {(id) => (
              <Combobox
                id={id}
                autoFocus={!fixedCustomer}
                disabled={!!fixedCustomer}
                options={
                  buyer
                    ? [{ value: buyer.id, label: buyer.name }]
                    : choices.map((item) => ({
                        value: item.id,
                        label: item.name,
                        hint: [
                          item.isSupplier ? t('customers.supplier') : '',
                          item.phoneTail ? `…${item.phoneTail}` : '',
                        ]
                          .filter(Boolean)
                          .join(' · '),
                      }))
                }
                onQuery={search}
                value={customerId}
                onChange={(id) => {
                  setCustomerId(id)
                  setPickedCurrency(null)
                }}
              />
            )}
          </Field>
          <Field label={t('payments.accountCurrency')}>
            {(id) => (
              <div data-enter-skip>
                <Select
                  id={id}
                  value={currency ?? me.org.baseCurrency}
                  onChange={(value) => setPickedCurrency(value as AnyCurrency)}
                  options={kept.map((code) => ({ value: code, label: currencyName(code, t) }))}
                  disabled={!customerId || kept.length < 2}
                />
              </div>
            )}
          </Field>
          <TillField tills={tills} value={tillId} onChange={pickTill} />
          {/* What stands between them now, and what will once this is saved. */}
          {balance !== null && currency && after !== null ? (
            <div className="flex flex-col justify-end gap-0.5 pb-1 text-[13px] leading-tight">
              <span className="tabular font-medium">{debtText(balance, currency)}</span>
              <span className="tabular text-xs text-ink-3">
                {t('payments.after')}: {debtText(after, currency)}
              </span>
            </div>
          ) : null}
        </div>
        {forgivable && owing && currency ? (
          <div data-enter-skip>
            <Checkbox
              checked={forgiving}
              onChange={setForgiving}
              label={t('payments.forgive', { amount: money(owing, currency) })}
            />
          </div>
        ) : null}

        {accounts.data && !places.length ? (
          <p className="text-[13px] text-ink-3">{t('payments.noAccounts')}</p>
        ) : (
          <PaymentLines
            kind={kind}
            lines={valued}
            spare={sparePlaces(places, shown, tillId, hidden)}
            currency={currency}
            owed={debt !== null && debt > 0 ? debt : null}
            onPatch={patch}
            onAdd={(accountId) => {
              setRows(addRow(shown, accountId))
              unhide(accountId)
              setAdded(accountId)
            }}
            onRemove={(accountId) => {
              setRows(removeRow(shown, accountId))
              hide(accountId)
            }}
            onTotal={typeTotal}
            setsRates={setsRates}
            dayRate={dayRate}
            problems={problems}
            autoFocus={!!fixedCustomer}
            focusId={added}
          />
        )}

        <Field label={t('receipts.note')}>
          {(id) => <Input id={id} value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />}
        </Field>
      </Form>
    </Dialog>
  )
}

/** What stood between the business and a customer before the books began, in one of their currencies. */
export function OpeningDialog({ customer, onClose }: { customer: CustomerDto; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const kept = useKept()
  const [owes, setOwes] = useState<'customer' | 'us'>(customer.isSupplier ? 'us' : 'customer')
  const [currency, setCurrency] = useState<AnyCurrency>(customer.currency)
  const [amount, setAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [clientKey] = useState(uuid)

  const save = useMutation({
    mutationFn: (input: unknown) => api.post<CustomerPaymentDto>('/customer-payments/opening', input),
    onSuccess: (payment) => {
      refresh(queryClient)
      toast.success(t('payments.saved', { number: payment.number }))
      onClose()
    },
  })
  const submit = () => {
    const parsed = customerOpeningInputSchema.safeParse({
      clientKey,
      customerId: customer.id,
      currency,
      owes,
      amount,
      note,
    })
    if (!parsed.success) {
      toast.error(t('payments.nothing'))
      return
    }
    save.mutate(parsed.data)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${t('payments.opening')} · ${customer.name}`}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="opening-form" variant="primary" loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form id="opening-form" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('payments.openingOwes')}>
            {(id) => (
              <Select
                id={id}
                value={owes}
                onChange={(value) => setOwes(value as 'customer' | 'us')}
                options={[
                  { value: 'customer', label: t('payments.openingCustomer') },
                  { value: 'us', label: t('payments.openingUs') },
                ]}
              />
            )}
          </Field>
          <Field label={t('payments.accountCurrency')}>
            {(id) => (
              <Select
                id={id}
                value={currency}
                onChange={(value) => setCurrency(value as AnyCurrency)}
                options={kept.map((code) => ({ value: code, label: currencyName(code, t) }))}
                disabled={kept.length < 2}
              />
            )}
          </Field>
          <Field label={t('payments.sum')} required>
            {(id) => <MoneyInput id={id} autoFocus value={amount} onChange={setAmount} currency={currency} />}
          </Field>
        </div>
        <Field label={t('receipts.note')}>
          {(id) => <Input id={id} value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />}
        </Field>
      </Form>
    </Dialog>
  )
}

/**
 * A customer's account put right with no money moving: a debt given up as hopeless, a supplier's bonus. The kind
 * of expense or income says which way it goes, and it always says why.
 */
export function AdjustDialog({
  customer,
  currency: asked,
  onClose,
}: {
  customer: CustomerDto
  currency?: AnyCurrency
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const debtText = useDebtText()
  const kept = useKept()
  const [currency, setCurrency] = useState<AnyCurrency>(asked ?? customer.currency)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [clientKey] = useState(uuid)
  const categories = useQuery({
    queryKey: ['money-categories'],
    queryFn: ({ signal }) => api.get<MoneyCategoryDto[]>('/money/categories', undefined, signal),
  })
  const kinds = (categories.data ?? []).filter((item) => item.isActive)
  const category = kinds.find((item) => item.id === categoryId) ?? null
  const balance = balanceIn(customer.balances, currency)
  // An expense is the business's loss: they owe less by it. An income is its gain: it owes them less.
  const after =
    balance === null || !category || !amount ? null : balance + (category.kind === 'expense' ? -amount : amount)

  const save = useMutation({
    mutationFn: (input: unknown) => api.post<CustomerPaymentDto>('/customer-payments/adjust', input),
    onSuccess: (payment) => {
      refresh(queryClient)
      toast.success(t('payments.saved', { number: payment.number }))
      onClose()
    },
  })
  const submit = () => {
    const parsed = customerAdjustInputSchema.safeParse({
      clientKey,
      customerId: customer.id,
      currency,
      categoryId,
      amount,
      note,
    })
    if (!parsed.success) {
      toast.error(
        !categoryId
          ? t('payments.adjustKindNeeded')
          : !note.trim()
            ? t('payments.adjustWhyNeeded')
            : t('payments.nothing'),
      )
      return
    }
    save.mutate(parsed.data)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${t('payments.adjust')} · ${customer.name}`}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="adjust-form" variant="primary" loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form id="adjust-form" onSubmit={submit}>
        <Field
          label={t('payments.adjustKind')}
          required
          hint={category ? t(`payments.adjustWay.${category.kind}`) : undefined}
        >
          {(id) => (
            <Combobox
              id={id}
              autoFocus
              options={kinds.map((item) => ({
                value: item.id,
                label: item.name,
                hint: t(item.kind === 'expense' ? 'ops.expense' : 'ops.income'),
              }))}
              value={categoryId}
              onChange={setCategoryId}
            />
          )}
        </Field>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field label={t('payments.accountCurrency')}>
            {(id) => (
              <Select
                id={id}
                value={currency}
                onChange={(value) => setCurrency(value as AnyCurrency)}
                options={kept.map((code) => ({ value: code, label: currencyName(code, t) }))}
                disabled={kept.length < 2}
              />
            )}
          </Field>
          <Field label={t('payments.sum')} required>
            {(id) => (
              <MoneyInput
                id={id}
                value={amount}
                onChange={setAmount}
                currency={currency}
                // A debt given up is usually given up whole.
                fillValue={balance !== null && balance > 0 && category?.kind === 'expense' ? balance : undefined}
              />
            )}
          </Field>
        </div>
        {balance !== null ? (
          <p className="tabular text-[13px] text-ink-2">
            {debtText(balance, currency)}
            {after !== null ? <span className="text-ink-3"> → {debtText(after, currency)}</span> : null}
          </p>
        ) : null}
        <Field label={t('payments.adjustWhy')} required>
          {(id) => <Input id={id} value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />}
        </Field>
      </Form>
    </Dialog>
  )
}

/**
 * What stands to a customer's good in one of their currencies carried into another: their dollars set against
 * what they owe in so'm. A pair of sums, as in a payment: what leaves is the anchor, what enters follows from the
 * day's rate until it is typed over, and then it is what the two sides agreed.
 */
export function ExchangeDialog({
  customer,
  currency: asked,
  onClose,
}: {
  customer: CustomerDto
  currency?: AnyCurrency
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { can, me } = useSession()
  const queryClient = useQueryClient()
  const debtText = useDebtText()
  const kept = useKept()
  const book = useRateBook()
  // It leaves the account that has something to its good, when one does.
  const start = asked ?? customer.balances?.find((item) => item.balance < 0)?.currency ?? customer.currency
  const [from, setFrom] = useState<AnyCurrency>(start)
  const [to, setTo] = useState<AnyCurrency>(kept.find((code) => code !== start) ?? start)
  const [sums, setSums] = useState<ExchangeSums>({ amount: null, received: null })
  const [note, setNote] = useState('')
  const [clientKey] = useState(uuid)
  const setsRates = can('money.rates')
  const line = exchangeLine({ id: from, currency: from }, to, sums, book, me.org.settings.maxRateLossPercent)
  const left = balanceIn(customer.balances, from)
  const entered = balanceIn(customer.balances, to)

  const save = useMutation({
    mutationFn: (input: unknown) => api.post<CustomerPaymentDto>('/customer-payments/exchange', input),
    onSuccess: (payment) => {
      refresh(queryClient)
      toast.success(t('payments.saved', { number: payment.number }))
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'RATE_CHANGED') {
        void queryClient.invalidateQueries({ queryKey: ['money'] })
      }
    },
  })
  const submit = () => {
    const parsed = customerExchangeInputSchema.safeParse({
      clientKey,
      customerId: customer.id,
      from,
      to,
      amount: sums.amount,
      received: receivedOf(line),
      settled: line?.settled ?? 0,
      note,
    })
    if (!parsed.success || !line?.settled) {
      toast.error(
        from === to ? t('payments.exchangeSame') : !line?.dayRate ? t('payments.noRate') : t('payments.nothing'),
      )
      return
    }
    save.mutate(parsed.data)
  }
  const pick = (which: 'from' | 'to', code: AnyCurrency) => {
    // The two are never one currency: picking the other's swaps them.
    if (which === 'from') {
      if (code === to) setTo(from)
      setFrom(code)
    } else {
      if (code === from) setFrom(to)
      setTo(code)
    }
    setSums({ amount: null, received: null })
  }
  const options = kept.map((code) => ({ value: code, label: currencyName(code, t) }))

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${t('payments.exchange')} · ${customer.name}`}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="account-exchange-form" variant="primary" loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {kept.length < 2 ? (
        <p className="text-[13px] text-ink-3">{t('payments.exchangeOneCurrency')}</p>
      ) : (
        <Form id="account-exchange-form" onSubmit={submit}>
          <div className="grid items-start gap-x-3 gap-y-4 sm:grid-cols-2">
            <Field label={t('payments.exchangeFrom')} hint={left !== null ? debtText(left, from) : undefined}>
              {(id) => (
                <div data-enter-skip>
                  <Select
                    id={id}
                    value={from}
                    onChange={(value) => pick('from', value as AnyCurrency)}
                    options={options}
                  />
                </div>
              )}
            </Field>
            <Field label={t('payments.exchangeTo')} hint={entered !== null ? debtText(entered, to) : undefined}>
              {(id) => (
                <div data-enter-skip>
                  <Select id={id} value={to} onChange={(value) => pick('to', value as AnyCurrency)} options={options} />
                </div>
              )}
            </Field>
            <Field label={t('money.exchangeOut', { currency: currencyShort(from, t) })} required>
              {(id) => (
                <MoneyInput
                  id={id}
                  autoFocus
                  value={sums.amount}
                  // What leaves is the anchor: typed, what enters follows from the rate afresh.
                  onChange={(amount) => setSums({ amount, received: null })}
                  currency={from}
                  // What is theirs there, whole, is what is usually carried over.
                  fillValue={left !== null && left < 0 ? -left : undefined}
                />
              )}
            </Field>
            {line ? (
              <ReceivedField
                line={line}
                sums={sums}
                toCurrency={to}
                onChange={setSums}
                book={book}
                setsRates={setsRates}
                className="w-full"
              />
            ) : null}
          </div>
          <Field label={t('receipts.note')}>
            {(id) => <Input id={id} value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />}
          </Field>
        </Form>
      )}
    </Dialog>
  )
}

/**
 * What stands to one customer's good carried to another's account: one pays for another, a buyer's debt is set
 * against what the business owes a supplier, a payment written to the wrong person is put right. No money moves.
 * A pair of sums where the two accounts are in different currencies, as in an exchange.
 */
export function CustomerTransferDialog({
  customer,
  currency: asked,
  onClose,
}: {
  customer: CustomerDto
  currency?: AnyCurrency
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { can, me } = useSession()
  const queryClient = useQueryClient()
  const debtText = useDebtText()
  const kept = useKept()
  const book = useRateBook()
  // It leaves the account that has something to its good, when one does.
  const start = asked ?? customer.balances?.find((item) => item.balance < 0)?.currency ?? customer.currency
  const [from, setFrom] = useState<AnyCurrency>(start)
  const [toId, setToId] = useState<string | null>(null)
  /** Which of the other's accounts, when not their main one. */
  const [toPicked, setToPicked] = useState<AnyCurrency | null>(null)
  const [sums, setSums] = useState<ExchangeSums>({ amount: null, received: null })
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [clientKey] = useState(uuid)
  const { choices, search } = useCustomerChoices([toId])
  const taker = useCustomer(toId).data
  const to = toPicked ?? taker?.currency ?? choices.find((item) => item.id === toId)?.currency ?? from
  const line = exchangeLine({ id: from, currency: from }, to, sums, book, me.org.settings.maxRateLossPercent)
  const left = balanceIn(customer.balances, from)
  const entered = toId ? balanceIn(taker?.balances, to) : null
  const options = kept.map((code) => ({ value: code, label: currencyName(code, t) }))

  const save = useMutation({
    mutationFn: (input: unknown) => api.post<CustomerPaymentDto>('/customer-payments/transfer', input),
    onSuccess: (payment) => {
      refresh(queryClient)
      toast.success(t('payments.saved', { number: payment.number }))
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'RATE_CHANGED') {
        void queryClient.invalidateQueries({ queryKey: ['money'] })
      }
      if (error instanceof ApiError && error.fields) {
        setErrors(error.fields)
      }
    },
  })
  const submit = () => {
    // In one currency what enters is what leaves; in two, what the pair makes of it.
    const settled = from === to ? (sums.amount ?? 0) : (line?.settled ?? 0)
    const parsed = customerTransferInputSchema.safeParse({
      clientKey,
      customerId: customer.id,
      currency: from,
      toCustomerId: toId,
      toCurrency: to,
      amount: sums.amount,
      received: from === to ? null : receivedOf(line),
      settled,
      note,
    })
    if (!parsed.success || !settled) {
      toast.error(
        !toId
          ? t('payments.transferPick')
          : from !== to && !line?.dayRate
            ? t('payments.noRate')
            : t('payments.nothing'),
      )
      return
    }
    setErrors({})
    save.mutate(parsed.data)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${t('payments.transfer')} · ${customer.name}`}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="customer-transfer-form" variant="primary" loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form id="customer-transfer-form" onSubmit={submit}>
        <div className="grid items-start gap-x-3 gap-y-4 sm:grid-cols-2">
          {/* Whose it leaves is whoever the window was opened for; only which of their accounts is picked. */}
          <Field label={t('payments.transferFrom')} hint={left !== null ? debtText(left, from) : undefined}>
            {(id) =>
              kept.length > 1 ? (
                <div data-enter-skip>
                  <Select
                    id={id}
                    value={from}
                    onChange={(value) => {
                      setFrom(value as AnyCurrency)
                      setSums({ amount: null, received: null })
                    }}
                    options={options.map((option) => ({ ...option, label: `${customer.name} · ${option.label}` }))}
                  />
                </div>
              ) : (
                <Input id={id} value={customer.name} disabled />
              )
            }
          </Field>
          <Field
            label={t('payments.transferTo')}
            error={errors.toCustomerId}
            hint={entered !== null ? debtText(entered, to) : undefined}
            required
          >
            {(id) => (
              <Combobox
                id={id}
                autoFocus
                options={choices
                  .filter((item) => item.id !== customer.id)
                  .map((item) => ({
                    value: item.id,
                    label: item.name,
                    hint: [item.isSupplier ? t('customers.supplier') : '', item.phoneTail ? `…${item.phoneTail}` : '']
                      .filter(Boolean)
                      .join(' · '),
                  }))}
                onQuery={search}
                value={toId}
                onChange={(value) => {
                  setToId(value)
                  setToPicked(null)
                  setSums((current) => ({ ...current, received: null }))
                }}
                invalid={!!errors.toCustomerId}
              />
            )}
          </Field>
          <Field
            label={from === to ? t('money.amount') : t('money.exchangeOut', { currency: currencyShort(from, t) })}
            error={errors.amount}
            required
          >
            {(id) => (
              <MoneyInput
                id={id}
                value={sums.amount}
                // What leaves is the anchor: typed, what enters follows from the rate afresh.
                onChange={(amount) => setSums({ amount, received: null })}
                currency={from}
                // What is theirs there, whole, is what is usually carried over.
                fillValue={left !== null && left < 0 ? -left : undefined}
                invalid={!!errors.amount}
              />
            )}
          </Field>
          {from !== to && line ? (
            <ReceivedField
              line={line}
              sums={sums}
              toCurrency={to}
              onChange={setSums}
              book={book}
              setsRates={can('money.rates')}
              error={errors.received}
              className="w-full"
            />
          ) : null}
        </div>
        {/* The other's account is their main one; another of theirs is seldom wanted, and a Tab away. */}
        {toId && kept.length > 1 ? (
          <Field label={t('payments.transferToAccount')}>
            {(id) => (
              <div data-enter-skip className="w-48">
                <Select
                  id={id}
                  value={to}
                  onChange={(value) => {
                    setToPicked(value as AnyCurrency)
                    setSums((current) => ({ ...current, received: null }))
                  }}
                  options={options}
                />
              </div>
            )}
          </Field>
        ) : null}
        <Field label={t('receipts.note')}>
          {(id) => <Input id={id} value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />}
        </Field>
      </Form>
    </Dialog>
  )
}

// ───────────────────────────── A payment, looked at ─────────────────────────────

const KIND_TONES: Record<CustomerPaymentKind, 'ok' | 'info' | 'neutral'> = {
  in: 'ok',
  out: 'info',
  opening: 'neutral',
  adjust: 'neutral',
  exchange: 'neutral',
  transfer: 'neutral',
}

/** Who may take a payment of a kind back: as who may make it. */
const MAY_CANCEL: Record<CustomerPaymentKind, string> = {
  in: 'customers.receive',
  out: 'customers.pay_out',
  opening: 'customers.adjust',
  adjust: 'customers.adjust',
  exchange: 'customers.adjust',
  transfer: 'customers.adjust',
}

/** One payment: its lines, and the way to take it back. */
export function PaymentViewDialog({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const { can, me } = useSession()
  const queryClient = useQueryClient()
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const query = useQuery({
    queryKey: ['customer-payments', 'one', paymentId],
    queryFn: ({ signal }) => api.get<CustomerPaymentDto>(`/customer-payments/${paymentId}`, undefined, signal),
  })
  const payment = query.data

  const cancel = useMutation({
    mutationFn: () => api.post<CustomerPaymentDto>(`/customer-payments/${paymentId}/cancel`, { reason }),
    onSuccess: (cancelled) => {
      queryClient.setQueryData(['customer-payments', 'one', paymentId], cancelled)
      refresh(queryClient)
      toast.success(t('payments.cancelled', { number: cancelled.number }))
      setCancelling(false)
    },
  })
  const mayCancel = payment?.status === 'posted' && can(MAY_CANCEL[payment.kind]) && !cancelling

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={payment ? `${CUSTOMER_PAYMENT_KIND_LABELS[payment.kind]} ${payment.number}` : t('payments.one')}
      description={
        payment
          ? `${payment.customerName} · ${formatDateTime(payment.paidAt)} · ${payment.createdByName ?? ''}`
          : undefined
      }
      footer={
        <>
          {mayCancel ? (
            <Button variant="danger" className="mr-auto" onClick={() => setCancelling(true)}>
              <Ban />
              {t('payments.cancel')}
            </Button>
          ) : null}
          <Button onClick={onClose}>{t('common.close')}</Button>
        </>
      }
    >
      {!payment ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      ) : (
        <div className="flex flex-col gap-4 text-[13px]">
          {cancelling ? (
            <Form onSubmit={() => (reason.trim() ? cancel.mutate() : toast.error(t('sales.voidReasonNeeded')))}>
              <Field label={t('payments.cancelReason')} required>
                {(id) => (
                  <Input
                    id={id}
                    autoFocus
                    value={reason}
                    maxLength={200}
                    onChange={(event) => setReason(event.target.value)}
                  />
                )}
              </Field>
              <div className="flex gap-2">
                <Button type="submit" variant="danger" loading={cancel.isPending}>
                  {t('payments.cancel')}
                </Button>
                <Button onClick={() => setCancelling(false)}>{t('common.no')}</Button>
              </div>
            </Form>
          ) : null}
          {payment.status === 'cancelled' ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="bad">{CUSTOMER_PAYMENT_STATUS_LABELS.cancelled}</Badge>
              <span className="text-xs text-ink-3">
                {payment.cancelledByName} · {formatDateTime(payment.cancelledAt)} · {payment.cancelReason}
              </span>
            </div>
          ) : null}
          {payment.lines.length ? (
            <table className="w-full">
              <thead className="text-left text-[11px] font-semibold tracking-[0.04em] text-ink-3 uppercase">
                <tr>
                  <th className="py-1.5 pr-2">{t('payments.account')}</th>
                  <th className="px-2 py-1.5 text-right">{t('payments.sum')}</th>
                  <th className="px-2 py-1.5 text-right">{t('payments.rate')}</th>
                  <th className="py-1.5 pl-2 text-right">{t('payments.settles')}</th>
                </tr>
              </thead>
              <tbody>
                {payment.lines.map((line, index) => (
                  <tr key={index} className="border-t border-line">
                    <td className="py-1.5 pr-2">{line.accountName}</td>
                    <td className="tabular px-2 py-1.5 text-right">{money(line.amount, line.currency)}</td>
                    <td className="tabular px-2 py-1.5 text-right text-ink-3">
                      {line.rate ? rateText(line.rate) : ''}
                    </td>
                    <td className="tabular py-1.5 pl-2 text-right font-medium">
                      {money(line.settled, payment.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {payment.forgiven ? (
            <div className="flex items-baseline justify-between text-ink-2">
              <span>{t('payments.forgiven')}</span>
              <span className="tabular">{money(payment.forgiven, payment.currency)}</span>
            </div>
          ) : null}
          {payment.categoryName ? (
            <div className="flex items-baseline justify-between text-ink-2">
              <span>{t('payments.adjustKind')}</span>
              <span>{payment.categoryName}</span>
            </div>
          ) : null}
          {payment.toCustomerName ? (
            <div className="flex items-baseline justify-between text-ink-2">
              <span>{t('payments.transferTo')}</span>
              <span>{payment.toCustomerName}</span>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between border-t border-line pt-3 text-sm font-semibold">
            <span>{t('payments.total')}</span>
            <span className="tabular">
              {money(Math.abs(payment.change), payment.currency)}
              {payment.toCurrency && payment.toAmount !== null
                ? ` → ${money(payment.toAmount, payment.toCurrency)}`
                : ''}
            </span>
          </div>
          {payment.fx ? (
            <p className={cn('tabular text-right text-xs', payment.fx > 0 ? 'text-ok' : 'text-warn')}>
              {t(payment.fx > 0 ? 'payments.fxGain' : 'payments.fxLoss', {
                amount: money(Math.abs(payment.fx), me.org.baseCurrency),
              })}
            </p>
          ) : null}
          {payment.approvedByName ? (
            <p className="text-xs text-ink-3">{t('payments.approvedBy', { name: payment.approvedByName })}</p>
          ) : null}
          {payment.note ? <p className="text-xs text-ink-2">{payment.note}</p> : null}
        </div>
      )}
    </Dialog>
  )
}

interface StatementDialogProps {
  customerId: string
  /** Which of their accounts to open on: their main currency's unless said. */
  currency?: AnyCurrency
  onClose: () => void
  /** Takes the place of the account with a payment in its currency; without it, the account is only looked at. */
  onPay?: (kind: 'in' | 'out', currency: AnyCurrency) => void
  /** Takes its place with a window that puts the account right: an adjustment, or an exchange out of it. */
  onMend?: (kind: 'adjust' | 'exchange' | 'transfer', currency: AnyCurrency) => void
}

/** One of a customer's accounts: every change, what was owed after each, and what is owed now; the others a pick away. */
export function StatementDialog({ customerId, currency: asked, onClose, onPay, onMend }: StatementDialogProps) {
  const { t } = useTranslation()
  const { can } = useSession()
  const debtText = useDebtText()
  const [currency, setCurrency] = useState<AnyCurrency | undefined>(asked)
  const query = useQuery({
    queryKey: ['customers', 'statement', customerId, currency],
    queryFn: ({ signal }) =>
      api.get<CustomerStatementDto>(`/customers/${customerId}/statement`, currency ? { currency } : undefined, signal),
    placeholderData: keepPreviousData,
  })
  const data = query.data
  const queryClient = useQueryClient()
  // A debt's day is moved by whoever keeps that account, or may lend at the till.
  const movesDays =
    !!data && (can(data.customer.isSupplier ? 'customers.suppliers' : 'customers.debts') || can('pos.debt'))
  const moveDue = useMutation({
    mutationFn: ({ id, dueDate }: { id: string; dueDate: string | null }) =>
      api.put(`/customers/dues/${id}`, { dueDate }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success(t('common.saved'))
    },
  })
  // Every currency they have an account in, and their main one even before it has one.
  const currencies = data
    ? [...new Set([data.customer.currency, ...(data.customer.balances ?? []).map((item) => item.currency)])]
    : []

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={data ? `${t('payments.statement')} · ${data.customer.name}` : t('payments.statement')}
      description={data ? debtText(data.balance, data.currency) : undefined}
      footer={
        <>
          {onPay && data ? (
            <span className="mr-auto flex gap-2">
              {can('customers.receive') ? (
                <Button onClick={() => onPay('in', data.currency)}>
                  <ArrowDownLeft />
                  {t('payments.takeIn')}
                </Button>
              ) : null}
              {can('customers.pay_out') ? (
                <Button onClick={() => onPay('out', data.currency)}>
                  <ArrowUpRight />
                  {t('payments.payOut')}
                </Button>
              ) : null}
              {onMend && can('customers.adjust') ? (
                <>
                  <Button onClick={() => onMend('adjust', data.currency)}>
                    <Wrench />
                    {t('payments.adjust')}
                  </Button>
                  <Button onClick={() => onMend('exchange', data.currency)}>
                    <ArrowLeftRight />
                    {t('payments.exchangeShort')}
                  </Button>
                  <Button onClick={() => onMend('transfer', data.currency)}>
                    <Users />
                    {t('payments.transferShort')}
                  </Button>
                </>
              ) : null}
            </span>
          ) : null}
          <Button onClick={onClose}>{t('common.close')}</Button>
        </>
      }
    >
      {currencies.length > 1 && data ? (
        <div className="mb-3 flex flex-wrap gap-1.5" data-enter-skip>
          {currencies.map((code) => (
            <Button
              key={code}
              size="sm"
              variant={code === data.currency ? 'primary' : 'soft'}
              onClick={() => setCurrency(code)}
            >
              {currencyName(code, t)}
            </Button>
          ))}
        </div>
      ) : null}
      {!data ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      ) : data.lines.length ? (
        <table className="w-full text-[13px]">
          <thead className="text-left text-[11px] font-semibold tracking-[0.04em] text-ink-3 uppercase">
            <tr>
              <th className="py-1.5 pr-2">{t('payments.paidAt')}</th>
              <th className="px-2 py-1.5">{t('payments.document')}</th>
              <th className="px-2 py-1.5 text-right">{t('payments.change')}</th>
              <th className="px-2 py-1.5 text-right">{t('payments.balance')}</th>
              <th className="px-2 py-1.5">{t('pos.debtDue')}</th>
              <th className="py-1.5 pl-2">{t('receipts.note')}</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line, index) => (
              <tr key={index} className={cn('border-t border-line', line.kind === 'cancel' && 'text-ink-3')}>
                <td className="tabular py-1.5 pr-2 whitespace-nowrap">{formatDateTime(line.at)}</td>
                <td className="px-2 py-1.5">
                  {line.kind === 'cancel'
                    ? t(
                        line.source === 'receipt'
                          ? 'payments.receiptCancelled'
                          : line.source === 'sale'
                            ? 'payments.saleVoided'
                            : line.source === 'supplier_return'
                              ? 'payments.supplierReturnCancelled'
                              : 'payments.cancelLine',
                      )
                    : line.kind === 'receipt'
                      ? t('payments.receiptLine')
                      : line.kind === 'sale'
                        ? t('payments.saleLine')
                        : line.kind === 'sale_return'
                          ? t('payments.saleReturnLine')
                          : line.kind === 'supplier_return'
                            ? t('payments.supplierReturnLine')
                            : CUSTOMER_PAYMENT_KIND_LABELS[line.kind]}{' '}
                  {line.number && line.source === 'receipt' && line.documentId ? (
                    // The goods behind the debt are a click away.
                    <Link
                      to="/receipts/$receiptId"
                      params={{ receiptId: line.documentId }}
                      className="font-code text-xs text-accent-ink hover:underline"
                    >
                      {line.number}
                    </Link>
                  ) : line.number ? (
                    <span className="font-code text-xs text-ink-3">{line.number}</span>
                  ) : null}
                </td>
                <td
                  className={cn(
                    'tabular px-2 py-1.5 text-right whitespace-nowrap',
                    line.change > 0 ? 'text-bad' : 'text-ok',
                  )}
                >
                  {line.change > 0 ? '+' : '−'}
                  {money(Math.abs(line.change), data.currency)}
                </td>
                <td className="tabular px-2 py-1.5 text-right font-medium whitespace-nowrap">
                  {money(line.balance, data.currency)}
                </td>
                {/* The day a debt falls due, beside the sale or the opening balance that made it. */}
                <td className="px-2 py-1 whitespace-nowrap">
                  {line.due && movesDays ? (
                    <span className="block w-36" data-enter-skip>
                      <DateInput
                        value={line.due.dueDate ?? ''}
                        onChange={(date) => moveDue.mutate({ id: line.due!.id, dueDate: date || null })}
                        warnPast
                      />
                    </span>
                  ) : line.due ? (
                    <span className="tabular">{line.due.dueDate ? formatDay(line.due.dueDate) : t('pos.noDue')}</span>
                  ) : null}
                </td>
                <td className="py-1.5 pl-2 text-ink-2">{line.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState icon={Banknote} title={t('payments.noEntries')} />
      )}
    </Dialog>
  )
}

// ───────────────────────────── The list ─────────────────────────────

/** Every payment made with customers (TL-), newest first. */
export function PaymentsPage() {
  const { t } = useTranslation()
  const { can } = useSession()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const { open: openId, ...filters } = search
  const [adding, setAdding] = useState<'in' | 'out' | null>(null)
  const canTake = can('customers.receive')
  const canPayOut = can('customers.pay_out')

  const list = useQuery({
    queryKey: ['customer-payments', 'list', filters],
    queryFn: ({ signal }) => api.get<PageOf<CustomerPaymentDto>>('/customer-payments', filters, signal),
    placeholderData: keepPreviousData,
  })
  const { choices, search: findCustomer } = useCustomerChoices([search.customerId])

  const filter = (patch: Partial<typeof search>, replace = false) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace })

  useHotkey('n', () => setAdding('in'), {
    label: t('payments.takeIn'),
    group: t('shortcuts.groupList'),
    enabled: canTake && !adding && !openId,
  })

  const columns = useMemo<ColumnDef<CustomerPaymentDto>[]>(
    () => [
      {
        id: 'number',
        header: t('payments.one'),
        meta: { export: (row) => row.number, fixed: true, className: 'w-px font-code text-xs whitespace-nowrap' },
        cell: ({ row }) => row.original.number,
      },
      {
        id: 'paidAt',
        header: t('payments.paidAt'),
        meta: { export: (row) => timeCell(row.paidAt), className: 'tabular w-px whitespace-nowrap' },
        cell: ({ row }) => formatDateTime(row.original.paidAt),
      },
      {
        id: 'kind',
        header: t('payments.kind'),
        meta: { export: (row) => CUSTOMER_PAYMENT_KIND_LABELS[row.kind], className: 'w-px whitespace-nowrap' },
        cell: ({ row }) => (
          <Badge tone={KIND_TONES[row.original.kind]}>{CUSTOMER_PAYMENT_KIND_LABELS[row.original.kind]}</Badge>
        ),
      },
      {
        id: 'customer',
        header: t('payments.customer'),
        meta: {
          export: (row) => (row.toCustomerName ? `${row.customerName} → ${row.toCustomerName}` : row.customerName),
        },
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.customerName}
            {/* A transfer is two customers': the one it left, and the one it went to. */}
            {row.original.toCustomerName ? (
              <span className="font-normal text-ink-2"> → {row.original.toCustomerName}</span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'amount',
        header: t('payments.settles'),
        meta: {
          export: (row) => moneyCell(Math.abs(row.change), row.currency),
          className: 'tabular text-right font-medium whitespace-nowrap',
          headerClassName: 'text-right',
        },
        cell: ({ row }) => money(Math.abs(row.original.change), row.original.currency),
      },
      { id: 'currency', header: t('money.currency'), meta: { exportOnly: true, export: (row) => row.currency } },
      {
        id: 'paidBy',
        header: t('payments.account'),
        meta: { export: (row) => row.paidBy, className: 'text-ink-2' },
        cell: ({ row }) =>
          row.original.lines.map((line) => `${line.accountName}: ${money(line.amount, line.currency)}`).join(', '),
      },
      {
        id: 'author',
        header: t('payments.author'),
        meta: { export: (row) => row.createdByName, className: 'text-ink-2 whitespace-nowrap' },
        cell: ({ row }) => row.original.createdByName ?? '',
      },
      {
        id: 'note',
        header: t('receipts.note'),
        meta: { export: (row) => row.cancelReason ?? row.note, className: 'text-ink-2' },
        cell: ({ row }) => row.original.cancelReason ?? row.original.note ?? '',
      },
      {
        id: 'status',
        header: t('common.status'),
        meta: { export: (row) => CUSTOMER_PAYMENT_STATUS_LABELS[row.status], className: 'w-px whitespace-nowrap' },
        cell: ({ row }) => (
          <Badge tone={row.original.status === 'cancelled' ? 'bad' : 'ok'}>
            {CUSTOMER_PAYMENT_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
    ],
    [t],
  )

  const filtered =
    !!(search.q || search.kind || search.customerId || search.from || search.to) || search.status !== 'all'

  return (
    <Page
      title={t('payments.title')}
      actions={
        canTake || canPayOut ? (
          <>
            {canPayOut ? (
              <Button onClick={() => setAdding('out')}>
                <ArrowUpRight />
                {t('payments.payOut')}
              </Button>
            ) : null}
            {canTake ? (
              <Button variant="primary" onClick={() => setAdding('in')}>
                <ArrowDownLeft />
                {t('payments.takeIn')}
                <Shortcut combo="n" className="ml-1 opacity-70" />
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      <DataTable
        columns={columns}
        data={list.data?.items}
        loading={list.isFetching}
        rowId={(row) => row.id}
        onRowOpen={(row) => void navigate({ search: (previous) => ({ ...previous, open: row.id }) })}
        exportAs={{
          fileName: t('payments.title'),
          rows: () => fetchAll<CustomerPaymentDto>('/customer-payments', filters),
        }}
        preferenceKey="customer-payments"
        rowClassName={(row) => (row.status === 'cancelled' ? 'text-ink-3' : undefined)}
        pagination={{
          page: search.page,
          size: search.size,
          total: list.data?.total ?? 0,
          onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
          onSizeChange: (size) => filter({ size }),
        }}
        filters={{
          kind: (
            <FilterSelect
              value={search.kind ?? 'all'}
              onChange={(kind) => filter({ kind: kind === 'all' ? undefined : (kind as CustomerPaymentKind) })}
              options={[
                { value: 'all', label: t('common.all') },
                ...CUSTOMER_PAYMENT_KINDS.map((kind) => ({ value: kind, label: CUSTOMER_PAYMENT_KIND_LABELS[kind] })),
              ]}
            />
          ),
          customer: (
            <FilterCombo
              options={choices.map((customer) => ({ value: customer.id, label: customer.name }))}
              onQuery={findCustomer}
              value={search.customerId ?? null}
              onChange={(customerId) => filter({ customerId: customerId ?? undefined })}
            />
          ),
          status: (
            <FilterSelect
              value={search.status}
              onChange={(status) => filter({ status: status as typeof search.status })}
              options={[
                { value: 'all', label: t('common.all') },
                ...CUSTOMER_PAYMENT_STATUSES.map((status) => ({
                  value: status,
                  label: CUSTOMER_PAYMENT_STATUS_LABELS[status],
                })),
              ]}
            />
          ),
          paidAt: <FilterDates from={search.from} to={search.to} onChange={(range) => filter(range)} />,
        }}
        toolbar={<SearchInput value={search.q ?? ''} onChange={(q) => filter({ q: q || undefined }, true)} />}
        empty={<EmptyState icon={Banknote} title={filtered ? t('common.nothingFound') : t('payments.empty')} />}
      />
      {adding ? <PaymentDialog kind={adding} onClose={() => setAdding(null)} /> : null}
      {openId ? (
        <PaymentViewDialog
          paymentId={openId}
          onClose={() => void navigate({ search: (previous) => ({ ...previous, open: undefined }) })}
        />
      ) : null}
    </Page>
  )
}
