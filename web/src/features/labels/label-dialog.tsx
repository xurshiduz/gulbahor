import {
  DEFAULT_LABEL_SIZE,
  LABEL_SIZE_KEYS,
  PRINTER_DPIS,
  UNIT_INFO,
  type AttributeDto,
  type LabelPrintResult,
  type LabelSizeKey,
  type PrinterDpi,
  type PrinterDto,
  type ProductDto,
  type ReceiptDto,
  type ReceiptLabelsDto,
  type ReceiptProductDto,
  type VariantLookupDto,
} from '@gulbahor/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Download, Printer as PrinterIcon, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Checkbox, Select } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/dialog'
import { Badge, Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { QtyMatrix } from '@/components/ui/qty-matrix'
import { useSession } from '@/features/auth/session'
import { useAttributes } from '@/features/catalog/catalog'
import { matrixAxes } from '@/features/catalog/matrix-axes'
import { ProductPicker } from '@/features/catalog/product-picker'
import { matrixOf, toReceiptProduct } from '@/features/receipts/receipt-state'
import { api, ApiError } from '@/lib/api'
import { formatNumber } from '@/lib/format'
import { usePreference } from '@/lib/preferences'
import { useScanner } from '@/lib/scanner'

const FORM_ID = 'label-form'
/** Stands for "no printer: give me the file" in the printer list. */
const FILE = 'file'

interface Choice {
  /** A printer, `FILE`, or null while nothing has been chosen yet: then the first printer is offered. */
  printerId: string | null
  size: LabelSizeKey
  dpi: PrinterDpi
  rfid: boolean
  withPrice: boolean
}

const NO_CHOICE: Choice = { printerId: null, size: DEFAULT_LABEL_SIZE, dpi: 203, rfid: true, withPrice: true }

interface LocationOption {
  id: string
  name: string
}

interface Props {
  /** Labels for the goods of this receipt; without it, for goods picked here. */
  receipt?: Pick<ReceiptDto, 'id' | 'number' | 'lines' | 'products'>
  onClose: () => void
}

/** A whole number of pieces has that many labels; a length or a weight has one. */
const unitsOf = (qty: number) => (Number.isInteger(qty) ? qty : 1)

function saveFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Chooses what to print and where. For a receipt every piece is offered,
 * less the ones already printed; on its own the dialog takes any goods:
 * pick a model or scan a piece's barcode, and one more label is added.
 */
export function LabelDialog({ receipt, onClose }: Props) {
  const { t } = useTranslation()
  const { can, hasModule } = useSession()
  const queryClient = useQueryClient()
  const attributes = useAttributes()
  const pickerRef = useRef<HTMLInputElement>(null)

  const printers = useQuery({
    queryKey: ['devices', 'printers', 'choice'],
    queryFn: ({ signal }) => api.get<PrinterDto[]>('/labels/printers', undefined, signal),
  })
  const status = useQuery({
    queryKey: ['labels', 'receipt', receipt?.id],
    queryFn: ({ signal }) => api.get<ReceiptLabelsDto>(`/labels/receipts/${receipt?.id}`, undefined, signal),
    enabled: !!receipt,
  })
  const locations = useQuery({
    queryKey: ['locations', 'options'],
    queryFn: ({ signal }) => api.get<LocationOption[]>('/locations/options', undefined, signal),
    enabled: !receipt,
  })

  // What was chosen last time is offered again; what is changed here is kept on printing.
  const [saved, save] = usePreference<Choice>('labels.choice', NO_CHOICE)
  const [changed, setChanged] = useState<Partial<Choice>>({})
  const choice = { ...NO_CHOICE, ...saved, ...changed }
  const printer =
    choice.printerId === FILE
      ? null
      : (printers.data?.find((item) => item.id === choice.printerId) ?? printers.data?.[0] ?? null)
  const size = 'size' in changed || !printer ? choice.size : printer.labelSize
  const rfidOn = hasModule('rfid')
  const rfid = rfidOn && choice.rfid && (!printer || printer.rfid)

  const [onlyNew, setOnlyNew] = useState(true)
  const [locationId, setLocationId] = useState<string | null>(null)
  const [products, setProducts] = useState<ReceiptProductDto[]>(receipt?.products ?? [])
  // How many pieces the receipt has of each variant: what is offered, and the most that can be tagged.
  const [units] = useState(() => {
    const pieces: Record<string, number> = {}
    for (const line of receipt?.lines ?? []) {
      pieces[line.variantId] = (pieces[line.variantId] ?? 0) + unitsOf(line.qty)
    }
    return pieces
  })
  const [counts, setCounts] = useState<Record<string, number | null>>(units)

  useEffect(() => {
    if (!receipt && locations.data?.length === 1) {
      setLocationId(locations.data[0].id)
    }
  }, [receipt, locations.data])

  // The dialog opens ready for typing: at the first quantity, or at the search when there is nothing yet.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const first = document.querySelector<HTMLInputElement>('[data-label-block] [data-cell]')
      ;(first ?? pickerRef.current)?.focus()
    }, 60)
    return () => window.clearTimeout(timer)
  }, [])

  const printedOf = useMemo(
    () => new Map((status.data?.items ?? []).map((item) => [item.variantId, item.printed])),
    [status.data],
  )
  const skipPrinted = !!receipt && rfid && onlyNew
  /** How many labels a variant will actually give. */
  const willPrint = (variantId: string) => {
    const count = counts[variantId] ?? 0
    return skipPrinted ? Math.max(0, count - (printedOf.get(variantId) ?? 0)) : count
  }
  const total = products.reduce(
    (sum, product) => sum + product.variants.reduce((inner, variant) => inner + willPrint(variant.id), 0),
    0,
  )

  const add = async (productId: string, variantId?: string) => {
    let product = products.find((item) => item.id === productId)
    if (!product) {
      const loaded = await queryClient.fetchQuery({
        queryKey: ['products', 'one', productId],
        queryFn: () => api.get<ProductDto>(`/products/${productId}`),
      })
      product = toReceiptProduct(loaded)
      const added = product
      setProducts((current) => (current.some((item) => item.id === productId) ? current : [...current, added]))
    }
    // A scanned piece is one more label for it; a model with a single variant needs no grid to fill in.
    const target = variantId ?? (product.variants.length === 1 ? product.variants[0].id : undefined)
    if (target) {
      setCounts((current) => ({ ...current, [target]: (current[target] ?? 0) + 1 }))
    }
    if (!variantId) {
      window.setTimeout(
        () => document.querySelector<HTMLInputElement>(`[data-label-block="${productId}"] [data-cell]`)?.focus(),
        60,
      )
    }
  }

  useScanner(
    (code) => {
      api
        .get<VariantLookupDto>('/products/lookup', { code })
        .then((found) => add(found.productId, found.variantId))
        .catch((error: unknown) => toast.error(error instanceof ApiError ? error.message : String(error)))
    },
    { enabled: !receipt },
  )

  const print = useMutation({
    mutationFn: () =>
      api.post<LabelPrintResult>('/labels/print', {
        receiptId: receipt?.id ?? null,
        locationId: receipt ? null : locationId,
        items: products.flatMap((product) =>
          product.variants.flatMap((variant) =>
            counts[variant.id] ? [{ variantId: variant.id, count: counts[variant.id] }] : [],
          ),
        ),
        size,
        dpi: choice.dpi,
        rfid,
        withPrice: choice.withPrice,
        onlyNew: skipPrinted,
        printerId: printer?.id ?? null,
      }),
    meta: { silent: true },
    onSuccess: (result) => {
      save({ ...choice, printerId: printer?.id ?? FILE, size })
      void queryClient.invalidateQueries({ queryKey: ['labels'] })
      void queryClient.invalidateQueries({ queryKey: ['printjobs'] })
      if (result.file) {
        saveFile(result.file.name, result.file.zpl)
        toast.success(t('labels.saved', { count: result.count }))
      } else if (result.job?.agentOnline) {
        toast.success(t('labels.sent', { count: result.count }))
      } else {
        toast.warning(t('labels.queued', { count: result.count }))
      }
      onClose()
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : String(error)),
  })

  const submit = () => {
    if (!total) {
      toast.error(t('labels.nothing'))
    } else if (rfid && !receipt && !locationId) {
      toast.error(t('labels.needLocation'))
    } else {
      print.mutate()
    }
  }

  const printerOptions = [
    ...(printers.data ?? []).map((item) => ({
      value: item.id,
      label: item.online ? item.name : `${item.name} · ${t('labels.offline')}`,
    })),
    { value: FILE, label: t('labels.printerFile') },
  ]

  return (
    <Dialog
      open
      onClose={onClose}
      title={receipt ? t('labels.titleFor', { number: receipt.number }) : t('labels.title')}
      description={receipt ? t('labels.hintReceipt') : t('labels.hintLoose')}
      size="xl"
      footer={
        <>
          <span className="mr-auto text-[13px] text-ink-3">
            {t('labels.total')}: <span className="tabular font-semibold text-ink">{formatNumber(total)}</span>
          </span>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={print.isPending}>
            {printer ? <PrinterIcon /> : <Download />}
            {printer ? t('labels.print') : t('labels.download')}
            <Shortcut combo="mod+enter" className="ml-1 opacity-70" />
          </Button>
        </>
      }
    >
      <Form id={FORM_ID} onSubmit={submit} className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('labels.printer')}>
            {(id) => (
              <Select
                id={id}
                value={printer?.id ?? FILE}
                onChange={(value) => setChanged((current) => ({ ...current, printerId: value }))}
                options={printerOptions}
              />
            )}
          </Field>
          <Field label={t('labels.size')}>
            {(id) => (
              <Select
                id={id}
                value={size}
                onChange={(value) => setChanged((current) => ({ ...current, size: value as LabelSizeKey }))}
                options={LABEL_SIZE_KEYS.map((key) => ({ value: key, label: `${key.replace('x', ' × ')} mm` }))}
              />
            )}
          </Field>
          {!printer ? (
            <Field label={t('labels.dpi')}>
              {(id) => (
                <Select
                  id={id}
                  value={String(choice.dpi)}
                  onChange={(value) => setChanged((current) => ({ ...current, dpi: Number(value) as PrinterDpi }))}
                  options={PRINTER_DPIS.map((dpi) => ({ value: String(dpi), label: `${dpi} dpi` }))}
                />
              )}
            </Field>
          ) : null}
          {!receipt ? (
            <Field label={t('receipts.location')} required={rfid}>
              {(id) => (
                <Combobox
                  id={id}
                  options={(locations.data ?? []).map((location) => ({ value: location.id, label: location.name }))}
                  value={locationId}
                  onChange={setLocationId}
                />
              )}
            </Field>
          ) : null}
        </div>

        <div data-enter-skip className="flex flex-wrap gap-x-8 gap-y-2">
          {rfidOn ? (
            <Checkbox
              checked={rfid}
              onChange={(value) => setChanged((current) => ({ ...current, rfid: value }))}
              disabled={!!printer && !printer.rfid}
              label={t('labels.rfid')}
              hint={printer && !printer.rfid ? t('labels.rfidNoPrinter') : t('labels.rfidHint')}
            />
          ) : null}
          {receipt && rfid ? (
            <Checkbox
              checked={onlyNew}
              onChange={setOnlyNew}
              label={t('labels.onlyNew')}
              hint={t('labels.onlyNewHint')}
            />
          ) : null}
          <Checkbox
            checked={choice.withPrice}
            onChange={(value) => setChanged((current) => ({ ...current, withPrice: value }))}
            label={t('labels.withPrice')}
          />
        </div>

        {printers.data && !printers.data.length ? (
          <p className="rounded-md bg-info-soft px-3 py-2 text-xs text-info">
            {t('labels.noPrinters')}{' '}
            {can('devices.manage') ? (
              <Link to="/devices" className="font-medium underline">
                {t('labels.noPrintersLink')}
              </Link>
            ) : null}
          </p>
        ) : null}

        {!receipt ? (
          <div className="flex items-center gap-3">
            <ProductPicker
              ref={pickerRef}
              onPick={(product) => void add(product.id)}
              placeholder={t('receipts.addProduct')}
              className="max-w-xl flex-1"
            />
            <span className="hidden text-xs text-ink-3 sm:block">{t('receipts.scanHint')}</span>
          </div>
        ) : null}

        {products.map((product) => (
          <LabelBlock
            key={product.id}
            product={product}
            attributes={attributes.data ?? []}
            counts={counts}
            // On a receipt the grid shows how many pieces there are, and a tagged label cannot exceed that.
            units={receipt ? units : undefined}
            limited={!!receipt && rfid}
            printed={receipt && rfid ? printedOf : undefined}
            willPrint={willPrint}
            onChange={(changes) => setCounts((current) => ({ ...current, ...changes }))}
            onRemove={
              receipt
                ? undefined
                : () => {
                    setProducts((current) => current.filter((item) => item.id !== product.id))
                    setCounts((current) => {
                      const next = { ...current }
                      product.variants.forEach((variant) => delete next[variant.id])
                      return next
                    })
                  }
            }
          />
        ))}
        {!products.length ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-3">
            {t('receipts.emptyLines')}
          </p>
        ) : null}
      </Form>
    </Dialog>
  )
}

interface BlockProps {
  product: ReceiptProductDto
  attributes: AttributeDto[]
  counts: Record<string, number | null>
  units?: Record<string, number>
  limited: boolean
  printed?: Map<string, number>
  willPrint: (variantId: string) => number
  onChange: (changes: Record<string, number | null>) => void
  onRemove?: () => void
}

function LabelBlock({
  product,
  attributes,
  counts,
  units,
  limited,
  printed,
  willPrint,
  onChange,
  onRemove,
}: BlockProps) {
  const { t } = useTranslation()
  const matrix = useMemo(() => matrixOf(product, attributes), [product, attributes])
  const axes = useMemo(() => matrixAxes(matrix), [matrix])
  const pieces = product.variants.reduce((sum, variant) => sum + (units?.[variant.id] ?? 0), 0)
  const done = product.variants.reduce((sum, variant) => sum + (printed?.get(variant.id) ?? 0), 0)
  const here = product.variants.reduce((sum, variant) => sum + willPrint(variant.id), 0)

  return (
    <section data-label-block={product.id} className="rounded-lg border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <div className="mr-auto min-w-0">
          <p className="truncate text-sm font-semibold">{product.name}</p>
          <p className="font-code text-xs text-ink-3">{product.sku}</p>
        </div>
        {printed ? (
          <Badge tone={done >= pieces ? 'ok' : done ? 'warn' : 'neutral'}>
            {t('labels.printed', { printed: done, units: pieces })}
          </Badge>
        ) : null}
        <span className="text-xs text-ink-3">
          {t('labels.total')}: <span className="tabular font-semibold text-ink">{formatNumber(here)}</span>
        </span>
        {onRemove ? (
          <Button variant="ghost" size="iconSm" tabIndex={-1} onClick={onRemove} aria-label={t('common.delete')}>
            <X />
          </Button>
        ) : null}
      </div>
      <div className="mt-3">
        <QtyMatrix
          {...axes}
          cellKey={matrix.cellKey}
          values={counts}
          onChange={onChange}
          decimals={0}
          hints={units}
          limits={limited ? units : undefined}
          corner={matrix.corner}
        />
        {UNIT_INFO[product.unit].decimals ? <p className="mt-1.5 text-xs text-ink-3">{t('labels.measured')}</p> : null}
      </div>
    </section>
  )
}
