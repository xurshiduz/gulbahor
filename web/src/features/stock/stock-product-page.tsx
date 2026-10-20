import {
  formatMoney,
  normalizeEpc,
  UNIT_STATUS_LABELS,
  UNIT_STATUSES,
  type AttributeDto,
  type ProductImageDto,
  type StockLocationDto,
  type StockProductDto,
  type StockUnitDto,
  type UnitStatus,
  type VariantLookupDto,
} from '@erp/core'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ColorDot } from '@/components/ui/combobox'
import { Select } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/dialog'
import { Badge, Shortcut, Spinner } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { Card, Page } from '@/components/ui/page'
import { Thumb } from '@/components/ui/thumb'
import { useAttributes } from '@/features/catalog/catalog'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatDay } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { useScanner } from '@/lib/scanner'
import { toast } from '@/lib/toast'

import { ALL, StockMatrix } from './stock-page'

const route = getRouteApi('/stock/$productId')

const STATUS_TONES: Record<UnitStatus, 'ok' | 'neutral' | 'warn' | 'bad'> = {
  ready: 'neutral',
  in_stock: 'ok',
  sold: 'warn',
  void: 'bad',
}

/** One model on a page of its own: photographs, what is where by colour and size, and every tagged piece. */
export function StockProductPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { productId } = route.useParams()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const attributes = useAttributes()
  const [locationId, setLocationId] = useState(ALL)

  const product = useQuery({
    queryKey: ['stock', 'product', productId],
    queryFn: ({ signal }) => api.get<StockProductDto>(`/stock/products/${productId}`, undefined, signal),
  })
  const locations = useQuery({
    queryKey: ['stock', 'locations'],
    queryFn: ({ signal }) => api.get<StockLocationDto[]>('/stock/locations', undefined, signal),
  })

  const back = () => router.history.back()
  useHotkey('escape', back, { label: t('common.back') })

  // A tag read here is looked for among this model's pieces; another model's opens that model.
  useScanner((code) => {
    api
      .get<VariantLookupDto>('/products/lookup', { code })
      .then((found) =>
        found.productId === productId
          ? void navigate({ search: { epc: found.epc ?? undefined }, replace: true })
          : void navigate({
              to: '/stock/$productId',
              params: { productId: found.productId },
              search: { epc: found.epc ?? undefined },
            }),
      )
      .catch((error: unknown) => toast.error(error instanceof ApiError ? error.message : String(error)))
  })

  const data = product.data
  const present = (locations.data ?? []).filter((location) =>
    data?.variants.some((variant) => variant.byLocation[location.id]),
  )

  return (
    <Page
      title={data?.name ?? t('stock.title')}
      note={data ? [data.sku, data.brandName, data.categoryName].filter(Boolean).join(' · ') : undefined}
      actions={
        <Button onClick={back}>
          <ArrowLeft />
          {t('common.back')}
          <Shortcut combo="escape" className="ml-1" />
        </Button>
      }
    >
      {data && attributes.data ? (
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-6">
          <div className="flex max-w-6xl flex-col gap-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
              <Photos images={data.images} />
              <Card title={t('stock.byVariant')}>
                <div className="flex flex-col gap-3">
                  <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
                    <About label={t('products.brand')} value={data.brandName} />
                    <About label={t('products.category')} value={data.categoryName} />
                    <About
                      label={t('products.retailPrice')}
                      value={data.retailPrice ? formatMoney(data.retailPrice.amount, data.retailPrice.currency) : null}
                    />
                  </dl>
                  {present.length > 1 ? (
                    <Select
                      value={locationId}
                      onChange={setLocationId}
                      options={[
                        { value: ALL, label: t('stock.everywhere') },
                        ...present.map((location) => ({ value: location.id, label: location.name })),
                      ]}
                      className="w-56"
                    />
                  ) : null}
                  <StockMatrix product={data} attributes={attributes.data} locationId={locationId} />
                </div>
              </Card>
            </div>
            <Units product={data} attributes={attributes.data} found={search.epc ?? null} />
          </div>
        </div>
      ) : (
        <div className="flex justify-center py-10">
          <Spinner className="size-6" />
        </div>
      )}
    </Page>
  )
}

function About({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-ink-3">{label}:</dt>
      <dd className="font-medium">{value ?? '—'}</dd>
    </div>
  )
}

/** The model's photographs: a large one, the rest beside it; any of them opens full size. */
function Photos({ images }: { images: ProductImageDto[] }) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(0)
  const [viewing, setViewing] = useState<ProductImageDto | null>(null)
  if (!images.length) {
    return (
      <Card>
        <p className="py-10 text-center text-sm text-ink-3">{t('stock.noImages')}</p>
      </Card>
    )
  }
  const main = images[Math.min(shown, images.length - 1)]
  return (
    <Card>
      <button type="button" className="block w-full cursor-zoom-in" onClick={() => setViewing(main)}>
        <Thumb image={{ url: main.medium, blur: main.blur }} className="aspect-square w-full border border-line" />
      </button>
      {images.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setShown(index)}
              className={cn('rounded-md', index === shown && 'ring-2 ring-accent')}
            >
              <Thumb image={{ url: image.small, blur: image.blur }} className="size-12 border border-line" />
            </button>
          ))}
        </div>
      ) : null}
      {viewing ? (
        <Dialog open onClose={() => setViewing(null)} title={t('products.sectionImages')} size="xl">
          <img
            src={viewing.large}
            alt=""
            width={viewing.width}
            height={viewing.height}
            style={{ backgroundImage: `url(${viewing.blur})` }}
            className="mx-auto max-h-[70vh] w-auto max-w-full rounded-md bg-cover"
          />
        </Dialog>
      ) : null}
    </Card>
  )
}

/** Every tagged piece of the model: the end of its tag is what the label prints after «#». */
function Units({
  product,
  attributes,
  found,
}: {
  product: StockProductDto
  attributes: AttributeDto[]
  found: string | null
}) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<UnitStatus | typeof ALL>('in_stock')
  const [text, setText] = useState('')
  const units = useQuery({
    queryKey: ['stock', 'units', product.productId],
    queryFn: ({ signal }) => api.get<StockUnitDto[]>(`/stock/products/${product.productId}/units`, undefined, signal),
  })

  const values = useMemo(
    () => new Map(attributes.flatMap((attribute) => attribute.values.map((value) => [value.id, value]))),
    [attributes],
  )
  const variantOf = useMemo(
    () => new Map(product.variants.map((variant) => [variant.variantId, variant.valueIds])),
    [product.variants],
  )

  const wanted = normalizeEpc(text) ?? text.replace(/^#/, '').trim().toUpperCase()
  const rows = (units.data ?? []).filter(
    (unit) =>
      unit.epc === found ||
      ((status === ALL || unit.status === status) && (!wanted || unit.epc.endsWith(wanted) || unit.epc === wanted)),
  )

  // The piece just read is brought into view.
  useEffect(() => {
    if (found && units.data) {
      document.querySelector(`[data-epc="${found}"]`)?.scrollIntoView({ block: 'center' })
    }
  }, [found, units.data])

  const counts = (units.data ?? []).reduce<Record<string, number>>((all, unit) => {
    all[unit.status] = (all[unit.status] ?? 0) + 1
    return all
  }, {})

  return (
    <Card title={t('stock.units')}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('stock.unitSearch')}
          className="w-56"
        />
        <Select
          value={status}
          onChange={(value) => setStatus(value as UnitStatus | typeof ALL)}
          options={[
            ...UNIT_STATUSES.map((value) => ({
              value,
              label: `${UNIT_STATUS_LABELS[value]} (${counts[value] ?? 0})`,
            })),
            { value: ALL, label: `${t('common.all')} (${units.data?.length ?? 0})` },
          ]}
          className="w-48"
        />
        <span className="text-xs text-ink-3">{t('stock.unitScanHint')}</span>
      </div>
      {units.isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-xs text-ink-3">
              <tr className="border-b border-line">
                <th className="py-1.5 pr-3 font-medium">{t('stock.unitTag')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('stock.unitVariant')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('stock.unitStatus')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('stock.unitPlace')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('stock.unitReceipt')}</th>
                <th className="py-1.5 font-medium">{t('stock.unitPrinted')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((unit) => (
                <tr
                  key={unit.id}
                  data-epc={unit.epc}
                  className={cn('border-b border-line last:border-0', unit.epc === found && 'bg-accent-soft')}
                >
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    <span className="font-code font-semibold">#{unit.epc.slice(-6)}</span>
                    <span className="ml-2 font-code text-[11px] text-ink-3">{unit.epc}</span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {(variantOf.get(unit.variantId) ?? []).map((valueId) => {
                        const value = values.get(valueId)
                        return value ? (
                          <span key={valueId} className="flex items-center gap-1">
                            {value.hex ? <ColorDot color={value.hex} /> : null}
                            {value.name}
                          </span>
                        ) : null
                      })}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <Badge tone={STATUS_TONES[unit.status]}>{UNIT_STATUS_LABELS[unit.status]}</Badge>
                  </td>
                  <td className="py-1.5 pr-3">{unit.locationName ?? <span className="text-ink-3">—</span>}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {unit.receiptNumber ? (
                      <>
                        {unit.receiptNumber}
                        {unit.unitNo ? <span className="text-ink-3"> · {unit.unitNo}</span> : null}
                      </>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="py-1.5 whitespace-nowrap text-ink-2">
                    {unit.lastPrintedAt ? formatDay(unit.lastPrintedAt.slice(0, 10)) : '—'}
                    {unit.printCount > 1 ? <span className="text-ink-3"> ×{unit.printCount}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-ink-3">{t('stock.noUnits')}</p>
      )}
    </Card>
  )
}
