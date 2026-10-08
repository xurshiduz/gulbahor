import { formatMoney, type Page as PageOf, type ReturnListItemDto } from '@gulbahor/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Undo2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { FilterCombo, FilterDates } from '@/components/ui/column-filters'
import { DataTable } from '@/components/ui/data-table'
import { Badge, EmptyState } from '@/components/ui/feedback'
import { SearchInput } from '@/components/ui/page'
import { api } from '@/lib/api'
import { base } from '@/lib/base'
import { fetchAll, moneyCell, timeCell } from '@/lib/excel'
import { formatDateTime, formatNumber } from '@/lib/format'

import { ReturnDialog } from './return-parts'

const route = getRouteApi('/sales')

const money = (minor: number) => formatMoney(minor, base(), { minor: 'auto' })

/** Every return made, newest first: what came back on which receipt, and whether it became an exchange. */
export function ReturnsTab({ locations }: { locations: { id: string; name: string }[] }) {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const { page, size, q, locationId, shiftId, from, to } = search
  const filters = { page, size, q, locationId, shiftId, from, to }

  const list = useQuery({
    queryKey: ['returns', 'list', filters],
    queryFn: ({ signal }) => api.get<PageOf<ReturnListItemDto>>('/returns', filters, signal),
    placeholderData: keepPreviousData,
  })

  const filter = (patch: Partial<typeof search>, replace = false) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace })

  const columns = useMemo<ColumnDef<ReturnListItemDto>[]>(
    () => [
      {
        id: 'number',
        header: t('sales.returnOne'),
        meta: { export: (row) => row.number, fixed: true, className: 'w-px font-code text-xs whitespace-nowrap' },
        cell: ({ row }) => row.original.number,
      },
      {
        id: 'returnedAt',
        header: t('sales.soldAt'),
        meta: { export: (row) => timeCell(row.returnedAt), className: 'tabular w-px whitespace-nowrap' },
        cell: ({ row }) => formatDateTime(row.original.returnedAt),
      },
      {
        id: 'sale',
        header: t('sales.number'),
        meta: { export: (row) => row.saleNumber, className: 'w-px font-code text-xs whitespace-nowrap' },
        cell: ({ row }) => row.original.saleNumber,
      },
      {
        id: 'location',
        header: t('money.shop'),
        meta: { export: (row) => row.locationName },
        cell: ({ row }) => (
          <span>
            {row.original.locationName}
            <span className="text-ink-3"> · {row.original.registerName}</span>
          </span>
        ),
      },
      {
        id: 'register',
        header: t('sales.register'),
        meta: { exportOnly: true, export: (row) => row.registerName },
      },
      {
        id: 'cashier',
        header: t('sales.cashier'),
        meta: { export: (row) => row.cashierName, className: 'text-ink-2' },
        cell: ({ row }) => row.original.cashierName ?? '',
      },
      {
        id: 'qty',
        header: t('receipts.totalQty'),
        meta: { export: (row) => row.qty, className: 'tabular text-right', headerClassName: 'text-right' },
        cell: ({ row }) => formatNumber(row.original.qty),
      },
      {
        id: 'total',
        header: t('pos.returnedGoods'),
        meta: {
          export: (row) => moneyCell(row.total),
          className: 'tabular text-right whitespace-nowrap',
          headerClassName: 'text-right',
        },
        cell: ({ row }) => <span className="font-medium">{money(row.original.total)}</span>,
      },
      {
        id: 'refunded',
        header: t('sales.refunded'),
        meta: {
          export: (row) => moneyCell(row.total - row.exchangeTotal),
          className: 'tabular text-right whitespace-nowrap',
          headerClassName: 'text-right',
        },
        cell: ({ row }) =>
          row.original.total > row.original.exchangeTotal ? money(row.original.total - row.original.exchangeTotal) : '',
      },
      {
        id: 'exchange',
        header: t('sales.exchange'),
        meta: { export: (row) => row.exchangeSaleNumber, className: 'w-px font-code text-xs whitespace-nowrap' },
        cell: ({ row }) => row.original.exchangeSaleNumber ?? '',
      },
      {
        id: 'reason',
        header: t('pos.returnReason'),
        meta: { export: (row) => row.reason, className: 'text-ink-2' },
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            {row.original.late ? <Badge tone="warn">{t('sales.late')}</Badge> : null}
            {row.original.reason}
          </span>
        ),
      },
      {
        id: 'approvedBy',
        header: t('pos.approvedBy'),
        meta: { export: (row) => row.approvedByName, className: 'text-ink-2' },
        cell: ({ row }) => row.original.approvedByName ?? '',
      },
      {
        id: 'late',
        header: t('sales.late'),
        meta: { exportOnly: true, export: (row) => (row.late ? t('common.yes') : '') },
      },
    ],
    [t],
  )

  const filtered = !!(q || locationId || shiftId || from || to)

  return (
    <>
      <DataTable
        columns={columns}
        data={list.data?.items}
        loading={list.isFetching}
        rowId={(row) => row.id}
        onRowOpen={(row) => void navigate({ search: (previous) => ({ ...previous, open: row.id }) })}
        exportAs={{ fileName: t('sales.tabReturns'), rows: () => fetchAll<ReturnListItemDto>('/returns', filters) }}
        preferenceKey="returns"
        pagination={{
          page,
          size,
          total: list.data?.total ?? 0,
          onPageChange: (next) => void navigate({ search: (previous) => ({ ...previous, page: next }) }),
          onSizeChange: (next) => filter({ size: next }),
        }}
        filters={{
          location: (
            <FilterCombo
              options={locations.map((location) => ({ value: location.id, label: location.name }))}
              value={locationId ?? null}
              onChange={(value) => filter({ locationId: value ?? undefined })}
            />
          ),
          returnedAt: <FilterDates from={from} to={to} onChange={(range) => filter(range)} />,
        }}
        toolbar={
          <SearchInput
            value={q ?? ''}
            placeholder={t('sales.returnSearchPlaceholder')}
            onChange={(value) => filter({ q: value || undefined }, true)}
          />
        }
        empty={<EmptyState icon={Undo2} title={filtered ? t('common.nothingFound') : t('sales.noReturns')} />}
      />
      {search.open ? (
        <ReturnDialog
          returnId={search.open}
          onClose={() => void navigate({ search: (previous) => ({ ...previous, open: undefined }) })}
        />
      ) : null}
    </>
  )
}
