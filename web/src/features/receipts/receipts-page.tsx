import {
  formatMoney,
  RECEIPT_STATUS_LABELS,
  RECEIPT_STATUSES,
  type Page as PageOf,
  type PartnerDto,
  type ReceiptListItemDto,
} from '@erp/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { FileSpreadsheet, PackagePlus, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterCombo, FilterDates, FilterSelect } from '@/components/ui/column-filters'
import { DataTable } from '@/components/ui/data-table'
import { Badge, EmptyState, Shortcut, Tooltip } from '@/components/ui/feedback'
import { Page, SearchInput } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { base } from '@/lib/base'
import { dayCell, fetchAll, moneyCell } from '@/lib/excel'
import { formatDay, formatNumber } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { withFilter } from '@/lib/list-search'

import { ReceiptImportDialog } from './receipt-import'
import { STATUS_TONES } from './receipt-page'

const route = getRouteApi('/receipts')

interface LocationOption {
  id: string
  name: string
  code: string
}

export function ReceiptsPage() {
  const { t } = useTranslation()
  const { can } = useSession()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const go = useNavigate()
  const canManage = can('receipts.manage')
  const canImport = canManage && can('products.manage')
  const [importing, setImporting] = useState(false)

  const list = useQuery({
    queryKey: ['receipts', 'list', search],
    queryFn: ({ signal }) => api.get<PageOf<ReceiptListItemDto>>('/receipts', search, signal),
    placeholderData: keepPreviousData,
  })
  const locations = useQuery({
    queryKey: ['locations', 'options'],
    queryFn: ({ signal }) => api.get<LocationOption[]>('/locations/options', undefined, signal),
  })
  const suppliers = useQuery({
    queryKey: ['partners', 'suppliers'],
    queryFn: ({ signal }) =>
      api.get<PageOf<PartnerDto>>('/partners', { role: 'supplier', status: 'all', size: 200 }, signal),
    enabled: can('partners.view'),
  })

  const open = (receiptId: string) => void go({ to: '/receipts/$receiptId', params: { receiptId } })

  useHotkey('n', () => open('new'), {
    label: t('receipts.add'),
    group: t('shortcuts.groupList'),
    enabled: canManage && !importing,
  })

  const columns = useMemo<ColumnDef<ReceiptListItemDto>[]>(
    () => [
      {
        id: 'number',
        header: t('receipts.number'),
        meta: {
          export: (row) => row.number,
          sortKey: 'number',
          fixed: true,
          className: 'w-px font-code text-xs whitespace-nowrap',
        },
        cell: ({ row }) => row.original.number,
      },
      {
        id: 'date',
        header: t('receipts.date'),
        meta: {
          export: (row) => dayCell(row.docDate),
          sortKey: 'docDate',
          className: 'tabular w-px whitespace-nowrap',
        },
        cell: ({ row }) => formatDay(row.original.docDate),
      },
      {
        id: 'location',
        header: t('receipts.location'),
        meta: { export: (row) => row.locationName },
        cell: ({ row }) => row.original.locationName,
      },
      {
        id: 'supplier',
        header: t('receipts.supplier'),
        meta: { export: (row) => row.supplierName },
        cell: ({ row }) => row.original.supplierName ?? <span className="text-ink-3">—</span>,
      },
      {
        id: 'qty',
        header: t('receipts.totalQty'),
        meta: { export: (row) => row.totals.qty, className: 'tabular text-right', headerClassName: 'text-right' },
        cell: ({ row }) => formatNumber(row.original.totals.qty),
      },
      {
        id: 'goods',
        header: t('receipts.totalGoods'),
        meta: {
          export: (row) => moneyCell(row.totals.goods, row.currency),
          className: 'tabular text-right whitespace-nowrap',
          headerClassName: 'text-right',
        },
        cell: ({ row }) => formatMoney(row.original.totals.goods, row.original.currency),
      },
      {
        id: 'currency',
        header: t('receipts.currency'),
        meta: { exportOnly: true, export: (row) => row.currency },
      },
      {
        id: 'cost',
        header: t('receipts.totalCost'),
        meta: {
          export: (row) => moneyCell(row.totals.costUzs),
          sortKey: 'cost',
          className: 'tabular text-right whitespace-nowrap',
          headerClassName: 'text-right',
        },
        cell: ({ row }) => (
          <span className="font-medium">{formatMoney(row.original.totals.costUzs, base(), { minor: 'never' })}</span>
        ),
      },
      {
        id: 'status',
        header: t('common.status'),
        meta: { export: (row) => RECEIPT_STATUS_LABELS[row.status], className: 'w-px whitespace-nowrap' },
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5">
            <Badge tone={STATUS_TONES[row.original.status]}>{RECEIPT_STATUS_LABELS[row.original.status]}</Badge>
            {row.original.hasEstimates && row.original.status !== 'cancelled' ? (
              <Tooltip content={t('receipts.estimatesNote')}>
                <Badge tone="warn">≈</Badge>
              </Tooltip>
            ) : null}
          </span>
        ),
      },
      {
        id: 'author',
        header: t('receipts.author'),
        meta: { export: (row) => row.createdByName, className: 'text-ink-2' },
        cell: ({ row }) => row.original.createdByName ?? '',
      },
    ],
    [t],
  )

  const filtered =
    !!(search.q || search.locationId || search.supplierId || search.from || search.to) || search.status !== 'all'

  return (
    <Page
      title={t('receipts.title')}
      actions={
        <>
          {canImport ? (
            <Button onClick={() => setImporting(true)}>
              <FileSpreadsheet />
              {t('import.button')}
            </Button>
          ) : null}
          {canManage ? (
            <Button variant="primary" onClick={() => open('new')}>
              <Plus />
              {t('receipts.add')}
              <Shortcut combo="n" className="ml-1 opacity-70" />
            </Button>
          ) : null}
        </>
      }
    >
      <DataTable
        columns={columns}
        data={list.data?.items}
        loading={list.isFetching}
        rowId={(row) => row.id}
        onRowOpen={(row) => open(row.id)}
        exportAs={{
          fileName: t('receipts.title'),
          rows: () => fetchAll<ReceiptListItemDto>('/receipts', search),
        }}
        sort={search.sort}
        order={search.order}
        onSortChange={(sort, order) => void navigate({ search: (previous) => withFilter(previous, { sort, order }) })}
        preferenceKey="receipts"
        rowClassName={(row) => (row.status === 'cancelled' ? 'text-ink-3' : undefined)}
        pagination={{
          page: search.page,
          size: search.size,
          total: list.data?.total ?? 0,
          onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
          onSizeChange: (size) => void navigate({ search: (previous) => withFilter(previous, { size }) }),
        }}
        filters={{
          status: (
            <FilterSelect
              value={search.status}
              onChange={(status) =>
                void navigate({
                  search: (previous) => withFilter(previous, { status: status as typeof search.status }),
                })
              }
              options={[
                { value: 'all', label: t('common.all') },
                ...RECEIPT_STATUSES.map((status) => ({ value: status, label: RECEIPT_STATUS_LABELS[status] })),
              ]}
            />
          ),
          location: (
            <FilterCombo
              options={(locations.data ?? []).map((location) => ({ value: location.id, label: location.name }))}
              value={search.locationId ?? null}
              onChange={(locationId) =>
                void navigate({ search: (previous) => withFilter(previous, { locationId: locationId ?? undefined }) })
              }
            />
          ),
          date: (
            <FilterDates
              from={search.from}
              to={search.to}
              onChange={(range) => void navigate({ search: (previous) => withFilter(previous, range) })}
            />
          ),
          supplier: suppliers.data ? (
            <FilterCombo
              options={suppliers.data.items.map((partner) => ({ value: partner.id, label: partner.name }))}
              value={search.supplierId ?? null}
              onChange={(supplierId) =>
                void navigate({ search: (previous) => withFilter(previous, { supplierId: supplierId ?? undefined }) })
              }
            />
          ) : null,
        }}
        toolbar={
          <>
            <SearchInput
              value={search.q ?? ''}
              placeholder={t('receipts.searchPlaceholder')}
              onChange={(q) =>
                void navigate({ search: (previous) => withFilter(previous, { q: q || undefined }), replace: true })
              }
            />
          </>
        }
        empty={
          <EmptyState
            icon={PackagePlus}
            title={filtered ? t('common.nothingFound') : t('receipts.empty')}
            hint={filtered ? undefined : t('receipts.emptyHint')}
            action={
              canManage && !filtered ? (
                <div className="flex justify-center gap-2">
                  <Button variant="primary" size="sm" onClick={() => open('new')}>
                    <Plus />
                    {t('receipts.add')}
                  </Button>
                  {canImport ? (
                    <Button size="sm" onClick={() => setImporting(true)}>
                      <FileSpreadsheet />
                      {t('import.button')}
                    </Button>
                  ) : null}
                </div>
              ) : null
            }
          />
        }
      />
      {importing ? (
        <ReceiptImportDialog
          locations={locations.data ?? []}
          onClose={() => setImporting(false)}
          onDone={(receiptId) => {
            setImporting(false)
            open(receiptId)
          }}
        />
      ) : null}
    </Page>
  )
}
