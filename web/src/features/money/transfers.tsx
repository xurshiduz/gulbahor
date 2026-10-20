import {
  feeOf,
  formatMoney,
  MONEY_TRANSFER_STATUS_LABELS,
  MONEY_TRANSFER_STATUSES,
  moneyTransferInputSchema,
  type AccountDto,
  type AnyCurrency,
  type MoneyTransferDto,
  type MoneyTransferStatus,
  type Page as PageOf,
} from '@erp/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowRight, ArrowRightLeft, Check, MoreHorizontal, Undo2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterDates, FilterSelect } from '@/components/ui/column-filters'
import { Combobox } from '@/components/ui/combobox'
import { Menu } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog } from '@/components/ui/dialog'
import { Badge, EmptyState } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { SearchInput } from '@/components/ui/page'
import type { NoticeStart } from '@/features/cards/notice-picks'
import { currencyShort, placeName } from '@/features/money/payment-lines'
import { api, ApiError } from '@/lib/api'
import { base } from '@/lib/base'
import { fetchAll, moneyCell, timeCell } from '@/lib/excel'
import { formatDateTime } from '@/lib/format'
import { toast } from '@/lib/toast'
import { uuid } from '@/lib/uuid'

import { exchangeLine, ReceivedField, receivedOf, transferSums, type ExchangeSums } from './exchange'
import { useRateBook } from './rates'

const route = getRouteApi('/money')

const money = (minor: number, currency: AnyCurrency) => formatMoney(minor, currency, { minor: 'auto' })

const TONES: Record<MoneyTransferStatus, 'warn' | 'ok' | 'bad' | 'neutral'> = {
  sent: 'warn',
  received: 'ok',
  rejected: 'bad',
  cancelled: 'neutral',
}

const refresh = (queryClient: ReturnType<typeof useQueryClient>) => {
  for (const key of ['money', 'pos', 'shifts']) {
    void queryClient.invalidateQueries({ queryKey: [key] })
  }
}

/** Saying money arrived, refusing it, or taking it back: the three things done to a transfer on its way. */
export function useTransferActions() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const act = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: 'receive' | 'reject' | 'cancel'; reason?: string }) =>
      api.post<MoneyTransferDto>(`/money/transfers/${id}/${action}`, action === 'reject' ? { reason } : undefined),
    onSuccess: (transfer) => {
      refresh(queryClient)
      toast.success(
        t(
          transfer.status === 'received'
            ? 'money.transferReceived'
            : transfer.status === 'rejected'
              ? 'money.transferRejected'
              : 'money.transferCancelled',
          { number: transfer.number },
        ),
      )
    },
  })
  return act
}

interface ActionsProps {
  transfer: MoneyTransferDto
  size?: 'sm' | 'md'
}

/** The buttons a person may press on a transfer still on its way; refusing asks why. */
export function TransferButtons({ transfer, size = 'sm' }: ActionsProps) {
  const { t } = useTranslation()
  const act = useTransferActions()
  const [refusing, setRefusing] = useState(false)
  const [reason, setReason] = useState('')

  if (!transfer.mayReceive && !transfer.mayCancel) {
    return transfer.status === 'sent' ? <span className="text-xs text-ink-3">{t('money.waiting')}</span> : null
  }
  const takeBack = () => act.mutate({ id: transfer.id, action: 'cancel' })
  return (
    <span className="flex items-center justify-end gap-1.5" onClick={(event) => event.stopPropagation()}>
      {/* One button, the one usually pressed; refusing, and taking back what one sent oneself, wait in the menu
          beside it — three buttons side by side pushed the table, and the till's narrow column, out sideways. */}
      {transfer.mayReceive ? (
        <>
          <Button
            size={size}
            variant="primary"
            loading={act.isPending}
            onClick={() => act.mutate({ id: transfer.id, action: 'receive' })}
          >
            <Check />
            {t('money.receive')}
          </Button>
          <Menu
            trigger={
              <Button
                variant="ghost"
                size={size === 'sm' ? 'iconSm' : 'icon'}
                disabled={act.isPending}
                aria-label={t('common.actions')}
              >
                <MoreHorizontal />
              </Button>
            }
            items={[
              { label: t('money.reject'), icon: <X />, tone: 'danger', onSelect: () => setRefusing(true) },
              ...(transfer.mayCancel ? [{ label: t('money.takeBack'), icon: <Undo2 />, onSelect: takeBack }] : []),
            ]}
          />
        </>
      ) : (
        <Button size={size} disabled={act.isPending} onClick={takeBack}>
          <Undo2 />
          {t('money.takeBack')}
        </Button>
      )}
      {refusing ? (
        <Dialog
          open
          onClose={() => setRefusing(false)}
          size="sm"
          title={`${t('money.reject')} · ${transfer.number}`}
          description={`${transfer.fromAccountName} → ${transfer.toAccountName} · ${transferSums(transfer)}`}
          footer={
            <>
              <Button onClick={() => setRefusing(false)}>{t('common.no')}</Button>
              <Button type="submit" form="reject-transfer" variant="danger" loading={act.isPending}>
                {t('money.reject')}
              </Button>
            </>
          }
        >
          <Form
            id="reject-transfer"
            onSubmit={() =>
              reason.trim()
                ? act.mutate(
                    { id: transfer.id, action: 'reject', reason: reason.trim() },
                    { onSuccess: () => setRefusing(false) },
                  )
                : toast.error(t('money.rejectReasonNeeded'))
            }
          >
            <Field label={t('money.rejectReason')} required>
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
          </Form>
        </Dialog>
      ) : null}
    </span>
  )
}

/** Every movement of money between accounts, newest first; what is still on its way can be dealt with here. */
export function TransfersTab() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const filters = {
    page: search.page,
    size: search.size,
    q: search.q,
    status: search.status,
    from: search.from,
    to: search.to,
  }

  const list = useQuery({
    queryKey: ['money', 'transfers', filters],
    queryFn: ({ signal }) => api.get<PageOf<MoneyTransferDto>>('/money/transfers', filters, signal),
    placeholderData: keepPreviousData,
  })

  const filter = (patch: Partial<typeof search>, replace = false) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace })

  const columns = useMemo<ColumnDef<MoneyTransferDto>[]>(
    () => [
      {
        id: 'number',
        header: t('money.transferNumber'),
        meta: { export: (row) => row.number, fixed: true, className: 'w-px font-code text-xs whitespace-nowrap' },
        cell: ({ row }) => row.original.number,
      },
      {
        id: 'sentAt',
        header: t('money.sentAt'),
        meta: { export: (row) => timeCell(row.sentAt), className: 'tabular w-px whitespace-nowrap' },
        cell: ({ row }) => formatDateTime(row.original.sentAt),
      },
      {
        id: 'route',
        header: t('money.transferRoute'),
        meta: { export: (row) => `${row.fromAccountName} → ${row.toAccountName}`, className: 'whitespace-nowrap' },
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            {row.original.fromAccountName}
            <ArrowRight className="size-3.5 text-ink-3" />
            {row.original.toAccountName}
          </span>
        ),
      },
      {
        id: 'amount',
        header: t('money.amount'),
        meta: {
          export: (row) => moneyCell(row.amount, row.currency),
          className: 'tabular text-right font-medium whitespace-nowrap',
          headerClassName: 'text-right',
        },
        cell: ({ row }) => (
          <>
            {transferSums(row.original)}
            {/* What the bank kept for it left the account too: said under the sum, and found among the expenses. */}
            {row.original.fee ? (
              <span className="block text-xs font-normal text-ink-3" title={row.original.feeNumber ?? undefined}>
                {t('money.feeShort', { amount: money(row.original.fee, row.original.currency) })}
              </span>
            ) : null}
          </>
        ),
      },
      { id: 'currency', header: t('money.currency'), meta: { exportOnly: true, export: (row) => row.currency } },
      {
        id: 'fee',
        header: t('money.transferFee'),
        meta: { exportOnly: true, export: (row) => (row.fee ? moneyCell(row.fee, row.currency) : null) },
      },
      {
        id: 'toAmount',
        header: t('money.exchangeReceived'),
        meta: { exportOnly: true, export: (row) => moneyCell(row.toAmount, row.toCurrency) },
      },
      {
        id: 'toCurrency',
        header: t('money.exchangeCurrency'),
        meta: { exportOnly: true, export: (row) => row.toCurrency },
      },
      {
        id: 'sentBy',
        header: t('money.sentBy'),
        meta: { export: (row) => row.sentByName, className: 'text-ink-2' },
        cell: ({ row }) => row.original.sentByName ?? '',
      },
      {
        id: 'decidedBy',
        header: t('money.decidedBy'),
        meta: { export: (row) => row.decidedByName, className: 'text-ink-2' },
        cell: ({ row }) =>
          row.original.decidedByName ? (
            <span>
              {row.original.decidedByName}
              <span className="tabular text-xs text-ink-3"> · {formatDateTime(row.original.decidedAt)}</span>
            </span>
          ) : (
            ''
          ),
      },
      {
        id: 'note',
        header: t('receipts.note'),
        meta: { export: (row) => row.reason ?? row.note, className: 'text-ink-2' },
        cell: ({ row }) => row.original.reason ?? row.original.note ?? '',
      },
      {
        id: 'status',
        header: t('common.status'),
        meta: { export: (row) => MONEY_TRANSFER_STATUS_LABELS[row.status], className: 'w-px whitespace-nowrap' },
        cell: ({ row }) => (
          <Badge tone={TONES[row.original.status]}>{MONEY_TRANSFER_STATUS_LABELS[row.original.status]}</Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px whitespace-nowrap' },
        cell: ({ row }) => <TransferButtons transfer={row.original} />,
      },
    ],
    [t],
  )

  const filtered = !!(search.q || search.from || search.to) || search.status !== 'all'

  return (
    <DataTable
      columns={columns}
      data={list.data?.items}
      loading={list.isFetching}
      rowId={(row) => row.id}
      exportAs={{
        fileName: t('money.tabTransfers'),
        rows: () => fetchAll<MoneyTransferDto>('/money/transfers', filters),
      }}
      preferenceKey="money-transfers"
      rowClassName={(row) => (row.status === 'rejected' || row.status === 'cancelled' ? 'text-ink-3' : undefined)}
      pagination={{
        page: search.page,
        size: search.size,
        total: list.data?.total ?? 0,
        onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
        onSizeChange: (size) => filter({ size }),
      }}
      filters={{
        status: (
          <FilterSelect
            value={search.status}
            onChange={(status) => filter({ status: status as typeof search.status })}
            options={[
              { value: 'all', label: t('common.all') },
              ...MONEY_TRANSFER_STATUSES.map((status) => ({
                value: status,
                label: MONEY_TRANSFER_STATUS_LABELS[status],
              })),
            ]}
          />
        ),
        sentAt: <FilterDates from={search.from} to={search.to} onChange={(range) => filter(range)} />,
      }}
      toolbar={<SearchInput value={search.q ?? ''} onChange={(q) => filter({ q: q || undefined }, true)} />}
      empty={<EmptyState icon={ArrowRightLeft} title={filtered ? t('common.nothingFound') : t('money.noTransfers')} />}
    />
  )
}

/**
 * Moving money from one account to another, by those who keep it. Into a
 * place of another currency it is an exchange: what enters is a second sum,
 * paired with what leaves.
 */
export function TransferDialog({
  accounts,
  limit,
  setsRates,
  startFrom: asked = null,
  notice = null,
  onClose,
}: {
  accounts: AccountDto[]
  /** How far from the day's rate this person may agree what enters, in percent. */
  limit: number
  /** This person sets rates: an agreement however far from the day's is theirs to make. */
  setsRates: boolean
  /** The account the money leaves, when the window is opened for it: a terminal whose money reached the bank. */
  startFrom?: string | null
  /** A bank's notice of money on a card, opened to say where it went or came from: the card and sum are its. */
  notice?: NoticeStart | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const book = useRateBook()
  // Opened for a notice of money leaving a card, the card is where it leaves from; of money reaching one, where to.
  const startFrom = notice?.direction === 'out' ? notice.accountId : asked
  const [fromId, setFromId] = useState<string | null>(startFrom)
  // Opened for a terminal, its money goes to the bank account — the only one of its currency, when there is one.
  const [startTo] = useState<string | null>(() => {
    const start = accounts.find((account) => account.id === startFrom)
    const banks =
      start?.kind === 'terminal'
        ? accounts.filter(
            (account) => account.isActive && account.kind === 'bank' && account.currency === start.currency,
          )
        : []
    return notice?.direction === 'in' ? notice.accountId : banks.length === 1 ? banks[0].id : null
  })
  const [toId, setToId] = useState<string | null>(startTo)
  const [sums, setSums] = useState<ExchangeSums>({ amount: notice?.amount ?? null, received: null })
  // What the bank keeps for moving it: seldom there, so the field stays folded until asked for.
  const [charged, setCharged] = useState(false)
  const [fee, setFee] = useState<number | null>(null)
  /** The fee was typed: what the terminal's percent makes of the sum is no longer put in its place. */
  const [feeTyped, setFeeTyped] = useState(false)
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  // One transfer, one key: sent twice, it is still made once.
  const [clientKey] = useState(uuid)

  // Everything can be carried but a terminal's money: that goes one way, to the bank, when the bank shows it.
  const movable = accounts.filter((account) => account.isActive && account.kind !== 'terminal')
  const sources = accounts.filter((account) => account.isActive)
  const from = sources.find((account) => account.id === fromId) ?? null
  const settling = from?.kind === 'terminal'
  const targets = settling
    ? movable.filter((account) => account.kind === 'bank' && account.currency === from.currency)
    : movable.filter((account) => account.id !== fromId)
  const to = targets.find((account) => account.id === toId) ?? null
  const line = exchangeLine(from, to?.currency ?? null, sums, book, limit)
  // Of what a terminal took the bank keeps its share: worked out from the terminal's percent until typed over.
  const feeNow = settling && !feeTyped ? feeOf(sums.amount ?? 0, from.feePercent) || null : fee
  const withFee = charged || settling
  // A card is told from another by its number, a drawer by its till: the till's name is the drawer's own.
  const option = (account: AccountDto) => ({
    value: account.id,
    label: account.kind === 'cash' ? account.name : placeName(account, t),
    hint: account.balance === null ? account.currency : money(account.balance, account.currency),
  })

  const send = useMutation({
    mutationFn: (input: unknown) => api.post<MoneyTransferDto>('/money/transfers', input),
    onSuccess: (transfer) => {
      refresh(queryClient)
      toast.success(t('money.transferSent', { number: transfer.number }))
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) {
        setErrors(error.fields)
      }
    },
  })

  const noticeHolds =
    !!notice &&
    (notice.direction === 'out'
      ? fromId === notice.accountId && sums.amount === notice.amount
      : toId === notice.accountId && (receivedOf(line) ?? sums.amount) === notice.amount)

  const submit = () => {
    const parsed = moneyTransferInputSchema.safeParse({
      clientKey,
      fromAccountId: fromId,
      toAccountId: toId,
      // What leaves a terminal is typed whole: what reaches the bank is that less the bank's share.
      amount: settling && sums.amount ? sums.amount - (feeNow ?? 0) : sums.amount,
      received: receivedOf(line),
      fee: withFee ? feeNow : null,
      note,
      // The notice it was opened for stands for it while its card and sum are still the transfer's.
      ...(notice && noticeHolds ? { noticeIds: [notice.id] } : {}),
    })
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])))
      return
    }
    setErrors({})
    send.mutate(parsed.data)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('money.addTransfer')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="transfer-form" variant="primary" loading={send.isPending}>
            {t('money.send')}
          </Button>
        </>
      }
    >
      <Form id="transfer-form" onSubmit={submit}>
        {/* A pair, as in a payment: where the money leaves and what leaves on the left, where it goes and what
            enters on the right. */}
        <div className="grid items-start gap-x-3 gap-y-4 sm:grid-cols-2">
          <Field label={t('money.transferFrom')} error={errors.fromAccountId} required>
            {(id) => (
              <Combobox
                id={id}
                // The cursor starts at the first thing still to be said.
                autoFocus={!startFrom}
                options={sources.map(option)}
                value={fromId}
                onChange={(value) => {
                  setFromId(value)
                  setToId(null)
                  setSums({ amount: null, received: null })
                  setFee(null)
                  setFeeTyped(false)
                }}
                invalid={!!errors.fromAccountId}
              />
            )}
          </Field>
          <Field label={t('money.transferTo')} error={errors.toAccountId} required>
            {(id) => (
              <Combobox
                id={id}
                autoFocus={!!startFrom && !startTo}
                // A place of another currency is offered too: the money is changed on the way.
                options={targets.map(option)}
                value={toId}
                onChange={(value) => {
                  setToId(value)
                  setSums((current) => ({ ...current, received: null }))
                }}
                invalid={!!errors.toAccountId}
              />
            )}
          </Field>
          <Field
            label={
              settling
                ? t('money.terminalGross')
                : line && from
                  ? t('money.exchangeOut', { currency: currencyShort(from.currency, t) })
                  : t('money.amount')
            }
            error={errors.amount}
            required
          >
            {(id) => (
              <MoneyInput
                id={id}
                value={sums.amount}
                autoFocus={!!startFrom && !!startTo}
                // What leaves is the anchor: typed, what enters follows from the rate afresh.
                onChange={(amount) => setSums({ amount, received: null })}
                currency={from?.currency ?? base()}
                fillValue={from?.balance ?? undefined}
                invalid={!!errors.amount}
              />
            )}
          </Field>
          {line && to ? (
            <ReceivedField
              line={line}
              sums={sums}
              toCurrency={to.currency}
              onChange={setSums}
              book={book}
              setsRates={setsRates}
              error={errors.received}
              className="w-full"
            />
          ) : null}
        </div>
        {withFee ? (
          <div className="grid items-start gap-x-3 gap-y-4 sm:grid-cols-2">
            <Field
              label={
                settling && from.feePercent
                  ? `${t('money.transferFee')} · ${String(from.feePercent).replace('.', ',')}%`
                  : t('money.transferFee')
              }
              error={errors.fee}
              hint={settling ? t('money.terminalFeeHint') : t('money.transferFeeHint')}
            >
              {(id) => (
                <MoneyInput
                  id={id}
                  // Asked for, the cursor goes to it; a terminal's is there from the start and is passed by.
                  autoFocus={!settling}
                  value={feeNow}
                  onChange={(value) => {
                    setFee(value)
                    setFeeTyped(true)
                  }}
                  currency={from?.currency ?? base()}
                  invalid={!!errors.fee}
                />
              )}
            </Field>
            {/* What it comes to: what the account loses in all, or — off a terminal — what the bank account gets. */}
            {from && sums.amount && (feeNow || settling) ? (
              <p data-fee-total className="tabular self-center pt-5 text-[13px] text-ink-2">
                {settling
                  ? t('money.reachesBank', { amount: money(sums.amount - (feeNow ?? 0), from.currency) })
                  : t('money.leavesAccount', { amount: money(sums.amount + (feeNow ?? 0), from.currency) })}
              </p>
            ) : null}
          </div>
        ) : (
          <div data-enter-skip>
            <Button variant="soft" size="sm" onClick={() => setCharged(true)}>
              {t('money.addFee')}
            </Button>
          </div>
        )}
        <Field label={t('receipts.note')}>
          {(id) => <Input id={id} value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />}
        </Field>
      </Form>
    </Dialog>
  )
}
