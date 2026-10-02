import type { AuditDto, Page as PageOf } from '@gulbahor/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowRight, History } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { FilterDates, FilterSelect } from '@/components/ui/column-filters'
import { DataTable } from '@/components/ui/data-table'
import { Badge, EmptyState } from '@/components/ui/feedback'
import { Page } from '@/components/ui/page'
import { api } from '@/lib/api'
import { fetchAll, timeCell } from '@/lib/excel'
import { formatDateTime } from '@/lib/format'

import { useAuditText } from './audit-text'

const route = getRouteApi('/audit')

const ENTITIES = [
  'sale',
  'return',
  'shift',
  'receipt',
  'transfer',
  'writeoff',
  'count',
  'product',
  'category',
  'brand',
  'attribute',
  'price_type',
  'price_revision',
  'price_rule',
  'partner',
  'register',
  'account',
  'rate',
  'agent',
  'printer',
  'user',
  'role',
  'location',
  'org',
]

export function AuditPage() {
  const { t } = useTranslation()
  const describe = useAuditText()
  const search = route.useSearch()
  const navigate = route.useNavigate()

  const list = useQuery({
    queryKey: ['audit', 'list', search],
    queryFn: ({ signal }) => api.get<PageOf<AuditDto>>('/audit', search, signal),
    placeholderData: keepPreviousData,
  })

  const columns = useMemo<ColumnDef<AuditDto>[]>(
    () => [
      {
        id: 'at',
        header: t('audit.at'),
        meta: {
          export: (row) => timeCell(row.at),
          fixed: true,
          className: 'tabular w-px whitespace-nowrap text-ink-2',
        },
        cell: ({ row }) => formatDateTime(row.original.at),
      },
      {
        id: 'actor',
        header: t('audit.actor'),
        meta: { export: (row) => row.actorName ?? t('audit.system'), className: 'whitespace-nowrap' },
        cell: ({ row }) => row.original.actorName ?? <span className="text-ink-3">{t('audit.system')}</span>,
      },
      {
        id: 'action',
        header: t('audit.action'),
        meta: { export: (row) => describe.action(row.action), fixed: true, className: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const failed = row.original.action.endsWith('_failed') || row.original.action.endsWith('_locked')
          return <Badge tone={failed ? 'bad' : 'neutral'}>{describe.action(row.original.action)}</Badge>
        },
      },
      {
        id: 'summary',
        header: t('audit.what'),
        meta: { export: (row) => row.summary },
        cell: ({ row }) => row.original.summary ?? '—',
      },
      {
        id: 'changes',
        header: t('audit.changes'),
        meta: {
          export: (row) =>
            Object.entries(row.changes ?? {})
              .map(
                ([field, [before, after]]) =>
                  `${describe.field(field)}: ${describe.value(field, before)} → ${describe.value(field, after)}`,
              )
              .join('; '),
        },
        cell: ({ row }) => {
          const changes = row.original.changes
          if (!changes) {
            return null
          }
          return (
            <ul className="flex flex-col gap-0.5 text-xs">
              {Object.entries(changes).map(([field, [before, after]]) => (
                <li key={field} className="flex flex-wrap items-center gap-x-1.5">
                  <span className="text-ink-3">{describe.field(field)}:</span>
                  <span className="text-ink-3 line-through">{describe.value(field, before)}</span>
                  <ArrowRight className="size-3 text-ink-3" />
                  <span className="font-medium">{describe.value(field, after)}</span>
                </li>
              ))}
            </ul>
          )
        },
      },
      {
        id: 'ip',
        header: 'IP',
        meta: { export: (row) => row.ip, className: 'font-code w-px text-xs whitespace-nowrap text-ink-3' },
        cell: ({ row }) => row.original.ip ?? '',
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  return (
    <Page title={t('audit.title')}>
      <DataTable
        columns={columns}
        data={list.data?.items}
        loading={list.isFetching}
        rowId={(row) => row.id}
        exportAs={{ fileName: t('audit.title'), rows: () => fetchAll<AuditDto>('/audit', search) }}
        preferenceKey="audit"
        pagination={{
          page: search.page,
          size: search.size,
          total: list.data?.total ?? 0,
          onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
          onSizeChange: (size) => void navigate({ search: (previous) => ({ ...previous, size, page: 1 }) }),
        }}
        filters={{
          action: (
            <FilterSelect
              value={search.entity ?? 'all'}
              onChange={(entity) =>
                void navigate({
                  search: (previous) => ({ ...previous, entity: entity === 'all' ? undefined : entity, page: 1 }),
                })
              }
              options={[
                { value: 'all', label: t('common.all') },
                ...ENTITIES.map((entity) => ({ value: entity, label: describe.entity(entity) })),
              ]}
            />
          ),
          at: (
            <FilterDates
              from={search.from}
              to={search.to}
              onChange={(range) => void navigate({ search: (previous) => ({ ...previous, ...range, page: 1 }) })}
            />
          ),
        }}
        toolbar={<></>}
        empty={<EmptyState icon={History} title={t('common.nothingFound')} />}
      />
    </Page>
  )
}
