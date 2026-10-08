import { LOCATION_KIND_LABELS, LOCATION_KINDS, type LocationDto, type Page as PageOf } from '@erp/core'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Archive, ArchiveRestore, Building2, MoreHorizontal, Pencil, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterSelect } from '@/components/ui/column-filters'
import { Menu } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { useConfirm } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut } from '@/components/ui/feedback'
import { Page, SearchInput } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { formatPhone } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { withFilter } from '@/lib/list-search'
import { toast } from '@/lib/toast'

import { LocationFormDialog } from './location-form'

const route = getRouteApi('/locations')

export function LocationsPage() {
  const { t } = useTranslation()
  const { can } = useSession()
  const confirm = useConfirm()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const canManage = can('locations.manage')

  const { edit, ...filters } = search
  const list = useQuery({
    queryKey: ['locations', 'list', filters],
    queryFn: ({ signal }) => api.get<PageOf<LocationDto>>('/locations', filters, signal),
    placeholderData: keepPreviousData,
  })

  const editing = edit && edit !== 'new' ? (list.data?.items.find((item) => item.id === edit) ?? null) : null
  const single = useQuery({
    queryKey: ['locations', 'one', edit],
    queryFn: ({ signal }) => api.get<LocationDto>(`/locations/${edit}`, undefined, signal),
    enabled: !!edit && edit !== 'new' && !editing && !list.isPending,
  })

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.post(`/locations/${id}/${active ? 'restore' : 'archive'}`),
    onSuccess: (_data, { active }) => toast.success(active ? t('locations.restored') : t('locations.archived')),
  })

  const open = (value: string | undefined) => void navigate({ search: (previous) => ({ ...previous, edit: value }) })

  useHotkey('n', () => open('new'), { label: t('locations.add'), group: t('shortcuts.groupList'), enabled: canManage && !edit })

  const columns = useMemo<ColumnDef<LocationDto>[]>(
    () => [
      {
        id: 'code',
        header: t('locations.code'),
        meta: { sortKey: 'code', className: 'w-px font-code text-xs text-ink-2 whitespace-nowrap' },
        cell: ({ row }) => row.original.code,
      },
      {
        id: 'name',
        header: t('locations.name'),
        meta: { sortKey: 'name', fixed: true },
        cell: ({ row }) => (
          <span>
            <span className="font-medium">{row.original.name}</span>
            {row.original.parentName ? <span className="text-ink-3"> · {row.original.parentName}</span> : null}
          </span>
        ),
      },
      {
        id: 'kind',
        header: t('locations.kind'),
        meta: { sortKey: 'kind' },
        cell: ({ row }) => <Badge tone={row.original.kind === 'warehouse' ? 'info' : row.original.kind === 'zone' ? 'neutral' : 'accent'}>{LOCATION_KIND_LABELS[row.original.kind]}</Badge>,
      },
      { id: 'address', header: t('locations.address'), cell: ({ row }) => row.original.address ?? <span className="text-ink-3">—</span> },
      {
        id: 'phone',
        header: t('locations.phone'),
        meta: { className: 'tabular whitespace-nowrap' },
        cell: ({ row }) => (row.original.phone ? formatPhone(row.original.phone) : <span className="text-ink-3">—</span>),
      },
      {
        id: 'status',
        header: t('common.status'),
        cell: ({ row }) => (row.original.isActive ? <Badge tone="ok">{t('common.active')}</Badge> : <Badge>{t('common.archived')}</Badge>),
      },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px' },
        cell: ({ row }) =>
          canManage ? (
            <span onClick={(event) => event.stopPropagation()}>
              <Menu
                trigger={
                  <Button variant="ghost" size="iconSm" tabIndex={-1} aria-label={t('common.actions')}>
                    <MoreHorizontal />
                  </Button>
                }
                items={[
                  { label: t('common.edit'), icon: <Pencil />, onSelect: () => open(row.original.id) },
                  row.original.isActive
                    ? {
                        label: t('common.archive'),
                        icon: <Archive />,
                        tone: 'danger',
                        onSelect: async () => {
                          if (await confirm({ title: t('locations.archiveConfirm', { name: row.original.name }), confirmLabel: t('common.archive'), tone: 'danger' })) {
                            setActive.mutate({ id: row.original.id, active: false })
                          }
                        },
                      }
                    : { label: t('common.restore'), icon: <ArchiveRestore />, onSelect: () => setActive.mutate({ id: row.original.id, active: true }) },
                ]}
              />
            </span>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage],
  )

  const dialogLocation = edit === 'new' ? null : (editing ?? single.data ?? undefined)

  return (
    <Page
      title={t('locations.title')}
      actions={
        canManage ? (
          <Button variant="primary" onClick={() => open('new')}>
            <Plus />
            {t('locations.add')}
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
        onRowOpen={canManage ? (row) => open(row.id) : undefined}
        sort={search.sort ?? 'name'}
        order={search.order}
        onSortChange={(sort, order) => void navigate({ search: (previous) => withFilter(previous, { sort, order }) })}
        preferenceKey="locations"
        rowClassName={(row) => (row.isActive ? undefined : 'text-ink-3')}
        pagination={{
          page: search.page,
          size: search.size,
          total: list.data?.total ?? 0,
          onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
          onSizeChange: (size) => void navigate({ search: (previous) => withFilter(previous, { size }) }),
        }}
        filters={{
          kind: (
            <FilterSelect
              value={search.kind ?? 'all'}
              onChange={(kind) => void navigate({ search: (previous) => withFilter(previous, { kind: kind === 'all' ? undefined : (kind as LocationDto['kind']) }) })}
              options={[{ value: 'all', label: t('common.all') }, ...LOCATION_KINDS.map((kind) => ({ value: kind, label: LOCATION_KIND_LABELS[kind] }))]}
            />
          ),
          status: (
            <FilterSelect
              value={search.status}
              onChange={(status) => void navigate({ search: (previous) => withFilter(previous, { status: status as typeof search.status }) })}
              options={[
                { value: 'active', label: t('common.active') },
                { value: 'archived', label: t('common.archived') },
                { value: 'all', label: t('common.all') },
              ]}
            />
          ),
        }}
        toolbar={
          <>
            <SearchInput value={search.q ?? ''} onChange={(q) => void navigate({ search: (previous) => withFilter(previous, { q: q || undefined }), replace: true })} />
          </>
        }
        empty={
          <EmptyState
            icon={Building2}
            title={search.q || search.kind ? t('common.nothingFound') : t('locations.empty')}
            action={
              canManage && !search.q ? (
                <Button variant="primary" size="sm" onClick={() => open('new')}>
                  <Plus />
                  {t('locations.add')}
                </Button>
              ) : null
            }
          />
        }
      />

      {edit && dialogLocation !== undefined ? <LocationFormDialog key={edit} location={dialogLocation} onClose={() => open(undefined)} /> : null}
    </Page>
  )
}
