import {
  CUSTOMER_GENDER_LABELS,
  CUSTOMER_GENDERS,
  customerInputSchema,
  formatMoney,
  type CustomerDto,
  type CustomerGender,
  type CustomerGroupDto,
  type CustomerInput,
  type CustomerSummary,
  type Page as PageOf,
} from '@gulbahor/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Archive, ArchiveRestore, Cake, MoreHorizontal, Pencil, Plus, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterSelect } from '@/components/ui/column-filters'
import { Combobox } from '@/components/ui/combobox'
import { Menu, Select, TabPanel, Tabs, type MenuItem } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { DateInput } from '@/components/ui/date-input'
import { Dialog } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, zodCheck } from '@/components/ui/form'
import { Input, Textarea } from '@/components/ui/input'
import { Page, SearchInput } from '@/components/ui/page'
import { PhoneInput } from '@/components/ui/phone-input'
import { TagInput } from '@/components/ui/tag-input'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { dayCell, fetchAll, moneyCell, timeCell } from '@/lib/excel'
import { formatDateTime, formatDay, formatNumber, formatPhone } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { withFilter } from '@/lib/list-search'
import { toast } from '@/lib/toast'

import { GroupDialog, GroupsTab, useCustomerGroups } from './groups-tab'
import { LoyaltyTab } from './loyalty-tab'

const route = getRouteApi('/customers')

const money = (minor: number) => formatMoney(minor, 'UZS', { minor: 'auto' })

type Listed = PageOf<CustomerDto> & { summary: CustomerSummary }

/**
 * The people who buy in the shops. Over the list stands the whole base at a
 * glance; a customer is written down here, or at the till the first time
 * they buy, and what they have bought is read from their receipts.
 */
export function CustomersPage() {
  const { t } = useTranslation()
  const { can } = useSession()
  const queryClient = useQueryClient()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const canManage = can('customers.manage')
  const [groupForm, setGroupForm] = useState<CustomerGroupDto | null | undefined>()
  const groups = useCustomerGroups()

  const { edit, tab, ...filters } = search
  const list = useQuery({
    queryKey: ['customers', 'list', filters],
    queryFn: ({ signal }) => api.get<Listed>('/customers', filters, signal),
    placeholderData: keepPreviousData,
  })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['customers'] })

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post(`/customers/${id}/${active ? 'restore' : 'archive'}`),
    onSuccess: refresh,
  })

  const open = (value: string | undefined) => void navigate({ search: (previous) => ({ ...previous, edit: value }) })

  const add = () => (tab === 'groups' ? setGroupForm(null) : open('new'))
  const addLabel = tab === 'groups' ? t('customers.addGroup') : t('customers.add')
  useHotkey('n', add, {
    label: addLabel,
    group: t('shortcuts.groupList'),
    enabled: canManage && tab !== 'loyalty' && !edit && groupForm === undefined,
  })

  const columns = useMemo<ColumnDef<CustomerDto>[]>(
    () => {
      const menu = (customer: CustomerDto): MenuItem[] =>
        canManage
          ? [
              { label: t('common.edit'), icon: <Pencil />, onSelect: () => open(customer.id) },
              customer.isActive
                ? {
                    label: t('common.archive'),
                    icon: <Archive />,
                    onSelect: () => setActive.mutate({ id: customer.id, active: false }),
                  }
                : {
                    label: t('common.restore'),
                    icon: <ArchiveRestore />,
                    onSelect: () => setActive.mutate({ id: customer.id, active: true }),
                  },
            ]
          : []
      return [
        {
          id: 'name',
          header: t('customers.name'),
          meta: { export: (row) => row.name, sortKey: 'name', fixed: true },
          cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
        },
        {
          id: 'phone',
          header: t('customers.phone'),
          meta: { export: (row) => formatPhone(row.phone), className: 'tabular whitespace-nowrap' },
          cell: ({ row }) => formatPhone(row.original.phone),
        },
        {
          id: 'groups',
          header: t('customers.groups'),
          meta: {
            export: (row) => [...row.groups.map((group) => group.name), ...row.tags.map((tag) => `#${tag}`)].join(', '),
          },
          cell: ({ row }) => (
            <span className="flex flex-wrap items-center gap-1">
              {row.original.groups.map((group) => (
                <Badge key={group.id} tone="accent">
                  {group.name}
                </Badge>
              ))}
              {row.original.tags.map((tag) => (
                <span key={tag} className="text-xs text-ink-3">
                  #{tag}
                </span>
              ))}
            </span>
          ),
        },
        {
          id: 'birthday',
          header: t('customers.birthday'),
          meta: { export: (row) => dayCell(row.birthday), className: 'tabular whitespace-nowrap text-ink-2' },
          cell: ({ row }) => (row.original.birthday ? formatDay(row.original.birthday) : ''),
        },
        {
          id: 'gender',
          header: t('customers.gender'),
          meta: {
            export: (row) => (row.gender ? CUSTOMER_GENDER_LABELS[row.gender] : null),
            className: 'text-ink-2',
          },
          cell: ({ row }) => (row.original.gender ? CUSTOMER_GENDER_LABELS[row.original.gender] : ''),
        },
        {
          id: 'purchases',
          header: t('customers.purchases'),
          meta: {
            export: (row) => moneyCell(row.purchases, 'UZS'),
            className: 'tabular text-right whitespace-nowrap',
            headerClassName: 'text-right',
          },
          cell: ({ row }) =>
            row.original.purchases ? (
              <span className="font-medium">{money(row.original.purchases)}</span>
            ) : (
              <span className="text-ink-3">—</span>
            ),
        },
        {
          id: 'discount',
          header: t('pos.discount'),
          meta: {
            export: (row) => (row.discountPercent ? `${row.discountPercent}%` : null),
            className: 'tabular text-right whitespace-nowrap',
            headerClassName: 'text-right',
          },
          cell: ({ row }) =>
            row.original.discountPercent ? (
              <span className="font-medium text-accent-ink">
                {String(row.original.discountPercent).replace('.', ',')}%
              </span>
            ) : (
              ''
            ),
        },
        {
          id: 'salesCount',
          header: t('customers.salesCount'),
          meta: {
            export: (row) => row.salesCount,
            className: 'tabular text-right text-ink-2',
            headerClassName: 'text-right',
          },
          cell: ({ row }) => (row.original.salesCount ? formatNumber(row.original.salesCount) : ''),
        },
        {
          id: 'lastSaleAt',
          header: t('customers.lastSale'),
          meta: { export: (row) => timeCell(row.lastSaleAt), className: 'tabular whitespace-nowrap text-ink-2' },
          cell: ({ row }) => (row.original.lastSaleAt ? formatDateTime(row.original.lastSaleAt) : ''),
        },
        {
          id: 'location',
          header: t('customers.registeredAt'),
          meta: { export: (row) => row.locationName, className: 'text-ink-2' },
          cell: ({ row }) => row.original.locationName ?? '',
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
            row.original.isActive ? (
              <Badge tone="ok">{t('common.active')}</Badge>
            ) : (
              <Badge>{t('common.archived')}</Badge>
            ),
        },
        {
          id: 'actions',
          header: '',
          meta: { fixed: true, className: 'w-px' },
          cell: ({ row }) => {
            const items = menu(row.original)
            return items.length ? (
              <span onClick={(event) => event.stopPropagation()}>
                <Menu
                  trigger={
                    <Button variant="ghost" size="iconSm" tabIndex={-1} aria-label={t('common.actions')}>
                      <MoreHorizontal />
                    </Button>
                  }
                  items={items}
                />
              </span>
            ) : null
          },
        },
      ]
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage],
  )

  const editing = edit && edit !== 'new' ? list.data?.items.find((item) => item.id === edit) : null
  const single = useQuery({
    queryKey: ['customers', 'one', edit],
    queryFn: ({ signal }) => api.get<CustomerDto>(`/customers/${edit}`, undefined, signal),
    enabled: !!edit && edit !== 'new' && !editing && !list.isPending,
  })
  const dialogCustomer = edit === 'new' ? null : (editing ?? single.data ?? undefined)
  const summary = list.data?.summary
  const soon = search.birthdayIn !== undefined

  return (
    <Page
      title={t('customers.title')}
      actions={
        canManage && tab !== 'loyalty' ? (
          <Button variant="primary" onClick={add}>
            <Plus />
            {addLabel}
            <Shortcut combo="n" className="ml-1 opacity-70" />
          </Button>
        ) : null
      }
    >
      <Tabs
        value={tab}
        onChange={(value) => void navigate({ search: { tab: value as typeof tab } })}
        tabs={[
          { value: 'list', label: t('customers.title') },
          { value: 'groups', label: t('customers.groups') },
          { value: 'loyalty', label: t('customers.loyalty') },
        ]}
      >
        <TabPanel value="groups">
          <GroupsTab onEdit={setGroupForm} />
        </TabPanel>
        <TabPanel value="loyalty">
          <LoyaltyTab />
        </TabPanel>
        <TabPanel value="list">
          {summary ? (
            <div className="mb-3 grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
              <Figure label={t('customers.total')} value={summary.total} />
              <Figure label={t('customers.newThisWeek')} value={summary.newThisWeek} tone="ok" />
              <Figure
                label={t('customers.lapsed')}
                value={summary.lapsed}
                hint={t('customers.lapsedHint')}
                tone="warn"
              />
              {/* The one figure that is also a filter: who to congratulate this week. */}
              <Figure
                label={t('customers.birthdaysSoon')}
                value={summary.birthdaysSoon}
                icon={<Cake className="size-4" />}
                active={soon}
                onClick={() =>
                  void navigate({ search: (previous) => withFilter(previous, { birthdayIn: soon ? undefined : 7 }) })
                }
              />
            </div>
          ) : null}
          <DataTable
            columns={columns}
            data={list.data?.items}
            loading={list.isFetching}
            rowId={(row) => row.id}
            onRowOpen={canManage ? (row) => open(row.id) : undefined}
            exportAs={{ fileName: t('customers.title'), rows: () => fetchAll<CustomerDto>('/customers', filters) }}
            sort={search.sort ?? 'name'}
            order={search.order}
            onSortChange={(sort, order) =>
              void navigate({ search: (previous) => withFilter(previous, { sort, order }) })
            }
            preferenceKey="customers"
            rowClassName={(row) => (row.isActive ? undefined : 'text-ink-3')}
            pagination={{
              page: search.page,
              size: search.size,
              total: list.data?.total ?? 0,
              onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
              onSizeChange: (size) => void navigate({ search: (previous) => withFilter(previous, { size }) }),
            }}
            filters={{
              groups: (
                <FilterSelect
                  value={search.groupId ?? 'all'}
                  onChange={(groupId) =>
                    void navigate({
                      search: (previous) => withFilter(previous, { groupId: groupId === 'all' ? undefined : groupId }),
                    })
                  }
                  options={[
                    { value: 'all', label: t('common.all') },
                    ...(groups.data ?? []).map((group) => ({ value: group.id, label: group.name })),
                  ]}
                />
              ),
              status: (
                <FilterSelect
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
                />
              ),
            }}
            toolbar={
              <SearchInput
                value={search.q ?? ''}
                onChange={(q) =>
                  void navigate({ search: (previous) => withFilter(previous, { q: q || undefined }), replace: true })
                }
              />
            }
            empty={
              <EmptyState
                icon={UsersRound}
                title={search.q || soon ? t('common.nothingFound') : t('customers.empty')}
                hint={search.q || soon ? undefined : t('customers.emptyHint')}
              />
            }
          />
        </TabPanel>
      </Tabs>
      {edit && dialogCustomer !== undefined ? (
        <CustomerDialog
          key={edit}
          customer={dialogCustomer}
          groups={(groups.data ?? []).filter((group) => group.isActive)}
          onClose={() => open(undefined)}
          onSaved={refresh}
        />
      ) : null}
      {groupForm !== undefined ? <GroupDialog group={groupForm} onClose={() => setGroupForm(undefined)} /> : null}
    </Page>
  )
}

interface FigureProps {
  label: string
  value: number
  hint?: string
  tone?: 'ok' | 'warn'
  icon?: React.ReactNode
  /** The figure filters the list, and is doing so now. */
  active?: boolean
  onClick?: () => void
}

/** One number about the whole base; pressed, where it can be, it narrows the list to those it counts. */
function Figure({ label, value, hint, tone, icon, active, onClick }: FigureProps) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-xs text-ink-3">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          'tabular text-xl font-semibold',
          value && tone === 'ok' && 'text-ok',
          value && tone === 'warn' && 'text-warn',
        )}
      >
        {formatNumber(value)}
      </span>
      {hint ? <span className="text-[11px] text-ink-3">{hint}</span> : null}
    </>
  )
  const box = 'flex flex-col gap-0.5 rounded-lg border bg-surface px-4 py-3 text-left shadow-card'
  return onClick ? (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(box, 'transition-colors', active ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunken')}
    >
      {body}
    </button>
  ) : (
    <div className={cn(box, 'border-line')}>{body}</div>
  )
}

interface Values {
  name: string
  phone: string
  birthday: string
  gender: CustomerGender | ''
  note: string
  groupIds: string[]
  tags: string[]
}

export function CustomerDialog({
  customer,
  groups,
  onClose,
  onSaved,
}: {
  customer: CustomerDto | null
  /** The groups a customer can be put in. */
  groups: CustomerGroupDto[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const formId = 'customer-form'
  const form = useForm<Values>({
    defaultValues: {
      name: customer?.name ?? '',
      phone: customer?.phone ?? '',
      birthday: customer?.birthday ?? '',
      gender: customer?.gender ?? '',
      note: customer?.note ?? '',
      groupIds: customer?.groups.map((group) => group.id) ?? [],
      tags: customer?.tags ?? [],
    },
  })
  const errors = form.formState.errors

  const mutation = useMutation({
    mutationFn: (input: CustomerInput) =>
      customer ? api.put(`/customers/${customer.id}`, input) : api.post('/customers', input),
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
      title={customer ? t('customers.edit') : t('customers.add')}
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
      <Form
        id={formId}
        onSubmit={() =>
          void form.handleSubmit((values) => {
            const input = zodCheck(form, customerInputSchema, {
              ...values,
              birthday: values.birthday || null,
              gender: values.gender || null,
            })
            if (input) {
              mutation.mutate(input)
            }
          })()
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('customers.phone')} hint={t('customers.phoneHint')} error={errors.phone?.message} required>
            {(id) => (
              <Controller
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <PhoneInput
                    id={id}
                    autoFocus={!customer}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!errors.phone}
                  />
                )}
              />
            )}
          </Field>
          <Field label={t('customers.name')} error={errors.name?.message} required>
            {(id) => <Input id={id} invalid={!!errors.name} {...form.register('name')} />}
          </Field>
          <Field label={t('customers.birthday')} error={errors.birthday?.message}>
            {(id) => (
              <Controller
                control={form.control}
                name="birthday"
                render={({ field }) => <DateInput id={id} value={field.value} onChange={field.onChange} />}
              />
            )}
          </Field>
          <Field label={t('customers.gender')} error={errors.gender?.message}>
            {(id) => (
              <Controller
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <Select
                    id={id}
                    value={field.value || 'none'}
                    onChange={(value) => field.onChange(value === 'none' ? '' : value)}
                    options={[
                      { value: 'none', label: t('customers.genderNone') },
                      ...CUSTOMER_GENDERS.map((gender) => ({ value: gender, label: CUSTOMER_GENDER_LABELS[gender] })),
                    ]}
                  />
                )}
              />
            )}
          </Field>
        </div>
        {groups.length || customer?.groups.length ? (
          <Field label={t('customers.groups')} hint={t('customers.groupsHint')} error={errors.groupIds?.message}>
            {(id) => (
              <Controller
                control={form.control}
                name="groupIds"
                render={({ field }) => (
                  <Combobox
                    id={id}
                    multiple
                    options={[
                      ...groups,
                      // A group since archived stays on the customer until it is taken off them.
                      ...(customer?.groups.filter((group) => !groups.some((item) => item.id === group.id)) ?? []),
                    ].map((group) => ({ value: group.id, label: group.name }))}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            )}
          </Field>
        ) : null}
        <Field label={t('customers.tags')} hint={t('customers.tagsHint')} error={errors.tags?.message}>
          {(id) => (
            <Controller
              control={form.control}
              name="tags"
              render={({ field }) => (
                <TagInput
                  id={id}
                  value={field.value}
                  onChange={field.onChange}
                  parse={(text) => text.replace(/^#/, '').slice(0, 30) || null}
                  max={20}
                />
              )}
            />
          )}
        </Field>
        <Field label={t('partners.note')} error={errors.note?.message}>
          {(id) => <Textarea id={id} rows={2} {...form.register('note')} />}
        </Field>
      </Form>
    </Dialog>
  )
}
