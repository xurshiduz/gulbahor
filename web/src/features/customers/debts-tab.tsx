import { formatMoney, type AnyCurrency, type DebtorDto, type DebtorSummary, type Page as PageOf } from '@erp/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { HandCoins, ScrollText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterSelect } from '@/components/ui/column-filters'
import { DataTable } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/feedback'
import { SearchInput } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { base } from '@/lib/base'
import { dayCell, fetchAll, moneyCell } from '@/lib/excel'
import { formatDay, formatPhone } from '@/lib/format'

import { PaymentDialog, StatementDialog } from './payments'

const route = getRouteApi('/customers')

const money = (minor: number, currency: AnyCurrency) => formatMoney(minor, currency, { minor: 'auto' })

/** Who owes: the name, and under it the number they are rung on. */
function Who({ name, phone }: { name: string; phone: string | null }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="font-medium">{name}</span>
      {phone ? <span className="tabular text-xs text-ink-3">{formatPhone(phone)}</span> : null}
    </span>
  )
}

/** What is open over the list: one of the debtor's accounts, or money taken against it. */
type Over = { kind: 'statement' | 'in' | 'out'; customerId: string; currency: AnyCurrency; back?: boolean }

/**
 * Who owes the business: a row for each account that owes, the longest late
 * on top. Money is taken against the account, not against a receipt: whatever
 * comes in pays what falls due first.
 */
export function DebtorsTab() {
  const { t } = useTranslation()
  const { can } = useSession()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [over, setOver] = useState<Over | null>(null)
  const canTake = can('customers.receive')
  const filters = { page: search.page, size: search.size, q: search.q, state: search.debtState }

  const list = useQuery({
    queryKey: ['customers', 'debtors', filters],
    queryFn: ({ signal }) =>
      api.get<PageOf<DebtorDto> & { summary: DebtorSummary }>('/customers/debtors', filters, signal),
    placeholderData: keepPreviousData,
  })
  const filter = (patch: Partial<typeof search>, replace = false) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace })

  const columns = useMemo<ColumnDef<DebtorDto>[]>(
    () => [
      {
        id: 'customer',
        header: t('debts.customer'),
        meta: { export: (row) => row.customerName, fixed: true, className: 'whitespace-nowrap' },
        cell: ({ row }) => <Who name={row.original.customerName} phone={row.original.phone} />,
      },
      { id: 'phone', header: t('customers.phone'), meta: { exportOnly: true, export: (row) => row.phone } },
      {
        id: 'owed',
        header: t('debts.owes'),
        meta: {
          export: (row) => moneyCell(row.owed, row.currency),
          className: 'tabular text-right whitespace-nowrap',
          headerClassName: 'text-right',
        },
        cell: ({ row }) => <span className="font-semibold">{money(row.original.owed, row.original.currency)}</span>,
      },
      {
        id: 'overdue',
        header: t('debts.state_overdue'),
        meta: {
          export: (row) => moneyCell(row.overdue, row.currency),
          className: 'tabular text-right whitespace-nowrap',
          headerClassName: 'text-right',
        },
        // Since when it is late stands under how much is.
        cell: ({ row }) =>
          row.original.overdue ? (
            <span className="flex flex-col items-end leading-tight text-bad">
              <span className="font-medium">{money(row.original.overdue, row.original.currency)}</span>
              <span className="text-xs">{t('debts.since', { day: formatDay(row.original.overdueSince) })}</span>
            </span>
          ) : (
            <span className="text-ink-3">—</span>
          ),
      },
      {
        id: 'overdueSince',
        header: t('debts.lateSince'),
        meta: { exportOnly: true, export: (row) => dayCell(row.overdueSince) },
      },
      {
        id: 'nextDue',
        header: t('debts.nextDue'),
        meta: {
          export: (row) => dayCell(row.nextDue),
          className: 'tabular text-right whitespace-nowrap',
          headerClassName: 'text-right',
        },
        cell: ({ row }) =>
          row.original.nextDue ? (
            <span className="flex flex-col items-end leading-tight">
              <span>{formatDay(row.original.nextDue)}</span>
              <span className="text-xs text-ink-3">{money(row.original.nextDueAmount, row.original.currency)}</span>
            </span>
          ) : (
            <span className="text-ink-3">—</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px whitespace-nowrap' },
        cell: ({ row }) => (
          <span className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="iconSm"
              aria-label={t('payments.statement')}
              onClick={() =>
                setOver({ kind: 'statement', customerId: row.original.customerId, currency: row.original.currency })
              }
            >
              <ScrollText />
            </Button>
            {canTake ? (
              <Button
                variant="soft"
                size="sm"
                onClick={() =>
                  setOver({ kind: 'in', customerId: row.original.customerId, currency: row.original.currency })
                }
              >
                <HandCoins />
                {t('debts.take')}
              </Button>
            ) : null}
          </span>
        ),
      },
    ],
    [t, canTake],
  )

  const summary = list.data?.summary
  const moneyBase = (minor: number) => money(minor, base())
  return (
    <>
      <DataTable
        columns={columns}
        data={list.data?.items}
        loading={list.isFetching}
        rowId={(row) => `${row.customerId}:${row.currency}`}
        onRowOpen={(row) => setOver({ kind: 'statement', customerId: row.customerId, currency: row.currency })}
        exportAs={{ fileName: t('debts.title'), rows: () => fetchAll<DebtorDto>('/customers/debtors', filters) }}
        preferenceKey="customer-debtors"
        pagination={{
          page: search.page,
          size: search.size,
          total: list.data?.total ?? 0,
          onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
          onSizeChange: (size) => void navigate({ search: (previous) => ({ ...previous, size, page: 1 }) }),
        }}
        filters={{
          overdue: (
            <FilterSelect
              value={search.debtState}
              onChange={(state) => filter({ debtState: state as typeof search.debtState })}
              options={[
                { value: 'owed', label: t('common.all') },
                { value: 'overdue', label: t('debts.state_overdue') },
              ]}
            />
          ),
        }}
        toolbar={
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
            <SearchInput value={search.q ?? ''} onChange={(q) => filter({ q: q || undefined }, true)} />
            {/* The whole of what is owed, in the base at today's rates, whatever the list is filtered to. */}
            {summary?.owed ? (
              <p className="tabular text-[13px] text-ink-2">
                {t('debts.owedTotal')}: <span className="font-semibold text-ink">{moneyBase(summary.owed)}</span>
                <span className="text-ink-3"> · {t('debts.debtors', { n: summary.debtors })}</span>
                {summary.overdue ? (
                  <>
                    <span className="text-ink-3"> · </span>
                    {t('debts.overdueTotal')}:{' '}
                    <span className="font-semibold text-bad">{moneyBase(summary.overdue)}</span>
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
      {over?.kind === 'statement' ? (
        <StatementDialog
          customerId={over.customerId}
          currency={over.currency}
          onClose={() => setOver(null)}
          onPay={(kind, currency) => setOver({ kind, customerId: over.customerId, currency, back: true })}
        />
      ) : null}
      {over?.kind === 'in' || over?.kind === 'out' ? (
        <PaymentDialog
          customerId={over.customerId}
          currency={over.currency}
          kind={over.kind}
          onClose={() => setOver(over.back ? { ...over, kind: 'statement' } : null)}
        />
      ) : null}
    </>
  )
}
