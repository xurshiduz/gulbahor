import {
  formatMoney,
  STOCK_DOC_PERMISSION,
  STOCK_DOC_STATUS_LABELS,
  WRITEOFF_REASON_LABELS,
  type Page as PageOf,
  type StockDocKind,
  type StockDocListItemDto,
  type StockDocStatus,
} from '@gulbahor/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowRight, ClipboardCheck, PackageMinus, Plus, Truck, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Select } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { DateInput } from '@/components/ui/date-input'
import { Badge, EmptyState, Shortcut } from '@/components/ui/feedback'
import { Page, SearchInput } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { dayCell, fetchAll, moneyCell } from '@/lib/excel'
import { cn } from '@/lib/cn'
import { formatDay, formatNumber } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'

export const DOC_ROUTES = { transfer: '/transfers', writeoff: '/writeoffs', count: '/counts' } as const

export const DOC_STATUS_TONES: Record<StockDocStatus, 'warn' | 'info' | 'ok' | 'neutral'> = {
  draft: 'warn',
  sent: 'info',
  posted: 'ok',
  cancelled: 'neutral',
}

const ICONS: Record<StockDocKind, LucideIcon> = { transfer: Truck, writeoff: PackageMinus, count: ClipboardCheck }

/** A transfer can be on the way; the other two cannot. */
const STATUSES: Record<StockDocKind, StockDocStatus[]> = {
  transfer: ['draft', 'sent', 'posted', 'cancelled'],
  writeoff: ['draft', 'posted', 'cancelled'],
  count: ['draft', 'posted'],
}

export interface DocSearch {
  page: number
  size: number
  sort?: string
  order: 'asc' | 'desc'
  q?: string
  status: StockDocStatus | 'all'
  locationId?: string
  from?: string
  to?: string
}

interface LocationOption {
  id: string
  name: string
}

const transfers = getRouteApi('/transfers')
const writeoffs = getRouteApi('/writeoffs')
const counts = getRouteApi('/counts')

export function TransfersPage() {
  const navigate = transfers.useNavigate()
  return (
    <StockDocsList
      kind="transfer"
      search={transfers.useSearch()}
      onSearch={(patch, replace) => void navigate({ search: (previous) => ({ ...previous, ...patch }), replace })}
    />
  )
}

export function WriteoffsPage() {
  const navigate = writeoffs.useNavigate()
  return (
    <StockDocsList
      kind="writeoff"
      search={writeoffs.useSearch()}
      onSearch={(patch, replace) => void navigate({ search: (previous) => ({ ...previous, ...patch }), replace })}
    />
  )
}

export function CountsPage() {
  const navigate = counts.useNavigate()
  return (
    <StockDocsList
      kind="count"
      search={counts.useSearch()}
      onSearch={(patch, replace) => void navigate({ search: (previous) => ({ ...previous, ...patch }), replace })}
    />
  )
}

interface ListProps {
  kind: StockDocKind
  search: DocSearch
  onSearch: (patch: Partial<DocSearch>, replace?: boolean) => void
}

/** The list of one kind of stock document; the three kinds differ only in a few columns. */
function StockDocsList({ kind, search, onSearch }: ListProps) {
  const { t } = useTranslation()
  const { can } = useSession()
  const go = useNavigate()
  const canManage = can(`${STOCK_DOC_PERMISSION[kind]}.manage`)
  const seesCost = can('stock.cost')

  const list = useQuery({
    queryKey: ['stockdocs', 'list', kind, search],
    queryFn: ({ signal }) => api.get<PageOf<StockDocListItemDto>>('/stock-documents', { kind, ...search }, signal),
    placeholderData: keepPreviousData,
  })
  const locations = useQuery({
    queryKey: ['locations', 'options'],
    queryFn: ({ signal }) => api.get<LocationOption[]>('/locations/options', undefined, signal),
  })

  const open = (docId: string) => void go({ to: `${DOC_ROUTES[kind]}/$docId`, params: { docId } })
  const filter = (patch: Partial<DocSearch>, replace?: boolean) => onSearch({ ...patch, page: 1 }, replace)

  useHotkey('n', () => open('new'), {
    label: t(`stockdocs.${kind}.add`),
    group: t('shortcuts.groupList'),
    enabled: canManage,
  })

  const columns = useMemo<ColumnDef<StockDocListItemDto>[]>(
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
        header: kind === 'transfer' ? t('stockdocs.route') : t('receipts.location'),
        meta: {
          export: (row) => (row.toLocationName ? `${row.locationName} → ${row.toLocationName}` : row.locationName),
        },
        cell: ({ row }) =>
          row.original.toLocationName ? (
            <span className="flex items-center gap-1.5">
              {row.original.locationName}
              <ArrowRight className="size-3.5 text-ink-3" />
              {row.original.toLocationName}
            </span>
          ) : (
            row.original.locationName
          ),
      },
      ...(kind === 'writeoff'
        ? [
            {
              id: 'reason',
              header: t('stockdocs.reason'),
              meta: { export: (row) => (row.reason ? WRITEOFF_REASON_LABELS[row.reason] : null) },
              cell: ({ row }) => (row.original.reason ? WRITEOFF_REASON_LABELS[row.original.reason] : ''),
            } satisfies ColumnDef<StockDocListItemDto>,
          ]
        : []),
      {
        id: 'qty',
        header: kind === 'count' ? t('stockdocs.counted') : t('receipts.totalQty'),
        meta: { export: (row) => row.qty, className: 'tabular text-right', headerClassName: 'text-right' },
        cell: ({ row }) => formatNumber(row.original.qty),
      },
      ...(kind !== 'writeoff'
        ? [
            {
              id: 'diff',
              header: kind === 'transfer' ? t('stockdocs.lost') : t('stockdocs.diff'),
              meta: { export: (row) => row.diffQty, className: 'tabular text-right', headerClassName: 'text-right' },
              cell: ({ row }) => {
                const diff = row.original.diffQty
                if (!diff) {
                  return <span className="text-ink-3">{diff === 0 ? '0' : '—'}</span>
                }
                // A transfer's difference is how many were lost; a count's is signed.
                const bad = kind === 'transfer' || diff < 0
                return (
                  <span className={cn('font-medium', bad ? 'text-bad' : 'text-ok')}>
                    {kind === 'count' && diff > 0 ? '+' : ''}
                    {formatNumber(diff)}
                  </span>
                )
              },
            } satisfies ColumnDef<StockDocListItemDto>,
          ]
        : []),
      ...(seesCost
        ? [
            {
              id: 'cost',
              header: t('stockdocs.value'),
              meta: {
                export: (row) => moneyCell(row.costUzs),
                className: 'tabular text-right whitespace-nowrap',
                headerClassName: 'text-right',
              },
              cell: ({ row }) =>
                row.original.costUzs === null ? (
                  <span className="text-ink-3">—</span>
                ) : (
                  formatMoney(row.original.costUzs, 'UZS', { minor: 'never' })
                ),
            } satisfies ColumnDef<StockDocListItemDto>,
          ]
        : []),
      {
        id: 'status',
        header: t('common.status'),
        meta: { export: (row) => STOCK_DOC_STATUS_LABELS[row.status], className: 'w-px whitespace-nowrap' },
        cell: ({ row }) => (
          <Badge tone={DOC_STATUS_TONES[row.original.status]}>{STOCK_DOC_STATUS_LABELS[row.original.status]}</Badge>
        ),
      },
      {
        id: 'author',
        header: t('receipts.author'),
        meta: { export: (row) => row.createdByName, className: 'text-ink-2' },
        cell: ({ row }) => row.original.createdByName ?? '',
      },
    ],
    [t, kind, seesCost],
  )

  const filtered = !!(search.q || search.locationId || search.from || search.to) || search.status !== 'all'

  return (
    <Page
      title={t(`stockdocs.${kind}.title`)}
      subtitle={t(`stockdocs.${kind}.subtitle`)}
      actions={
        canManage ? (
          <Button variant="primary" onClick={() => open('new')}>
            <Plus />
            {t(`stockdocs.${kind}.add`)}
            <Shortcut combo="n" className="ml-1 opacity-70" />
          </Button>
        ) : null
      }
    >
      <DataTable
        columns={columns}
        data={list.data?.items}
        loading={list.isFetching}
        rowId={(row) => row.id}
        onRowOpen={(row) => open(row.id)}
        exportAs={{
          fileName: t(`stockdocs.${kind}.title`),
          rows: () => fetchAll<StockDocListItemDto>('/stock-documents', { kind, ...search }),
        }}
        sort={search.sort}
        order={search.order}
        onSortChange={(sort, order) => filter({ sort, order })}
        preferenceKey={`stockdocs.${kind}`}
        rowClassName={(row) => (row.status === 'cancelled' ? 'text-ink-3' : undefined)}
        pagination={{
          page: search.page,
          size: search.size,
          total: list.data?.total ?? 0,
          onPageChange: (page) => onSearch({ page }),
          onSizeChange: (size) => filter({ size }),
        }}
        toolbar={
          <>
            <SearchInput
              value={search.q ?? ''}
              placeholder={t('stockdocs.searchPlaceholder')}
              onChange={(q) => filter({ q: q || undefined }, true)}
            />
            <Select
              value={search.status}
              onChange={(status) => filter({ status: status as DocSearch['status'] })}
              options={[
                { value: 'all', label: `${t('common.status')}: ${t('common.all').toLowerCase()}` },
                ...STATUSES[kind].map((status) => ({ value: status, label: STOCK_DOC_STATUS_LABELS[status] })),
              ]}
              className="w-44"
            />
            <Combobox
              options={(locations.data ?? []).map((location) => ({ value: location.id, label: location.name }))}
              value={search.locationId ?? null}
              onChange={(locationId) => filter({ locationId: locationId ?? undefined })}
              placeholder={t('receipts.location')}
              className="w-48"
            />
            <DateInput
              value={search.from ?? ''}
              onChange={(from) => filter({ from: from || undefined })}
              className="w-36"
            />
            <span className="text-xs text-ink-3">—</span>
            <DateInput value={search.to ?? ''} onChange={(to) => filter({ to: to || undefined })} className="w-36" />
          </>
        }
        empty={
          <EmptyState
            icon={ICONS[kind]}
            title={filtered ? t('common.nothingFound') : t(`stockdocs.${kind}.empty`)}
            hint={filtered ? undefined : t(`stockdocs.${kind}.emptyHint`)}
            action={
              canManage && !filtered ? (
                <Button variant="primary" size="sm" onClick={() => open('new')}>
                  <Plus />
                  {t(`stockdocs.${kind}.add`)}
                </Button>
              ) : null
            }
          />
        }
      />
    </Page>
  )
}
