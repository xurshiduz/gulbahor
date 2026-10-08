import {
  formatMoney,
  type CustomerDebtDto,
  type DebtPaymentDto,
  type DebtState,
  type DebtSummary,
  type Page as PageOf,
} from '@erp/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { HandCoins, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterSelect } from '@/components/ui/column-filters'
import { DataTable } from '@/components/ui/data-table'
import { useConfirm } from '@/components/ui/dialog'
import { Badge, EmptyState } from '@/components/ui/feedback'
import { SearchInput } from '@/components/ui/page'
import { api } from '@/lib/api'
import { base } from '@/lib/base'
import { cn } from '@/lib/cn'
import { dayCell, fetchAll, moneyCell, timeCell } from '@/lib/excel'
import { formatDateTime, formatDay, formatPhone } from '@/lib/format'
import { toast } from '@/lib/toast'

import { DebtPayDialog } from './debt-pay'

const route = getRouteApi('/customers')

const money = (minor: number) => formatMoney(minor, base(), { minor: 'auto' })

/** Who owes: the name, and under it the number they are rung on. */
function Who({ name, phone }: { name: string; phone: string }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="font-medium">{name}</span>
      <span className="tabular text-xs text-ink-3">{formatPhone(phone)}</span>
    </span>
  )
}

const STATE_TONES: Record<DebtState, 'ok' | 'warn' | 'bad' | 'neutral'> = {
  open: 'warn',
  overdue: 'bad',
  closed: 'ok',
  cancelled: 'neutral',
}

/**
 * What customers owe: a row for each receipt that left something owing,
 * the one due first on top. Money is taken against the customer, not the
 * row: whatever they bring pays what is due first.
 */
export function DebtsTab() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [paying, setPaying] = useState<CustomerDebtDto | null>(null)
  const filters = { page: search.page, size: search.size, q: search.q, state: search.debtState }

  const list = useQuery({
    queryKey: ['customer-debts', 'list', filters],
    queryFn: ({ signal }) =>
      api.get<PageOf<CustomerDebtDto> & { summary: DebtSummary }>('/customer-debts', filters, signal),
    placeholderData: keepPreviousData,
  })
  const filter = (patch: Partial<typeof search>, replace = false) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace })

  const columns = useMemo<ColumnDef<CustomerDebtDto>[]>(
    () => [
      {
        id: 'customer',
        header: t('debts.customer'),
        meta: { export: (row) => row.customerName, fixed: true, className: 'whitespace-nowrap' },
        cell: ({ row }) => <Who name={row.original.customerName} phone={row.original.customerPhone} />,
      },
      { id: 'phone', header: t('customers.phone'), meta: { exportOnly: true, export: (row) => row.customerPhone } },
      {
        id: 'sale',
        header: t('debts.sale'),
        meta: { export: (row) => row.saleNumber, className: 'whitespace-nowrap' },
        // When and where it was sold stand under the receipt they belong to.
        cell: ({ row }) => (
          <span className="flex flex-col leading-tight">
            <span className="font-code text-xs">{row.original.saleNumber}</span>
            <span className="text-xs text-ink-3">
              {formatDay(row.original.soldAt)} · {row.original.locationName}
            </span>
          </span>
        ),
      },
      { id: 'soldAt', header: t('debts.soldAt'), meta: { exportOnly: true, export: (row) => timeCell(row.soldAt) } },
      { id: 'location', header: t('money.shop'), meta: { exportOnly: true, export: (row) => row.locationName } },
      {
        id: 'dueDate',
        header: t('debts.dueDate'),
        meta: { export: (row) => dayCell(row.dueDate), className: 'tabular whitespace-nowrap' },
        cell: ({ row }) => (
          <span className={cn(row.original.state === 'overdue' && 'font-medium text-bad')}>
            {formatDay(row.original.dueDate)}
          </span>
        ),
      },
      {
        id: 'amount',
        header: t('debts.amount'),
        meta: {
          export: (row) => moneyCell(row.amount, base()),
          className: 'tabular text-right whitespace-nowrap',
          headerClassName: 'text-right',
        },
        cell: ({ row }) => money(row.original.amount),
      },
      {
        id: 'paid',
        header: t('debts.paidSum'),
        meta: {
          export: (row) => moneyCell(row.paid + row.returned, base()),
          className: 'tabular text-right whitespace-nowrap text-ink-2',
          headerClassName: 'text-right',
        },
        // What goods brought back took off is said apart, on a line of its own: no money came in for it.
        cell: ({ row }) =>
          row.original.paid || row.original.returned ? (
            <span className="flex flex-col items-end leading-tight">
              {row.original.paid ? <span>{money(row.original.paid)}</span> : null}
              {row.original.returned ? (
                <span className="text-xs text-ink-3">
                  {t('debts.returned').toLowerCase()} {money(row.original.returned)}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-ink-3">—</span>
          ),
      },
      {
        id: 'left',
        header: t('debts.left'),
        meta: {
          export: (row) => moneyCell(row.left, base()),
          className: 'tabular text-right whitespace-nowrap',
          headerClassName: 'text-right',
        },
        cell: ({ row }) =>
          row.original.left ? (
            <span className="font-semibold">{money(row.original.left)}</span>
          ) : (
            <span className="text-ink-3">—</span>
          ),
      },
      {
        id: 'state',
        header: t('debts.state'),
        meta: { export: (row) => t(`debts.state_${row.state}`), className: 'w-px whitespace-nowrap' },
        cell: ({ row }) => (
          <Badge tone={STATE_TONES[row.original.state]}>{t(`debts.state_${row.original.state}`)}</Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px whitespace-nowrap' },
        cell: ({ row }) =>
          row.original.left ? (
            <Button variant="soft" size="sm" onClick={() => setPaying(row.original)}>
              <HandCoins />
              {t('debts.take')}
            </Button>
          ) : null,
      },
    ],
    [t],
  )

  const summary = list.data?.summary
  return (
    <>
      <DataTable
        columns={columns}
        data={list.data?.items}
        loading={list.isFetching}
        rowId={(row) => row.id}
        exportAs={{ fileName: t('debts.title'), rows: () => fetchAll<CustomerDebtDto>('/customer-debts', filters) }}
        preferenceKey="customer-debts"
        rowClassName={(row) => (row.state === 'cancelled' ? 'text-ink-3' : undefined)}
        pagination={{
          page: search.page,
          size: search.size,
          total: list.data?.total ?? 0,
          onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
          onSizeChange: (size) => void navigate({ search: (previous) => ({ ...previous, size, page: 1 }) }),
        }}
        filters={{
          state: (
            <FilterSelect
              value={search.debtState}
              onChange={(state) => filter({ debtState: state as typeof search.debtState })}
              options={(['owed', 'overdue', 'closed', 'all'] as const).map((state) => ({
                value: state,
                label: t(`debts.state_${state}`),
              }))}
            />
          ),
        }}
        toolbar={
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
            <SearchInput value={search.q ?? ''} onChange={(q) => filter({ q: q || undefined }, true)} />
            {/* The whole of what is owed, whatever the list is filtered to. */}
            {summary?.owed ? (
              <p className="tabular text-[13px] text-ink-2">
                {t('debts.owedTotal')}: <span className="font-semibold text-ink">{money(summary.owed)}</span>
                <span className="text-ink-3"> · {t('debts.debtors', { n: summary.debtors })}</span>
                {summary.overdue ? (
                  <>
                    <span className="text-ink-3"> · </span>
                    {t('debts.overdueTotal')}: <span className="font-semibold text-bad">{money(summary.overdue)}</span>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        }
        empty={
          <EmptyState
            icon={HandCoins}
            title={search.q || search.debtState !== 'owed' ? t('common.nothingFound') : t('debts.empty')}
            hint={search.q || search.debtState !== 'owed' ? undefined : t('debts.emptyHint')}
          />
        }
      />
      {paying ? (
        <DebtPayDialog
          customer={{ id: paying.customerId, name: paying.customerName, phone: paying.customerPhone }}
          owed={paying.customerOwed}
          onClose={() => setPaying(null)}
        />
      ) : null}
    </>
  )
}

/** The money customers have brought against what they owe, newest first. */
export function DebtPaymentsTab() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const filters = { page: search.page, size: search.size }

  const list = useQuery({
    queryKey: ['customer-debts', 'payments', filters],
    queryFn: ({ signal }) => api.get<PageOf<DebtPaymentDto>>('/customer-debts/payments', filters, signal),
    placeholderData: keepPreviousData,
  })
  const cancel = useMutation({
    mutationFn: (id: string) => api.post<DebtPaymentDto>(`/customer-debts/payments/${id}/cancel`, {}),
    onSuccess: () => {
      for (const key of ['customer-debts', 'customers', 'money', 'pos', 'shifts']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
      toast.success(t('debts.cancelled'))
    },
  })

  const columns = useMemo<ColumnDef<DebtPaymentDto>[]>(
    () => [
      {
        id: 'number',
        header: t('debts.number'),
        meta: { export: (row) => row.number, fixed: true, className: 'w-px font-code text-xs whitespace-nowrap' },
        cell: ({ row }) => row.original.number,
      },
      {
        id: 'paidAt',
        header: t('debts.paidAt'),
        meta: { export: (row) => timeCell(row.paidAt), className: 'whitespace-nowrap' },
        // Who took it stands under when.
        cell: ({ row }) => (
          <span className="flex flex-col leading-tight">
            <span className="tabular">{formatDateTime(row.original.paidAt)}</span>
            <span className="text-xs text-ink-3">{row.original.createdByName ?? ''}</span>
          </span>
        ),
      },
      { id: 'by', header: t('debts.takenBy'), meta: { exportOnly: true, export: (row) => row.createdByName } },
      {
        id: 'customer',
        header: t('debts.customer'),
        meta: { export: (row) => row.customerName, className: 'whitespace-nowrap' },
        cell: ({ row }) => <Who name={row.original.customerName} phone={row.original.customerPhone} />,
      },
      {
        id: 'total',
        header: t('payments.total'),
        meta: {
          export: (row) => moneyCell(row.total, base()),
          className: 'tabular text-right whitespace-nowrap',
          headerClassName: 'text-right',
        },
        cell: ({ row }) => <span className="font-semibold">{money(row.original.total)}</span>,
      },
      {
        id: 'into',
        header: t('debts.into'),
        meta: { export: (row) => row.paidBy, className: 'whitespace-nowrap text-ink-2' },
        cell: ({ row }) => row.original.paidBy,
      },
      {
        id: 'sales',
        header: t('debts.forSales'),
        meta: {
          export: (row) => row.parts.map((part) => part.saleNumber).join(', '),
          className: 'font-code text-xs text-ink-2',
        },
        cell: ({ row }) => row.original.parts.map((part) => part.saleNumber).join(', '),
      },
      {
        id: 'note',
        header: t('receipts.note'),
        meta: { export: (row) => row.cancelReason ?? row.note, className: 'max-w-56 text-ink-2' },
        cell: ({ row }) => row.original.cancelReason ?? row.original.note ?? '',
      },
      {
        id: 'status',
        header: t('common.status'),
        meta: {
          exportOnly: true,
          export: (row) => t(row.status === 'posted' ? 'debts.paymentPosted' : 'debts.state_cancelled'),
        },
      },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px whitespace-nowrap text-right' },
        // One that was undone says so where the way to undo it stood.
        cell: ({ row }) =>
          row.original.status === 'cancelled' ? (
            <Badge>{t('debts.state_cancelled')}</Badge>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const sure = await confirm({
                  title: t('debts.cancelConfirm', { number: row.original.number }),
                  confirmLabel: t('debts.cancel'),
                  tone: 'danger',
                })
                if (sure) {
                  cancel.mutate(row.original.id)
                }
              }}
            >
              <Undo2 />
              {t('debts.cancel')}
            </Button>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  return (
    <DataTable
      columns={columns}
      data={list.data?.items}
      loading={list.isFetching}
      rowId={(row) => row.id}
      exportAs={{
        fileName: t('debts.payments'),
        rows: () => fetchAll<DebtPaymentDto>('/customer-debts/payments', filters),
      }}
      preferenceKey="debt-payments"
      rowClassName={(row) => (row.status === 'cancelled' ? 'text-ink-3' : undefined)}
      pagination={{
        page: search.page,
        size: search.size,
        total: list.data?.total ?? 0,
        onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
        onSizeChange: (size) => void navigate({ search: (previous) => ({ ...previous, size, page: 1 }) }),
      }}
      empty={<EmptyState icon={HandCoins} title={t('debts.noPayments')} />}
    />
  )
}
