import {
  GENDER_LABELS,
  GENDERS,
  ORIGIN_COUNTRIES,
  productInputSchema,
  SEASON_LABELS,
  SEASONS,
  UNIT_INFO,
  UNITS,
  type AttributeDto,
  type BrandDto,
  type CategoryDto,
  type Gender,
  type PriceTypeDto,
  type ProductDto,
  type Season,
  type Unit,
} from '@gulbahor/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, useBlocker, useRouter } from '@tanstack/react-router'
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Controller, useForm, useWatch, type Path } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Select } from '@/components/ui/controls'
import { useConfirm } from '@/components/ui/dialog'
import { Badge, Shortcut, Spinner } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input, Textarea } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { NumberInput } from '@/components/ui/number-input'
import { Card, Page } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useHotkey } from '@/lib/hotkeys'

import {
  categoryAxisIds,
  defaultAxisIds,
  useAttributes,
  useBrands,
  useCategories,
  useCategoryOptions,
  usePriceTypes,
} from './catalog'
import {
  carryOver,
  emptyState,
  hasSavedVariants,
  orderedKeys,
  removedCount,
  stateOf,
  toPriceDrafts,
  toPriceInputs,
  toVariantInputs,
  withAxes,
  withDraft,
  type PriceDrafts,
  type VariantDraft,
  type VariantState,
} from './product-state'
import { VariantAxes, VariantDetails, type VariantErrors } from './variant-editor'

const route = getRouteApi('/products/$productId')

const FORM_ID = 'product-form'
const DRAFT_KEY = 'gb.draft.product'
const NONE = 'none'

interface Values {
  name: string
  sku: string
  categoryId: string | null
  brandId: string | null
  gender: Gender | typeof NONE
  season: Season | typeof NONE
  collectionYear: number | null
  material: string
  originCountry: string | null
  unit: Unit
  weightG: number | null
  mxikCode: string
  description: string
  factoryCode: string
  manufacturer: string
}

/** What the next model starts from after "save and add another". */
interface Carry {
  values: Partial<Values>
  variants: VariantState
}

interface Draft {
  values: Values
  variants: VariantState
  prices: PriceDrafts
}

export function ProductPage() {
  const { t } = useTranslation()
  const { productId } = route.useParams()
  const isNew = productId === 'new'
  // Each "save and add another" starts a fresh form that keeps a few things from the last one.
  const [round, setRound] = useState<{ number: number; carry: Carry | null }>({ number: 0, carry: null })

  const product = useQuery({
    queryKey: ['products', 'one', productId],
    queryFn: ({ signal }) => api.get<ProductDto>(`/products/${productId}`, undefined, signal),
    enabled: !isNew,
    // The form owns the model while it is open; a refetch must not pull the rug from under it.
    staleTime: Infinity,
  })
  const categories = useCategories()
  const brands = useBrands()
  const attributes = useAttributes()
  const priceTypes = usePriceTypes()

  if (product.isError) {
    return (
      <Page title={t('products.title')}>
        <p className="text-sm text-ink-2">{t('products.notFound')}</p>
      </Page>
    )
  }
  if ((!isNew && !product.data) || !categories.data || !brands.data || !attributes.data || !priceTypes.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  return (
    <ProductForm
      key={`${productId}:${round.number}`}
      product={isNew ? null : (product.data as ProductDto)}
      carry={round.carry}
      categories={categories.data}
      brands={brands.data}
      attributes={attributes.data}
      priceTypes={priceTypes.data}
      onRestart={(carry) => setRound((current) => ({ number: current.number + 1, carry }))}
    />
  )
}

interface FormProps {
  product: ProductDto | null
  carry: Carry | null
  categories: CategoryDto[]
  brands: BrandDto[]
  attributes: AttributeDto[]
  priceTypes: PriceTypeDto[]
  /** Starts a fresh form for a new model, optionally keeping a few things from this one. */
  onRestart: (carry: Carry | null) => void
}

function ProductForm({ product, carry, categories, brands, attributes, priceTypes, onRestart }: FormProps) {
  const { t } = useTranslation()
  const { can, hasModule } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const confirm = useConfirm()

  const canManage = can('products.manage')
  const canPrice = can('products.prices')
  const canReference = can('products.references')
  const canUseUsd = hasModule('usd')

  // A draft is only good while the lists it was built from are still there.
  const draft = useMemo(() => {
    const stored = product || carry ? null : readDraft()
    return stored?.variants.axisIds.every((id) => attributes.some((attribute) => attribute.id === id)) ? stored : null
    // Read once, when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const form = useForm<Values>({
    defaultValues: draft?.values ?? {
      name: product?.name ?? '',
      sku: product?.sku ?? '',
      categoryId: product?.categoryId ?? null,
      brandId: product?.brandId ?? null,
      gender: product?.gender ?? NONE,
      season: product?.season ?? NONE,
      collectionYear: product?.collectionYear ?? null,
      material: product?.material ?? '',
      originCountry: product?.originCountry ?? null,
      unit: product?.unit ?? 'pcs',
      weightG: product?.weightG ?? null,
      mxikCode: product?.mxikCode ?? '',
      description: product?.description ?? '',
      factoryCode: product?.factoryCode ?? '',
      manufacturer: product?.manufacturer ?? '',
      ...carry?.values,
    },
  })
  const errors = form.formState.errors

  const [variants, setVariants] = useState<VariantState>(
    () => draft?.variants ?? (product ? stateOf(product) : (carry?.variants ?? emptyState(defaultAxisIds(attributes)))),
  )
  const [prices, setPrices] = useState<PriceDrafts>(
    () => draft?.prices ?? (product ? toPriceDrafts(product.prices) : {}),
  )
  const [variantErrors, setVariantErrors] = useState<VariantErrors>({})
  const [variantsError, setVariantsError] = useState<string>()
  const [touched, setTouched] = useState(!!draft)
  const [saved, setSaved] = useState(false)
  // Until someone arranges the axes by hand, a new model takes them from its category.
  const axesByHand = useRef(!!draft || !!carry || !!product)
  const another = useRef(false)

  const [detailsOpen, setDetailsOpen] = useState(!!product)
  const [moreOpen, setMoreOpen] = useState(
    () =>
      !!product &&
      !!(
        product.gender ||
        product.season ||
        product.collectionYear ||
        product.material ||
        product.originCountry ||
        product.weightG ||
        product.mxikCode ||
        product.description ||
        product.factoryCode ||
        product.manufacturer ||
        product.unit !== 'pcs'
      ),
  )

  const dirty = (form.formState.isDirty || touched) && !saved

  const changeVariants = (next: VariantState) => {
    setVariants(next)
    setTouched(true)
    setVariantsError(undefined)
  }
  const patchVariant = useCallback((key: string, patch: Partial<VariantDraft>) => {
    setVariants((current) => withDraft(current, key, patch))
    setTouched(true)
  }, [])

  // ── Draft: a new model survives a closed tab ──
  const latest = useRef({ variants, prices })
  latest.current = { variants, prices }
  const draftTimer = useRef<number>(undefined)
  const scheduleDraft = useCallback(() => {
    window.clearTimeout(draftTimer.current)
    draftTimer.current = window.setTimeout(() => writeDraft({ values: form.getValues(), ...latest.current }), 400)
  }, [form])

  useEffect(() => {
    if (product) {
      return
    }
    const subscription = form.watch(() => scheduleDraft())
    return () => {
      subscription.unsubscribe()
      window.clearTimeout(draftTimer.current)
    }
  }, [form, product, scheduleDraft])

  useEffect(() => {
    if (!product && touched && !saved) {
      scheduleDraft()
    }
  }, [variants, prices, touched, saved, product, scheduleDraft])

  // ── Leaving ──
  useBlocker({
    shouldBlockFn: async () =>
      !(await confirm({ title: t('common.unsaved'), confirmLabel: t('common.close'), tone: 'danger' })),
    enableBeforeUnload: () => dirty,
    disabled: !dirty,
  })

  const leave = () => {
    if (router.history.canGoBack()) {
      router.history.back()
    } else {
      void router.navigate({ to: '/products' })
    }
  }

  useHotkey('escape', leave, { label: t('common.back'), group: t('shortcuts.groupForm') })

  // ── Options ──
  const categoryOptions = useCategoryOptions(categories, product?.categoryId)
  const brandOptions = useMemo(
    () =>
      brands
        .filter((brand) => brand.isActive || brand.id === product?.brandId)
        .map((brand) => ({ value: brand.id, label: brand.name })),
    [brands, product?.brandId],
  )
  const activePriceTypes = useMemo(
    () => priceTypes.filter((type) => type.isActive || prices[type.id]?.amount != null),
    // Which types are shown should not change while a price is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [priceTypes],
  )
  const originCountry = useWatch({ control: form.control, name: 'originCountry' })
  const countryOptions = useMemo(
    () =>
      [...new Set([...ORIGIN_COUNTRIES, ...(originCountry ? [originCountry] : [])])].map((name) => ({
        value: name,
        label: name,
      })),
    [originCountry],
  )

  const createBrand = async (name: string) => {
    const brand = await api.post<BrandDto>('/brands', { name })
    queryClient.setQueryData<BrandDto[]>(['brands'], (current) => [...(current ?? []), brand])
    return brand.id
  }

  const createValue = async (attributeId: string, name: string) => {
    const before = new Set(
      attributes.find((attribute) => attribute.id === attributeId)?.values.map((value) => value.id),
    )
    const updated = await api.post<AttributeDto>(`/attributes/${attributeId}/values`, { values: [{ name }] })
    queryClient.setQueryData<AttributeDto[]>(['attributes'], (current) =>
      current?.map((attribute) => (attribute.id === attributeId ? updated : attribute)),
    )
    return updated.values.find((value) => !before.has(value.id))?.id
  }

  // ── Saving ──
  const keys = orderedKeys(variants, attributes)

  const mutation = useMutation({
    mutationFn: (input: unknown) =>
      product ? api.put<ProductDto>(`/products/${product.id}`, input) : api.post<ProductDto>('/products', input),
    meta: { silent: true },
    onSuccess: (result) => {
      window.clearTimeout(draftTimer.current)
      clearDraft()
      setSaved(true)
      queryClient.setQueryData(['products', 'one', result.id], result)
      toast.success(t('products.saved', { name: result.name, sku: result.sku }))
      if (another.current && !product) {
        const current = form.getValues()
        onRestart({
          values: {
            categoryId: current.categoryId,
            brandId: current.brandId,
            gender: current.gender,
            season: current.season,
            collectionYear: current.collectionYear,
            unit: current.unit,
            originCountry: current.originCountry,
          },
          variants: carryOver(variants),
        })
      } else {
        // The blocker reads `saved` on the next render; leaving waits for it.
        window.setTimeout(leave)
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) {
        showErrors(error.fields)
      } else {
        toast.error(error instanceof ApiError ? error.message : String(error))
      }
    },
  })

  /** Puts each message where its field is: plain fields under themselves, variant fields in their row. */
  const showErrors = (fields: Record<string, string>) => {
    const byVariant: VariantErrors = {}
    let focused = false
    for (const [path, message] of Object.entries(fields)) {
      const match = /^variants\.(\d+)\.(sku|barcodes|valueIds|id)/.exec(path)
      if (match) {
        const key = keys[Number(match[1])]
        const field = match[2] === 'barcodes' ? 'barcodes' : 'sku'
        byVariant[key] = { ...byVariant[key], [field]: message }
      } else if (path === 'variants' || path === 'axisIds') {
        setVariantsError(message)
      } else if (path === 'prices') {
        toast.error(message)
      } else {
        form.setError(path as Path<Values>, { type: 'server', message }, { shouldFocus: !focused })
        focused = true
      }
    }
    setVariantErrors(byVariant)
    if (Object.keys(byVariant).length) {
      setDetailsOpen(true)
    }
  }

  const submit = form.handleSubmit((current) => {
    setVariantErrors({})
    setVariantsError(undefined)
    const result = productInputSchema.safeParse({
      ...current,
      sku: current.sku,
      gender: current.gender === NONE ? null : current.gender,
      season: current.season === NONE ? null : current.season,
      axisIds: variants.axisIds,
      variants: toVariantInputs(variants, keys),
      prices: toPriceInputs(prices),
    })
    if (!result.success) {
      const fields: Record<string, string> = {}
      for (const issue of result.error.issues) {
        fields[issue.path.join('.')] ??= issue.message
      }
      showErrors(fields)
      return
    }
    mutation.mutate(result.data)
  })

  const removed = removedCount(variants)
  const locked = hasSavedVariants(variants)
  const title = product ? product.name : t('products.new')

  return (
    <Page
      title={title}
      note={product ? `${t('products.sku')}: ${product.sku}` : undefined}
      actions={
        <>
          <Button onClick={leave}>
            <ArrowLeft />
            {t('common.back')}
            <Shortcut combo="escape" className="ml-1" />
          </Button>
          {canManage && !product ? (
            <Button
              type="submit"
              form={FORM_ID}
              disabled={mutation.isPending}
              onClick={() => {
                another.current = true
              }}
            >
              {t('products.saveAndNew')}
              <Shortcut combo="mod+shift+enter" className="ml-1" />
            </Button>
          ) : null}
          {canManage ? (
            <Button
              type="submit"
              form={FORM_ID}
              variant="primary"
              loading={mutation.isPending}
              onClick={() => {
                another.current = false
              }}
            >
              {t('common.save')}
              <Shortcut combo="mod+enter" className="ml-1 opacity-70" />
            </Button>
          ) : null}
        </>
      }
    >
      <div
        className="min-h-0 flex-1 overflow-y-auto pb-6"
        onKeyDownCapture={(event) => {
          // Ctrl+Enter saves; with Shift it saves and starts the next model.
          if (event.key === 'Enter') {
            another.current = (event.ctrlKey || event.metaKey) && event.shiftKey && !product
          }
        }}
      >
        <Form id={FORM_ID} onSubmit={() => void submit()} className="max-w-6xl gap-4">
          {draft && !saved ? (
            <div className="flex items-center justify-between gap-3 rounded-md bg-info-soft px-3 py-2 text-xs text-info">
              {t('products.draftRestored')}
              <Button
                size="sm"
                onClick={() => {
                  window.clearTimeout(draftTimer.current)
                  clearDraft()
                  setSaved(true)
                  onRestart(null)
                }}
              >
                {t('products.draftDiscard')}
              </Button>
            </div>
          ) : null}
          <fieldset disabled={!canManage} className="contents">
            <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
              <Card title={t('products.sectionMain')}>
                <div className="flex flex-col gap-4">
                  <Field label={t('products.name')} error={errors.name?.message} required>
                    {(id) => (
                      <Input
                        id={id}
                        autoFocus={!product}
                        invalid={!!errors.name}
                        placeholder={t('products.namePlaceholder')}
                        {...form.register('name')}
                      />
                    )}
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('products.category')} error={errors.categoryId?.message}>
                      {(id) => (
                        <Controller
                          control={form.control}
                          name="categoryId"
                          render={({ field }) => (
                            <Combobox
                              id={id}
                              options={categoryOptions}
                              value={field.value}
                              recentKey="product.category"
                              invalid={!!errors.categoryId}
                              onChange={(categoryId) => {
                                field.onChange(categoryId)
                                if (!axesByHand.current) {
                                  changeVariants(
                                    withAxes(
                                      variants,
                                      categoryAxisIds(categories, categoryId) ?? defaultAxisIds(attributes),
                                    ),
                                  )
                                }
                              }}
                            />
                          )}
                        />
                      )}
                    </Field>
                    <Field label={t('products.brand')} error={errors.brandId?.message}>
                      {(id) => (
                        <Controller
                          control={form.control}
                          name="brandId"
                          render={({ field }) => (
                            <Combobox
                              id={id}
                              options={brandOptions}
                              value={field.value}
                              onChange={field.onChange}
                              recentKey="product.brand"
                              invalid={!!errors.brandId}
                              onCreate={canReference ? createBrand : undefined}
                            />
                          )}
                        />
                      )}
                    </Field>
                  </div>
                  <Field
                    label={t('products.sku')}
                    hint={product ? undefined : t('products.skuHint')}
                    error={errors.sku?.message}
                    className="sm:max-w-64"
                  >
                    {(id) => (
                      <Input
                        id={id}
                        className="font-code"
                        maxLength={40}
                        placeholder={t('products.automatic')}
                        invalid={!!errors.sku}
                        {...form.register('sku')}
                      />
                    )}
                  </Field>
                </div>
              </Card>

              <Card title={t('products.sectionPrices')}>
                <div className="flex flex-col gap-3">
                  {activePriceTypes.map((type) => {
                    const price = prices[type.id] ?? { amount: null, currency: type.currency }
                    const setPrice = (next: typeof price) => {
                      setPrices((current) => ({ ...current, [type.id]: next }))
                      setTouched(true)
                    }
                    return (
                      <Field key={type.id} label={type.name}>
                        {(id) => (
                          <MoneyInput
                            id={id}
                            value={price.amount}
                            onChange={(amount) => setPrice({ ...price, amount })}
                            currency={price.currency}
                            onCurrencyChange={canUseUsd ? (currency) => setPrice({ ...price, currency }) : undefined}
                            disabled={!canPrice}
                          />
                        )}
                      </Field>
                    )
                  })}
                  {!canPrice ? <p className="text-xs text-ink-3">{t('products.pricesLocked')}</p> : null}
                </div>
              </Card>
            </div>

            <Card title={t('products.sectionVariants')}>
              <VariantAxes
                state={variants}
                attributes={attributes}
                locked={locked}
                error={variantsError}
                onCreateValue={canReference ? createValue : undefined}
                onChange={(next) => {
                  if (next.axisIds !== variants.axisIds) {
                    axesByHand.current = true
                  }
                  changeVariants(next)
                }}
              />
              {locked ? <p className="mt-2 text-xs text-ink-3">{t('products.axesLocked')}</p> : null}
              {removed ? (
                <p className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
                  {t('products.willRemove', { count: removed })}
                </p>
              ) : null}

              <Disclosure
                open={detailsOpen}
                onToggle={() => setDetailsOpen((open) => !open)}
                title={t('products.details')}
                aside={<Badge>{t('products.variantCount', { count: keys.length })}</Badge>}
                hint={detailsOpen ? undefined : t('products.detailsHint')}
              >
                <VariantDetails
                  state={variants}
                  attributes={attributes}
                  onPatch={patchVariant}
                  priceTypes={activePriceTypes}
                  modelPrices={prices}
                  canPrice={canPrice}
                  canUseUsd={canUseUsd}
                  errors={variantErrors}
                />
              </Disclosure>
            </Card>

            <Card>
              <Disclosure
                open={moreOpen}
                onToggle={() => setMoreOpen((open) => !open)}
                title={t('products.sectionMore')}
                hint={moreOpen ? undefined : t('products.moreHint')}
                flush
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label={t('products.gender')}>
                    {(id) => (
                      <Controller
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                          <Select
                            id={id}
                            value={field.value}
                            onChange={field.onChange}
                            options={[
                              { value: NONE, label: '—' },
                              ...GENDERS.map((gender) => ({ value: gender, label: GENDER_LABELS[gender] })),
                            ]}
                          />
                        )}
                      />
                    )}
                  </Field>
                  <Field label={t('products.season')}>
                    {(id) => (
                      <Controller
                        control={form.control}
                        name="season"
                        render={({ field }) => (
                          <Select
                            id={id}
                            value={field.value}
                            onChange={field.onChange}
                            options={[
                              { value: NONE, label: '—' },
                              ...SEASONS.map((season) => ({ value: season, label: SEASON_LABELS[season] })),
                            ]}
                          />
                        )}
                      />
                    )}
                  </Field>
                  <Field label={t('products.collectionYear')} error={errors.collectionYear?.message}>
                    {(id) => (
                      <Controller
                        control={form.control}
                        name="collectionYear"
                        render={({ field }) => (
                          <NumberInput
                            id={id}
                            value={field.value}
                            onChange={field.onChange}
                            min={2000}
                            max={2100}
                            invalid={!!errors.collectionYear}
                          />
                        )}
                      />
                    )}
                  </Field>
                  <Field label={t('products.unit')}>
                    {(id) => (
                      <Controller
                        control={form.control}
                        name="unit"
                        render={({ field }) => (
                          <Select
                            id={id}
                            value={field.value}
                            onChange={field.onChange}
                            options={UNITS.map((unit) => ({ value: unit, label: UNIT_INFO[unit].label }))}
                          />
                        )}
                      />
                    )}
                  </Field>
                  <Field label={t('products.material')} error={errors.material?.message}>
                    {(id) => (
                      <Input
                        id={id}
                        placeholder={t('products.materialPlaceholder')}
                        invalid={!!errors.material}
                        {...form.register('material')}
                      />
                    )}
                  </Field>
                  <Field label={t('products.originCountry')} error={errors.originCountry?.message}>
                    {(id) => (
                      <Controller
                        control={form.control}
                        name="originCountry"
                        render={({ field }) => (
                          <Combobox
                            id={id}
                            options={countryOptions}
                            value={field.value}
                            onChange={field.onChange}
                            onCreate={(text) => text}
                            recentKey="product.country"
                          />
                        )}
                      />
                    )}
                  </Field>
                  <Field label={t('products.weight')} hint={t('products.weightHint')} error={errors.weightG?.message}>
                    {(id) => (
                      <Controller
                        control={form.control}
                        name="weightG"
                        render={({ field }) => (
                          <NumberInput
                            id={id}
                            value={field.value}
                            onChange={field.onChange}
                            min={0}
                            max={1_000_000}
                            suffix="g"
                            invalid={!!errors.weightG}
                          />
                        )}
                      />
                    )}
                  </Field>
                  <Field label={t('products.mxik')} hint={t('products.mxikHint')} error={errors.mxikCode?.message}>
                    {(id) => (
                      <Input
                        id={id}
                        className="font-code"
                        inputMode="numeric"
                        maxLength={17}
                        invalid={!!errors.mxikCode}
                        {...form.register('mxikCode')}
                      />
                    )}
                  </Field>
                  <Field
                    label={t('products.factoryCode')}
                    hint={t('products.factoryCodeHint')}
                    error={errors.factoryCode?.message}
                  >
                    {(id) => (
                      <Input
                        id={id}
                        className="font-code"
                        maxLength={60}
                        invalid={!!errors.factoryCode}
                        {...form.register('factoryCode')}
                      />
                    )}
                  </Field>
                  <Field label={t('products.manufacturer')} error={errors.manufacturer?.message}>
                    {(id) => (
                      <Input
                        id={id}
                        maxLength={120}
                        invalid={!!errors.manufacturer}
                        {...form.register('manufacturer')}
                      />
                    )}
                  </Field>
                </div>
                <Field label={t('products.description')} error={errors.description?.message} className="mt-4">
                  {(id) => (
                    <Textarea id={id} rows={2} invalid={!!errors.description} {...form.register('description')} />
                  )}
                </Field>
              </Disclosure>
            </Card>
          </fieldset>
        </Form>
      </div>
    </Page>
  )
}

interface DisclosureProps {
  open: boolean
  onToggle: () => void
  title: string
  aside?: ReactNode
  hint?: string
  /** No rule above: the disclosure is the whole card. */
  flush?: boolean
  children: ReactNode
}

/** A part of the form most people skip: one line until it is opened. */
function Disclosure({ open, onToggle, title, aside, hint, flush, children }: DisclosureProps) {
  return (
    <div className={cn(!flush && 'mt-4 border-t border-line pt-3')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        {open ? <ChevronDown className="size-4 text-ink-3" /> : <ChevronRight className="size-4 text-ink-3" />}
        <span className="eyebrow">{title}</span>
        {aside}
        {hint ? <span className="truncate text-xs text-ink-3">{hint}</span> : null}
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  )
}

function readDraft(): Draft | null {
  try {
    const stored = localStorage.getItem(DRAFT_KEY)
    return stored ? (JSON.parse(stored) as Draft) : null
  } catch {
    return null
  }
}

function writeDraft(draft: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Storage may be full or unavailable; the form still works.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Nothing to clear.
  }
}
