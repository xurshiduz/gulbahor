import { partnerInputSchema, type Page as PageOf, type PartnerDto, type PartnerInput } from '@gulbahor/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Archive, ArchiveRestore, Handshake, MoreHorizontal, Pencil, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox, Menu, Select } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, zodSubmit } from '@/components/ui/form'
import { Input, Textarea } from '@/components/ui/input'
import { Page, SearchInput } from '@/components/ui/page'
import { PhoneInput } from '@/components/ui/phone-input'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { fetchAll } from '@/lib/excel'
import { formatPhone } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { withFilter } from '@/lib/list-search'

const route = getRouteApi('/partners')

export function PartnersPage() {
  const { t } = useTranslation()
  const { can } = useSession()
  const queryClient = useQueryClient()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const canManage = can('partners.manage')

  const { edit, ...filters } = search
  const list = useQuery({
    queryKey: ['partners', 'list', filters],
    queryFn: ({ signal }) => api.get<PageOf<PartnerDto>>('/partners', filters, signal),
    placeholderData: keepPreviousData,
  })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['partners'] })

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post(`/partners/${id}/${active ? 'restore' : 'archive'}`),
    onSuccess: refresh,
  })

  const open = (value: string | undefined) => void navigate({ search: (previous) => ({ ...previous, edit: value }) })

  useHotkey('n', () => open('new'), {
    label: t('partners.add'),
    group: t('shortcuts.groupList'),
    enabled: canManage && !edit,
  })

  const columns = useMemo<ColumnDef<PartnerDto>[]>(
    () => [
      {
        id: 'name',
        header: t('partners.name'),
        meta: { export: (row) => row.name, sortKey: 'name', fixed: true },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'roles',
        header: t('partners.role'),
        meta: {
          export: (row) =>
            [row.isSupplier ? t('partners.supplier') : null, row.isBuyer ? t('partners.buyer') : null]
              .filter(Boolean)
              .join(', '),
        },
        cell: ({ row }) => (
          <span className="flex gap-1">
            {row.original.isSupplier ? <Badge tone="info">{t('partners.supplier')}</Badge> : null}
            {row.original.isBuyer ? <Badge tone="accent">{t('partners.buyer')}</Badge> : null}
          </span>
        ),
      },
      {
        id: 'phone',
        header: t('partners.phone'),
        meta: { export: (row) => (row.phone ? formatPhone(row.phone) : null), className: 'tabular whitespace-nowrap' },
        cell: ({ row }) =>
          row.original.phone ? formatPhone(row.original.phone) : <span className="text-ink-3">—</span>,
      },
      {
        id: 'note',
        header: t('partners.note'),
        meta: { export: (row) => row.note, className: 'text-ink-2' },
        cell: ({ row }) => row.original.note ?? '',
      },
      {
        id: 'status',
        header: t('common.status'),
        meta: { export: (row) => (row.isActive ? t('common.active') : t('common.archived')), className: 'w-px' },
        cell: ({ row }) =>
          row.original.isActive ? <Badge tone="ok">{t('common.active')}</Badge> : <Badge>{t('common.archived')}</Badge>,
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
                        onSelect: () => setActive.mutate({ id: row.original.id, active: false }),
                      }
                    : {
                        label: t('common.restore'),
                        icon: <ArchiveRestore />,
                        onSelect: () => setActive.mutate({ id: row.original.id, active: true }),
                      },
                ]}
              />
            </span>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage],
  )

  const editing = edit && edit !== 'new' ? list.data?.items.find((item) => item.id === edit) : null
  const single = useQuery({
    queryKey: ['partners', 'one', edit],
    queryFn: ({ signal }) => api.get<PartnerDto>(`/partners/${edit}`, undefined, signal),
    enabled: !!edit && edit !== 'new' && !editing && !list.isPending,
  })
  const dialogPartner = edit === 'new' ? null : (editing ?? single.data ?? undefined)

  return (
    <Page
      title={t('partners.title')}
      subtitle={t('partners.subtitle')}
      actions={
        canManage ? (
          <Button variant="primary" onClick={() => open('new')}>
            <Plus />
            {t('partners.add')}
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
        exportAs={{ fileName: t('partners.title'), rows: () => fetchAll<PartnerDto>('/partners', filters) }}
        sort={search.sort ?? 'name'}
        order={search.order}
        onSortChange={(sort, order) => void navigate({ search: (previous) => withFilter(previous, { sort, order }) })}
        preferenceKey="partners"
        rowClassName={(row) => (row.isActive ? undefined : 'text-ink-3')}
        pagination={{
          page: search.page,
          size: search.size,
          total: list.data?.total ?? 0,
          onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
          onSizeChange: (size) => void navigate({ search: (previous) => withFilter(previous, { size }) }),
        }}
        toolbar={
          <>
            <SearchInput
              value={search.q ?? ''}
              onChange={(q) =>
                void navigate({ search: (previous) => withFilter(previous, { q: q || undefined }), replace: true })
              }
            />
            <Select
              value={search.role ?? 'all'}
              onChange={(role) =>
                void navigate({
                  search: (previous) =>
                    withFilter(previous, { role: role === 'all' ? undefined : (role as 'supplier' | 'buyer') }),
                })
              }
              options={[
                { value: 'all', label: t('common.all') },
                { value: 'supplier', label: t('partners.suppliers') },
                { value: 'buyer', label: t('partners.buyers') },
              ]}
              className="w-48"
            />
            <Select
              value={search.status}
              onChange={(status) =>
                void navigate({
                  search: (previous) => withFilter(previous, { status: status as typeof search.status }),
                })
              }
              options={[
                { value: 'active', label: t('common.active') },
                { value: 'archived', label: t('common.archived') },
                { value: 'all', label: t('common.all') },
              ]}
              className="w-36"
            />
          </>
        }
        empty={
          <EmptyState
            icon={Handshake}
            title={search.q ? t('common.nothingFound') : t('partners.empty')}
            hint={search.q ? undefined : t('partners.emptyHint')}
          />
        }
      />
      {edit && dialogPartner !== undefined ? (
        <PartnerDialog key={edit} partner={dialogPartner} onClose={() => open(undefined)} onSaved={refresh} />
      ) : null}
    </Page>
  )
}

interface Values {
  name: string
  phone: string
  isSupplier: boolean
  isBuyer: boolean
  note: string
}

function PartnerDialog({
  partner,
  onClose,
  onSaved,
}: {
  partner: PartnerDto | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const formId = 'partner-form'
  const form = useForm<Values>({
    defaultValues: {
      name: partner?.name ?? '',
      phone: partner?.phone ?? '',
      isSupplier: partner?.isSupplier ?? true,
      isBuyer: partner?.isBuyer ?? false,
      note: partner?.note ?? '',
    },
  })
  const errors = form.formState.errors

  const mutation = useMutation({
    mutationFn: (input: PartnerInput) =>
      partner ? api.put(`/partners/${partner.id}`, input) : api.post('/partners', input),
    onSuccess: () => {
      onSaved()
      toast.success(t('common.saved'))
      onClose()
    },
    onError: (error) => void applyServerErrors(error, form),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={partner ? t('partners.edit') : t('partners.add')}
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
      <Form id={formId} onSubmit={() => void zodSubmit(form, partnerInputSchema, (input) => mutation.mutate(input))()}>
        <Field label={t('partners.name')} error={errors.name?.message} required>
          {(id) => <Input id={id} autoFocus invalid={!!errors.name} {...form.register('name')} />}
        </Field>
        <Field label={t('partners.phone')} error={errors.phone?.message}>
          {(id) => (
            <Controller
              control={form.control}
              name="phone"
              render={({ field }) => (
                <PhoneInput
                  id={id}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={!!errors.phone}
                />
              )}
            />
          )}
        </Field>
        <div>
          <div className="flex gap-6">
            <Controller
              control={form.control}
              name="isSupplier"
              render={({ field }) => (
                <Checkbox checked={field.value} onChange={field.onChange} label={t('partners.supplier')} />
              )}
            />
            <Controller
              control={form.control}
              name="isBuyer"
              render={({ field }) => (
                <Checkbox checked={field.value} onChange={field.onChange} label={t('partners.buyer')} />
              )}
            />
          </div>
          {errors.isSupplier?.message ? <p className="mt-1 text-xs text-bad">{errors.isSupplier.message}</p> : null}
        </div>
        <Field label={t('partners.note')} error={errors.note?.message}>
          {(id) => <Textarea id={id} rows={2} invalid={!!errors.note} {...form.register('note')} />}
        </Field>
      </Form>
    </Dialog>
  )
}
