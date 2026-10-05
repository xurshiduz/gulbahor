import {
  partnerInputSchema,
  type CurrencyCode,
  type Page as PageOf,
  type PartnerDto,
  type PartnerInput,
} from '@gulbahor/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Archive,
  ArchiveRestore,
  ArrowDownLeft,
  ArrowUpRight,
  Handshake,
  MoreHorizontal,
  Pencil,
  Plus,
  ScrollText,
  Scale,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterSelect } from '@/components/ui/column-filters'
import { Checkbox, Menu, Select, type MenuItem } from '@/components/ui/controls'
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
import { cn } from '@/lib/cn'
import { fetchAll, moneyCell } from '@/lib/excel'
import { formatPhone } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { withFilter } from '@/lib/list-search'
import { toast } from '@/lib/toast'

import { OpeningDialog, PaymentDialog, StatementDialog, useDebtText } from './payments'

const route = getRouteApi('/partners')

/** What is open over the list besides the partner's own card. */
type Over =
  | { kind: 'statement'; partner: PartnerDto }
  // `back`: the payment was started from the account, and the account comes back when it is done.
  | { kind: 'in' | 'out'; partner: PartnerDto; back?: boolean }
  | { kind: 'opening'; partner: PartnerDto }

export function PartnersPage() {
  const { t } = useTranslation()
  const { can } = useSession()
  const queryClient = useQueryClient()
  const debtText = useDebtText()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const canManage = can('partners.manage')
  const canDebts = can('partners.debts')
  const canPay = can('partners.pay')
  const canAdjust = can('partners.adjust')
  const [over, setOver] = useState<Over | null>(null)

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
    enabled: canManage && !edit && !over,
  })

  const columns = useMemo<ColumnDef<PartnerDto>[]>(
    () => {
      const menu = (partner: PartnerDto): MenuItem[] => [
        ...(canDebts
          ? [
              {
                label: t('payments.statement'),
                icon: <ScrollText />,
                onSelect: () => setOver({ kind: 'statement', partner }),
              },
            ]
          : []),
        ...(canPay && partner.isActive
          ? [
              {
                label: t('payments.takeIn'),
                icon: <ArrowDownLeft />,
                onSelect: () => setOver({ kind: 'in', partner }),
              },
              {
                label: t('payments.payOut'),
                icon: <ArrowUpRight />,
                onSelect: () => setOver({ kind: 'out', partner }),
              },
            ]
          : []),
        ...(canAdjust && partner.isActive
          ? [{ label: t('payments.opening'), icon: <Scale />, onSelect: () => setOver({ kind: 'opening', partner }) }]
          : []),
        ...(canManage
          ? [
              { label: t('common.edit'), icon: <Pencil />, onSelect: () => open(partner.id) },
              partner.isActive
                ? {
                    label: t('common.archive'),
                    icon: <Archive />,
                    onSelect: () => setActive.mutate({ id: partner.id, active: false }),
                  }
                : {
                    label: t('common.restore'),
                    icon: <ArchiveRestore />,
                    onSelect: () => setActive.mutate({ id: partner.id, active: true }),
                  },
            ]
          : []),
      ]

      const balance: ColumnDef<PartnerDto>[] = canDebts
        ? [
            {
              id: 'balance',
              header: t('partners.balance'),
              meta: {
                // Signed, as the books keep it: above zero they owe, below it they are owed.
                export: (row) => moneyCell(row.balance, row.currency),
                className: 'tabular text-right whitespace-nowrap',
                headerClassName: 'text-right',
              },
              cell: ({ row }) => {
                const owed = row.original.balance ?? 0
                return (
                  <span
                    className={cn(owed > 0 && 'font-medium text-bad', owed < 0 && 'font-medium', !owed && 'text-ink-3')}
                  >
                    {debtText(owed, row.original.currency)}
                  </span>
                )
              },
            },
          ]
        : []

      return [
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
          meta: {
            export: (row) => (row.phone ? formatPhone(row.phone) : null),
            className: 'tabular whitespace-nowrap',
          },
          cell: ({ row }) =>
            row.original.phone ? formatPhone(row.original.phone) : <span className="text-ink-3">—</span>,
        },
        ...balance,
        {
          id: 'currency',
          header: t('partners.currency'),
          meta: { export: (row) => row.currency, className: 'w-px text-ink-2' },
          cell: ({ row }) => row.original.currency,
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
    [t, canManage, canDebts, canPay, canAdjust],
  )

  const editing = edit && edit !== 'new' ? list.data?.items.find((item) => item.id === edit) : null
  const single = useQuery({
    queryKey: ['partners', 'one', edit],
    queryFn: ({ signal }) => api.get<PartnerDto>(`/partners/${edit}`, undefined, signal),
    enabled: !!edit && edit !== 'new' && !editing && !list.isPending,
  })
  const dialogPartner = edit === 'new' ? null : (editing ?? single.data ?? undefined)

  // A partner opens on their account for those who keep it, on their card for the rest.
  const onRowOpen = canDebts
    ? (row: PartnerDto) => setOver({ kind: 'statement', partner: row })
    : canManage
      ? (row: PartnerDto) => open(row.id)
      : undefined

  return (
    <Page
      title={t('partners.title')}
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
        onRowOpen={onRowOpen}
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
        filters={{
          roles: (
            <FilterSelect
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
            />
          ),
          balance: (
            <FilterSelect
              value={search.debt ?? 'all'}
              onChange={(debt) =>
                void navigate({
                  search: (previous) =>
                    withFilter(previous, { debt: debt === 'all' ? undefined : (debt as 'owes' | 'owed') }),
                })
              }
              options={[
                { value: 'all', label: t('common.all') },
                { value: 'owes', label: t('partners.owes') },
                { value: 'owed', label: t('partners.owed') },
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
          <>
            <SearchInput
              value={search.q ?? ''}
              onChange={(q) =>
                void navigate({ search: (previous) => withFilter(previous, { q: q || undefined }), replace: true })
              }
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
      {over?.kind === 'statement' ? (
        <StatementDialog
          partnerId={over.partner.id}
          onClose={() => setOver(null)}
          onPay={(kind) => setOver({ kind, partner: over.partner, back: true })}
        />
      ) : null}
      {over?.kind === 'in' || over?.kind === 'out' ? (
        <PaymentDialog
          partnerId={over.partner.id}
          kind={over.kind}
          onClose={() => setOver(over.back ? { kind: 'statement', partner: over.partner } : null)}
        />
      ) : null}
      {over?.kind === 'opening' ? <OpeningDialog partner={over.partner} onClose={() => setOver(null)} /> : null}
    </Page>
  )
}

interface Values {
  name: string
  phone: string
  isSupplier: boolean
  isBuyer: boolean
  currency: CurrencyCode
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
      currency: partner?.currency ?? 'UZS',
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
        <div className="grid gap-4 sm:grid-cols-2">
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
          {/* The currency the account is kept in: it cannot change once anything is owed either way. */}
          <Field label={t('partners.currency')} error={errors.currency?.message}>
            {(id) => (
              <Controller
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <Select
                    id={id}
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!errors.currency}
                    options={[
                      { value: 'UZS', label: t('partners.currencyUzs') },
                      { value: 'USD', label: t('partners.currencyUsd') },
                    ]}
                  />
                )}
              />
            )}
          </Field>
        </div>
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
