import type { Page as PageOf, UserDto } from '@erp/core'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Ban, KeyRound, MonitorSmartphone, MoreHorizontal, Pencil, Plus, ShieldCheck, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { formatPhone, formatRecent } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { withFilter } from '@/lib/list-search'
import { toast } from '@/lib/toast'

import { permissionNames } from './permissions'
import { ResetPasswordDialog, UserFormDialog, UserSessionsDialog, useUserFormOptions } from './user-form'

const route = getRouteApi('/users')

type Extra = { kind: 'password' | 'sessions'; user: UserDto } | null

export function UsersPage() {
  const { t } = useTranslation()
  const { me, can } = useSession()
  const confirm = useConfirm()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const canManage = can('users.manage')
  const [extra, setExtra] = useState<Extra>(null)
  const { roles, locations } = useUserFormOptions()

  const { edit, ...filters } = search
  const list = useQuery({
    queryKey: ['users', 'list', filters],
    queryFn: ({ signal }) => api.get<PageOf<UserDto>>('/users', filters, signal),
    placeholderData: keepPreviousData,
  })

  const editing = edit && edit !== 'new' ? (list.data?.items.find((item) => item.id === edit) ?? null) : null
  const single = useQuery({
    queryKey: ['users', 'one', edit],
    queryFn: ({ signal }) => api.get<UserDto>(`/users/${edit}`, undefined, signal),
    enabled: !!edit && edit !== 'new' && !editing && !list.isPending,
  })

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.post(`/users/${id}/${active ? 'unblock' : 'block'}`),
    onSuccess: (_data, { active }) => toast.success(active ? t('users.unblockedToast') : t('users.blockedToast')),
  })

  const open = (value: string | undefined) => void navigate({ search: (previous) => ({ ...previous, edit: value }) })

  useHotkey('n', () => open('new'), { label: t('users.add'), group: t('shortcuts.groupList'), enabled: canManage && !edit && !extra })

  const columns = useMemo<ColumnDef<UserDto>[]>(
    () => [
      {
        id: 'fullName',
        header: t('users.fullName'),
        meta: { sortKey: 'fullName', fixed: true },
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{row.original.fullName}</span>
            {row.original.isOwner ? (
              <Badge tone="accent">
                <ShieldCheck className="mr-1 size-3" />
                {t('users.owner')}
              </Badge>
            ) : null}
          </span>
        ),
      },
      { id: 'login', header: t('users.login'), meta: { sortKey: 'login', className: 'font-code text-xs' }, cell: ({ row }) => row.original.login },
      {
        id: 'phone',
        header: t('users.phone'),
        meta: { className: 'tabular whitespace-nowrap' },
        cell: ({ row }) => (row.original.phone ? formatPhone(row.original.phone) : <span className="text-ink-3">—</span>),
      },
      {
        id: 'roles',
        header: t('users.roles'),
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            {row.original.roles.map((role) => (
              <Badge key={role.id}>{role.name}</Badge>
            ))}
            {/* Given beside the roles: how many, and on hover which. */}
            {row.original.extraPermissions.length ? (
              <span title={permissionNames(row.original.extraPermissions)}>
                <Badge tone="info">{t('users.extraCount', { count: row.original.extraPermissions.length })}</Badge>
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'locations',
        header: t('users.locations'),
        cell: ({ row }) =>
          row.original.allLocations ? (
            <span className="text-ink-2">{t('common.all')}</span>
          ) : (
            <span className="text-ink-2">{row.original.locations.map((location) => location.name).join(', ') || '—'}</span>
          ),
      },
      {
        id: 'lastLoginAt',
        header: t('users.lastLogin'),
        meta: { sortKey: 'lastLoginAt', className: 'tabular whitespace-nowrap text-ink-2' },
        cell: ({ row }) => (row.original.lastLoginAt ? formatRecent(row.original.lastLoginAt) : <span className="text-ink-3">{t('common.never')}</span>),
      },
      {
        id: 'status',
        header: t('common.status'),
        cell: ({ row }) => (row.original.isActive ? <Badge tone="ok">{t('common.active')}</Badge> : <Badge tone="bad">{t('common.blocked')}</Badge>),
      },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px' },
        cell: ({ row }) => {
          const user = row.original
          // The owner is changed only by an owner.
          if (!canManage || (user.isOwner && !me.user.isOwner)) {
            return null
          }
          return (
            <span onClick={(event) => event.stopPropagation()}>
              <Menu
                trigger={
                  <Button variant="ghost" size="iconSm" tabIndex={-1} aria-label={t('common.actions')}>
                    <MoreHorizontal />
                  </Button>
                }
                items={[
                  { label: t('common.edit'), icon: <Pencil />, onSelect: () => open(user.id) },
                  { label: t('users.resetPassword'), icon: <KeyRound />, onSelect: () => setExtra({ kind: 'password', user }) },
                  { label: t('users.sessions'), icon: <MonitorSmartphone />, onSelect: () => setExtra({ kind: 'sessions', user }) },
                  'separator',
                  user.isActive
                    ? {
                        label: t('users.block'),
                        icon: <Ban />,
                        tone: 'danger',
                        disabled: user.id === me.user.id,
                        onSelect: async () => {
                          if (await confirm({ title: t('users.blockConfirm', { name: user.fullName }), confirmLabel: t('users.block'), tone: 'danger' })) {
                            setActive.mutate({ id: user.id, active: false })
                          }
                        },
                      }
                    : { label: t('users.unblock'), icon: <ShieldCheck />, onSelect: () => setActive.mutate({ id: user.id, active: true }) },
                ]}
              />
            </span>
          )
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage, me.user.id, me.user.isOwner],
  )

  const dialogUser = edit === 'new' ? null : (editing ?? single.data ?? undefined)
  const mayEdit = (user: UserDto) => canManage && (!user.isOwner || me.user.isOwner)

  return (
    <Page
      title={t('users.title')}
      actions={
        canManage ? (
          <Button variant="primary" onClick={() => open('new')}>
            <Plus />
            {t('users.add')}
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
        onRowOpen={canManage ? (row) => mayEdit(row) && open(row.id) : undefined}
        sort={search.sort ?? 'fullName'}
        order={search.order}
        onSortChange={(sort, order) => void navigate({ search: (previous) => withFilter(previous, { sort, order }) })}
        preferenceKey="users"
        rowClassName={(row) => (row.isActive ? undefined : 'text-ink-3')}
        pagination={{
          page: search.page,
          size: search.size,
          total: list.data?.total ?? 0,
          onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
          onSizeChange: (size) => void navigate({ search: (previous) => withFilter(previous, { size }) }),
        }}
        filters={{
          roles: (
            <FilterSelect
              value={search.roleId ?? 'all'}
              onChange={(roleId) => void navigate({ search: (previous) => withFilter(previous, { roleId: roleId === 'all' ? undefined : roleId }) })}
              options={[{ value: 'all', label: t('common.all') }, ...roles.map((role) => ({ value: role.id, label: role.name }))]}
            />
          ),
          locations: (
            <FilterSelect
              value={search.locationId ?? 'all'}
              onChange={(locationId) => void navigate({ search: (previous) => withFilter(previous, { locationId: locationId === 'all' ? undefined : locationId }) })}
              options={[{ value: 'all', label: t('common.all') }, ...locations.map((location) => ({ value: location.id, label: location.name }))]}
            />
          ),
          status: (
            <FilterSelect
              value={search.status}
              onChange={(status) => void navigate({ search: (previous) => withFilter(previous, { status: status as typeof search.status }) })}
              options={[
                { value: 'all', label: t('common.all') },
                { value: 'active', label: t('common.active') },
                { value: 'blocked', label: t('common.blocked') },
              ]}
            />
          ),
        }}
        toolbar={
          <>
            <SearchInput value={search.q ?? ''} onChange={(q) => void navigate({ search: (previous) => withFilter(previous, { q: q || undefined }), replace: true })} />
          </>
        }
        empty={<EmptyState icon={Users} title={search.q ? t('common.nothingFound') : t('users.empty')} />}
      />

      {edit && dialogUser !== undefined ? <UserFormDialog key={edit} user={dialogUser} onClose={() => open(undefined)} /> : null}
      {extra?.kind === 'password' ? <ResetPasswordDialog user={extra.user} onClose={() => setExtra(null)} /> : null}
      {extra?.kind === 'sessions' ? <UserSessionsDialog user={extra.user} onClose={() => setExtra(null)} /> : null}
    </Page>
  )
}
