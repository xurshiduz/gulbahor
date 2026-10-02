import {
  CURRENCIES,
  CURRENCY_CODES,
  formatMoney,
  PRICE_KIND_LABELS,
  PRICE_KINDS,
  priceTypeInputSchema,
  type CurrencyCode,
  type PriceKind,
  type PriceTypeDto,
  type PriceTypeInput,
} from '@gulbahor/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Archive, ArchiveRestore, Banknote, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Menu, Select } from '@/components/ui/controls'
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
import { useHotkey } from '@/lib/hotkeys'

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
      currency: type?.currency ?? 'UZS',
      // A new so'm price type rounds to the thousand, as the ready-made ones do.
      roundStep: type ? type.roundStep : 100_000,
      roundEnding: type?.roundEnding ?? 0,
    },
  })
  const errors = form.formState.errors
  const currency = form.watch('currency')

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
                    options={CURRENCY_CODES.map((code) => ({ value: code, label: CURRENCIES[code].symbol }))}
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
