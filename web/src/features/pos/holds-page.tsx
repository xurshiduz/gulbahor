import {
  formatMoney,
  HOLD_STATUS_LABELS,
  todayIn,
  toIsoDate,
  type HoldDto,
  type HoldListState,
  type HoldSummary,
  type Page as PageOf,
} from '@erp/core'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Bookmark } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterCombo, FilterSelect } from '@/components/ui/column-filters'
import { DataTable } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/feedback'
import { Page, SearchInput } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { base } from '@/lib/base'
import { dayCell, fetchAll, moneyCell, timeCell } from '@/lib/excel'
import { formatDateTime, formatDay, formatNumber, formatPhone } from '@/lib/format'

import { HoldBadge, HoldCard, holdGoods } from './hold-card'

const route = getRouteApi('/holds')

interface LocationOption {
  id: string
  name: string
}

const STATES: HoldListState[] = ['active', 'overdue', 'taken', 'released', 'all']

/**
 * Goods set aside for customers ("Band qilinganlar"): what stands, the nearest day first, and what became of the
 * rest. A hold past its day stays until someone lets it go — the goods are still behind the counter.
 */
export function HoldsPage() {
  const { t } = useTranslation()
  const { can, me } = useSession()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const go = useNavigate()
  const queryClient = useQueryClient()
  const { open: openId, ...filters } = search
  const mayAct = can('pos.sell')
  const today = toIsoDate(todayIn(me.org.timezone))

  const locations = useQuery({
    queryKey: ['locations', 'options'],
    queryFn: ({ signal }) => api.get<LocationOption[]>('/locations/options', undefined, signal),
  })
  const list = useQuery({
    queryKey: ['holds', 'list', filters],
    queryFn: ({ signal }) => api.get<PageOf<HoldDto> & { summary: HoldSummary }>('/holds', filters, signal),
    placeholderData: keepPreviousData,
  })
  const opened = useQuery({
    queryKey: ['holds', 'one', openId],
    queryFn: ({ signal }) => api.get<HoldDto>(`/holds/${openId}`, undefined, signal),
    enabled: !!openId,
    // The row that was clicked is shown at once; what comes back replaces it.
    placeholderData: list.data?.items.find((hold) => hold.id === openId),
  })
  const filter = (patch: Partial<typeof search>, replace = false) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace })
  const close = () => void navigate({ search: (previous) => ({ ...previous, open: undefined }) })
  const sell = (hold: HoldDto) => void go({ to: '/pos', search: { hold: hold.id } })

  const columns = useMemo<ColumnDef<HoldDto>[]>(
    () => [
      {
        id: 'number',
        header: t('sales.number'),
        meta: { export: (row) => row.number, fixed: true, className: 'w-px font-code text-xs whitespace-nowrap' },
        cell: ({ row }) => row.original.number,
      },
      {
        id: 'customer',
        header: t('debts.customer'),
        meta: { export: (row) => row.customerName, className: 'whitespace-nowrap' },
        cell: ({ row }) => (
          <span className="flex flex-col leading-tight">
            <span className="font-medium">{row.original.customerName}</span>
            {row.original.customerPhone ? (
              <span className="tabular text-xs text-ink-3">{formatPhone(row.original.customerPhone)}</span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'phone',
        header: t('customers.phone'),
        meta: { exportOnly: true, export: (row) => row.customerPhone },
      },
      {
        id: 'goods',
        header: t('holds.item'),
        meta: { export: (row) => row.lines.map((line) => `${line.name} ${line.label}`.trim()).join('; ') },
        cell: ({ row }) => <span className="text-ink-2">{holdGoods(row.original, (n) => t('holds.more', { n }))}</span>,
      },
      {
        id: 'qty',
        header: t('receipts.totalQty'),
        meta: { export: (row) => row.qty, className: 'tabular text-right', headerClassName: 'text-right' },
        cell: ({ row }) => formatNumber(row.original.qty),
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
      {
        id: 'dueDate',
        header: t('holds.until'),
        meta: { export: (row) => dayCell(row.dueDate), className: 'tabular w-px whitespace-nowrap' },
        cell: ({ row }) => (
          <span className={row.original.overdue ? 'font-medium text-bad' : undefined}>
            {formatDay(row.original.dueDate)}
          </span>
        ),
      },
      {
        id: 'status',
        header: t('common.status'),
        meta: {
          export: (row) => (row.overdue ? t('holds.state_overdue') : HOLD_STATUS_LABELS[row.status]),
          className: 'w-px whitespace-nowrap',
        },
        cell: ({ row }) => <HoldBadge hold={row.original} />,
      },
      {
        id: 'location',
        header: t('money.shop'),
        meta: { export: (row) => row.locationName, className: 'text-ink-2' },
        cell: ({ row }) => row.original.locationName,
      },
      {
        id: 'createdBy',
        header: t('holds.maker'),
        meta: { export: (row) => row.createdByName, className: 'text-ink-2' },
        cell: ({ row }) => row.original.createdByName ?? '',
      },
      {
        id: 'createdAt',
        header: t('holds.madeAt'),
        meta: { export: (row) => timeCell(row.createdAt), className: 'tabular w-px whitespace-nowrap text-ink-2' },
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px whitespace-nowrap' },
        cell: ({ row }) =>
          mayAct && row.original.status === 'active' ? (
            <span className="flex justify-end" onClick={(event) => event.stopPropagation()}>
              <Button variant="soft" size="sm" onClick={() => sell(row.original)}>
                {t('holds.sell')}
              </Button>
            </span>
          ) : null,
      },
    ],
    // `sell` only navigates: it is the same thing every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, mayAct],
  )

  const summary = list.data?.summary
  const filtered = !!(search.q || search.locationId) || search.state !== 'active'
  return (
    <Page title={t('holds.title')}>
      <DataTable
        columns={columns}
        data={list.data?.items}
        loading={list.isFetching}
        rowId={(row) => row.id}
        onRowOpen={(row) => void navigate({ search: (previous) => ({ ...previous, open: row.id }) })}
        exportAs={{ fileName: t('holds.title'), rows: () => fetchAll<HoldDto>('/holds', filters) }}
        preferenceKey="holds"
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
              value={search.state}
              onChange={(state) => filter({ state: state as HoldListState })}
              options={STATES.map((state) => ({
                value: state,
                label: state === 'all' ? t('common.all') : t(`holds.state_${state}`),
              }))}
            />
          ),
          location: (
            <FilterCombo
              options={(locations.data ?? []).map((location) => ({ value: location.id, label: location.name }))}
              value={search.locationId ?? null}
              onChange={(locationId) => filter({ locationId: locationId ?? undefined })}
            />
          ),
        }}
        toolbar={
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
            <SearchInput
              value={search.q ?? ''}
              placeholder={t('holds.searchPlaceholder')}
              onChange={(q) => filter({ q: q || undefined }, true)}
            />
            {/* What stands, and what of it is past its day — whatever the list is filtered to. */}
            {summary?.active ? (
              <p className="tabular text-[13px] text-ink-2">
                {t('holds.standing', { n: summary.active })}
                {summary.overdue ? (
                  <>
                    <span className="text-ink-3"> · </span>
                    <button
                      type="button"
                      className="font-semibold text-bad underline-offset-2 hover:underline"
                      onClick={() => filter({ state: 'overdue' })}
                    >
                      {t('holds.late', { n: summary.overdue })}
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        }
        empty={
          <EmptyState
            icon={Bookmark}
            title={filtered ? t('common.nothingFound') : t('holds.empty')}
            hint={filtered ? undefined : t('holds.emptyHint')}
          />
        }
      />
      {openId && opened.data ? (
        <HoldCard
          // What was typed into the day belongs to the hold as it stood: saved, it starts from the new one.
          key={`${opened.data.id}:${opened.data.status}:${opened.data.dueDate}`}
          hold={opened.data}
          today={today}
          mayAct={mayAct}
          onClose={close}
          onSell={sell}
          onChanged={(after) => {
            queryClient.setQueryData(['holds', 'one', after.id], after)
            void queryClient.invalidateQueries({ queryKey: ['holds'] })
            if (after.status !== 'active') {
              close()
            }
          }}
        />
      ) : null}
    </Page>
  )
}
