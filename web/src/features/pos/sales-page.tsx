import {
  formatMoney,
  SALE_STATUS_LABELS,
  SALE_STATUSES,
  type Page as PageOf,
  type SaleListItemDto,
} from '@erp/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Receipt, X } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterCombo, FilterDates, FilterSelect } from '@/components/ui/column-filters'
import { TabPanel, Tabs } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Badge, EmptyState } from '@/components/ui/feedback'
import { Page, SearchInput } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { base } from '@/lib/base'
import { fetchAll, moneyCell, timeCell } from '@/lib/excel'
import { formatDateTime, formatNumber } from '@/lib/format'

import { ReturnsTab } from './returns-tab'
import { SaleDialog } from './sale-dialog'

const route = getRouteApi('/sales')

interface LocationOption {
  id: string
  name: string
}

/** What the tills did: the receipts rung up, and the returns made against them. */
export function SalesPage() {
  const { t } = useTranslation()
  const { tab } = route.useSearch()
  const navigate = route.useNavigate()
  const locations = useQuery({
    queryKey: ['locations', 'options'],
    queryFn: ({ signal }) => api.get<LocationOption[]>('/locations/options', undefined, signal),
  })

  return (
    <Page title={t('sales.title')}>
      <Tabs
        value={tab}
        // A receipt open in one tab is not one of the other's; the filters stay.
        onChange={(value) =>
          void navigate({ search: (previous) => ({ ...previous, tab: value as typeof tab, open: undefined, page: 1 }) })
        }
        tabs={[
          { value: 'sales', label: t('sales.tabSales') },
          { value: 'returns', label: t('sales.tabReturns') },
        ]}
      >
        <TabPanel value="sales">
          <SalesTab locations={locations.data ?? []} />
        </TabPanel>
        <TabPanel value="returns">
          <ReturnsTab locations={locations.data ?? []} />
        </TabPanel>
      </Tabs>
    </Page>
  )
}

/** Every receipt rung up, newest first. A cashier sees their own; those who check sales see them all. */
function SalesTab({ locations }: { locations: LocationOption[] }) {
  const { t } = useTranslation()
  const { can } = useSession()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const { open: openId, tab: _tab, ...filters } = search
  const seesCost = can('stock.cost')

  const list = useQuery({
    queryKey: ['sales', 'list', filters],
    queryFn: ({ signal }) => api.get<PageOf<SaleListItemDto>>('/sales', filters, signal),
    placeholderData: keepPreviousData,
  })
  const filter = (patch: Partial<typeof search>, replace = false) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace })

  const columns = useMemo<ColumnDef<SaleListItemDto>[]>(
    () => [
      {
        id: 'number',
        header: t('sales.number'),
        meta: { export: (row) => row.number, fixed: true, className: 'w-px font-code text-xs whitespace-nowrap' },
        cell: ({ row }) => row.original.number,
      },
      {
        id: 'soldAt',
        header: t('sales.soldAt'),
        meta: { export: (row) => timeCell(row.soldAt), className: 'tabular w-px whitespace-nowrap' },
        cell: ({ row }) => formatDateTime(row.original.soldAt),
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
        id: 'seller',
        header: t('sales.seller'),
        meta: { export: (row) => row.sellerName, className: 'text-ink-2' },
        cell: ({ row }) => row.original.sellerName ?? '',
      },
      {
        id: 'qty',
        header: t('receipts.totalQty'),
        meta: { export: (row) => row.qty, className: 'tabular text-right', headerClassName: 'text-right' },
        cell: ({ row }) => formatNumber(row.original.qty),
      },
      {
        id: 'discount',
        header: t('pos.discount'),
        meta: {
          export: (row) => moneyCell(row.discount),
          className: 'tabular text-right whitespace-nowrap text-ink-2',
          headerClassName: 'text-right',
        },
        cell: ({ row }) => (row.original.discount ? formatMoney(row.original.discount, base(), { minor: 'auto' }) : ''),
      },
      {
        id: 'total',
        header: t('pos.total'),
        meta: {
          export: (row) => moneyCell(row.total),
          className: 'tabular text-right whitespace-nowrap',
          headerClassName: 'text-right',
        },
        cell: ({ row }) => (
          <span className="font-medium">{formatMoney(row.original.total, base(), { minor: 'auto' })}</span>
        ),
      },
      ...(seesCost
        ? ([
            {
              id: 'cost',
              header: t('sales.cost'),
              meta: {
                export: (row) => moneyCell(row.costUzs),
                className: 'tabular text-right whitespace-nowrap text-ink-2',
                headerClassName: 'text-right',
              },
              cell: ({ row }) =>
                row.original.costUzs === null ? '' : formatMoney(row.original.costUzs, base(), { minor: 'never' }),
            },
          ] satisfies ColumnDef<SaleListItemDto>[])
        : []),
      {
        id: 'returned',
        header: t('sales.returned'),
        meta: {
          export: (row) => moneyCell(row.returnedTotal),
          className: 'tabular text-right whitespace-nowrap text-warn',
          headerClassName: 'text-right',
        },
        cell: ({ row }) =>
          row.original.returnedTotal ? `−${formatMoney(row.original.returnedTotal, base(), { minor: 'auto' })}` : '',
      },
      {
        id: 'paidBy',
        header: t('sales.paidBy'),
        meta: { export: (row) => row.paidBy, className: 'text-ink-2' },
        cell: ({ row }) => row.original.paidBy,
      },
      {
        id: 'status',
        header: t('common.status'),
        meta: { export: (row) => SALE_STATUS_LABELS[row.status], className: 'w-px whitespace-nowrap' },
        cell: ({ row }) => (
          <Badge tone={row.original.status === 'voided' ? 'bad' : 'ok'}>
            {SALE_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
    ],
    [t, seesCost],
  )

  const filtered =
    !!(search.q || search.locationId || search.shiftId || search.from || search.to) || search.status !== 'all'

  return (
    <>
      <DataTable
        columns={columns}
        data={list.data?.items}
        loading={list.isFetching}
        rowId={(row) => row.id}
        onRowOpen={(row) => void navigate({ search: (previous) => ({ ...previous, open: row.id }) })}
        exportAs={{ fileName: t('sales.title'), rows: () => fetchAll<SaleListItemDto>('/sales', filters) }}
        preferenceKey="sales"
        rowClassName={(row) => (row.status === 'voided' ? 'text-ink-3 line-through decoration-ink-3/40' : undefined)}
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
                ...SALE_STATUSES.map((status) => ({ value: status, label: SALE_STATUS_LABELS[status] })),
              ]}
            />
          ),
          location: (
            <FilterCombo
              options={locations.map((location) => ({ value: location.id, label: location.name }))}
              value={search.locationId ?? null}
              onChange={(locationId) => filter({ locationId: locationId ?? undefined })}
            />
          ),
          soldAt: <FilterDates from={search.from} to={search.to} onChange={(range) => filter(range)} />,
        }}
        toolbar={
          <>
            <SearchInput
              value={search.q ?? ''}
              placeholder={t('sales.searchPlaceholder')}
              onChange={(q) => filter({ q: q || undefined }, true)}
            />
            {search.shiftId ? (
              <Button size="sm" onClick={() => filter({ shiftId: undefined })}>
                {t('sales.oneShift')}
                <X />
              </Button>
            ) : null}
          </>
        }
        empty={
          <EmptyState
            icon={Receipt}
            title={filtered ? t('common.nothingFound') : t('sales.empty')}
            hint={filtered ? undefined : t('sales.emptyHint')}
          />
        }
      />
      {openId ? (
        <SaleDialog
          saleId={openId}
          onClose={() => void navigate({ search: (previous) => ({ ...previous, open: undefined }) })}
        />
      ) : null}
    </>
  )
}
