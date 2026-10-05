import {
  customerGroupInputSchema,
  TILL_PRICE_KINDS,
  type CustomerGroupDto,
  type CustomerGroupInput,
} from '@gulbahor/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Archive, ArchiveRestore, Pencil, UsersRound } from 'lucide-react'
import { useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox, Select } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog } from '@/components/ui/dialog'
import { Badge, EmptyState } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, zodCheck } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useSession } from '@/features/auth/session'
import { usePriceTypes } from '@/features/catalog/catalog'
import { api } from '@/lib/api'
import { formatNumber } from '@/lib/format'
import { toast } from '@/lib/toast'

export function useCustomerGroups(enabled = true) {
  return useQuery({
    queryKey: ['customers', 'groups'],
    queryFn: ({ signal }) => api.get<CustomerGroupDto[]>('/customers/groups', undefined, signal),
    enabled,
  })
}

/** What is not done for a group's members, as short marks. */
const BARS = [
  ['noDebt', 'customers.noDebt'],
  ['noLayaway', 'customers.noLayaway'],
  ['noExchange', 'customers.noExchange'],
] as const

/**
 * The groups customers are put in. A group gives rules, and the till keeps
 * them by itself: its price prices the cart, its reminder is shown to the
 * cashier, and what is not done for its members is refused.
 */
export function GroupsTab({ onEdit }: { onEdit: (group: CustomerGroupDto) => void }) {
  const { t } = useTranslation()
  const { can } = useSession()
  const queryClient = useQueryClient()
  const groups = useCustomerGroups()
  const canManage = can('customers.manage')

  const setActive = useMutation({
    mutationFn: (group: CustomerGroupDto) =>
      api.post(`/customers/groups/${group.id}/${group.isActive ? 'archive' : 'restore'}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['customers'] }),
  })

  const columns = useMemo<ColumnDef<CustomerGroupDto>[]>(
    () => [
      {
        id: 'name',
        header: t('customers.groupName'),
        meta: { fixed: true },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'members',
        header: t('customers.members'),
        meta: { className: 'tabular text-right text-ink-2', headerClassName: 'text-right' },
        cell: ({ row }) => formatNumber(row.original.members),
      },
      {
        id: 'priceType',
        header: t('customers.groupPrice'),
        cell: ({ row }) =>
          row.original.priceTypeName ? (
            <Badge tone="accent">{row.original.priceTypeName}</Badge>
          ) : (
            <span className="text-ink-3">{t('pos.retailPrice')}</span>
          ),
      },
      {
        id: 'reminder',
        header: t('customers.reminder'),
        meta: { className: 'text-ink-2' },
        cell: ({ row }) => row.original.reminder ?? '',
      },
      {
        id: 'bars',
        header: t('customers.bars'),
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            {BARS.map(([key, label]) =>
              row.original[key] ? (
                <Badge key={key} tone="warn">
                  {t(label)}
                </Badge>
              ) : null,
            )}
          </span>
        ),
      },
      {
        id: 'status',
        header: t('common.status'),
        meta: { className: 'w-px whitespace-nowrap' },
        cell: ({ row }) => (row.original.isActive ? null : <Badge>{t('common.archived')}</Badge>),
      },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px whitespace-nowrap' },
        cell: ({ row }) =>
          canManage ? (
            <span className="flex justify-end gap-1">
              <Button variant="ghost" size="iconSm" aria-label={t('common.edit')} onClick={() => onEdit(row.original)}>
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={row.original.isActive ? t('common.archive') : t('common.restore')}
                onClick={() => setActive.mutate(row.original)}
              >
                {row.original.isActive ? <Archive /> : <ArchiveRestore />}
              </Button>
            </span>
          ) : null,
      },
    ],
    [t, canManage, onEdit, setActive],
  )

  return (
    <DataTable
      columns={columns}
      data={groups.data}
      loading={groups.isFetching}
      rowId={(row) => row.id}
      onRowOpen={canManage ? onEdit : undefined}
      preferenceKey="customer-groups"
      rowClassName={(row) => (row.isActive ? undefined : 'text-ink-3')}
      empty={<EmptyState icon={UsersRound} title={t('customers.noGroups')} hint={t('customers.noGroupsHint')} />}
    />
  )
}

interface Values {
  name: string
  priceTypeId: string
  reminder: string
  noDebt: boolean
  noLayaway: boolean
  noExchange: boolean
}

const RETAIL = 'retail'

export function GroupDialog({ group, onClose }: { group: CustomerGroupDto | null; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const priceTypes = usePriceTypes()
  const formId = 'customer-group-form'
  const form = useForm<Values>({
    defaultValues: {
      name: group?.name ?? '',
      priceTypeId: group?.priceTypeId ?? RETAIL,
      reminder: group?.reminder ?? '',
      noDebt: group?.noDebt ?? false,
      noLayaway: group?.noLayaway ?? false,
      noExchange: group?.noExchange ?? false,
    },
  })
  const errors = form.formState.errors
  // A price a group's members buy at: any the business keeps beside the retail one and the floor.
  const prices = (priceTypes.data ?? []).filter(
    (type) => (type.isActive && TILL_PRICE_KINDS.includes(type.kind)) || type.id === group?.priceTypeId,
  )

  const mutation = useMutation({
    mutationFn: (input: CustomerGroupInput) =>
      group ? api.put(`/customers/groups/${group.id}`, input) : api.post('/customers/groups', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success(t('common.saved'))
      onClose()
    },
    onError: (error) => void applyServerErrors(error, form),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={group ? t('customers.editGroup') : t('customers.addGroup')}
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
            const input = zodCheck(form, customerGroupInputSchema, {
              ...values,
              // "Retail" in the list is no price type of its own: the group has none.
              priceTypeId: values.priceTypeId === RETAIL ? null : values.priceTypeId,
            })
            if (input) {
              mutation.mutate(input)
            }
          })()
        }
      >
        <Field label={t('customers.groupName')} error={errors.name?.message} required>
          {(id) => <Input id={id} autoFocus invalid={!!errors.name} {...form.register('name')} />}
        </Field>
        <Field
          label={t('customers.groupPrice')}
          hint={t('customers.groupPriceHint')}
          error={errors.priceTypeId?.message}
        >
          {(id) => (
            <Controller
              control={form.control}
              name="priceTypeId"
              render={({ field }) => (
                <Select
                  id={id}
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: RETAIL, label: t('pos.retailPrice') },
                    ...prices.map((type) => ({ value: type.id, label: type.name })),
                  ]}
                />
              )}
            />
          )}
        </Field>
        <Field label={t('customers.reminder')} hint={t('customers.reminderHint')} error={errors.reminder?.message}>
          {(id) => <Input id={id} maxLength={200} {...form.register('reminder')} />}
        </Field>
        <Field label={t('customers.bars')} hint={t('customers.barsHint')}>
          {() => (
            <div className="flex flex-col gap-2">
              {BARS.map(([key, label]) => (
                <Controller
                  key={key}
                  control={form.control}
                  name={key}
                  render={({ field }) => <Checkbox checked={field.value} onChange={field.onChange} label={t(label)} />}
                />
              ))}
            </div>
          )}
        </Field>
      </Form>
    </Dialog>
  )
}
