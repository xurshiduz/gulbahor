import {
  formatMoney,
  STOCK_DOC_PERMISSION,
  STOCK_DOC_STATUS_LABELS,
  stockDocInputSchema,
  todayIn,
  toIsoDate,
  UNIT_INFO,
  WRITEOFF_REASON_LABELS,
  WRITEOFF_REASONS,
  type AttributeDto,
  type ProductDto,
  type Page as PageOf,
  type ProductListItemDto,
  type ReceiptListItemDto,
  type ReceiptProductDto,
  type StockDocDto,
  type StockDocKind,
  type StockDocStatus,
  type StockLocationDto,
  type StockProductDto,
  type VariantLookupDto,
  type WriteoffReason,
} from '@erp/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, useBlocker, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Ban, CheckCheck, MoreHorizontal, PackageCheck, Send, Trash2, X } from 'lucide-react'
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
import { Card, Page } from '@/components/ui/page'
import { QtyMatrix } from '@/components/ui/qty-matrix'
import { useSession } from '@/features/auth/session'
import { useAttributes } from '@/features/catalog/catalog'
import { ProductPicker } from '@/features/catalog/product-picker'
import { matrixOf, toReceiptProduct } from '@/features/receipts/receipt-state'
import { api, ApiError } from '@/lib/api'
import { base } from '@/lib/base'
import { cn } from '@/lib/cn'
import { formatDay, formatNumber } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { useScanner } from '@/lib/scanner'
import { toast } from '@/lib/toast'

import { DOC_ROUTES, DOC_STATUS_TONES } from './stockdocs-page'

const transfer = getRouteApi('/transfers/$docId')
const writeoff = getRouteApi('/writeoffs/$docId')
const count = getRouteApi('/counts/$docId')
const supplierReturn = getRouteApi('/supplier-returns/$docId')

export const TransferPage = () => <StockDocPage kind="transfer" docId={transfer.useParams().docId} />
export const WriteoffPage = () => <StockDocPage kind="writeoff" docId={writeoff.useParams().docId} />
export const CountPage = () => <StockDocPage kind="count" docId={count.useParams().docId} />
export const SupplierReturnPage = () => <StockDocPage kind="supplier_return" docId={supplierReturn.useParams().docId} />

const FORM_ID = 'stockdoc-form'

interface LocationOption {
  id: string
  name: string
  code: string
}

/** One model on the document: its quantities by variant. */
interface Block {
  productId: string
  qty: Record<string, number | null>
}

interface Header {
  locationId: string | null
  toLocationId: string | null
  docDate: string
  reason: WriteoffReason | null
  /** A return to a supplier: the receipt the goods came on. */
  receiptId: string | null
  fullCount: boolean
  note: string
}

function StockDocPage({ kind, docId }: { kind: StockDocKind; docId: string }) {
  const { t } = useTranslation()
  const isNew = docId === 'new'
  // Counts this screen's own saves; see the receipt page for why the form restarts on nothing else.
  const [version, setVersion] = useState(0)

  const doc = useQuery({
    queryKey: ['stockdocs', 'one', docId],
    queryFn: ({ signal }) => api.get<StockDocDto>(`/stock-documents/${docId}`, undefined, signal),
    enabled: !isNew,
    staleTime: Infinity,
  })
  const attributes = useAttributes()
  const mine = useQuery({
    queryKey: ['locations', 'options'],
    queryFn: ({ signal }) => api.get<LocationOption[]>('/locations/options', undefined, signal),
  })
  const places = useQuery({
    queryKey: ['stock', 'locations'],
    queryFn: ({ signal }) => api.get<StockLocationDto[]>('/stock/locations', undefined, signal),
  })

  if (doc.isError) {
    return (
      <Page title={t(`stockdocs.${kind}.title`)}>
        <p className="text-sm text-ink-2">{t('stockdocs.notFound')}</p>
      </Page>
    )
  }
  if ((!isNew && !doc.data) || !attributes.data || !mine.data || !places.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  return (
    <StockDocForm
      key={`${docId}:${doc.data?.status ?? ''}:${version}`}
      kind={kind}
      doc={isNew ? null : (doc.data as StockDocDto)}
      attributes={attributes.data}
      mine={mine.data}
      places={places.data.filter((place) => !place.isTransit)}
      onReloaded={() => setVersion((current) => current + 1)}
    />
  )
}

interface FormProps {
  kind: StockDocKind
  doc: StockDocDto | null
  attributes: AttributeDto[]
  /** The places this person works in. */
  mine: LocationOption[]
  /** Every place a transfer can go to. */
  places: StockLocationDto[]
  onReloaded: () => void
}

function StockDocForm({ kind, doc, attributes, mine, places, onReloaded }: FormProps) {
  const { t } = useTranslation()
  const { can, me } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const pickerRef = useRef<HTMLInputElement>(null)

  const permission = STOCK_DOC_PERMISSION[kind]
  const status: StockDocStatus = doc?.status ?? 'draft'
  const worksAt = (locationId: string | null) => !!locationId && mine.some((place) => place.id === locationId)
  const editable = status === 'draft' && can(`${permission}.manage`) && (!doc || worksAt(doc.locationId))
  /** A sent transfer is counted in by the place it arrives at. */
  const receiving =
    kind === 'transfer' && status === 'sent' && can('transfers.manage') && worksAt(doc?.toLocationId ?? null)
  const canCarryOut = kind === 'transfer' ? can('transfers.manage') : can(`${permission}.post`)
  const seesBooks = kind !== 'count' || status !== 'draft' || can('counts.post')

  const [header, setHeader] = useState<Header>(() => ({
    locationId: doc?.locationId ?? (mine.length === 1 ? mine[0].id : null),
    toLocationId: doc?.toLocationId ?? null,
    docDate: doc?.docDate ?? toIsoDate(todayIn(me.org.timezone)),
    reason: doc?.reason ?? null,
    receiptId: doc?.receiptId ?? null,
    fullCount: doc?.fullCount ?? false,
    note: doc?.note ?? '',
  }))
  // A return to a supplier goes against a receipt that was carried out: the latest of them, to pick from.
  const receipts = useQuery({
    queryKey: ['receipts', 'list', 'posted'],
    queryFn: ({ signal }) => api.get<PageOf<ReceiptListItemDto>>('/receipts', { status: 'posted', size: 200 }, signal),
    enabled: kind === 'supplier_return' && editable,
  })
  const receiptOptions = [
    ...(receipts.data?.items ?? []).map((receipt) => ({
      value: receipt.id,
      label: `${receipt.number} · ${formatDay(receipt.docDate)}`,
      hint: receipt.supplierName ?? undefined,
    })),
    // The one the document already names stays there, whether or not it is among the latest.
    ...(doc?.receiptId && !receipts.data?.items.some((receipt) => receipt.id === doc.receiptId)
      ? [{ value: doc.receiptId, label: doc.receiptNumber ?? '', hint: doc.partnerName ?? undefined }]
      : []),
  ]
  const [blocks, setBlocks] = useState<Block[]>(() => {
    const byProduct = new Map<string, Block>()
    for (const line of doc?.lines ?? []) {
      const block = byProduct.get(line.productId) ?? { productId: line.productId, qty: {} }
      byProduct.set(line.productId, block)
      block.qty[line.variantId] = line.qty
    }
    return [...byProduct.values()]
  })
  /** What arrived, by variant: starts as what was sent and is corrected where it differs. */
  const [arrived, setArrived] = useState<Record<string, number | null>>(() =>
    Object.fromEntries((doc?.lines ?? []).map((line) => [line.variantId, line.receivedQty ?? line.qty])),
  )
  const [products, setProducts] = useState<Map<string, ReceiptProductDto>>(
    () => new Map((doc?.products ?? []).map((product) => [product.id, product])),
  )
  const [onHand, setOnHand] = useState<Record<string, number>>(() => doc?.onHand ?? {})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const seenTags = useRef(new Set<string>())

  const touch = () => {
    setDirty(true)
    setErrors({})
  }
  const patchHeader = (patch: Partial<Header>) => {
    setHeader((current) => ({ ...current, ...patch }))
    touch()
  }

  /** What is on hand of a model's variants in the document's place. */
  const loadOnHand = async (productId: string, locationId: string | null) => {
    if (!locationId || !seesBooks) {
      return
    }
    const stock = await queryClient.fetchQuery({
      queryKey: ['stock', 'product', productId],
      queryFn: () => api.get<StockProductDto>(`/stock/products/${productId}`),
    })
    setOnHand((current) => ({
      ...current,
      ...Object.fromEntries(stock.variants.map((variant) => [variant.variantId, variant.byLocation[locationId] ?? 0])),
    }))
  }

  // Another place has other stock: what is on hand is asked again for everything on the document.
  const changeLocation = (locationId: string | null) => {
    patchHeader({ locationId, toLocationId: header.toLocationId === locationId ? null : header.toLocationId })
    setOnHand({})
    blocks.forEach((block) => void loadOnHand(block.productId, locationId))
  }

  const addProduct = async (productId: string, variantId?: string) => {
    if (!products.has(productId)) {
      const loaded = await queryClient.fetchQuery({
        queryKey: ['products', 'one', productId],
        queryFn: () => api.get<ProductDto>(`/products/${productId}`),
      })
      setProducts((current) => new Map(current).set(productId, toReceiptProduct(loaded)))
      void loadOnHand(productId, header.locationId)
    }
    setBlocks((current) => {
      const existing = current.find((block) => block.productId === productId)
      if (!existing) {
        return [...current, { productId, qty: variantId ? { [variantId]: 1 } : {} }]
      }
      // A scan is one more piece of that variant.
      return variantId
        ? current.map((block) =>
            block === existing
              ? { ...block, qty: { ...block.qty, [variantId]: (block.qty[variantId] ?? 0) + 1 } }
              : block,
          )
        : current
    })
    touch()
    if (!variantId) {
      window.setTimeout(
        () => document.querySelector<HTMLInputElement>(`[data-block="${productId}"] [data-cell]`)?.focus(),
        60,
      )
    }
  }

  useScanner(
    (code) => {
      api
        .get<VariantLookupDto>('/products/lookup', { code })
        .then((found) => {
          // An RFID reader reports a tag many times over; each piece is counted once.
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
    { enabled: editable },
  )

  // ── Saving and carrying out ──
  const lines = useMemo(
    () =>
      blocks.flatMap((block) =>
        (products.get(block.productId)?.variants ?? []).flatMap((variant) => {
          const qty = block.qty[variant.id]
          // A count keeps a typed zero: "looked, found none".
          return qty === null || qty === undefined || (qty === 0 && kind !== 'count')
            ? []
            : [{ variantId: variant.id, qty }]
        }),
      ),
    [blocks, products, kind],
  )
  const total = lines.reduce((sum, line) => sum + Math.round(line.qty * 1000), 0) / 1000
  const short = lines.filter((line) => kind !== 'count' && line.qty > (onHand[line.variantId] ?? 0)).length

  const showProblems = (fields: Record<string, string>) => {
    setErrors(fields)
    const first = Object.values(fields)[0]
    if (first) {
      toast.error(first)
    }
  }
  const reload = (saved: StockDocDto) => {
    queryClient.setQueryData(['stockdocs', 'one', saved.id], saved)
    void queryClient.invalidateQueries({ queryKey: ['stockdocs', 'list'] })
    void queryClient.invalidateQueries({ queryKey: ['stock'] })
    onReloaded()
  }
  const failed = (error: unknown) =>
    error instanceof ApiError && error.fields ? showProblems(error.fields) : toast.error((error as Error).message)

  const save = useMutation({
    mutationFn: async (): Promise<StockDocDto | null> => {
      const parsed = stockDocInputSchema.safeParse({ kind, ...header, lines })
      if (!parsed.success) {
        const fields: Record<string, string> = {}
        for (const issue of parsed.error.issues) {
          fields[issue.path.join('.')] ??= issue.message
        }
        showProblems(fields)
        return null
      }
      return doc
        ? api.put<StockDocDto>(`/stock-documents/${doc.id}`, parsed.data)
        : api.post<StockDocDto>('/stock-documents', parsed.data)
    },
    meta: { silent: true },
    onError: failed,
  })

  const afterSave = (saved: StockDocDto) => {
    setDirty(false)
    reload(saved)
    if (!doc) {
      window.setTimeout(
        () => void router.navigate({ to: `${DOC_ROUTES[kind]}/$docId`, params: { docId: saved.id }, replace: true }),
      )
    }
  }

  const saveDraft = async () => {
    const saved = await save.mutateAsync().catch(() => null)
    if (saved) {
      toast.success(t('receipts.saved', { number: saved.number }))
      afterSave(saved)
    }
  }

  const act = useMutation({
    mutationFn: ({
      id,
      action,
      body,
    }: {
      id: string
      action: 'send' | 'receive' | 'post' | 'cancel'
      body?: unknown
    }) => api.post<StockDocDto>(`/stock-documents/${id}/${action}`, body),
    meta: { silent: true },
    onSuccess: (result, { action }) => {
      toast.success(t(`stockdocs.done.${action}`, { number: result.number }))
      setDirty(false)
      reload(result)
    },
    onError: failed,
  })

  /** Saves what is on the screen if it changed, then sends, posts or approves it. */
  const carryOut = async () => {
    if (!lines.length) {
      toast.error(t('stockdocs.noLines'))
      return
    }
    const action = kind === 'transfer' ? 'send' : 'post'
    const ok = await confirm({
      title: t(`stockdocs.${kind}.confirm`),
      description: t(`stockdocs.${kind}.confirmHint`),
      confirmLabel: t(`stockdocs.${kind}.action`),
    })
    if (!ok) {
      return
    }
    const saved = dirty || !doc ? await save.mutateAsync().catch(() => null) : doc
    if (saved) {
      afterSave(saved)
      act.mutate({ id: saved.id, action })
    }
  }

  const receive = async () => {
    const sent = doc as StockDocDto
    const changed = sent.lines.filter((line) => (arrived[line.variantId] ?? 0) !== line.qty)
    const missing = changed.reduce((sum, line) => sum + line.qty - (arrived[line.variantId] ?? 0), 0)
    const ok = await confirm({
      title: t('stockdocs.transfer.receiveConfirm'),
      description: missing
        ? t('stockdocs.transfer.receiveShort', { count: missing })
        : t('stockdocs.transfer.receiveFull'),
      confirmLabel: t('stockdocs.transfer.receive'),
      tone: missing ? 'danger' : 'default',
    })
    if (ok) {
      act.mutate({
        id: sent.id,
        action: 'receive',
        body: { lines: changed.map((line) => ({ lineId: line.id, receivedQty: arrived[line.variantId] ?? 0 })) },
      })
    }
  }

  const remove = useMutation({
    mutationFn: () => api.delete(`/stock-documents/${(doc as StockDocDto).id}`),
    onSuccess: () => {
      setDirty(false)
      void queryClient.invalidateQueries({ queryKey: ['stockdocs', 'list'] })
      window.setTimeout(leave)
    },
  })

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
      void router.navigate({ to: DOC_ROUTES[kind] })
    }
  }
  useHotkey('escape', leave, { label: t('common.back'), group: t('shortcuts.groupForm') })
  useHotkey('f2', () => pickerRef.current?.focus(), {
    label: t('receipts.addProduct'),
    group: t('shortcuts.groupForm'),
    enabled: editable,
  })
  useHotkey('f9', () => void (receiving ? receive() : carryOut()), {
    label: receiving ? t('stockdocs.transfer.receive') : t(`stockdocs.${kind}.action`),
    group: t('shortcuts.groupForm'),
    enabled: receiving || (editable && canCarryOut),
  })

  useEffect(() => {
    if (!doc && header.locationId) {
      pickerRef.current?.focus()
    }
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const busy = save.isPending || act.isPending
  const canCancel =
    (kind === 'transfer' && status === 'sent' && can('transfers.manage') && worksAt(doc?.locationId ?? null)) ||
    ((kind === 'writeoff' || kind === 'supplier_return') && status === 'posted' && can(`${permission}.post`))

  return (
    <Page
      title={doc ? `${t(`stockdocs.${kind}.one`)} ${doc.number}` : t(`stockdocs.${kind}.new`)}
      note={
        doc
          ? [doc.locationName, doc.toLocationName ? `→ ${doc.toLocationName}` : null, doc.createdByName]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
      actions={
        <>
          {doc ? <Badge tone={DOC_STATUS_TONES[status]}>{STOCK_DOC_STATUS_LABELS[status]}</Badge> : null}
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
          {editable && canCarryOut ? (
            <Button variant="primary" onClick={() => void carryOut()} loading={act.isPending} disabled={busy}>
              {kind === 'transfer' ? <Send /> : <CheckCheck />}
              {t(`stockdocs.${kind}.action`)}
              <Shortcut combo="f9" className="ml-1 opacity-70" />
            </Button>
          ) : null}
          {receiving ? (
            <Button variant="primary" onClick={() => void receive()} loading={act.isPending}>
              <PackageCheck />
              {t('stockdocs.transfer.receive')}
              <Shortcut combo="f9" className="ml-1 opacity-70" />
            </Button>
          ) : null}
          {doc && (canCancel || editable) ? (
            <Menu
              trigger={
                <Button size="icon" aria-label={t('common.actions')}>
                  <MoreHorizontal />
                </Button>
              }
              items={[
                ...(canCancel
                  ? [
                      {
                        label: kind === 'transfer' ? t('stockdocs.transfer.takeBack') : t('receipts.cancel'),
                        icon: <Ban />,
                        tone: 'danger' as const,
                        onSelect: async () => {
                          if (
                            await confirm({
                              title: t(`stockdocs.${kind}.cancelConfirm`, { number: doc.number }),
                              confirmLabel:
                                kind === 'transfer' ? t('stockdocs.transfer.takeBack') : t('receipts.cancel'),
                              tone: 'danger',
                            })
                          ) {
                            act.mutate({ id: doc.id, action: 'cancel' })
                          }
                        },
                      },
                    ]
                  : []),
                ...(editable
                  ? [
                      {
                        label: t('common.delete'),
                        icon: <Trash2 />,
                        tone: 'danger' as const,
                        onSelect: async () => {
                          if (
                            await confirm({
                              title: t('receipts.deleteConfirm', { number: doc.number }),
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
        <Form id={FORM_ID} onSubmit={() => void saveDraft()} className="max-w-5xl gap-4">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field
                label={kind === 'transfer' ? t('stockdocs.from') : t('receipts.location')}
                error={errors.locationId}
                required
              >
                {(id) => (
                  <Combobox
                    id={id}
                    options={(editable ? mine : places).map((place) => ({
                      value: place.id,
                      label: place.name,
                      hint: place.code,
                    }))}
                    value={header.locationId}
                    onChange={changeLocation}
                    invalid={!!errors.locationId}
                    disabled={!editable}
                    autoFocus={!doc && !header.locationId}
                  />
                )}
              </Field>
              {kind === 'transfer' ? (
                <Field label={t('stockdocs.to')} error={errors.toLocationId} required>
                  {(id) => (
                    <Combobox
                      id={id}
                      options={places
                        .filter((place) => place.id !== header.locationId)
                        .map((place) => ({ value: place.id, label: place.name, hint: place.code }))}
                      value={header.toLocationId}
                      onChange={(toLocationId) => patchHeader({ toLocationId })}
                      invalid={!!errors.toLocationId}
                      disabled={!editable}
                      recentKey="transfer.to"
                    />
                  )}
                </Field>
              ) : null}
              {kind === 'supplier_return' ? (
                <Field
                  label={t('stockdocs.supplier_return.receipt')}
                  hint={doc?.partnerName ?? receiptOptions.find((option) => option.value === header.receiptId)?.hint}
                  error={errors.receiptId}
                  required
                >
                  {(id) => (
                    <Combobox
                      id={id}
                      options={receiptOptions}
                      value={header.receiptId}
                      onChange={(receiptId) => patchHeader({ receiptId })}
                      invalid={!!errors.receiptId}
                      disabled={!editable}
                    />
                  )}
                </Field>
              ) : null}
              {kind === 'writeoff' ? (
                <Field label={t('stockdocs.reason')} error={errors.reason} required>
                  {(id) => (
                    <Select
                      id={id}
                      value={header.reason ?? ''}
                      onChange={(reason) => patchHeader({ reason: reason as WriteoffReason })}
                      options={WRITEOFF_REASONS.map((reason) => ({
                        value: reason,
                        label: WRITEOFF_REASON_LABELS[reason],
                      }))}
                      placeholder={t('common.select')}
                      invalid={!!errors.reason}
                      disabled={!editable}
                    />
                  )}
                </Field>
              ) : null}
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
              <Field
                label={t('receipts.note')}
                error={errors.note}
                className={kind === 'count' ? 'lg:col-span-2' : undefined}
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
            {kind === 'count' ? (
              <div className="mt-4 border-t border-line pt-3">
                <Checkbox
                  checked={header.fullCount}
                  onChange={(fullCount) => patchHeader({ fullCount })}
                  disabled={!editable}
                  label={t('stockdocs.count.full')}
                  hint={t('stockdocs.count.fullHint')}
                />
              </div>
            ) : null}
          </Card>

          {editable ? (
            <div className="flex items-center gap-3">
              <ProductPicker
                ref={pickerRef}
                onPick={(product: ProductListItemDto) => void addProduct(product.id)}
                placeholder={t('receipts.addProductPlaceholder')}
                disabled={!header.locationId}
                className="max-w-xl flex-1"
              />
              <Shortcut combo="f2" />
              <span className="text-xs text-ink-3">{t('receipts.scanHint')}</span>
            </div>
          ) : null}

          {receiving ? (
            <p className="rounded-md bg-info-soft px-3 py-2 text-xs text-info">{t('stockdocs.transfer.receiveHint')}</p>
          ) : null}

          {blocks.map((block) => {
            const product = products.get(block.productId)
            if (!product) {
              return null
            }
            return (
              <BlockCard
                key={block.productId}
                kind={kind}
                block={block}
                product={product}
                attributes={attributes}
                doc={doc}
                onHand={seesBooks ? onHand : null}
                editable={editable}
                arrived={receiving ? arrived : null}
                onArrived={(changes) => setArrived((current) => ({ ...current, ...changes }))}
                onChange={(qty) => {
                  setBlocks((current) =>
                    current.map((item) => (item.productId === block.productId ? { ...item, qty } : item)),
                  )
                  touch()
                }}
                onRemove={() => {
                  setBlocks((current) => current.filter((item) => item.productId !== block.productId))
                  touch()
                }}
              />
            )
          })}
          {!blocks.length ? (
            <p className="rounded-lg border border-dashed border-line-strong px-4 py-10 text-center text-sm text-ink-3">
              {editable ? t('receipts.emptyLines') : t('stockdocs.noLines')}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]">
            <span className="text-ink-3">
              {kind === 'count' ? t('stockdocs.counted') : t('receipts.totalQty')}:{' '}
              <span className="tabular font-semibold text-ink">{formatNumber(total)}</span>
            </span>
            {doc?.diffQty !== null && doc?.diffQty !== undefined && status === 'posted' ? (
              <span className="text-ink-3">
                {kind === 'transfer' ? t('stockdocs.lost') : t('stockdocs.diff')}:{' '}
                <span
                  className={cn(
                    'tabular font-semibold',
                    doc.diffQty === 0 ? 'text-ink' : kind === 'transfer' || doc.diffQty < 0 ? 'text-bad' : 'text-ok',
                  )}
                >
                  {kind === 'count' && doc.diffQty > 0 ? '+' : ''}
                  {formatNumber(doc.diffQty)}
                </span>
              </span>
            ) : null}
            {doc?.credited ? (
              <span className="text-ink-3">
                {t('stockdocs.supplier_return.credited', { name: doc.partnerName })}:{' '}
                <span className="tabular font-semibold text-ok">
                  {formatMoney(doc.credited.amount, doc.credited.currency, { minor: 'auto' })}
                </span>
              </span>
            ) : null}
            {doc?.costUzs !== null && doc?.costUzs !== undefined ? (
              <span className="text-ink-3">
                {t('stockdocs.value')}:{' '}
                <span className="tabular font-semibold text-ink">
                  {formatMoney(doc.costUzs, base(), { minor: 'never' })}
                </span>
              </span>
            ) : null}
            {editable && short ? (
              <span className="text-bad">{t('stockdocs.shortWarning', { count: short })}</span>
            ) : null}
          </div>
        </Form>
      </div>
    </Page>
  )
}

interface BlockProps {
  kind: StockDocKind
  block: Block
  product: ReceiptProductDto
  attributes: AttributeDto[]
  doc: StockDocDto | null
  /** Null when this person is not shown what the books say. */
  onHand: Record<string, number> | null
  editable: boolean
  /** Set while a transfer is being received: the quantities that arrived. */
  arrived: Record<string, number | null> | null
  onArrived: (changes: Record<string, number | null>) => void
  onChange: (qty: Record<string, number | null>) => void
  onRemove: () => void
}

function BlockCard({
  kind,
  block,
  product,
  attributes,
  doc,
  onHand,
  editable,
  arrived,
  onArrived,
  onChange,
  onRemove,
}: BlockProps) {
  const { t } = useTranslation()
  const matrix = useMemo(() => matrixOf(product, attributes), [product, attributes])
  const unit = UNIT_INFO[product.unit]
  const posted = doc?.status === 'posted'

  // A posted count shows, next to what was found, what the books had said.
  const expected = useMemo(
    () =>
      posted && kind === 'count'
        ? Object.fromEntries(doc.lines.map((line) => [line.variantId, line.expectedQty ?? undefined]))
        : null,
    [posted, kind, doc],
  )
  const received = useMemo(
    () =>
      posted && kind === 'transfer'
        ? Object.fromEntries(doc.lines.map((line) => [line.variantId, line.receivedQty ?? line.qty]))
        : null,
    [posted, kind, doc],
  )
  const lostHere =
    received &&
    product.variants.reduce(
      (sum, variant) =>
        sum + Math.max(0, (block.qty[variant.id] ?? 0) - (received[variant.id] ?? block.qty[variant.id] ?? 0)),
      0,
    )
  const diffHere =
    expected &&
    product.variants.reduce(
      (sum, variant) =>
        block.qty[variant.id] === null || block.qty[variant.id] === undefined
          ? sum
          : sum + (block.qty[variant.id] as number) - (expected[variant.id] ?? 0),
      0,
    )

  const axes = {
    rows: matrix.rows.map((row) => ({
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
    })),
    columns: matrix.columns.map((value) => ({
      key: value.id,
      label: (
        <span className="inline-flex items-center gap-1">
          {value.hex ? <ColorDot color={value.hex} /> : null}
          {value.name}
        </span>
      ),
    })),
  }

  return (
    <section data-block={block.productId} className="rounded-lg border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <div className="mr-auto min-w-0">
          <p className="truncate text-sm font-semibold">{product.name}</p>
          <p className="font-code text-xs text-ink-3">{product.sku}</p>
        </div>
        {lostHere ? <Badge tone="bad">{t('stockdocs.lostHere', { count: lostHere })}</Badge> : null}
        {diffHere ? (
          <Badge tone={diffHere < 0 ? 'bad' : 'ok'}>
            {diffHere > 0 ? '+' : ''}
            {formatNumber(diffHere)} {unit.short}
          </Badge>
        ) : null}
        {editable ? (
          <Button variant="ghost" size="iconSm" tabIndex={-1} onClick={onRemove} aria-label={t('common.delete')}>
            <X />
          </Button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-x-10 gap-y-3">
        <div>
          {arrived || expected || received ? (
            <p className="eyebrow mb-1.5">{kind === 'count' ? t('stockdocs.counted') : t('stockdocs.sent')}</p>
          ) : null}
          <QtyMatrix
            {...axes}
            cellKey={matrix.cellKey}
            values={block.qty}
            onChange={(changes) => onChange({ ...block.qty, ...changes })}
            decimals={unit.decimals}
            disabled={!editable}
            // What is on hand shows in the empty cells, so there is no need to look it up.
            hints={editable && onHand ? onHand : undefined}
            limits={editable && onHand && kind !== 'count' ? onHand : undefined}
            zero={kind === 'count'}
            corner={matrix.corner}
          />
        </div>
        {arrived ? (
          <div>
            <p className="eyebrow mb-1.5">{t('stockdocs.arrived')}</p>
            <QtyMatrix
              {...axes}
              cellKey={(row, column) => {
                const key = matrix.cellKey(row, column)
                return key && block.qty[key] ? key : null
              }}
              values={arrived}
              onChange={onArrived}
              decimals={unit.decimals}
              limits={block.qty as Record<string, number>}
              zero
              corner={matrix.corner}
            />
          </div>
        ) : null}
        {received || expected ? (
          <div>
            <p className="eyebrow mb-1.5">{received ? t('stockdocs.arrived') : t('stockdocs.expected')}</p>
            <QtyMatrix
              {...axes}
              cellKey={(row, column) => {
                const key = matrix.cellKey(row, column)
                return key && block.qty[key] !== null && block.qty[key] !== undefined ? key : null
              }}
              values={(received ?? expected) as Record<string, number | null>}
              onChange={() => {}}
              decimals={unit.decimals}
              disabled
              zero
              corner={matrix.corner}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}
