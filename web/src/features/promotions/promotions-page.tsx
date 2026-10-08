import {
  formatMoney,
  PROMOTION_KIND_LABELS,
  PROMOTION_KINDS,
  PROMOTION_STATE_LABELS,
  PROMOTION_STATES,
  promotionInputSchema,
  SEASON_LABELS,
  SEASONS,
  todayIn,
  toIsoDate,
  type Page as PageOf,
  type ProductListItemDto,
  type PromotionDto,
  type PromotionInput,
  type PromotionKind,
  type PromotionState,
  type Season,
} from '@gulbahor/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { CirclePause, CirclePlay, Megaphone, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterSelect } from '@/components/ui/column-filters'
import { Combobox } from '@/components/ui/combobox'
import { Checkbox, Menu, Select, type MenuItem } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { DateInput } from '@/components/ui/date-input'
import { Dialog } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { NumberInput } from '@/components/ui/number-input'
import { Page, SearchInput } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { useBrands, useCategories, useCategoryOptions } from '@/features/catalog/catalog'
import { api, ApiError } from '@/lib/api'
import { base } from '@/lib/base'
import { formatDay, formatNumber } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { withFilter } from '@/lib/list-search'
import { toast } from '@/lib/toast'

const route = getRouteApi('/promotions')

const money = (minor: number) => formatMoney(minor, base(), { minor: 'auto' })

const TONES: Record<PromotionState, 'ok' | 'info' | 'neutral' | 'warn'> = {
  running: 'ok',
  scheduled: 'info',
  ended: 'neutral',
  stopped: 'warn',
}

/** What a promotion gives, in a few characters: "20%", "99 000 so'm", "3+ → 10%". */
export const gives = (promotion: { kind: PromotionKind; value: number; minQty?: number | null }) => {
  const percent = `${String(promotion.value).replace('.', ',')}%`
  return promotion.kind === 'price'
    ? money(promotion.value)
    : promotion.kind === 'quantity'
      ? `${promotion.minQty}+ → ${percent}`
      : percent
}

const useShops = () =>
  useQuery({
    queryKey: ['locations', 'options'],
    queryFn: ({ signal }) => api.get<{ id: string; name: string }[]>('/locations/options', undefined, signal),
  })

/**
 * Promotions: for a while, in some shops, some goods are cheaper. Set up
 * here, they start and end by themselves; the till takes them off without
 * being asked, and each shows what it has given so far.
 */
export function PromotionsPage() {
  const { t } = useTranslation()
  const { can } = useSession()
  const queryClient = useQueryClient()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const canManage = can('promotions.manage')
  const shops = useShops()

  const { edit, ...filters } = search
  const list = useQuery({
    queryKey: ['promotions', 'list', filters],
    queryFn: ({ signal }) => api.get<PageOf<PromotionDto>>('/promotions', filters, signal),
    placeholderData: keepPreviousData,
  })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['promotions'] })

  const setActive = useMutation({
    mutationFn: (promotion: PromotionDto) =>
      api.post(`/promotions/${promotion.id}/${promotion.isActive ? 'stop' : 'resume'}`),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (promotion: PromotionDto) => api.delete(`/promotions/${promotion.id}`),
    onSuccess: refresh,
  })

  const open = (value: string | undefined) => void navigate({ search: (previous) => ({ ...previous, edit: value }) })
  useHotkey('n', () => open('new'), {
    label: t('promotions.add'),
    group: t('shortcuts.groupList'),
    enabled: canManage && !edit,
  })

  const shopNames = useMemo(() => new Map((shops.data ?? []).map((shop) => [shop.id, shop.name])), [shops.data])

  const columns = useMemo<ColumnDef<PromotionDto>[]>(
    () => {
      const menu = (promotion: PromotionDto): MenuItem[] =>
        canManage
          ? [
              { label: t('common.edit'), icon: <Pencil />, onSelect: () => open(promotion.id) },
              promotion.isActive
                ? { label: t('promotions.stop'), icon: <CirclePause />, onSelect: () => setActive.mutate(promotion) }
                : { label: t('promotions.resume'), icon: <CirclePlay />, onSelect: () => setActive.mutate(promotion) },
              // One that has been on a receipt stays in the books: it can only be stopped.
              ...(promotion.sales
                ? []
                : [
                    {
                      label: t('common.delete'),
                      icon: <Trash2 />,
                      tone: 'danger' as const,
                      onSelect: () => remove.mutate(promotion),
                    },
                  ]),
            ]
          : []
      return [
        {
          id: 'name',
          header: t('promotions.name'),
          meta: { fixed: true },
          cell: ({ row }) => (
            <span className="font-medium">
              {row.original.name}
              {row.original.code ? (
                <span className="font-code ml-2 text-xs font-normal text-ink-3">{row.original.code}</span>
              ) : null}
            </span>
          ),
        },
        {
          id: 'gives',
          header: t('promotions.gives'),
          meta: { className: 'whitespace-nowrap' },
          cell: ({ row }) => (
            <span>
              <span className="tabular font-medium">{gives(row.original)}</span>
              <span className="text-xs text-ink-3"> · {PROMOTION_KIND_LABELS[row.original.kind]}</span>
              {row.original.stackable ? <span className="text-xs text-ink-3"> · {t('promotions.stacks')}</span> : null}
            </span>
          ),
        },
        {
          id: 'period',
          header: t('promotions.period'),
          meta: { className: 'tabular whitespace-nowrap text-ink-2' },
          cell: ({ row }) =>
            `${formatDay(row.original.startsOn)} — ${row.original.endsOn ? formatDay(row.original.endsOn) : t('promotions.openEnded')}`,
        },
        {
          id: 'shops',
          header: t('money.shops'),
          meta: { className: 'text-ink-2' },
          cell: ({ row }) =>
            row.original.locationIds.length
              ? row.original.locationIds.map((id) => shopNames.get(id) ?? '').join(', ')
              : t('money.everyShop'),
        },
        {
          id: 'state',
          header: t('common.status'),
          meta: { className: 'w-px whitespace-nowrap' },
          cell: ({ row }) => (
            <Badge tone={TONES[row.original.state]}>{PROMOTION_STATE_LABELS[row.original.state]}</Badge>
          ),
        },
        {
          id: 'given',
          header: t('promotions.given'),
          meta: { className: 'tabular text-right whitespace-nowrap', headerClassName: 'text-right' },
          cell: ({ row }) =>
            row.original.sales ? (
              <span>
                {money(row.original.given)}
                <span className="text-xs text-ink-3">
                  {' · '}
                  {t('promotions.receipts', { count: row.original.sales, number: formatNumber(row.original.sales) })}
                </span>
              </span>
            ) : (
              <span className="text-ink-3">—</span>
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
    [t, canManage, shopNames],
  )

  const editing = edit && edit !== 'new' ? list.data?.items.find((item) => item.id === edit) : null
  const single = useQuery({
    queryKey: ['promotions', 'one', edit],
    queryFn: ({ signal }) => api.get<PromotionDto>(`/promotions/${edit}`, undefined, signal),
    enabled: !!edit && edit !== 'new' && !editing && !list.isPending,
  })
  const dialogPromotion = edit === 'new' ? null : (editing ?? single.data ?? undefined)

  return (
    <Page
      title={t('promotions.title')}
      actions={
        canManage ? (
          <Button variant="primary" onClick={() => open('new')}>
            <Plus />
            {t('promotions.add')}
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
        preferenceKey="promotions"
        rowClassName={(row) => (row.state === 'ended' || row.state === 'stopped' ? 'text-ink-3' : undefined)}
        pagination={{
          page: search.page,
          size: search.size,
          total: list.data?.total ?? 0,
          onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
          onSizeChange: (size) => void navigate({ search: (previous) => withFilter(previous, { size }) }),
        }}
        filters={{
          state: (
            <FilterSelect
              value={search.state}
              onChange={(state) =>
                void navigate({ search: (previous) => withFilter(previous, { state: state as typeof search.state }) })
              }
              options={[
                { value: 'all', label: t('common.all') },
                ...PROMOTION_STATES.map((state) => ({ value: state, label: PROMOTION_STATE_LABELS[state] })),
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
            icon={Megaphone}
            title={search.q || search.state !== 'all' ? t('common.nothingFound') : t('promotions.empty')}
            hint={search.q || search.state !== 'all' ? undefined : t('promotions.emptyHint')}
          />
        }
      />
      {edit && dialogPromotion !== undefined ? (
        <PromotionDialog
          key={edit}
          promotion={dialogPromotion}
          shops={shops.data ?? []}
          onClose={() => open(undefined)}
          onSaved={refresh}
        />
      ) : null}
    </Page>
  )
}

interface DialogProps {
  promotion: PromotionDto | null
  shops: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}

function PromotionDialog({ promotion, shops, onClose, onSaved }: DialogProps) {
  const { t } = useTranslation()
  const { me } = useSession()
  const categories = useCategories()
  const brands = useBrands()
  const categoryOptions = useCategoryOptions(categories.data)

  const [name, setName] = useState(promotion?.name ?? '')
  const [kind, setKind] = useState<PromotionKind>(promotion?.kind ?? 'percent')
  const [value, setValue] = useState<number | null>(promotion?.value ?? null)
  const [minQty, setMinQty] = useState<number | null>(promotion?.minQty ?? null)
  const [startsOn, setStartsOn] = useState(promotion?.startsOn ?? toIsoDate(todayIn(me.org.timezone)))
  const [endsOn, setEndsOn] = useState(promotion?.endsOn ?? '')
  const [locationIds, setLocationIds] = useState(promotion?.locationIds ?? [])
  const [categoryIds, setCategoryIds] = useState(promotion?.categoryIds ?? [])
  const [brandIds, setBrandIds] = useState(promotion?.brandIds ?? [])
  const [seasons, setSeasons] = useState<string[]>(promotion?.seasons ?? [])
  const [products, setProducts] = useState(promotion?.products ?? [])
  const [stackable, setStackable] = useState(promotion?.stackable ?? false)
  const [code, setCode] = useState(promotion?.code ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: (input: PromotionInput) =>
      promotion ? api.put(`/promotions/${promotion.id}`, input) : api.post('/promotions', input),
    onSuccess: () => {
      onSaved()
      toast.success(t('common.saved'))
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) {
        setErrors(error.fields)
      }
    },
  })
  const submit = () => {
    const parsed = promotionInputSchema.safeParse({
      name,
      kind,
      value: value ?? 0,
      minQty: kind === 'quantity' ? minQty : null,
      startsOn,
      endsOn: endsOn || null,
      locationIds,
      productIds: products.map((product) => product.id),
      categoryIds,
      brandIds,
      seasons,
      stackable,
      code: code || null,
    })
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])))
      return
    }
    setErrors({})
    mutation.mutate(parsed.data)
  }

  const everything = !categoryIds.length && !brandIds.length && !seasons.length && !products.length

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={promotion ? t('promotions.edit') : t('promotions.add')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="promotion-form" variant="primary" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form id="promotion-form" onSubmit={submit}>
        <Field label={t('promotions.name')} hint={t('promotions.nameHint')} error={errors.name} required>
          {(id) => (
            <Input
              id={id}
              autoFocus
              value={name}
              maxLength={80}
              invalid={!!errors.name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('promotions.kind')} error={errors.kind}>
            {(id) => (
              <Select
                id={id}
                value={kind}
                onChange={(next) => {
                  // A percentage is not a price: what was typed for the one means nothing for the other.
                  if ((next === 'price') !== (kind === 'price')) {
                    setValue(null)
                  }
                  setKind(next as PromotionKind)
                }}
                options={PROMOTION_KINDS.map((item) => ({ value: item, label: PROMOTION_KIND_LABELS[item] }))}
                // What it gave on the receipts it is on stays what it was.
                disabled={!!promotion?.sales}
              />
            )}
          </Field>
          <Field
            label={
              kind === 'price'
                ? t('promotions.price')
                : kind === 'pair'
                  ? t('promotions.pairPercent')
                  : t('promotions.percent')
            }
            hint={kind === 'pair' ? t('promotions.pairHint') : undefined}
            error={errors.value}
            required
          >
            {(id) =>
              kind === 'price' ? (
                <MoneyInput id={id} value={value} onChange={setValue} currency={base()} invalid={!!errors.value} />
              ) : (
                <NumberInput id={id} value={value} onChange={setValue} decimals={2} max={100} suffix="%" />
              )
            }
          </Field>
          {kind === 'quantity' ? (
            <Field label={t('promotions.minQty')} hint={t('promotions.minQtyHint')} error={errors.minQty} required>
              {(id) => <NumberInput id={id} value={minQty} onChange={setMinQty} min={2} max={1000} />}
            </Field>
          ) : null}
          <Field label={t('promotions.startsOn')} error={errors.startsOn} required>
            {(id) => <DateInput id={id} value={startsOn} onChange={setStartsOn} invalid={!!errors.startsOn} />}
          </Field>
          <Field label={t('promotions.endsOn')} hint={t('promotions.endsOnHint')} error={errors.endsOn}>
            {(id) => <DateInput id={id} value={endsOn} onChange={setEndsOn} min={startsOn} invalid={!!errors.endsOn} />}
          </Field>
        </div>
        <Field label={t('money.shops')} hint={t('promotions.shopsHint')} error={errors.locationIds}>
          {(id) => (
            <Combobox
              id={id}
              multiple
              options={shops.map((shop) => ({ value: shop.id, label: shop.name }))}
              value={locationIds}
              onChange={setLocationIds}
              placeholder={t('money.everyShop')}
            />
          )}
        </Field>

        <div className="rounded-lg border border-line p-3">
          <p className="text-[13px] font-medium">{t('promotions.goods')}</p>
          <p className="mt-0.5 text-xs text-ink-3">
            {everything ? t('promotions.goodsAll') : t('promotions.goodsHint')}
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label={t('products.category')} error={errors.categoryIds}>
              {(id) => (
                <Combobox id={id} multiple options={categoryOptions} value={categoryIds} onChange={setCategoryIds} />
              )}
            </Field>
            <Field label={t('products.brand')} error={errors.brandIds}>
              {(id) => (
                <Combobox
                  id={id}
                  multiple
                  options={(brands.data ?? [])
                    .filter((brand) => brand.isActive || brandIds.includes(brand.id))
                    .map((brand) => ({ value: brand.id, label: brand.name }))}
                  value={brandIds}
                  onChange={setBrandIds}
                />
              )}
            </Field>
            <Field label={t('products.season')} error={errors.seasons}>
              {(id) => (
                <Combobox
                  id={id}
                  multiple
                  options={SEASONS.map((season: Season) => ({ value: season, label: SEASON_LABELS[season] }))}
                  value={seasons}
                  onChange={setSeasons}
                />
              )}
            </Field>
          </div>
          <div className="mt-4">
            <ProductList products={products} onChange={setProducts} error={errors.productIds} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('pos.promoCode')} hint={t('promotions.codeHint')} error={errors.code}>
            {(id) => (
              <Input
                id={id}
                value={code}
                maxLength={30}
                invalid={!!errors.code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                className="font-code uppercase"
              />
            )}
          </Field>
          <div className="flex items-end pb-1">
            <Checkbox
              checked={stackable}
              onChange={setStackable}
              label={t('promotions.stackable')}
              hint={t('promotions.stackableHint')}
            />
          </div>
        </div>
      </Form>
    </Dialog>
  )
}

interface Listed {
  id: string
  name: string
  sku: string
}

/** The models named one by one: found by typing, added to the list, taken off it with a click. */
function ProductList({
  products,
  onChange,
  error,
}: {
  products: Listed[]
  onChange: (products: Listed[]) => void
  error?: string
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')

  // Asked a moment after the typing stops.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(text.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [text])

  const found = useQuery({
    queryKey: ['products', 'promotion-pick', query],
    queryFn: ({ signal }) =>
      api.get<PageOf<ProductListItemDto>>('/products', { q: query, size: 8, status: 'active' }, signal),
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
  })
  const offered = (query.length >= 2 ? (found.data?.items ?? []) : []).filter(
    (item) => !products.some((product) => product.id === item.id),
  )

  return (
    <Field label={t('promotions.products')} hint={t('promotions.productsHint')} error={error}>
      {(id) => (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Input
              id={id}
              value={text}
              autoComplete="off"
              placeholder={t('promotions.productsSearch')}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  // Enter in the search adds the first model found: it must not save the promotion.
                  event.preventDefault()
                  event.stopPropagation()
                  if (offered[0]) {
                    onChange([...products, { id: offered[0].id, name: offered[0].name, sku: offered[0].sku }])
                    setText('')
                  }
                }
              }}
            />
            {text.trim().length >= 2 && offered.length ? (
              <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-float">
                {offered.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange([...products, { id: item.id, name: item.name, sku: item.sku }])
                      setText('')
                    }}
                    className="flex min-h-9 w-full items-center gap-3 rounded-md px-2 py-1 text-left text-[13px] hover:bg-sunken"
                  >
                    <span className="font-code w-20 shrink-0 truncate text-xs text-ink-3">{item.sku}</span>
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {products.length ? (
            <div className="flex flex-wrap gap-1.5">
              {products.map((product) => (
                <span
                  key={product.id}
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-sunken py-0.5 pr-0.5 pl-2 text-xs"
                >
                  <span className="font-code text-ink-3">{product.sku}</span>
                  {product.name}
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={t('common.delete')}
                    onClick={() => onChange(products.filter((item) => item.id !== product.id))}
                    className="rounded p-0.5 text-ink-3 hover:bg-surface hover:text-ink"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </Field>
  )
}
