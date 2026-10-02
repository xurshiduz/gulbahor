import {
  formatMoney,
  MONEY_TRANSFER_STATUS_LABELS,
  MONEY_TRANSFER_STATUSES,
  moneyTransferInputSchema,
  type AccountDto,
  type CurrencyCode,
  type MoneyTransferDto,
  type MoneyTransferStatus,
  type Page as PageOf,
} from '@gulbahor/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowRight, ArrowRightLeft, Check, Undo2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { FilterDates, FilterSelect } from '@/components/ui/column-filters'
import { Combobox } from '@/components/ui/combobox'
import { DataTable } from '@/components/ui/data-table'
import { Dialog } from '@/components/ui/dialog'
import { Badge, EmptyState } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { SearchInput } from '@/components/ui/page'
import { api } from '@/lib/api'
import { fetchAll, moneyCell, timeCell } from '@/lib/excel'
import { formatDateTime } from '@/lib/format'
import { uuid } from '@/lib/uuid'

const route = getRouteApi('/money')

const money = (minor: number, currency: CurrencyCode) => formatMoney(minor, currency, { minor: 'auto' })

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
  return (
    <span className="flex items-center justify-end gap-1.5" onClick={(event) => event.stopPropagation()}>
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
          <Button size={size} disabled={act.isPending} onClick={() => setRefusing(true)}>
            <X />
            {t('money.reject')}
          </Button>
        </>
      ) : null}
      {transfer.mayCancel ? (
        <Button size={size} disabled={act.isPending} onClick={() => act.mutate({ id: transfer.id, action: 'cancel' })}>
          <Undo2 />
          {t('money.takeBack')}
        </Button>
      ) : null}
      {refusing ? (
        <Dialog
          open
          onClose={() => setRefusing(false)}
          size="sm"
          title={`${t('money.reject')} · ${transfer.number}`}
          description={`${transfer.fromAccountName} → ${transfer.toAccountName} · ${money(transfer.amount, transfer.currency)}`}
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
        meta: { export: (row) => `${row.fromAccountName} → ${row.toAccountName}` },
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
        cell: ({ row }) => money(row.original.amount, row.original.currency),
      },
      { id: 'currency', header: t('money.currency'), meta: { exportOnly: true, export: (row) => row.currency } },
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

/** Moving money from one account to another, by those who keep it. */
export function TransferDialog({ accounts, onClose }: { accounts: AccountDto[]; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [fromId, setFromId] = useState<string | null>(null)
  const [toId, setToId] = useState<string | null>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  // One transfer, one key: sent twice, it is still made once.
  const [clientKey] = useState(uuid)

  // A terminal's money goes to the bank by itself; everything else can be carried.
  const movable = accounts.filter((account) => account.isActive && account.kind !== 'terminal')
  const from = movable.find((account) => account.id === fromId) ?? null
  const option = (account: AccountDto) => ({
    value: account.id,
    label: account.name,
    hint: account.balance === null ? account.currency : money(account.balance, account.currency),
  })

  const send = useMutation({
    mutationFn: (input: unknown) => api.post<MoneyTransferDto>('/money/transfers', input),
    onSuccess: (transfer) => {
      refresh(queryClient)
      toast.success(t('money.transferSent', { number: transfer.number }))
      onClose()
    },
  })

  const submit = () => {
    const parsed = moneyTransferInputSchema.safeParse({
      clientKey,
      fromAccountId: fromId,
      toAccountId: toId,
      amount,
      note,
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
        <Field label={t('money.transferFrom')} error={errors.fromAccountId} required>
          {(id) => (
            <Combobox
              id={id}
              autoFocus
              options={movable.map(option)}
              value={fromId}
              onChange={(value) => {
                setFromId(value)
                setToId(null)
              }}
              invalid={!!errors.fromAccountId}
            />
          )}
        </Field>
        <Field label={t('money.transferTo')} error={errors.toAccountId} required>
          {(id) => (
            <Combobox
              id={id}
              // Money stays what it is: so'm go to an account in so'm, dollars to one in dollars.
              options={movable
                .filter((account) => account.id !== fromId && (!from || account.currency === from.currency))
                .map(option)}
              value={toId}
              onChange={setToId}
              invalid={!!errors.toAccountId}
            />
          )}
        </Field>
        <Field label={t('money.amount')} error={errors.amount} required>
          {(id) => (
            <MoneyInput
              id={id}
              value={amount}
              onChange={setAmount}
              currency={from?.currency ?? 'UZS'}
              fillValue={from?.balance ?? undefined}
              invalid={!!errors.amount}
              className="w-48"
            />
          )}
        </Field>
        <Field label={t('receipts.note')}>
          {(id) => <Input id={id} value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />}
        </Field>
      </Form>
    </Dialog>
  )
}
