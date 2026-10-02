import { formatMoney, SHIFT_STATUS_LABELS, SHIFT_STATUSES, type Page as PageOf, type ShiftDto } from '@gulbahor/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { CalendarClock } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { FilterCombo, FilterDates, FilterSelect } from '@/components/ui/column-filters'
import { DataTable } from '@/components/ui/data-table'
import { Badge, EmptyState } from '@/components/ui/feedback'
import { Page, SearchInput } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { fetchAll, moneyCell, timeCell } from '@/lib/excel'
import { formatDateTime, formatNumber } from '@/lib/format'

import { ShiftDialog } from './shift-parts'

const route = getRouteApi('/shifts')

interface LocationOption {
  id: string
  name: string
}

const money = (minor: number, currency: 'UZS' | 'USD' = 'UZS') => formatMoney(minor, currency, { minor: 'auto' })

/**
 * The shifts worked at the tills: who opened and closed each, what was sold
 * in it and, for those who check the cashiers, how the count came out
 * against the books.
 */
export function ShiftsPage() {
  const { t } = useTranslation()
  const { can } = useSession()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const { open: openId, ...filters } = search
  const reviews = can('sales.shifts')

  const list = useQuery({
    queryKey: ['shifts', 'list', filters],
    queryFn: ({ signal }) => api.get<PageOf<ShiftDto>>('/shifts', filters, signal),
    placeholderData: keepPreviousData,
  })
  const locations = useQuery({
    queryKey: ['locations', 'options'],
    queryFn: ({ signal }) => api.get<LocationOption[]>('/locations/options', undefined, signal),
  })

  const filter = (patch: Partial<typeof search>, replace = false) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace })

  const columns = useMemo<ColumnDef<ShiftDto>[]>(
    () => [
      {
        id: 'number',
        header: t('shifts.number'),
        meta: { export: (row) => row.number, fixed: true, className: 'w-px font-code text-xs whitespace-nowrap' },
        cell: ({ row }) => row.original.number,
      },
      {
        id: 'register',
        header: t('sales.register'),
        meta: { export: (row) => row.registerName },
        cell: ({ row }) => (
          <span>
            {row.original.registerName}
            <span className="text-ink-3"> · {row.original.locationName}</span>
          </span>
        ),
      },
      {
        id: 'location',
        header: t('money.shop'),
        meta: { exportOnly: true, export: (row) => row.locationName },
      },
      {
        id: 'openedAt',
        header: t('shifts.openedAt'),
        meta: { export: (row) => timeCell(row.openedAt), className: 'tabular w-px whitespace-nowrap' },
        cell: ({ row }) => formatDateTime(row.original.openedAt),
      },
      {
        id: 'openedBy',
        header: t('sales.cashier'),
        meta: { export: (row) => row.openedByName, className: 'text-ink-2' },
        cell: ({ row }) => row.original.openedByName ?? '',
      },
      {
        id: 'closedAt',
        header: t('shifts.closedAt'),
        meta: { export: (row) => timeCell(row.closedAt), className: 'tabular w-px whitespace-nowrap' },
        cell: ({ row }) => (row.original.closedAt ? formatDateTime(row.original.closedAt) : ''),
      },
      {
        id: 'sales',
        header: t('pos.reportCount'),
        meta: {
          export: (row) => row.totals?.sales ?? 0,
          className: 'tabular text-right',
          headerClassName: 'text-right',
        },
        cell: ({ row }) => formatNumber(row.original.totals?.sales ?? 0),
      },
      {
        id: 'total',
        header: t('pos.total'),
        meta: {
          export: (row) => moneyCell(row.totals?.total ?? 0),
          className: 'tabular text-right whitespace-nowrap',
          headerClassName: 'text-right',
        },
        cell: ({ row }) => <span className="font-medium">{money(row.original.totals?.total ?? 0)}</span>,
      },
      ...(reviews
        ? ([
            {
              id: 'diffUzs',
              header: `${t('pos.diff')} (so'm)`,
              meta: {
                export: (row) => moneyCell(row.diffUzs),
                className: 'tabular text-right whitespace-nowrap',
                headerClassName: 'text-right',
              },
              cell: ({ row }) => <Diff value={row.original.diffUzs} currency="UZS" />,
            },
            {
              id: 'diffUsd',
              header: `${t('pos.diff')} ($)`,
              meta: {
                export: (row) => moneyCell(row.diffUsd, 'USD'),
                className: 'tabular text-right whitespace-nowrap',
                headerClassName: 'text-right',
              },
              cell: ({ row }) => <Diff value={row.original.diffUsd} currency="USD" />,
            },
          ] satisfies ColumnDef<ShiftDto>[])
        : []),
      {
        id: 'status',
        header: t('common.status'),
        meta: { export: (row) => SHIFT_STATUS_LABELS[row.status], className: 'w-px whitespace-nowrap' },
        cell: ({ row }) => (
          <Badge tone={row.original.status === 'open' ? 'ok' : 'neutral'}>
            {SHIFT_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
    ],
    [t, reviews],
  )

  const filtered = !!(search.q || search.locationId || search.from || search.to) || search.status !== 'all'

  return (
    <Page title={t('shifts.title')}>
      <DataTable
        columns={columns}
        data={list.data?.items}
        loading={list.isFetching}
        rowId={(row) => row.id}
        onRowOpen={(row) => void navigate({ search: (previous) => ({ ...previous, open: row.id }) })}
        exportAs={{ fileName: t('shifts.title'), rows: () => fetchAll<ShiftDto>('/shifts', filters) }}
        preferenceKey="shifts"
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
                ...SHIFT_STATUSES.map((status) => ({ value: status, label: SHIFT_STATUS_LABELS[status] })),
              ]}
            />
          ),
          register: (
            <FilterCombo
              options={(locations.data ?? []).map((location) => ({ value: location.id, label: location.name }))}
              value={search.locationId ?? null}
              onChange={(locationId) => filter({ locationId: locationId ?? undefined })}
            />
          ),
          openedAt: <FilterDates from={search.from} to={search.to} onChange={(range) => filter(range)} />,
        }}
        toolbar={
          <>
            <SearchInput
              value={search.q ?? ''}
              placeholder={t('shifts.searchPlaceholder')}
              onChange={(q) => filter({ q: q || undefined }, true)}
            />
          </>
        }
        empty={
          <EmptyState
            icon={CalendarClock}
            title={filtered ? t('common.nothingFound') : t('shifts.empty')}
            hint={filtered ? undefined : t('shifts.emptyHint')}
          />
        }
      />
      {openId ? (
        <ShiftDialog
          shiftId={openId}
          onClose={() => void navigate({ search: (previous) => ({ ...previous, open: undefined }) })}
        />
      ) : null}
    </Page>
  )
}

/** A count against the books: short in red, over in green, nothing when it matched or is not known yet. */
function Diff({ value, currency }: { value: number | null; currency: 'UZS' | 'USD' }) {
  if (!value) {
    return value === 0 ? <span className="text-ink-3">0</span> : null
  }
  return (
    <span className={value < 0 ? 'font-medium text-bad' : 'font-medium text-ok'}>
      {value > 0 ? '+' : ''}
      {money(value, currency)}
    </span>
  )
}
