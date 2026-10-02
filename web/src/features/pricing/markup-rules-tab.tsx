import {
  priceRuleInputSchema,
  SEASON_LABELS,
  SEASONS,
  type Markup,
  type PriceRuleDto,
  type PriceRuleInput,
  type PriceTypeDto,
  type Season,
} from '@gulbahor/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, Percent, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Menu, Select } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog, useConfirm } from '@/components/ui/dialog'
import { EmptyState, Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { NumberInput } from '@/components/ui/number-input'
import { useBrands, useCategories, useCategoryOptions, usePriceTypes } from '@/features/catalog/catalog'
import { api, ApiError } from '@/lib/api'
import { useHotkey } from '@/lib/hotkeys'

export const usePriceRules = () =>
  useQuery({
    queryKey: ['pricing', 'rules'],
    queryFn: ({ signal }) => api.get<PriceRuleDto[]>('/pricing/rules', undefined, signal),
  })

/** "+80%", "−15%": a markup as it is read. */
export const percentText = (percent: number) =>
  `${percent > 0 ? '+' : percent < 0 ? '−' : ''}${String(Math.abs(percent)).replace('.', ',')}%`

/** How a markup is entered: what it is counted from, and which way it goes. */
type Way = 'cost' | 'retail_less' | 'retail_more'

interface Row {
  way: Way
  /** Never negative: the way says the direction. */
  percent: number | null
}

const rowOf = (markup: Markup | undefined): Row =>
  markup
    ? {
        way: markup.base === 'cost' ? 'cost' : markup.percent < 0 ? 'retail_less' : 'retail_more',
        percent: Math.abs(markup.percent),
      }
    : { way: 'cost', percent: null }

/**
 * The rules prices are worked out by: goods of this category, this brand or
 * this season sell so far above cost. Of the rules that fit a model the one
 * that names the most about it is used.
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

  const markupText = (markup: Markup) =>
    markup.base === 'cost'
      ? `${t('pricing.fromCost')} ${percentText(markup.percent)}`
      : `${t('pricing.fromRetail')} ${percentText(markup.percent)}`

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
          return markup ? markupText(markup) : <span className="text-ink-3">—</span>
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
      <DataTable
        columns={columns}
        data={rules.data}
        loading={rules.isPending}
        rowId={(row) => row.id}
        onRowOpen={canManage ? (row) => setEditing(row) : undefined}
        toolbar={
          <>
            <p className="min-w-0 flex-1 text-xs text-ink-3">{t('pricing.rulesHint')}</p>
            {canManage ? (
              <Button variant="primary" onClick={() => setEditing('new')}>
                <Plus />
                {t('pricing.addRule')}
                <Shortcut combo="n" className="ml-1 opacity-70" />
              </Button>
            ) : null}
          </>
        }
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
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      types.map((type) => [type.id, rowOf(rule?.markups.find((markup) => markup.priceTypeId === type.id))]),
    ),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)

  const patchRow = (typeId: string, patch: Partial<Row>) => {
    setRows((current) => ({ ...current, [typeId]: { ...current[typeId], ...patch } }))
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
      markups: types.flatMap((type) => {
        const row = rows[type.id]
        return row.percent === null
          ? []
          : [
              {
                priceTypeId: type.id,
                base: row.way === 'cost' ? 'cost' : 'retail',
                percent: row.way === 'retail_less' ? -row.percent : row.percent,
              },
            ]
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
          {types.map((type, index) => {
            const row = rows[type.id]
            const error = errors[`markups.${index}.base`] ?? errors[`markups.${index}.priceTypeId`]
            return (
              <div key={type.id} className="grid items-start gap-3 sm:grid-cols-[10rem_1fr_8rem]">
                <p className="pt-2 text-[13px] font-medium">{type.name}</p>
                <Select
                  value={row.way}
                  onChange={(way) => patchRow(type.id, { way: way as Way })}
                  // The retail price is the one the others are counted from; it only ever comes from cost.
                  disabled={type.kind === 'retail'}
                  options={[
                    { value: 'cost', label: t('pricing.wayCost') },
                    { value: 'retail_less', label: t('pricing.wayRetailLess') },
                    { value: 'retail_more', label: t('pricing.wayRetailMore') },
                  ]}
                />
                <div>
                  <NumberInput
                    value={row.percent}
                    onChange={(percent) => patchRow(type.id, { percent })}
                    decimals={2}
                    max={row.way === 'retail_less' ? 99 : 10_000}
                    suffix="%"
                    placeholder="—"
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
