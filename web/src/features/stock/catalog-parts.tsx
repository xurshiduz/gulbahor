import {
  formatMoney,
  UNIT_INFO,
  type AttributeDto,
  type Page as PageOf,
  type StockHistoryItemDto,
  type StockLocationDto,
  type StockPriceDto,
  type StockProductDto,
  type StockSummaryDto,
} from '@erp/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Pencil, Tags } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ColorDot } from '@/components/ui/combobox'
import { CopyText } from '@/components/ui/copy-text'
import { Dialog } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/feedback'
import { Thumb } from '@/components/ui/thumb'
import { useSession } from '@/features/auth/session'
import { useAttributes } from '@/features/catalog/catalog'
import { api } from '@/lib/api'
import { base } from '@/lib/base'
import { cn } from '@/lib/cn'
import { formatDateTime, formatNumber } from '@/lib/format'

/** Every price type the model has, a line each, retail first: one cell however many types there are. */
export function PricesCell({ prices }: { prices: StockPriceDto[] }) {
  if (!prices.length) {
    return <span className="text-ink-3">—</span>
  }
  return (
    <span data-prices className="grid grid-cols-[auto_auto] justify-end gap-x-3 leading-5 whitespace-nowrap">
      {prices.map((price, index) => (
        <span key={price.priceTypeId} className="contents">
          <span className="text-right text-xs text-ink-3">{price.name}</span>
          <span className={cn('tabular text-right', index === 0 && 'font-semibold')}>
            {formatMoney(price.amount, base(), { minor: 'never' })}
          </span>
        </span>
      ))}
    </span>
  )
}

/** The figures of the whole list the filters cover: models, pieces, and what they are worth. */
export function CatalogStats({ summary }: { summary: StockSummaryDto }) {
  const { t } = useTranslation()
  const figures: [string, string][] = [
    [t('catalog.models'), formatNumber(summary.models)],
    [t('catalog.pieces'), formatNumber(summary.qty)],
    ...(summary.costUzs !== null
      ? [[t('catalog.atCost'), formatMoney(summary.costUzs, base(), { minor: 'never' })] as [string, string]]
      : []),
    [t('catalog.atRetail'), formatMoney(summary.retailValue, base(), { minor: 'never' })],
  ]
  return (
    <div data-stats className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
      {figures.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-line bg-surface px-4 py-3 shadow-card">
          <p className="text-xs text-ink-3">{label}</p>
          <p className="tabular mt-1 text-lg font-semibold text-ink">{value}</p>
        </div>
      ))}
    </div>
  )
}

const useStockProduct = (productId: string) =>
  useQuery({
    queryKey: ['stock', 'product', productId],
    queryFn: ({ signal }) => api.get<StockProductDto>(`/stock/products/${productId}`, undefined, signal),
  })

/** A variant's name the way it is said: colour, then size, with the colour's swatch. */
function VariantName({ valueIds, attributes }: { valueIds: string[]; attributes: AttributeDto[] }) {
  const values = valueIds
    .map((id) => attributes.flatMap((attribute) => attribute.values).find((value) => value.id === id))
    .filter((value) => !!value)
  return (
    <span className="flex items-center gap-1.5">
      {values.map((value, index) => (
        <span key={value.id} className="flex items-center gap-1.5">
          {index ? <span className="text-ink-3">/</span> : null}
          {value.hex ? <ColorDot color={value.hex} /> : null}
          {value.name}
        </span>
      ))}
    </span>
  )
}

/** Under a model's row: each of its colours and sizes with its pieces, place by place, and its barcodes. */
export function VariantRows({
  productId,
  locations,
  locationId,
}: {
  productId: string
  locations: StockLocationDto[]
  locationId: string | undefined
}) {
  const { t } = useTranslation()
  const product = useStockProduct(productId)
  const attributes = useAttributes()
  if (!product.data || !attributes.data) {
    return <Spinner className="m-2 size-4" />
  }
  const unit = UNIT_INFO[product.data.unit].short
  const places = locationId ? [] : locations
  return (
    <table data-variants className="w-full text-[13px]">
      <thead>
        <tr className="text-xs text-ink-3">
          <th className="py-1 pr-3 pl-8 text-left font-medium">{t('catalog.variant')}</th>
          <th className="py-1 pr-3 text-left font-medium">{t('stock.barcode')}</th>
          {places.map((place) => (
            <th key={place.id} className="py-1 pr-3 text-right font-medium">
              {place.name}
            </th>
          ))}
          <th className="py-1 text-right font-medium">{t('stock.total')}</th>
        </tr>
      </thead>
      <tbody>
        {product.data.variants.map((variant) => {
          const qty = locationId ? (variant.byLocation[locationId] ?? 0) : variant.qty
          return (
            <tr key={variant.variantId} className={cn(!qty && 'text-ink-3')}>
              <td className="py-1 pr-3 pl-8">
                <VariantName valueIds={variant.valueIds} attributes={attributes.data} />
              </td>
              <td className="py-1 pr-3 text-xs">
                {variant.barcodes.length ? (
                  <span className="flex flex-wrap gap-x-2">
                    {variant.barcodes.map((code) => (
                      <CopyText key={code} text={code} />
                    ))}
                  </span>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </td>
              {places.map((place) => (
                <td key={place.id} className="tabular py-1 pr-3 text-right">
                  <Qty value={variant.byLocation[place.id] ?? 0} />
                </td>
              ))}
              <td className="tabular py-1 text-right font-semibold">
                <Qty value={qty} unit={unit} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** A quantity, nought included: "0" stands quietly where there is none, rather than a dash to be puzzled over. */
export function Qty({ value, unit }: { value: number; unit?: string }) {
  return (
    <span className={cn(!value && 'font-normal text-ink-3')}>
      {formatNumber(value)}
      {unit ? ` ${unit}` : null}
    </span>
  )
}

/** Where a document of the history opens; one with no page of its own is named, not linked. */
function documentLink(item: StockHistoryItemDto): ReactNode {
  const label = item.number ?? '—'
  if (item.documentType === 'receipt') {
    return (
      <Link to="/receipts/$receiptId" params={{ receiptId: item.documentId }} className="text-accent hover:underline">
        {label}
      </Link>
    )
  }
  const docs: Record<string, '/transfers/$docId' | '/writeoffs/$docId' | '/supplier-returns/$docId'> = {
    transfer: '/transfers/$docId',
    writeoff: '/writeoffs/$docId',
    supplier_return: '/supplier-returns/$docId',
  }
  const to = docs[item.documentType]
  return to ? (
    <Link to={to} params={{ docId: item.documentId }} className="text-accent hover:underline">
      {label}
    </Link>
  ) : (
    label
  )
}

/**
 * A model's card, slid in from the right of the catalogue: what it is, where its pieces are, what it sells for and
 * what happened to it. Nothing here changes the stock — documents do that; "Edit" opens the model itself.
 */
export function CatalogCard({
  productId,
  onClose,
  onLabels,
}: {
  productId: string
  onClose: () => void
  /** Labels are printed in a window of their own, which takes this card's place. */
  onLabels: () => void
}) {
  const { t } = useTranslation()
  const { can } = useSession()
  const navigate = useNavigate()
  const product = useStockProduct(productId)
  const attributes = useAttributes()
  const locations = useQuery({
    queryKey: ['stock', 'locations'],
    queryFn: ({ signal }) => api.get<StockLocationDto[]>('/stock/locations', undefined, signal),
  })
  const [page, setPage] = useState(1)
  const history = useQuery({
    queryKey: ['stock', 'history', productId, page],
    queryFn: ({ signal }) =>
      api.get<PageOf<StockHistoryItemDto>>(`/stock/products/${productId}/history`, { page, size: 10 }, signal),
    placeholderData: keepPreviousData,
  })
  const data = product.data
  const unit = data ? UNIT_INFO[data.unit].short : ''
  const places = (locations.data ?? []).filter((place) =>
    data?.variants.some((variant) => variant.byLocation[place.id]),
  )
  const pages = Math.max(1, Math.ceil((history.data?.total ?? 0) / 10))

  return (
    <Dialog
      open
      side
      size="lg"
      onClose={onClose}
      title={data?.name ?? t('catalog.card')}
      description={data ? [data.sku, data.brandName, data.categoryName].filter(Boolean).join(' · ') : undefined}
      footer={
        <>
          {can('labels.print') ? (
            <Button onClick={onLabels}>
              <Tags />
              {t('catalog.printLabels')}
            </Button>
          ) : null}
          {can('products.view') ? (
            <Button
              variant="primary"
              onClick={() => void navigate({ to: '/products/$productId', params: { productId } })}
            >
              <Pencil />
              {t('catalog.edit')}
            </Button>
          ) : null}
        </>
      }
    >
      {data && attributes.data ? (
        <div className="flex flex-col gap-5 text-[13px]">
          <div className="flex gap-4">
            {data.images[0] ? (
              <Thumb image={{ url: data.images[0].medium, blur: data.images[0].blur }} className="size-24 shrink-0" />
            ) : null}
            <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2">
              <div className="min-w-0">
                <dt className="text-xs text-ink-3">{t('products.sku')}</dt>
                <dd>{data.sku ? <CopyText text={data.sku} /> : '—'}</dd>
              </div>
              <About label={t('products.brand')} value={data.brandName} />
              <About label={t('products.category')} value={data.categoryName} />
              <About
                label={t('stock.total')}
                value={`${formatNumber(data.variants.reduce((sum, variant) => sum + variant.qty, 0))} ${unit}`}
              />
            </dl>
          </div>

          <Section title={t('catalog.stockByPlace')}>
            <table className="w-full">
              <thead>
                <tr className="text-xs text-ink-3">
                  <th className="py-1 pr-3 text-left font-medium">{t('catalog.variant')}</th>
                  {places.map((place) => (
                    <th key={place.id} className="py-1 pr-3 text-right font-medium">
                      {place.name}
                    </th>
                  ))}
                  <th className="py-1 text-right font-medium">{t('stock.total')}</th>
                </tr>
              </thead>
              <tbody>
                {data.variants.map((variant) => (
                  <tr key={variant.variantId} className={cn('border-t border-line', !variant.qty && 'text-ink-3')}>
                    <td className="py-1.5 pr-3">
                      <VariantName valueIds={variant.valueIds} attributes={attributes.data} />
                    </td>
                    {places.map((place) => (
                      <td key={place.id} className="tabular py-1.5 pr-3 text-right">
                        <Qty value={variant.byLocation[place.id] ?? 0} />
                      </td>
                    ))}
                    <td className="tabular py-1.5 text-right font-semibold">
                      <Qty value={variant.qty} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title={t('catalog.history')}>
            {history.data?.items.length ? (
              <>
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-ink-3">
                      <th className="py-1 pr-3 text-left font-medium">{t('catalog.when')}</th>
                      <th className="py-1 pr-3 text-left font-medium">{t('catalog.what')}</th>
                      <th className="py-1 pr-3 text-left font-medium">{t('catalog.where')}</th>
                      <th className="py-1 text-right font-medium">{t('catalog.qty')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.items.map((item) => (
                      <tr key={`${item.documentId}:${item.kind}:${item.locationName}`} className="border-t border-line">
                        <td className="py-1.5 pr-3 whitespace-nowrap text-ink-2">{formatDateTime(item.at)}</td>
                        <td className="py-1.5 pr-3">
                          <span className="block">
                            {t(`catalog.kinds.${item.kind}`, { defaultValue: item.kind })} {documentLink(item)}
                          </span>
                          {item.variant ? <span className="block text-xs text-ink-3">{item.variant}</span> : null}
                        </td>
                        <td className="py-1.5 pr-3 text-ink-2">{item.locationName ?? '—'}</td>
                        <td
                          className={cn(
                            'tabular py-1.5 text-right font-semibold',
                            item.qty > 0 ? 'text-ok' : 'text-bad',
                          )}
                        >
                          {item.qty > 0 ? '+' : ''}
                          {formatNumber(item.qty)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pages > 1 ? (
                  <div className="mt-2 flex items-center justify-end gap-2 text-xs text-ink-3">
                    <Button
                      size="iconSm"
                      variant="ghost"
                      aria-label={t('common.previous')}
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft />
                    </Button>
                    {page} / {pages}
                    <Button
                      size="iconSm"
                      variant="ghost"
                      aria-label={t('common.next')}
                      disabled={page >= pages}
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                ) : null}
              </>
            ) : history.isPending ? (
              <Spinner className="size-4" />
            ) : (
              <p className="text-ink-3">{t('catalog.noHistory')}</p>
            )}
          </Section>
        </div>
      ) : (
        <div className="flex justify-center py-10">
          <Spinner className="size-6" />
        </div>
      )}
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </section>
  )
}

function About({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="truncate text-ink">{value || '—'}</dd>
    </div>
  )
}
