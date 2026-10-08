import {
  cashSteps,
  CURRENCIES,
  formatMoney,
  PRICE_KIND_LABELS,
  PRICE_KINDS,
  priceTypeInputSchema,
  TILL_ACCESS,
  TILL_ACCESS_LABELS,
  TILL_PRICE_KINDS,
  tillCurrencies,
  type CurrencyCode,
  type PriceKind,
  type PriceTypeDto,
  type PriceTypeInput,
  type TillAccess,
} from '@erp/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Archive, ArchiveRestore, Banknote, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Menu, Select, Switch } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog, useConfirm } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, zodCheck } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { PageActions } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { base } from '@/lib/base'
import { useHotkey } from '@/lib/hotkeys'
import { toast } from '@/lib/toast'

import { usePriceTypes } from './catalog'

export function PriceTypesTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const priceTypes = usePriceTypes()
  const [editing, setEditing] = useState<PriceTypeDto | 'new' | null>(null)

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['price-types'] })

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post(`/price-types/${id}/${active ? 'restore' : 'archive'}`),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/price-types/${id}`),
    onSuccess: () => {
      refresh()
      toast.success(t('references.deleted'))
    },
  })

  useHotkey('n', () => setEditing('new'), {
    label: t('references.addPriceType'),
    group: t('shortcuts.groupList'),
    enabled: canManage && !editing,
  })

  const columns = useMemo<ColumnDef<PriceTypeDto>[]>(
    () => [
      {
        id: 'name',
        header: t('references.name'),
        meta: { fixed: true },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'kind',
        header: t('references.priceKind'),
        cell: ({ row }) => (
          <Badge tone={row.original.kind === 'retail' ? 'accent' : row.original.kind === 'min' ? 'warn' : 'neutral'}>
            {PRICE_KIND_LABELS[row.original.kind]}
          </Badge>
        ),
      },
      {
        id: 'currency',
        header: t('references.currency'),
        meta: { className: 'text-ink-2' },
        cell: ({ row }) => CURRENCIES[row.original.currency].symbol,
      },
      {
        id: 'till',
        header: t('references.tillAccess'),
        meta: { className: 'text-ink-2' },
        cell: ({ row }) =>
          row.original.kind === 'retail' ? (
            t('references.tillRetail')
          ) : row.original.tillAccess === 'none' ? (
            <span className="text-ink-3">{TILL_ACCESS_LABELS.none}</span>
          ) : (
            TILL_ACCESS_LABELS[row.original.tillAccess]
          ),
      },
      {
        id: 'rounding',
        header: t('references.rounding'),
        meta: { className: 'tabular text-ink-2 whitespace-nowrap' },
        cell: ({ row }) => {
          const { roundStep, roundEnding, currency } = row.original
          if (!roundStep) {
            return <span className="text-ink-3">{t('references.roundNone')}</span>
          }
          return roundEnding
            ? `…${formatMoney(roundEnding, currency, { symbol: false })}`
            : formatMoney(roundStep, currency, { minor: 'auto' })
        },
      },
      {
        id: 'status',
        header: t('common.status'),
        meta: { className: 'w-px' },
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
                  { label: t('common.edit'), icon: <Pencil />, onSelect: () => setEditing(row.original) },
                  // The till always needs a retail price to start from.
                  ...(row.original.kind === 'retail'
                    ? []
                    : [
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
                        'separator' as const,
                        {
                          label: t('common.delete'),
                          icon: <Trash2 />,
                          tone: 'danger' as const,
                          onSelect: async () => {
                            if (
                              await confirm({
                                title: t('references.deleteConfirm', { name: row.original.name }),
                                confirmLabel: t('common.delete'),
                                tone: 'danger',
                              })
                            ) {
                              remove.mutate(row.original.id)
                            }
                          },
                        },
                      ]),
                ]}
              />
            </span>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage],
  )

  return (
    <>
      <PageActions>
        {canManage ? (
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus />
            {t('references.addPriceType')}
            <Shortcut combo="n" className="ml-1 opacity-70" />
          </Button>
        ) : null}
      </PageActions>
      <DataTable
        columns={columns}
        data={priceTypes.data}
        loading={priceTypes.isPending}
        rowId={(row) => row.id}
        onRowOpen={canManage ? (row) => setEditing(row) : undefined}
        rowClassName={(row) => (row.isActive ? undefined : 'text-ink-3')}
        empty={<EmptyState icon={Banknote} title={t('common.empty')} />}
      />
      {editing ? (
        <PriceTypeDialog
          type={editing === 'new' ? null : editing}
          taken={new Set((priceTypes.data ?? []).map((type) => type.kind))}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
    </>
  )
}

interface Values {
  name: string
  kind: PriceKind
  currency: CurrencyCode
  roundStep: number | null
  roundEnding: number | null
  tillAccess: TillAccess
  skipsFloor: boolean
}

function PriceTypeDialog({
  type,
  taken,
  onClose,
  onSaved,
}: {
  type: PriceTypeDto | null
  taken: Set<PriceKind>
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const { hasModule } = useSession()
  const formId = 'price-type-form'
  const form = useForm<Values>({
    defaultValues: {
      name: type?.name ?? '',
      kind: type?.kind ?? (taken.has('wholesale') ? 'other' : 'wholesale'),
      currency: type?.currency ?? base(),
      // A new price type rounds as the ready-made ones do: so'm to the thousand, tenge to the hundred.
      roundStep: type ? type.roundStep : cashSteps(base()).price,
      roundEnding: type?.roundEnding ?? 0,
      tillAccess: type?.tillAccess ?? 'none',
      skipsFloor: type?.skipsFloor ?? false,
    },
  })
  const errors = form.formState.errors
  const currency = form.watch('currency')
  // The retail price is the till's own and the floor is never sold at: only the others are offered there.
  const sellable = TILL_PRICE_KINDS.includes(form.watch('kind'))
  const tillAccess = form.watch('tillAccess')

  // There is one retail and one minimum type; they are offered only to the type that already is one.
  const kinds = PRICE_KINDS.filter(
    (kind) => kind === type?.kind || !((kind === 'retail' || kind === 'min') && taken.has(kind)),
  )

  const mutation = useMutation({
    mutationFn: (input: PriceTypeInput) =>
      type ? api.put(`/price-types/${type.id}`, input) : api.post('/price-types', input),
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
      size="sm"
      title={type ? t('references.editPriceType') : t('references.addPriceType')}
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
            const input = zodCheck(form, priceTypeInputSchema, {
              ...values,
              roundStep: values.roundStep ?? 0,
              roundEnding: values.roundEnding ?? 0,
              tillAccess: sellable ? values.tillAccess : 'none',
              skipsFloor: sellable && values.tillAccess !== 'none' && values.skipsFloor,
            })
            if (input) {
              mutation.mutate(input)
            }
          })()
        }
      >
        <Field label={t('references.name')} error={errors.name?.message} required>
          {(id) => <Input id={id} autoFocus invalid={!!errors.name} {...form.register('name')} />}
        </Field>
        <Field label={t('references.priceKind')} hint={t('references.priceKindHint')} error={errors.kind?.message}>
          {(id) => (
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <Select
                  id={id}
                  value={field.value}
                  onChange={field.onChange}
                  options={kinds.map((kind) => ({ value: kind, label: PRICE_KIND_LABELS[kind] }))}
                  disabled={type?.kind === 'retail'}
                  invalid={!!errors.kind}
                />
              )}
            />
          )}
        </Field>
        {sellable ? (
          <>
            <Field
              label={t('references.tillAccess')}
              hint={t('references.tillAccessHint')}
              error={errors.tillAccess?.message}
            >
              {(id) => (
                <Controller
                  control={form.control}
                  name="tillAccess"
                  render={({ field }) => (
                    <Select
                      id={id}
                      value={field.value}
                      onChange={field.onChange}
                      options={TILL_ACCESS.map((access) => ({ value: access, label: TILL_ACCESS_LABELS[access] }))}
                    />
                  )}
                />
              )}
            </Field>
            {tillAccess !== 'none' ? (
              <Controller
                control={form.control}
                name="skipsFloor"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onChange={field.onChange}
                    label={t('references.skipsFloor')}
                    hint={t('references.skipsFloorHint')}
                  />
                )}
              />
            ) : null}
          </>
        ) : null}
        {hasModule('usd') || type?.currency === 'USD' ? (
          <Field label={t('references.currency')} hint={t('references.currencyHint')} error={errors.currency?.message}>
            {(id) => (
              <Controller
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <Select
                    id={id}
                    value={field.value}
                    onChange={field.onChange}
                    options={tillCurrencies(base()).map((code) => ({ value: code, label: CURRENCIES[code].symbol }))}
                  />
                )}
              />
            )}
          </Field>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('references.roundStep')}
            hint={t('references.roundStepHint')}
            error={errors.roundStep?.message}
          >
            {(id) => (
              <Controller
                control={form.control}
                name="roundStep"
                render={({ field }) => (
                  <MoneyInput
                    id={id}
                    value={field.value}
                    onChange={field.onChange}
                    currency={currency}
                    invalid={!!errors.roundStep}
                  />
                )}
              />
            )}
          </Field>
          <Field
            label={t('references.roundEnding')}
            hint={t('references.roundEndingHint')}
            error={errors.roundEnding?.message}
          >
            {(id) => (
              <Controller
                control={form.control}
                name="roundEnding"
                render={({ field }) => (
                  <MoneyInput
                    id={id}
                    value={field.value}
                    onChange={field.onChange}
                    currency={currency}
                    invalid={!!errors.roundEnding}
                  />
                )}
              />
            )}
          </Field>
        </div>
      </Form>
    </Dialog>
  )
}
