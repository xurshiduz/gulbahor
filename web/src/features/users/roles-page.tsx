import { ALL_PERMISSIONS, PERMISSION_GROUPS, roleInputSchema, type RoleDto } from '@gulbahor/core'
import { useMutation, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { KeyRound, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox, Menu } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog, useConfirm } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, zodSubmit } from '@/components/ui/form'
import { Input, Textarea } from '@/components/ui/input'
import { Page } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { useHotkey } from '@/lib/hotkeys'

const route = getRouteApi('/roles')

export function RolesPage() {
  const { t } = useTranslation()
  const { hasModule } = useSession()
  const confirm = useConfirm()
  const { edit } = route.useSearch()
  const navigate = route.useNavigate()

  const roles = useQuery({ queryKey: ['roles'], queryFn: ({ signal }) => api.get<RoleDto[]>('/roles', undefined, signal) })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => toast.success(t('roles.deleted')),
  })

  const open = (value: string | undefined) => void navigate({ search: { edit: value } })
  useHotkey('n', () => open('new'), { label: t('roles.add'), group: t('shortcuts.groupList'), enabled: !edit })

  const groups = PERMISSION_GROUPS.filter((group) => !group.module || hasModule(group.module))
  const total = groups.reduce((sum, group) => sum + group.permissions.length, 0)

  const columns = useMemo<ColumnDef<RoleDto>[]>(
    () => [
      {
        id: 'name',
        header: t('roles.name'),
        meta: { fixed: true },
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            {row.original.isSystem ? <Badge tone="accent">{t('roles.system')}</Badge> : null}
          </span>
        ),
      },
      { id: 'description', header: t('roles.description'), meta: { className: 'text-ink-2' }, cell: ({ row }) => row.original.description ?? '—' },
      {
        id: 'permissions',
        header: t('roles.permissions'),
        meta: { className: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const role = row.original
          if (role.permissions.includes(ALL_PERMISSIONS)) {
            return <Badge tone="ok">{t('roles.allPermissions')}</Badge>
          }
          const count = countGranted(role.permissions)
          return count ? <span className="tabular text-ink-2">{t('roles.count', { count })} / {total}</span> : <span className="text-ink-3">{t('roles.noPermissions')}</span>
        },
      },
      { id: 'users', header: t('roles.users'), meta: { className: 'tabular w-px text-right' }, cell: ({ row }) => row.original.userCount },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px' },
        cell: ({ row }) =>
          row.original.isSystem ? null : (
            <span onClick={(event) => event.stopPropagation()}>
              <Menu
                trigger={
                  <Button variant="ghost" size="iconSm" tabIndex={-1} aria-label={t('common.actions')}>
                    <MoreHorizontal />
                  </Button>
                }
                items={[
                  { label: t('common.edit'), icon: <Pencil />, onSelect: () => open(row.original.id) },
                  {
                    label: t('common.delete'),
                    icon: <Trash2 />,
                    tone: 'danger',
                    onSelect: async () => {
                      if (await confirm({ title: t('roles.deleteConfirm', { name: row.original.name }), confirmLabel: t('common.delete'), tone: 'danger' })) {
                        remove.mutate(row.original.id)
                      }
                    },
                  },
                ]}
              />
            </span>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, total],
  )

  const editing = edit && edit !== 'new' ? roles.data?.find((role) => role.id === edit) : null

  return (
    <Page
      title={t('roles.title')}
      subtitle={t('roles.subtitle')}
      actions={
        <Button variant="primary" onClick={() => open('new')}>
          <Plus />
          {t('roles.add')}
          <Shortcut combo="n" className="ml-1 opacity-70" />
        </Button>
      }
    >
      <DataTable
        columns={columns}
        data={roles.data}
        loading={roles.isPending}
        rowId={(row) => row.id}
        onRowOpen={(row) => !row.isSystem && open(row.id)}
        empty={<EmptyState icon={KeyRound} title={t('common.empty')} />}
      />
      {edit && (edit === 'new' || editing) ? (
        <RoleFormDialog key={edit} role={editing ?? null} onClose={() => open(undefined)} />
      ) : null}
    </Page>
  )
}

/** How many single permissions a role's list covers, with "users.*" counted as every permission in that group. */
function countGranted(permissions: string[]): number {
  return PERMISSION_GROUPS.reduce(
    (sum, group) =>
      sum + group.permissions.filter((permission) => permissions.includes(permission.key) || permissions.includes(`${group.key}.*`)).length,
    0,
  )
}

interface Values {
  name: string
  description: string
  permissions: string[]
}

function RoleFormDialog({ role, onClose }: { role: RoleDto | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { can, hasModule } = useSession()
  const formId = 'role-form'

  const form = useForm<Values>({
    defaultValues: {
      name: role?.name ?? '',
      description: role?.description ?? '',
      // "users.*" is opened up into its permissions so each one has its own checkbox.
      permissions: role
        ? PERMISSION_GROUPS.flatMap((group) =>
            group.permissions.filter((permission) => role.permissions.includes(permission.key) || role.permissions.includes(`${group.key}.*`)).map((permission) => permission.key),
          )
        : [],
    },
  })
  const errors = form.formState.errors

  const mutation = useMutation({
    mutationFn: (input: unknown) => (role ? api.put(`/roles/${role.id}`, input) : api.post('/roles', input)),
    onSuccess: () => {
      toast.success(t('common.saved'))
      onClose()
    },
    onError: (error) => void applyServerErrors(error, form),
  })

  const groups = PERMISSION_GROUPS.filter((group) => !group.module || hasModule(group.module))

  return (
    <Dialog
      open
      onClose={onClose}
      title={role ? t('roles.edit') : t('roles.add')}
      size="lg"
      dirty={form.formState.isDirty && !mutation.isSuccess}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form id={formId} onSubmit={() => void zodSubmit(form, roleInputSchema, (input) => mutation.mutate(input))()}>
        <Field label={t('roles.name')} error={errors.name?.message} required>
          {(id) => <Input id={id} autoFocus invalid={!!errors.name} {...form.register('name')} />}
        </Field>
        <Field label={t('roles.description')} error={errors.description?.message}>
          {(id) => <Textarea id={id} rows={2} invalid={!!errors.description} {...form.register('description')} />}
        </Field>

        <Controller
          control={form.control}
          name="permissions"
          render={({ field }) => (
            <div>
              <p className="mb-2 text-xs font-medium text-ink-2">{t('roles.permissions')}</p>
              <div className="divide-y divide-line rounded-lg border border-line">
                {groups.map((group) => (
                  <div key={group.key} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[11rem_1fr]">
                    <p className="text-[13px] font-medium">{group.title}</p>
                    <div className="flex flex-col gap-1.5">
                      {group.permissions.map((permission) => {
                        const held = can(permission.key)
                        const checked = field.value.includes(permission.key)
                        return (
                          <Checkbox
                            key={permission.key}
                            checked={checked}
                            // Nobody hands out a right they do not hold; one the role already has can still be taken away.
                            disabled={!held && !checked}
                            onChange={(next) =>
                              field.onChange(next ? [...field.value, permission.key] : field.value.filter((key) => key !== permission.key))
                            }
                            label={permission.title}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {errors.permissions?.message ? <p className="mt-1 text-xs text-bad">{errors.permissions.message}</p> : null}
              <p className="mt-2 text-xs text-ink-3">{t('roles.later')}</p>
            </div>
          )}
        />
      </Form>
    </Dialog>
  )
}
