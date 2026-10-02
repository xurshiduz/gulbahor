import {
  PRINT_JOB_STATUS_LABELS,
  PRINT_JOB_STATUSES,
  type Page as PageOf,
  type PrintJobDto,
  type PrintJobStatus,
} from '@gulbahor/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Ban, MoreHorizontal, Plus, RotateCw, Tags } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterSelect } from '@/components/ui/column-filters'
import { Menu } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Badge, EmptyState, Shortcut } from '@/components/ui/feedback'
import { Page, SearchInput } from '@/components/ui/page'
import { api } from '@/lib/api'
import { formatDateTime, formatNumber } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'

import { LabelDialog } from './label-dialog'

const route = getRouteApi('/labels')

export const JOB_STATUS_TONES: Record<PrintJobStatus, 'warn' | 'info' | 'ok' | 'bad' | 'neutral'> = {
  queued: 'warn',
  sent: 'info',
  done: 'ok',
  failed: 'bad',
  cancelled: 'neutral',
}

/**
 * Everything sent to a printer, newest first: what is still waiting for its
 * agent, what went through, what failed and why. Printing labels for goods
 * already on hand starts here.
 */
export function LabelsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [printing, setPrinting] = useState(false)

  const list = useQuery({
    queryKey: ['printjobs', 'list', search],
    queryFn: ({ signal }) => api.get<PageOf<PrintJobDto>>('/labels/jobs', search, signal),
    placeholderData: keepPreviousData,
  })

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'retry' | 'cancel' }) =>
      api.post<PrintJobDto>(`/labels/jobs/${id}/${action}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['printjobs'] }),
  })

  useHotkey('n', () => setPrinting(true), {
    label: t('labels.title'),
    group: t('shortcuts.groupList'),
    enabled: !printing,
  })

  const columns = useMemo<ColumnDef<PrintJobDto>[]>(
    () => [
      {
        id: 'time',
        header: t('labels.time'),
        meta: { className: 'tabular w-px whitespace-nowrap text-ink-2' },
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      {
        id: 'title',
        header: t('labels.job'),
        meta: { fixed: true, className: 'whitespace-nowrap' },
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        id: 'labels',
        header: t('receipts.totalQty'),
        meta: { className: 'tabular text-right', headerClassName: 'text-right' },
        cell: ({ row }) => formatNumber(row.original.labels),
      },
      {
        id: 'printer',
        header: t('labels.printer'),
        meta: { className: 'whitespace-nowrap' },
        cell: ({ row }) => row.original.printerName,
      },
      {
        id: 'status',
        header: t('common.status'),
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <Badge tone={JOB_STATUS_TONES[row.original.status]}>{PRINT_JOB_STATUS_LABELS[row.original.status]}</Badge>
            {row.original.status === 'queued' && !row.original.agentOnline ? (
              <span className="text-xs text-ink-3">{t('labels.agentOffline')}</span>
            ) : null}
            {row.original.error ? <span className="text-xs text-bad">{row.original.error}</span> : null}
          </span>
        ),
      },
      {
        id: 'author',
        header: t('receipts.author'),
        meta: { className: 'text-ink-2' },
        cell: ({ row }) => row.original.createdByName ?? '',
      },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px' },
        cell: ({ row }) => {
          const { id, status } = row.original
          const items = [
            ...(status === 'failed' || status === 'cancelled'
              ? [{ label: t('labels.retry'), icon: <RotateCw />, onSelect: () => act.mutate({ id, action: 'retry' }) }]
              : []),
            ...(status === 'queued'
              ? [
                  {
                    label: t('receipts.cancel'),
                    icon: <Ban />,
                    tone: 'danger' as const,
                    onSelect: () => act.mutate({ id, action: 'cancel' }),
                  },
                ]
              : []),
          ]
          return items.length ? (
            <Menu
              trigger={
                <Button variant="ghost" size="iconSm" tabIndex={-1} aria-label={t('common.actions')}>
                  <MoreHorizontal />
                </Button>
              }
              items={items}
            />
          ) : null
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  const filtered = !!search.q || search.status !== 'all'

  return (
    <Page
      title={t('labels.pageTitle')}
      actions={
        <Button variant="primary" onClick={() => setPrinting(true)}>
          <Plus />
          {t('labels.title')}
          <Shortcut combo="n" className="ml-1 opacity-70" />
        </Button>
      }
    >
      <DataTable
        columns={columns}
        data={list.data?.items}
        loading={list.isFetching}
        rowId={(row) => row.id}
        preferenceKey="printjobs"
        rowClassName={(row) => (row.status === 'cancelled' ? 'text-ink-3' : undefined)}
        pagination={{
          page: search.page,
          size: search.size,
          total: list.data?.total ?? 0,
          onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
          onSizeChange: (size) => void navigate({ search: (previous) => ({ ...previous, size, page: 1 }) }),
        }}
        filters={{
          status: (
            <FilterSelect
              value={search.status}
              onChange={(status) =>
                void navigate({
                  search: (previous) => ({ ...previous, status: status as typeof search.status, page: 1 }),
                })
              }
              options={[
                { value: 'all', label: t('common.all') },
                ...PRINT_JOB_STATUSES.map((status) => ({ value: status, label: PRINT_JOB_STATUS_LABELS[status] })),
              ]}
            />
          ),
        }}
        toolbar={
          <>
            <SearchInput
              value={search.q ?? ''}
              onChange={(q) =>
                void navigate({ search: (previous) => ({ ...previous, q: q || undefined, page: 1 }), replace: true })
              }
            />
          </>
        }
        empty={
          <EmptyState
            icon={Tags}
            title={filtered ? t('common.nothingFound') : t('labels.empty')}
            hint={filtered ? undefined : t('labels.emptyHint')}
            action={
              filtered ? null : (
                <Button variant="primary" size="sm" onClick={() => setPrinting(true)}>
                  <Plus />
                  {t('labels.title')}
                </Button>
              )
            }
          />
        }
      />
      {printing ? <LabelDialog onClose={() => setPrinting(false)} /> : null}
    </Page>
  )
}
