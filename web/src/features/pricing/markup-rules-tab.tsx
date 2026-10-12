import {
  formulaText,
  priceRuleInputSchema,
  SEASON_LABELS,
  SEASONS,
  type PriceRuleDto,
  type PriceRuleInput,
  type PriceTypeDto,
  type Season,
} from '@erp/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, Percent, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Menu, Select } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog, useConfirm } from '@/components/ui/dialog'
import { EmptyState, Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { PageActions } from '@/components/ui/page'
import { useBrands, useCategories, useCategoryOptions, usePriceTypes } from '@/features/catalog/catalog'
import { api, ApiError } from '@/lib/api'
import { useHotkey } from '@/lib/hotkeys'
import { toast } from '@/lib/toast'

import { FormulaFields, formulaOf, formulaRowOf, type FormulaRow } from './formula-fields'

export const usePriceRules = () =>
  useQuery({
    queryKey: ['pricing', 'rules'],
    queryFn: ({ signal }) => api.get<PriceRuleDto[]>('/pricing/rules', undefined, signal),
  })

/** "+80%", "−15%": a markup as it is read. */
export const percentText = (percent: number) =>
  `${percent > 0 ? '+' : percent < 0 ? '−' : ''}${String(Math.abs(percent)).replace('.', ',')}%`

/**
 * The rules prices are worked out by: goods of this category, this brand or
 * this season sell so far above cost, so far from the retail price, or at a
 * price named outright. Of the rules that fit a model the one that names the
 * most about it is used; the rule for everything is each price type's own way.
 */
export function MarkupRulesTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const rules = usePriceRules()
  const priceTypes = usePriceTypes()
  const [editing, setEditing] = useState<PriceRuleDto | 'new' | null>(null)

  const types = useMemo(() => (priceTypes.data ?? []).filter((type) => type.isActive), [priceTypes.data])
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['pricing'] })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/pricing/rules/${id}`),
    onSuccess: refresh,
  })

  useHotkey('n', () => setEditing('new'), {
    label: t('pricing.addRule'),
    group: t('shortcuts.groupList'),
    enabled: canManage && !editing,
  })

  const columns = useMemo<ColumnDef<PriceRuleDto>[]>(
    () => [
      {
        id: 'scope',
        header: t('pricing.ruleScope'),
        meta: { fixed: true },
        cell: ({ row }) => {
          const parts = [
            row.original.categoryName,
            row.original.brandName,
            row.original.season ? SEASON_LABELS[row.original.season] : null,
          ].filter(Boolean)
          return parts.length ? (
            <span className="font-medium">{parts.join(' · ')}</span>
          ) : (
            <span className="font-medium text-ink-2">{t('pricing.everything')}</span>
          )
        },
      },
      ...types.map((type): ColumnDef<PriceRuleDto> => ({
        id: type.id,
        header: type.name,
        meta: { className: 'tabular whitespace-nowrap' },
        cell: ({ row }) => {
          const markup = row.original.markups.find((item) => item.priceTypeId === type.id)
          return markup ? formulaText(markup, type.currency) : <span className="text-ink-3">—</span>
        },
      })),
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
                  {
                    label: t('common.delete'),
                    icon: <Trash2 />,
                    tone: 'danger',
                    onSelect: async () => {
                      if (
                        await confirm({
                          title: t('pricing.deleteRuleConfirm'),
                          confirmLabel: t('common.delete'),
                          tone: 'danger',
                        })
                      ) {
                        remove.mutate(row.original.id)
                      }
                    },
                  },
                ]}
              />
            </span>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage, types],
  )

  return (
    <>
      <PageActions>
        {canManage ? (
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus />
            {t('pricing.addRule')}
            <Shortcut combo="n" className="ml-1 opacity-70" />
          </Button>
        ) : null}
      </PageActions>
      <DataTable
        columns={columns}
        data={rules.data}
        loading={rules.isPending}
        rowId={(row) => row.id}
        onRowOpen={canManage ? (row) => setEditing(row) : undefined}
        empty={<EmptyState icon={Percent} title={t('pricing.noRules')} hint={t('pricing.noRulesHint')} />}
      />
      {editing ? (
        <RuleDialog
          rule={editing === 'new' ? null : editing}
          types={types}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
    </>
  )
}

function RuleDialog({
  rule,
  types,
  onClose,
  onSaved,
}: {
  rule: PriceRuleDto | null
  types: PriceTypeDto[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const categories = useCategories()
  const brands = useBrands()
  const categoryOptions = useCategoryOptions(categories.data, rule?.categoryId)

  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? null)
  const [brandId, setBrandId] = useState(rule?.brandId ?? null)
  const [season, setSeason] = useState<Season | 'any'>(rule?.season ?? 'any')
  const [rows, setRows] = useState<Record<string, FormulaRow>>(() =>
    Object.fromEntries(
      types.map((type) => [type.id, formulaRowOf(rule?.markups.find((markup) => markup.priceTypeId === type.id))]),
    ),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)

  const setRow = (typeId: string, row: FormulaRow) => {
    setRows((current) => ({ ...current, [typeId]: row }))
    setDirty(true)
  }

  const mutation = useMutation({
    mutationFn: (input: PriceRuleInput) =>
      rule ? api.put(`/pricing/rules/${rule.id}`, input) : api.post('/pricing/rules', input),
    meta: { silent: true },
    onSuccess: () => {
      onSaved()
      toast.success(t('common.saved'))
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setErrors(error.fields ?? {})
        toast.error(error.message)
      }
    },
  })

  const submit = () => {
    const parsed = priceRuleInputSchema.safeParse({
      categoryId,
      brandId,
      season: season === 'any' ? null : season,
      // A type left at "no rule" is not in the rule; a price named outright with no sum is caught by the check.
      markups: types.flatMap((type) => {
        const row = rows[type.id]
        const formula = formulaOf(row)
        return row.way === 'none'
          ? []
          : [{ priceTypeId: type.id, ...(formula ?? { base: 'fixed', percent: 0, amount: 0 }) }]
      }),
    })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message)
      return
    }
    setErrors({})
    mutation.mutate(parsed.data)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={rule ? t('pricing.editRule') : t('pricing.addRule')}
      description={t('pricing.ruleHint')}
      size="lg"
      dirty={dirty && !mutation.isSuccess}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="price-rule-form" variant="primary" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form id="price-rule-form" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('products.category')} error={errors.categoryId}>
            {(id) => (
              <Combobox
                id={id}
                autoFocus
                options={categoryOptions}
                value={categoryId}
                onChange={(value) => {
                  setCategoryId(value)
                  setDirty(true)
                }}
                placeholder={t('pricing.any')}
                invalid={!!errors.categoryId}
              />
            )}
          </Field>
          <Field label={t('products.brand')} error={errors.brandId}>
            {(id) => (
              <Combobox
                id={id}
                options={(brands.data ?? [])
                  .filter((brand) => brand.isActive || brand.id === brandId)
                  .map((brand) => ({ value: brand.id, label: brand.name }))}
                value={brandId}
                onChange={(value) => {
                  setBrandId(value)
                  setDirty(true)
                }}
                placeholder={t('pricing.any')}
              />
            )}
          </Field>
          <Field label={t('products.season')}>
            {(id) => (
              <Select
                id={id}
                value={season}
                onChange={(value) => {
                  setSeason(value as Season | 'any')
                  setDirty(true)
                }}
                options={[
                  { value: 'any', label: t('pricing.any') },
                  ...SEASONS.map((item) => ({ value: item, label: SEASON_LABELS[item] })),
                ]}
              />
            )}
          </Field>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
          <p className="eyebrow">{t('pricing.markups')}</p>
          {types.map((type) => {
            // The server names a markup by its place among those sent: the types left at "no rule" are not sent.
            const sent = types.filter((item) => rows[item.id].way !== 'none')
            const index = sent.indexOf(type)
            const error =
              index === -1
                ? undefined
                : (errors[`markups.${index}.base`] ??
                  errors[`markups.${index}.amount`] ??
                  errors[`markups.${index}.priceTypeId`])
            return (
              <div key={type.id} data-rule-type={type.id} className="grid items-start gap-3 sm:grid-cols-[9rem_1fr]">
                <p className="pt-2 text-[13px] font-medium">{type.name}</p>
                <div>
                  <FormulaFields
                    value={rows[type.id]}
                    onChange={(row) => setRow(type.id, row)}
                    currency={type.currency}
                    noneLabel={t('pricing.wayNone')}
                    // The retail price is the one the others are counted from: it is never worked out from itself.
                    ways={type.kind === 'retail' ? ['none', 'cost', 'fixed'] : undefined}
                    invalid={!!error}
                  />
                  {error ? <p className="mt-1 text-xs text-bad">{error}</p> : null}
                </div>
              </div>
            )
          })}
          <p className="text-xs text-ink-3">{t('pricing.markupsHint')}</p>
        </div>
      </Form>
    </Dialog>
  )
}
