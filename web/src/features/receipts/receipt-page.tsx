import {
  ALL_CURRENCY_CODES,
  COMMON_EXPENSES,
  CURRENCIES,
  EXPENSE_BASES,
  EXPENSE_BASIS_LABELS,
  formatMoney,
  RECEIPT_STATUS_LABELS,
  receiptInputSchema,
  roundPrice,
  todayIn,
  toIsoDate,
  UNIT_INFO,
  unitCost,
  withPercent,
  type AnyCurrency,
  type AttributeDto,
  type ExpenseBasis,
  type Markup,
  type MarkupLookupResult,
  type Page as PageOf,
  type PartnerDto,
  type PriceTypeDto,
  type ProductDto,
  type ProductListItemDto,
  type ReceiptDto,
  type ReceiptProductDto,
  type ReceiptStatus,
  type VariantLookupDto,
} from '@gulbahor/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, useBlocker, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Ban, CheckCheck, Copy, MoreHorizontal, Plus, Tags, Trash2, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ColorDot, Combobox } from '@/components/ui/combobox'
import { Checkbox, Menu, Select } from '@/components/ui/controls'
import { DateInput } from '@/components/ui/date-input'
import { useConfirm } from '@/components/ui/dialog'
import { Badge, Shortcut, Spinner } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { NumberInput } from '@/components/ui/number-input'
import { Card, Page } from '@/components/ui/page'
import { QtyMatrix } from '@/components/ui/qty-matrix'
import { Thumb } from '@/components/ui/thumb'
import { useSession } from '@/features/auth/session'
import { useAttributes, usePriceTypes } from '@/features/catalog/catalog'
import { ProductPicker } from '@/features/catalog/product-picker'
import { LabelDialog } from '@/features/labels/label-dialog'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { usePreference } from '@/lib/preferences'
import { useScanner } from '@/lib/scanner'
import { toast } from '@/lib/toast'

import {
  blocksOf,
  costOf,
  DEFAULTS_KEY,
  expenseInputs,
  expensesOf,
  linesOf,
  matrixOf,
  newBlock,
  nextKey,
  NO_DEFAULTS,
  toReceiptProduct,
  type Block,
  type BlockCost,
  type ExpenseDraft,
  type Header,
  type ReceiptDefaults,
} from './receipt-state'

const route = getRouteApi('/receipts/$receiptId')

const FORM_ID = 'receipt-form'

export const STATUS_TONES: Record<ReceiptStatus, 'warn' | 'ok' | 'neutral'> = {
  draft: 'warn',
  posted: 'ok',
  cancelled: 'neutral',
}

interface LocationOption {
  id: string
  name: string
  code: string
}

export function ReceiptPage() {
  const { t } = useTranslation()
  const { receiptId } = route.useParams()
  const isNew = receiptId === 'new'
  // Counts this screen's own saves. The form starts over from what the server returned after each of them,
  // and from nothing else: a refetch set off by someone else's work must not wipe what is being typed.
  const [version, setVersion] = useState(0)

  const receipt = useQuery({
    queryKey: ['receipts', 'one', receiptId],
    queryFn: ({ signal }) => api.get<ReceiptDto>(`/receipts/${receiptId}`, undefined, signal),
    enabled: !isNew,
    // The form owns the document while it is open.
    staleTime: Infinity,
  })
  const attributes = useAttributes()
  const priceTypes = usePriceTypes()
  const locations = useQuery({
    queryKey: ['locations', 'options'],
    queryFn: ({ signal }) => api.get<LocationOption[]>('/locations/options', undefined, signal),
  })
  const suppliers = useQuery({
    queryKey: ['partners', 'suppliers'],
    queryFn: ({ signal }) =>
      api.get<PageOf<PartnerDto>>('/partners', { role: 'supplier', status: 'all', size: 200 }, signal),
  })

  if (receipt.isError) {
    return (
      <Page title={t('receipts.title')}>
        <p className="text-sm text-ink-2">{t('receipts.notFound')}</p>
      </Page>
    )
  }
  if ((!isNew && !receipt.data) || !attributes.data || !priceTypes.data || !locations.data || !suppliers.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  return (
    <ReceiptForm
      key={`${receiptId}:${receipt.data?.status ?? ''}:${version}`}
      receipt={isNew ? null : (receipt.data as ReceiptDto)}
      onReloaded={() => setVersion((current) => current + 1)}
      attributes={attributes.data}
      priceTypes={priceTypes.data}
      locations={locations.data}
      suppliers={suppliers.data.items}
    />
  )
}

interface FormProps {
  receipt: ReceiptDto | null
  attributes: AttributeDto[]
  priceTypes: PriceTypeDto[]
  locations: LocationOption[]
  suppliers: PartnerDto[]
  /** The document was saved or acted on from here: show it as the server now has it. */
  onReloaded: () => void
}

function ReceiptForm({ receipt, attributes, priceTypes, locations, suppliers, onReloaded }: FormProps) {
  const { t } = useTranslation()
  const { can, me } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const pickerRef = useRef<HTMLInputElement>(null)

  const status: ReceiptStatus = receipt?.status ?? 'draft'
  const editable = status === 'draft' && can('receipts.manage')
  const canPost = can('receipts.post')
  const expensesEditable = editable || (status === 'posted' && canPost)

  const [defaults, setDefaults] = usePreference<ReceiptDefaults>(DEFAULTS_KEY, NO_DEFAULTS)

  const [header, setHeader] = useState<Header>(() => ({
    locationId:
      receipt?.locationId ??
      (locations.some((location) => location.id === defaults.locationId)
        ? defaults.locationId
        : locations.length === 1
          ? locations[0].id
          : null),
    supplierId: receipt?.supplierId ?? null,
    docDate: receipt?.docDate ?? toIsoDate(todayIn(me.org.timezone)),
    currency: receipt?.currency ?? defaults.currency,
    usdRate: receipt?.usdRate ?? defaults.usdRates?.[defaults.currency] ?? null,
    uzsRate: receipt?.uzsRate ?? defaults.uzsRate,
    extraCurrency: receipt?.extraCurrency ?? 'USD',
    note: receipt?.note ?? '',
  }))
  const [blocks, setBlocks] = useState<Block[]>(() => (receipt ? blocksOf(receipt) : []))
  const [expenses, setExpenses] = useState<ExpenseDraft[]>(() => (receipt ? expensesOf(receipt) : []))
  const [products, setProducts] = useState<Map<string, ReceiptProductDto>>(
    () => new Map((receipt?.products ?? []).map((product) => [product.id, product])),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [expensesDirty, setExpensesDirty] = useState(false)
  const [labelsOpen, setLabelsOpen] = useState(false)

  // The markup each model's rule gives it: what a selling price is suggested from as the cost takes shape.
  const productIds = useMemo(() => [...new Set(blocks.map((block) => block.productId))].sort(), [blocks])
  const markups = useQuery({
    queryKey: ['pricing', 'markups', productIds],
    queryFn: () => api.post<MarkupLookupResult>('/pricing/markups', { productIds }),
    enabled: status === 'draft' && can('products.prices') && productIds.length > 0,
    placeholderData: keepPreviousData,
    meta: { silent: true },
  })
  // An RFID reader reports a tag many times over; each piece is taken once.
  const seenTags = useRef(new Set<string>())

  const touch = () => setDirty(true)
  const patchHeader = (patch: Partial<Header>) => {
    setHeader((current) => ({ ...current, ...patch }))
    setErrors({})
    touch()
  }
  const patchBlock = (key: string, patch: Partial<Block>) => {
    setBlocks((current) => current.map((block) => (block.key === key ? { ...block, ...patch } : block)))
    touch()
  }
  const changeExpenses = (next: ExpenseDraft[]) => {
    setExpenses(next)
    setExpensesDirty(true)
    if (editable) {
      touch()
    }
  }

  const cost = useMemo(() => costOf(header, blocks, expenses, products), [header, blocks, expenses, products])
  const foreign = header.currency !== 'USD' && header.currency !== 'UZS'
  const retailType = priceTypes.find((type) => type.kind === 'retail' && type.isActive)
  const wholesaleType = priceTypes.find((type) => type.kind === 'wholesale' && type.isActive)
  // Every other price the business keeps has its field too: the floor, a family price, a second wholesale one.
  const otherTypes = priceTypes.filter((type) => type.isActive && type !== retailType && type !== wholesaleType)
  // A cost known for one model alone: asked for in the settings, or already written on this receipt.
  const lineExtra = me.org.settings.receiptLineExtra || blocks.some((block) => block.extra)
  const canPrice = can('products.prices')

  // ── Adding goods ──
  const addProduct = async (productId: string, variantId?: string) => {
    let product = products.get(productId)
    if (!product) {
      const loaded = await queryClient.fetchQuery({
        queryKey: ['products', 'one', productId],
        queryFn: () => api.get<ProductDto>(`/products/${productId}`),
      })
      product = toReceiptProduct(loaded)
      const added = product
      setProducts((current) => new Map(current).set(productId, added))
    }
    let focusKey = ''
    setBlocks((current) => {
      const existing = [...current].reverse().find((block) => block.productId === productId)
      // A scan adds one piece to the model's block; picking a model that is already there adds a block for another price.
      if (existing && variantId) {
        focusKey = existing.key
        return current.map((block) =>
          block === existing
            ? { ...block, qty: { ...block.qty, [variantId]: (block.qty[variantId] ?? 0) + 1 } }
            : block,
        )
      }
      const block = newBlock(productId, existing)
      if (variantId) {
        block.qty[variantId] = 1
      }
      focusKey = block.key
      return [...current, block]
    })
    touch()
    if (!variantId) {
      // On to the new block's price, where typing continues.
      window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-block="${focusKey}"] input`)?.focus(), 50)
    }
  }

  useScanner(
    (code) => {
      api
        .get<VariantLookupDto>('/products/lookup', { code })
        .then((found) => {
          if (found.epc) {
            if (seenTags.current.has(found.epc)) {
              return
            }
            seenTags.current.add(found.epc)
          }
          return addProduct(found.productId, found.variantId)
        })
        .catch((error: unknown) => toast.error(error instanceof ApiError ? error.message : String(error)))
    },
    { enabled: editable && !labelsOpen },
  )

  // ── Saving ──
  const build = () => {
    const { lines } = linesOf(blocks, products)
    return receiptInputSchema.safeParse({
      ...header,
      usdRate: foreign ? header.usdRate : 1,
      lines,
      expenses: expenseInputs(expenses),
    })
  }

  const showProblems = (fields: Record<string, string>) => {
    setErrors(fields)
    const first = Object.values(fields)[0]
    if (first) {
      toast.error(first)
    }
  }

  const reload = (saved: ReceiptDto) => {
    queryClient.setQueryData(['receipts', 'one', saved.id], saved)
    void queryClient.invalidateQueries({ queryKey: ['receipts', 'list'] })
    onReloaded()
  }

  const save = useMutation({
    mutationFn: async (): Promise<ReceiptDto | null> => {
      const parsed = build()
      if (!parsed.success) {
        const fields: Record<string, string> = {}
        for (const issue of parsed.error.issues) {
          fields[issue.path.join('.')] ??= issue.message
        }
        showProblems(fields)
        return null
      }
      return receipt
        ? api.put<ReceiptDto>(`/receipts/${receipt.id}`, parsed.data)
        : api.post<ReceiptDto>('/receipts', parsed.data)
    },
    meta: { silent: true },
    onError: (error) =>
      error instanceof ApiError && error.fields
        ? showProblems(error.fields)
        : toast.error(String((error as Error).message)),
  })

  const afterSave = (saved: ReceiptDto) => {
    setDefaults({
      locationId: saved.locationId,
      currency: saved.currency,
      uzsRate: saved.uzsRate,
      usdRates: { ...defaults.usdRates, [saved.currency]: saved.usdRate },
    })
    setDirty(false)
    setExpensesDirty(false)
    reload(saved)
    if (!receipt) {
      // The blocker reads `dirty` on the next render; the move waits for it.
      window.setTimeout(
        () => void router.navigate({ to: '/receipts/$receiptId', params: { receiptId: saved.id }, replace: true }),
      )
    }
  }

  const saveDraft = async () => {
    const saved = await save.mutateAsync().catch(() => null)
    if (saved) {
      toast.success(t('receipts.saved', { number: saved.number }))
      afterSave(saved)
    }
    return saved
  }

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'post' | 'cancel' | 'copy' }) =>
      api.post<ReceiptDto>(`/receipts/${id}/${action}`),
    onSuccess: (result, { action }) => {
      void queryClient.invalidateQueries({ queryKey: ['stock'] })
      if (action === 'copy') {
        toast.success(t('receipts.copied', { number: result.number }))
        reload(result)
        void router.navigate({ to: '/receipts/$receiptId', params: { receiptId: result.id } })
        return
      }
      toast.success(action === 'post' ? t('receipts.posted', { number: result.number }) : t('receipts.cancelled'))
      reload(result)
    },
  })

  const post = async () => {
    const { lines } = linesOf(blocks, products)
    if (!lines.length) {
      toast.error(t('receipts.noLines'))
      return
    }
    const unpriced = blocks.filter((block) => !block.price && Object.values(block.qty).some(Boolean)).length
    const ok = await confirm({
      title: t('receipts.postConfirm'),
      description: [
        t('receipts.postHint'),
        unpriced ? t('receipts.unpricedWarning', { count: unpriced }) : '',
        cost?.costing.weightless.length ? t('receipts.weightlessWarning') : '',
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: t('receipts.post'),
    })
    if (!ok) {
      return
    }
    const saved = dirty || !receipt ? await save.mutateAsync().catch(() => null) : receipt
    if (saved) {
      afterSave(saved)
      act.mutate({ id: saved.id, action: 'post' })
    }
  }

  const saveExpenses = useMutation({
    mutationFn: () =>
      api.put<ReceiptDto>(`/receipts/${(receipt as ReceiptDto).id}/expenses`, { expenses: expenseInputs(expenses) }),
    onSuccess: (saved) => {
      toast.success(t('receipts.expensesSaved'))
      setExpensesDirty(false)
      void queryClient.invalidateQueries({ queryKey: ['stock'] })
      reload(saved)
    },
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/receipts/${(receipt as ReceiptDto).id}`),
    onSuccess: () => {
      setDirty(false)
      void queryClient.invalidateQueries({ queryKey: ['receipts', 'list'] })
      window.setTimeout(leave)
    },
  })

  // ── Leaving ──
  const unsaved = dirty || (status === 'posted' && expensesDirty)
  useBlocker({
    shouldBlockFn: async () =>
      !(await confirm({ title: t('common.unsaved'), confirmLabel: t('common.close'), tone: 'danger' })),
    enableBeforeUnload: () => unsaved,
    disabled: !unsaved,
  })
  const leave = () => {
    if (router.history.canGoBack()) {
      router.history.back()
    } else {
      void router.navigate({ to: '/receipts' })
    }
  }
  useHotkey('escape', leave, { label: t('common.back'), group: t('shortcuts.groupForm') })
  useHotkey('f2', () => pickerRef.current?.focus(), {
    label: t('receipts.addProduct'),
    group: t('shortcuts.groupForm'),
    enabled: editable,
  })
  useHotkey('f9', () => void post(), {
    label: t('receipts.post'),
    group: t('shortcuts.groupForm'),
    enabled: editable && canPost,
  })

  // Labels are made for the document as it is saved: its lines are what the pieces are counted from.
  const canLabel = !!receipt && status !== 'cancelled' && receipt.lines.length > 0 && can('labels.print')
  const openLabels = () => {
    if (dirty) {
      toast.error(t('labels.saveFirst'))
    } else {
      setLabelsOpen(true)
    }
  }
  useHotkey('f8', openLabels, {
    label: t('labels.title'),
    group: t('shortcuts.groupForm'),
    enabled: canLabel && !labelsOpen,
  })

  // A new receipt starts at the search box once its header is filled in from the last one.
  useEffect(() => {
    if (!receipt && header.locationId && header.uzsRate) {
      pickerRef.current?.focus()
    }
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const supplierOptions = useMemo(
    () =>
      suppliers
        .filter((partner) => partner.isActive || partner.id === header.supplierId)
        .map((partner) => ({ value: partner.id, label: partner.name })),
    [suppliers, header.supplierId],
  )
  const createSupplier = async (name: string) => {
    const partner = await api.post<PartnerDto>('/partners', { name, isSupplier: true })
    await queryClient.invalidateQueries({ queryKey: ['partners'] })
    return partner.id
  }

  const expenseCurrencies = [...new Set<AnyCurrency>(['USD', 'UZS', header.currency])]
  const busy = save.isPending || act.isPending
  const totals = cost?.costing.totals

  return (
    <Page
      title={receipt ? `${t('receipts.one')} ${receipt.number}` : t('receipts.new')}
      note={
        receipt
          ? [receipt.locationName, receipt.createdByName, receipt.sourceFile].filter(Boolean).join(' · ')
          : undefined
      }
      actions={
        <>
          {receipt ? <Badge tone={STATUS_TONES[status]}>{RECEIPT_STATUS_LABELS[status]}</Badge> : null}
          <Button onClick={leave}>
            <ArrowLeft />
            {t('common.back')}
            <Shortcut combo="escape" className="ml-1" />
          </Button>
          {editable ? (
            <Button type="submit" form={FORM_ID} loading={save.isPending} disabled={busy}>
              {t('common.save')}
              <Shortcut combo="mod+enter" className="ml-1" />
            </Button>
          ) : null}
          {editable && canPost ? (
            <Button variant="primary" onClick={() => void post()} loading={act.isPending} disabled={busy}>
              <CheckCheck />
              {t('receipts.post')}
              <Shortcut combo="f9" className="ml-1 opacity-70" />
            </Button>
          ) : null}
          {status === 'posted' && canPost && expensesDirty ? (
            <Button variant="primary" onClick={() => saveExpenses.mutate()} loading={saveExpenses.isPending}>
              {t('receipts.saveExpenses')}
            </Button>
          ) : null}
          {canLabel ? (
            <Button onClick={openLabels}>
              <Tags />
              {t('labels.button')}
              <Shortcut combo="f8" className="ml-1" />
            </Button>
          ) : null}
          {receipt && can('receipts.manage') ? (
            <Menu
              trigger={
                <Button size="icon" aria-label={t('common.actions')}>
                  <MoreHorizontal />
                </Button>
              }
              items={[
                {
                  label: t('receipts.copy'),
                  icon: <Copy />,
                  onSelect: () => act.mutate({ id: receipt.id, action: 'copy' }),
                },
                ...(status === 'posted' && canPost
                  ? [
                      {
                        label: t('receipts.cancel'),
                        icon: <Ban />,
                        tone: 'danger' as const,
                        onSelect: async () => {
                          if (
                            await confirm({
                              title: t('receipts.cancelConfirm', { number: receipt.number }),
                              description: t('receipts.cancelHint'),
                              confirmLabel: t('receipts.cancel'),
                              tone: 'danger',
                            })
                          ) {
                            act.mutate({ id: receipt.id, action: 'cancel' })
                          }
                        },
                      },
                    ]
                  : []),
                ...(status === 'draft'
                  ? [
                      {
                        label: t('common.delete'),
                        icon: <Trash2 />,
                        tone: 'danger' as const,
                        onSelect: async () => {
                          if (
                            await confirm({
                              title: t('receipts.deleteConfirm', { number: receipt.number }),
                              confirmLabel: t('common.delete'),
                              tone: 'danger',
                            })
                          ) {
                            remove.mutate()
                          }
                        },
                      },
                    ]
                  : []),
              ]}
            />
          ) : null}
        </>
      }
    >
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-6">
        <Form id={FORM_ID} onSubmit={() => void saveDraft()} className="gap-4">
          <div className="grid items-start gap-4 xl:grid-cols-[1fr_19rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <Card>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label={t('receipts.location')} error={errors.locationId} required>
                    {(id) => (
                      <Combobox
                        id={id}
                        options={locations.map((location) => ({
                          value: location.id,
                          label: location.name,
                          hint: location.code,
                        }))}
                        value={header.locationId}
                        onChange={(locationId) => patchHeader({ locationId })}
                        invalid={!!errors.locationId}
                        disabled={!editable}
                        autoFocus={!receipt && !header.locationId}
                      />
                    )}
                  </Field>
                  <Field label={t('receipts.supplier')} error={errors.supplierId}>
                    {(id) => (
                      <Combobox
                        id={id}
                        options={supplierOptions}
                        value={header.supplierId}
                        onChange={(supplierId) => patchHeader({ supplierId })}
                        onCreate={can('partners.manage') ? createSupplier : undefined}
                        invalid={!!errors.supplierId}
                        disabled={!editable}
                        recentKey="receipt.supplier"
                      />
                    )}
                  </Field>
                  <Field label={t('receipts.date')} error={errors.docDate} required>
                    {(id) => (
                      <DateInput
                        id={id}
                        value={header.docDate}
                        onChange={(docDate) => patchHeader({ docDate })}
                        invalid={!!errors.docDate}
                        disabled={!editable}
                        warnPast
                      />
                    )}
                  </Field>
                  <Field label={t('receipts.currency')} hint={t('receipts.currencyHint')}>
                    {(id) => (
                      <div data-enter-skip>
                        <Select
                          id={id}
                          value={header.currency}
                          onChange={(currency) =>
                            patchHeader({
                              currency: currency as AnyCurrency,
                              usdRate: defaults.usdRates?.[currency as AnyCurrency] ?? null,
                              // An extra cost can only be in a currency the receipt has a rate for.
                              extraCurrency:
                                header.extraCurrency === 'USD' || header.extraCurrency === 'UZS'
                                  ? header.extraCurrency
                                  : 'USD',
                            })
                          }
                          options={ALL_CURRENCY_CODES.map((code) => ({
                            value: code,
                            label: `${code} · ${CURRENCIES[code].name}`,
                          }))}
                          disabled={!editable}
                        />
                      </div>
                    )}
                  </Field>
                  {foreign ? (
                    <Field label={t('receipts.usdRate', { currency: header.currency })} error={errors.usdRate} required>
                      {(id) => (
                        <NumberInput
                          id={id}
                          value={header.usdRate}
                          onChange={(usdRate) => patchHeader({ usdRate })}
                          decimals={4}
                          suffix={CURRENCIES[header.currency].symbol}
                          invalid={!!errors.usdRate}
                          disabled={!editable}
                        />
                      )}
                    </Field>
                  ) : null}
                  <Field label={t('receipts.uzsRate')} error={errors.uzsRate} required>
                    {(id) => (
                      <NumberInput
                        id={id}
                        value={header.uzsRate}
                        onChange={(uzsRate) => patchHeader({ uzsRate })}
                        decimals={2}
                        suffix="so'm"
                        invalid={!!errors.uzsRate}
                        disabled={!editable}
                      />
                    )}
                  </Field>
                  <Field
                    label={t('receipts.note')}
                    error={errors.note}
                    className={foreign ? 'sm:col-span-2' : 'lg:col-span-3'}
                  >
                    {(id) => (
                      <Input
                        id={id}
                        value={header.note}
                        onChange={(event) => patchHeader({ note: event.target.value })}
                        maxLength={500}
                        disabled={!editable}
                      />
                    )}
                  </Field>
                </div>
              </Card>

              {editable ? (
                <div className="flex items-center gap-3">
                  <ProductPicker
                    ref={pickerRef}
                    onPick={(product: ProductListItemDto) => void addProduct(product.id)}
                    placeholder={t('receipts.addProductPlaceholder')}
                    className="max-w-xl flex-1"
                  />
                  <Shortcut combo="f2" />
                  <span className="text-xs text-ink-3">{t('receipts.scanHint')}</span>
                </div>
              ) : null}

              {blocks.map((block, index) => {
                const product = products.get(block.productId)
                return product ? (
                  <BlockCard
                    key={block.key}
                    block={block}
                    product={product}
                    attributes={attributes}
                    cost={cost?.blocks[index]}
                    markups={markups.data?.[block.productId]}
                    header={header}
                    retailType={canPrice ? retailType : undefined}
                    wholesaleType={canPrice ? wholesaleType : undefined}
                    otherTypes={canPrice ? otherTypes : []}
                    lineExtra={lineExtra}
                    supplierOptions={supplierOptions}
                    editable={editable}
                    onChange={(patch) => patchBlock(block.key, patch)}
                    onRemove={() => {
                      setBlocks((current) => current.filter((item) => item.key !== block.key))
                      touch()
                    }}
                  />
                ) : null
              })}
              {!blocks.length ? (
                <p className="rounded-lg border border-dashed border-line-strong px-4 py-10 text-center text-sm text-ink-3">
                  {editable ? t('receipts.emptyLines') : t('receipts.noLines')}
                </p>
              ) : null}

              <Card title={t('receipts.expenses')}>
                <ExpensesEditor
                  expenses={expenses}
                  onChange={changeExpenses}
                  currencies={expenseCurrencies}
                  editable={expensesEditable}
                  amounts={cost?.costing.expenses}
                  weightless={cost?.costing.weightless ?? []}
                />
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-xs text-ink-3">
                  {lineExtra ? (
                    <>
                      <span>{t('receipts.extraCurrency')}</span>
                      <div data-enter-skip className="w-28">
                        <Select
                          value={header.extraCurrency}
                          onChange={(extraCurrency) => patchHeader({ extraCurrency: extraCurrency as AnyCurrency })}
                          options={expenseCurrencies.map((code) => ({ value: code, label: code }))}
                          disabled={!editable}
                          className="h-7 text-xs"
                        />
                      </div>
                    </>
                  ) : null}
                  <span className="min-w-0 flex-1">{t('receipts.expensesHint')}</span>
                </div>
              </Card>
            </div>

            <Card title={t('receipts.totals')} className="xl:sticky xl:top-0">
              {totals ? (
                <dl className="flex flex-col gap-2 text-[13px]">
                  <Total label={t('receipts.totalQty')} value={formatNumber(totals.qty)} />
                  <Total
                    label={t('receipts.totalGoods')}
                    value={formatMoney(totals.goods, header.currency)}
                    sub={header.currency === 'USD' ? undefined : formatMoney(totals.goodsUsd, 'USD')}
                  />
                  <Total
                    label={t('receipts.totalExpenses')}
                    value={formatMoney(totals.expensesUsd, 'USD')}
                    sub={
                      totals.goodsUsd
                        ? t('receipts.expenseShare', {
                            percent: formatNumber(Math.round((totals.expensesUsd / totals.goodsUsd) * 1000) / 10),
                          })
                        : undefined
                    }
                  />
                  <div className="my-1 border-t border-line" />
                  <Total label={t('receipts.totalCost')} value={formatMoney(totals.costUsd, 'USD')} strong />
                  <Total label="" value={formatMoney(totals.costUzs, 'UZS', { minor: 'never' })} strong />
                </dl>
              ) : (
                <p className="text-xs text-ink-3">{t('receipts.ratesNeeded')}</p>
              )}
              {expenses.some((expense) => expense.isEstimate) ? (
                <p className="mt-3 flex gap-2 rounded-md bg-warn-soft px-2.5 py-2 text-xs text-warn">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {t('receipts.estimatesNote')}
                </p>
              ) : null}
            </Card>
          </div>
        </Form>
      </div>
      {labelsOpen && receipt ? <LabelDialog receipt={receipt} onClose={() => setLabelsOpen(false)} /> : null}
    </Page>
  )
}

function Total({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className={cn('tabular text-right', strong && 'text-sm font-semibold')}>
        {value}
        {sub ? <span className="block text-xs font-normal text-ink-3">{sub}</span> : null}
      </dd>
    </div>
  )
}

interface BlockCardProps {
  block: Block
  product: ReceiptProductDto
  attributes: AttributeDto[]
  cost: BlockCost | undefined
  /** What the model's markup rule says for each price type. */
  markups: Markup[] | undefined
  header: Header
  retailType: PriceTypeDto | undefined
  wholesaleType: PriceTypeDto | undefined
  /** The price types beyond those two: each has its field. */
  otherTypes: PriceTypeDto[]
  /** The field for a cost known for this model alone is shown. */
  lineExtra: boolean
  supplierOptions: { value: string; label: string }[]
  editable: boolean
  onChange: (patch: Partial<Block>) => void
  onRemove: () => void
}

/** One model at one price: the price once, the quantities in a grid. */
function BlockCard({
  block,
  product,
  attributes,
  cost,
  markups,
  header,
  retailType,
  wholesaleType,
  otherTypes,
  lineExtra,
  supplierOptions,
  editable,
  onChange,
  onRemove,
}: BlockCardProps) {
  const { t } = useTranslation()
  const matrix = useMemo(() => matrixOf(product, attributes), [product, attributes])
  const unit = UNIT_INFO[product.unit]

  const each = cost && cost.qty ? unitCost(cost.costUzs, cost.qty) : null
  const eachUsd = cost && cost.qty ? unitCost(cost.costUsd, cost.qty) : null
  const markup =
    each && block.retailPrice && retailType?.currency === 'UZS'
      ? Math.round(((block.retailPrice - each) / each) * 100)
      : null

  // The price the model's rule gives: cost plus its markup, or so far from the retail price, rounded as the
  // price type rounds. It shows faintly in the empty field and "=" takes it.
  const suggest = (type: PriceTypeDto | undefined, retail: number | null): number | undefined => {
    const rule = type && markups?.find((item) => item.priceTypeId === type.id)
    if (!editable || !type || !rule) {
      return undefined
    }
    const base = rule.base === 'retail' ? retail : type.currency === 'UZS' ? each : eachUsd
    return base
      ? roundPrice(withPercent(Math.round(base), rule.percent), { step: type.roundStep, ending: type.roundEnding })
      : undefined
  }
  const retailSuggested = suggest(retailType, null)
  const wholesaleSuggested = suggest(
    wholesaleType,
    retailType && retailType.currency === wholesaleType?.currency
      ? (block.retailPrice ?? retailSuggested ?? null)
      : null,
  )
  const offer = (amount: number | undefined, type: PriceTypeDto) =>
    amount === undefined ? undefined : formatMoney(amount, type.currency, { symbol: false })

  return (
    <section data-block={block.key} className="rounded-lg border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="mr-auto flex min-w-0 items-center gap-2.5 self-start">
          {product.image ? <Thumb image={product.image} className="size-10" /> : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{product.name}</p>
            <p className="font-code text-xs text-ink-3">{product.sku}</p>
          </div>
        </div>
        <Field label={t('receipts.price')} className="w-36">
          {(id) => (
            <MoneyInput
              id={id}
              value={block.price}
              onChange={(price) => onChange({ price })}
              currency={header.currency}
              disabled={!editable}
            />
          )}
        </Field>
        {lineExtra ? (
          <Field label={t('receipts.extra')} className="w-32">
            {(id) => (
              <MoneyInput
                id={id}
                value={block.extra}
                onChange={(extra) => onChange({ extra })}
                currency={header.extraCurrency}
                disabled={!editable}
              />
            )}
          </Field>
        ) : null}
        {retailType ? (
          <Field label={retailType.name} className="w-36">
            {(id) => (
              <MoneyInput
                id={id}
                value={block.retailPrice}
                onChange={(retailPrice) => onChange({ retailPrice })}
                currency={retailType.currency}
                disabled={!editable}
                fillValue={retailSuggested}
                placeholder={offer(retailSuggested, retailType)}
              />
            )}
          </Field>
        ) : null}
        {wholesaleType ? (
          <Field label={wholesaleType.name} className="w-36">
            {(id) => (
              <MoneyInput
                id={id}
                value={block.wholesalePrice}
                onChange={(wholesalePrice) => onChange({ wholesalePrice })}
                currency={wholesaleType.currency}
                disabled={!editable}
                fillValue={wholesaleSuggested}
                placeholder={offer(wholesaleSuggested, wholesaleType)}
              />
            )}
          </Field>
        ) : null}
        {otherTypes.map((type) => {
          // A price worked out from the retail one follows what is typed there, or what is offered there.
          const suggested = suggest(
            type,
            retailType && retailType.currency === type.currency ? (block.retailPrice ?? retailSuggested ?? null) : null,
          )
          return (
            <Field key={type.id} label={type.name} className="w-36">
              {(id) => (
                <MoneyInput
                  id={id}
                  value={block.otherPrices[type.id] ?? null}
                  onChange={(amount) => onChange({ otherPrices: { ...block.otherPrices, [type.id]: amount } })}
                  currency={type.currency}
                  disabled={!editable}
                  fillValue={suggested}
                  placeholder={offer(suggested, type)}
                />
              )}
            </Field>
          )
        })}
        {editable ? (
          <Button variant="ghost" size="icon" tabIndex={-1} onClick={onRemove} aria-label={t('common.delete')}>
            <X />
          </Button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-x-8 gap-y-3">
        <QtyMatrix
          rows={matrix.rows.map((row) => ({
            key: row.key,
            label: (
              <span className="flex items-center gap-1.5">
                {row.values.map((value) => (
                  <span key={value.id} className="flex items-center gap-1.5">
                    {value.hex ? <ColorDot color={value.hex} /> : null}
                    {value.name}
                  </span>
                ))}
              </span>
            ),
          }))}
          columns={matrix.columns.map((value) => ({
            key: value.id,
            label: (
              <span className="inline-flex items-center gap-1">
                {value.hex ? <ColorDot color={value.hex} /> : null}
                {value.name}
              </span>
            ),
          }))}
          cellKey={matrix.cellKey}
          values={block.qty}
          onChange={(changes) => onChange({ qty: { ...block.qty, ...changes } })}
          decimals={unit.decimals}
          disabled={!editable}
          corner={matrix.corner}
        />
        <dl className="ml-auto flex min-w-44 flex-col gap-1 text-xs">
          <Total label={t('receipts.totalQty')} value={`${formatNumber(cost?.qty ?? 0)} ${unit.short}`} />
          <Total label={t('receipts.totalGoods')} value={formatMoney(cost?.goods ?? 0, header.currency)} />
          {each !== null && eachUsd !== null ? (
            <>
              <Total
                label={t('receipts.unitCost')}
                value={formatMoney(each, 'UZS', { minor: 'never' })}
                sub={formatMoney(eachUsd, 'USD')}
              />
              {markup !== null ? (
                <Total label={t('receipts.markup')} value={`${markup > 0 ? '+' : ''}${formatNumber(markup)}%`} />
              ) : null}
            </>
          ) : null}
        </dl>
      </div>

      {supplierOptions.length > 1 && (editable || block.supplierId) ? (
        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-xs text-ink-3">
          <span>{t('receipts.blockSupplier')}</span>
          <div data-enter-skip className="w-64">
            <Combobox
              options={supplierOptions}
              value={block.supplierId}
              onChange={(supplierId) => onChange({ supplierId })}
              placeholder={t('receipts.asReceipt')}
              disabled={!editable}
            />
          </div>
        </div>
      ) : null}
    </section>
  )
}

interface ExpensesEditorProps {
  expenses: ExpenseDraft[]
  onChange: (expenses: ExpenseDraft[]) => void
  currencies: AnyCurrency[]
  editable: boolean
  amounts: { amountUsd: number; amountUzs: number }[] | undefined
  weightless: number[]
}

/** Freight, duty and the rest: what each cost, and what it is shared out by. */
function ExpensesEditor({ expenses, onChange, currencies, editable, amounts, weightless }: ExpensesEditorProps) {
  const { t } = useTranslation()
  const patch = (key: string, change: Partial<ExpenseDraft>) =>
    onChange(expenses.map((expense) => (expense.key === key ? { ...expense, ...change } : expense)))
  const add = () =>
    onChange([
      ...expenses,
      { key: nextKey(), name: '', amount: null, currency: 'USD', basis: 'value', isEstimate: false },
    ])

  return (
    <div className="flex flex-col gap-2">
      <datalist id="common-expenses">
        {COMMON_EXPENSES.map((expense) => (
          <option key={expense.name} value={expense.name} />
        ))}
      </datalist>
      {expenses.map((expense, index) => (
        <div key={expense.key} className="flex flex-wrap items-center gap-2">
          <Input
            value={expense.name}
            list="common-expenses"
            placeholder={t('receipts.expenseName')}
            disabled={!editable}
            className="min-w-40 flex-1"
            onChange={(event) => {
              const name = event.target.value
              // A usual expense brings the basis it is usually shared by.
              const usual = COMMON_EXPENSES.find((item) => item.name === name)
              patch(expense.key, usual ? { name, basis: usual.basis } : { name })
            }}
          />
          <MoneyInput
            value={expense.amount}
            onChange={(amount) => patch(expense.key, { amount })}
            currency={expense.currency}
            disabled={!editable}
            className="w-36"
          />
          <div data-enter-skip className="flex items-center gap-2">
            <Select
              value={expense.currency}
              onChange={(currency) => patch(expense.key, { currency: currency as AnyCurrency })}
              options={currencies.map((code) => ({ value: code, label: code }))}
              disabled={!editable}
              className="w-20"
            />
            <Select
              value={expense.basis}
              onChange={(basis) => patch(expense.key, { basis: basis as ExpenseBasis })}
              options={EXPENSE_BASES.map((basis) => ({ value: basis, label: EXPENSE_BASIS_LABELS[basis] }))}
              disabled={!editable}
              className="w-40"
            />
            <Checkbox
              checked={expense.isEstimate}
              onChange={(isEstimate) => patch(expense.key, { isEstimate })}
              disabled={!editable}
              label={t('receipts.estimate')}
            />
          </div>
          <span className="tabular w-24 text-right text-xs text-ink-3">
            {amounts?.[index] && expense.currency !== 'USD' ? formatMoney(amounts[index].amountUsd, 'USD') : ''}
          </span>
          {editable ? (
            <Button
              variant="ghost"
              size="iconSm"
              tabIndex={-1}
              aria-label={t('common.delete')}
              onClick={() => onChange(expenses.filter((item) => item.key !== expense.key))}
            >
              <X />
            </Button>
          ) : null}
          {weightless.includes(index) ? (
            <p className="w-full text-xs text-warn">{t('receipts.weightlessWarning')}</p>
          ) : null}
        </div>
      ))}
      {!expenses.length && !editable ? <p className="text-xs text-ink-3">{t('receipts.noExpenses')}</p> : null}
      {editable ? (
        <div>
          <Button variant="soft" size="sm" onClick={add}>
            <Plus />
            {t('receipts.addExpense')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
