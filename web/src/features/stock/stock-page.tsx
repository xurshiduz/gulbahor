import {
  formatMoney,
  GENDER_LABELS,
  SEASON_LABELS,
  UNIT_INFO,
  unitCost,
  type AttributeDto,
  type ReceiptProductDto,
  type StockListDto,
  type StockListItemDto,
  type StockLocationDto,
  type StockProductDto,
  type VariantLookupDto,
} from '@erp/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { BarChart3, Boxes, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FilterCombo } from '@/components/ui/column-filters'
import { ColorDot } from '@/components/ui/combobox'
import { CopyText } from '@/components/ui/copy-text'
import { Button } from '@/components/ui/button'
import { Select, TabPanel, Tabs } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/feedback'
import { Page, PageActions, SearchInput } from '@/components/ui/page'
import { Thumb } from '@/components/ui/thumb'
import { useSession } from '@/features/auth/session'
import { useBrands, useCategories, useCategoryOptions, usePriceTypes } from '@/features/catalog/catalog'
import { LabelDialog } from '@/features/labels/label-dialog'
import { matrixOf } from '@/features/receipts/receipt-state'
import { api, ApiError } from '@/lib/api'
import { base } from '@/lib/base'
import { fetchAll, moneyCell } from '@/lib/excel'
import { cn } from '@/lib/cn'
import { formatDay, formatNumber } from '@/lib/format'
import { usePreference } from '@/lib/preferences'
import { withFilter } from '@/lib/list-search'
import { useScanner } from '@/lib/scanner'
import { useShopFilter } from '@/lib/shop'
import { toast } from '@/lib/toast'

import { CatalogCard, CatalogStats, PricesCell, Qty, VariantRows } from './catalog-parts'

const route = getRouteApi('/stock')

export const ALL = 'all'

type Tab = 'all' | 'in' | 'out' | 'archived'

/** What a person has open over the catalogue: a model's card, or the labels window that took its place. */
type Over = { kind: 'card' | 'labels'; productId: string }

/**
 * The catalogue: every model with where its pieces are and what it sells for, as the goods are seen in Billz.
 * A row opens its colours and sizes under it; a click opens the model's card. Stock is changed by documents
 * (receipts, sales, transfers, counts) and nowhere here.
 */
export function StockPage() {
  const { t } = useTranslation()
  const { can } = useSession()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const seesCost = can('stock.cost')
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [over, setOver] = useState<Over | null>(null)
  const [statsShown, setStatsShown] = usePreference<boolean>('catalog.stats', true)
  const tab: Tab = search.status === 'archived' ? 'archived' : search.presence
  const toggle = (productId: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })

  // The place picked in the top bar stands in for one the page does not name.
  const shopFilter = useShopFilter(search.locationId)
  const filters = { ...search, locationId: shopFilter.locationId }
  const list = useQuery({
    queryKey: ['stock', 'list', filters],
    queryFn: ({ signal }) => api.get<StockListDto>('/stock', filters, signal),
    placeholderData: keepPreviousData,
  })
  const locations = useQuery({
    queryKey: ['stock', 'locations'],
    queryFn: ({ signal }) => api.get<StockLocationDto[]>('/stock/locations', undefined, signal),
  })
  const categories = useCategories()
  const brands = useBrands()
  const categoryOptions = useCategoryOptions(categories.data, search.categoryId)
  const priceTypes = usePriceTypes()
  const brandOptions = useMemo(
    () => (brands.data ?? []).map((brand) => ({ value: brand.id, label: brand.name })),
    [brands.data],
  )

  // One column per place, unless the list is already narrowed to one.
  const shownLocations = useMemo(
    () => (filters.locationId ? [] : (locations.data ?? [])),
    [locations.data, filters.locationId],
  )

  const faces = !!list.data?.items.some((item) => item.image)
  const columns = useMemo<ColumnDef<StockListItemDto>[]>(
    () => [
      {
        id: 'sku',
        header: t('products.sku'),
        meta: {
          export: (row) => row.sku,
          sortKey: 'sku',
          className: 'w-px font-code text-xs text-ink-2 whitespace-nowrap',
        },
        cell: ({ row }) => <CopyText text={row.original.sku} />,
      },
      {
        id: 'barcode',
        header: t('stock.barcode'),
        meta: {
          // Kept as text in the file: a long code is not a number to be rounded.
          export: (row) => row.barcodes.join(', '),
          className: 'w-px font-code text-xs text-ink-2 whitespace-nowrap',
        },
        // A model has a code for each colour and size: the first is shown, the rest are a hover away.
        cell: ({ row }) => {
          const [first, ...rest] = row.original.barcodes
          return first ? (
            <span data-barcodes className="inline-flex items-center gap-1">
              <CopyText text={first} />
              {rest.length ? (
                <span className="text-ink-3" title={row.original.barcodes.join('\n')}>
                  +{rest.length}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-ink-3">—</span>
          )
        },
      },
      {
        id: 'name',
        header: t('products.name'),
        meta: { export: (row) => row.name, sortKey: 'name', fixed: true },
        cell: ({ row }) => (
          <span className="flex items-center gap-2.5">
            {/* Its colours and sizes open under the row, without leaving the list. */}
            <button
              type="button"
              tabIndex={-1}
              data-expand={row.original.productId}
              aria-label={t('catalog.variants')}
              aria-expanded={open.has(row.original.productId)}
              onClick={(event) => {
                event.stopPropagation()
                toggle(row.original.productId)
              }}
              className="-ml-1 shrink-0 rounded p-0.5 text-ink-3 hover:bg-sunken hover:text-ink"
            >
              {open.has(row.original.productId) ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
            {faces ? <Thumb image={row.original.image} className="size-9" /> : null}
            <span>
              <span className="font-medium">{row.original.name}</span>
            </span>
          </span>
        ),
      },
      {
        id: 'brand',
        header: t('products.brand'),
        meta: { export: (row) => row.brandName, className: 'text-ink-2' },
        cell: ({ row }) => row.original.brandName ?? <span className="text-ink-3">—</span>,
      },
      {
        id: 'category',
        header: t('products.category'),
        meta: { export: (row) => row.categoryName, className: 'text-ink-2' },
        cell: ({ row }) => row.original.categoryName ?? <span className="text-ink-3">—</span>,
      },
      // What else a model says of itself: there for whoever wants it, off until switched on.
      ...extraColumns(t),
      ...shownLocations.map((location): ColumnDef<StockListItemDto> => ({
        id: `at:${location.id}`,
        header: location.name,
        meta: {
          label: location.name,
          className: 'tabular text-right',
          headerClassName: 'text-right',
          export: (row) => row.byLocation[location.id] || null,
        },
        cell: ({ row }) => {
          const qty = row.original.byLocation[location.id]
          return <Qty value={qty ?? 0} />
        },
      })),
      {
        id: 'qty',
        header: t('stock.total'),
        meta: {
          export: (row) => row.qty,
          sortKey: 'qty',
          className: 'tabular text-right font-semibold',
          headerClassName: 'text-right',
        },
        // What of it is promised to customers stands under it: it is there, but not for anyone else.
        cell: ({ row }) => (
          <span className="flex flex-col items-end leading-tight">
            <span>{`${formatNumber(row.original.qty)} ${UNIT_INFO[row.original.unit].short}`}</span>
            {row.original.held ? (
              <span data-held className="text-xs font-normal text-accent-ink">
                {t('stock.held', { n: formatNumber(row.original.held) })}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'held',
        header: t('stock.heldColumn'),
        meta: { exportOnly: true, export: (row) => row.held },
      },
      ...(seesCost
        ? [
            {
              id: 'cost',
              header: t('stock.cost'),
              meta: {
                export: (row) => moneyCell(row.costUzs),
                className: 'tabular text-right whitespace-nowrap',
                headerClassName: 'text-right',
              },
              cell: ({ row }) =>
                row.original.costUzs ? (
                  formatMoney(row.original.costUzs, base(), { minor: 'never' })
                ) : (
                  <span className="text-ink-3">—</span>
                ),
            } satisfies ColumnDef<StockListItemDto>,
          ]
        : []),
      {
        // Every price type in one cell, a line each: however many there are, the table keeps its width.
        id: 'price',
        header: t('catalog.prices'),
        meta: {
          export: (row) => row.prices.map((price) => `${price.name}: ${price.amount / 100}`).join('; ') || null,
          className: 'tabular text-right whitespace-nowrap',
          headerClassName: 'text-right',
        },
        cell: ({ row }) => <PricesCell prices={row.original.prices} />,
      },
      // Each price type in a column of its own too, as Billz shows them, for whoever prefers it so.
      ...(priceTypes.data ?? [])
        .filter((type) => type.isActive)
        .map((type): ColumnDef<StockListItemDto> => ({
          id: `price:${type.id}`,
          header: type.name,
          meta: {
            label: `${t('catalog.prices')}: ${type.name}`,
            hiddenByDefault: true,
            className: 'tabular text-right whitespace-nowrap',
            headerClassName: 'text-right',
            export: (row) => {
              const price = row.prices.find((item) => item.priceTypeId === type.id)
              return price ? moneyCell(price.amount) : null
            },
          },
          cell: ({ row }) => {
            const price = row.original.prices.find((item) => item.priceTypeId === type.id)
            return price ? formatMoney(price.amount, base(), { minor: 'never' }) : <span className="text-ink-3">—</span>
          },
        })),
    ],

    [t, shownLocations, seesCost, faces, open, priceTypes.data],
  )

  const openProduct = (productId: string) => setOver({ kind: 'card', productId })
  // A label read anywhere on the list opens its model's card.
  useScanner((code) => {
    api
      .get<VariantLookupDto>('/products/lookup', { code })
      .then((found) => openProduct(found.productId))
      .catch((error: unknown) => toast.error(error instanceof ApiError ? error.message : String(error)))
  })
  const filtered = !!(search.q || search.categoryId || search.brandId || filters.locationId)

  const setTab = (next: string) =>
    void navigate({
      search: (previous) =>
        withFilter(
          previous,
          next === 'archived'
            ? { status: 'archived', presence: 'all' }
            : { status: 'active', presence: next as 'all' | 'in' | 'out' },
        ),
    })

  const table = (
    <DataTable
      columns={columns}
      data={list.data?.items}
      loading={list.isFetching}
      rowId={(row) => row.productId}
      onRowOpen={(row) => openProduct(row.productId)}
      expanded={(row) =>
        open.has(row.productId) ? (
          <VariantRows productId={row.productId} locations={locations.data ?? []} locationId={filters.locationId} />
        ) : null
      }
      exportAs={{ fileName: t('catalog.title'), rows: () => fetchAll<StockListItemDto>('/stock', filters) }}
      sort={search.sort ?? 'name'}
      order={search.order}
      onSortChange={(sort, order) => void navigate({ search: (previous) => withFilter(previous, { sort, order }) })}
      preferenceKey="catalog"
      pagination={{
        page: search.page,
        size: search.size,
        total: list.data?.total ?? 0,
        onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
        onSizeChange: (size) => void navigate({ search: (previous) => withFilter(previous, { size }) }),
      }}
      filters={{
        category: (
          <FilterCombo
            options={categoryOptions}
            value={search.categoryId ?? null}
            onChange={(categoryId) =>
              void navigate({ search: (previous) => withFilter(previous, { categoryId: categoryId ?? undefined }) })
            }
          />
        ),
        name: (
          <FilterCombo
            options={brandOptions}
            value={search.brandId ?? null}
            placeholder={t('products.brand')}
            onChange={(brandId) =>
              void navigate({ search: (previous) => withFilter(previous, { brandId: brandId ?? undefined }) })
            }
          />
        ),
      }}
      toolbar={
        <>
          <SearchInput
            value={search.q ?? ''}
            placeholder={t('products.searchPlaceholder')}
            onChange={(q) =>
              void navigate({ search: (previous) => withFilter(previous, { q: q || undefined }), replace: true })
            }
            className="w-72"
          />
          <Select
            value={filters.locationId ?? ALL}
            onChange={(locationId) =>
              void navigate({
                search: (previous) =>
                  withFilter(previous, { locationId: shopFilter.toUrl(locationId === ALL ? undefined : locationId) }),
              })
            }
            options={[
              { value: ALL, label: t('stock.everywhere') },
              ...(locations.data ?? []).map((location) => ({ value: location.id, label: location.name })),
            ]}
            className="w-48"
          />
        </>
      }
      empty={
        <EmptyState
          icon={Boxes}
          title={filtered ? t('common.nothingFound') : t('stock.empty')}
          hint={filtered ? undefined : t('stock.emptyHint')}
        />
      }
    />
  )

  return (
    <Page title={t('catalog.title')}>
      <PageActions>
        <Button
          variant={statsShown ? 'soft' : 'ghost'}
          onClick={() => setStatsShown(!statsShown)}
          aria-pressed={statsShown}
        >
          <BarChart3 />
          {t('catalog.stats')}
        </Button>
        {can('products.manage') ? (
          <Button
            variant="primary"
            onClick={() => void navigate({ to: '/products/$productId', params: { productId: 'new' } })}
          >
            <Plus />
            {t('products.add')}
          </Button>
        ) : null}
      </PageActions>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'all', label: t('common.all') },
          { value: 'in', label: t('stock.present') },
          { value: 'out', label: t('stock.absent') },
          { value: 'archived', label: t('common.archived') },
        ]}
      >
        <TabPanel value={tab}>
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {statsShown && list.data?.summary ? <CatalogStats summary={list.data.summary} /> : null}
            {table}
          </div>
        </TabPanel>
      </Tabs>
      {over?.kind === 'card' ? (
        <CatalogCard
          productId={over.productId}
          onClose={() => setOver(null)}
          onLabels={() => setOver({ kind: 'labels', productId: over.productId })}
        />
      ) : null}
      {over?.kind === 'labels' ? <LabelDialog productId={over.productId} onClose={() => setOver(null)} /> : null}
    </Page>
  )
}

/** A text column the catalogue offers, off until a person switches it on. */
function textColumn(
  id: string,
  header: string,
  value: (row: StockListItemDto) => string | number | null,
): ColumnDef<StockListItemDto> {
  return {
    id,
    header,
    meta: { hiddenByDefault: true, className: 'text-ink-2 whitespace-nowrap', export: (row) => value(row) },
    cell: ({ row }) => value(row.original) ?? <span className="text-ink-3">—</span>,
  }
}

function extraColumns(t: (key: string) => string): ColumnDef<StockListItemDto>[] {
  return [
    textColumn('suppliers', t('catalog.suppliers'), (row) => row.suppliers.join(', ') || null),
    textColumn('variantCount', t('catalog.variants'), (row) => row.variants),
    textColumn('season', t('products.season'), (row) => (row.season ? SEASON_LABELS[row.season] : null)),
    textColumn('gender', t('products.gender'), (row) => (row.gender ? GENDER_LABELS[row.gender] : null)),
    textColumn('collectionYear', t('products.collectionYear'), (row) => row.collectionYear),
    textColumn('material', t('products.material'), (row) => row.material),
    textColumn('originCountry', t('products.originCountry'), (row) => row.originCountry),
    textColumn('manufacturer', t('products.manufacturer'), (row) => row.manufacturer),
    textColumn('factoryCode', t('products.factoryCode'), (row) => row.factoryCode),
    textColumn('mxikCode', t('products.mxik'), (row) => row.mxikCode),
    textColumn('createdAt', t('catalog.createdAt'), (row) => formatDay(row.createdAt.slice(0, 10))),
  ]
}

export function StockMatrix({
  product,
  attributes,
  locationId,
}: {
  product: StockProductDto
  attributes: AttributeDto[]
  locationId: string
}) {
  const { t } = useTranslation()
  const unit = UNIT_INFO[product.unit].short
  const byVariant = new Map(product.variants.map((variant) => [variant.variantId, variant]))
  const qtyOf = (variantId: string | null) => {
    const variant = variantId ? byVariant.get(variantId) : undefined
    return variant ? (locationId === ALL ? variant.qty : (variant.byLocation[locationId] ?? 0)) : 0
  }

  // The same grid the receipt is typed into, read-only.
  const shape: ReceiptProductDto = {
    id: product.productId,
    name: product.name,
    sku: product.sku,
    unit: product.unit,
    weightG: null,
    axisIds: product.axisIds,
    variants: product.variants.map((variant) => ({
      id: variant.variantId,
      valueIds: variant.valueIds,
      sku: variant.sku,
      isActive: true,
    })),
  }
  const matrix = matrixOf(shape, attributes)
  const total = product.variants.reduce((sum, variant) => sum + qtyOf(variant.variantId), 0)
  const cost = product.variants.reduce((sum, variant) => sum + (variant.costUzs ?? 0), 0)
  const allQty = product.variants.reduce((sum, variant) => sum + variant.qty, 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-[13px]">
          <thead>
            <tr>
              <th className="pr-3 text-left text-xs font-medium text-ink-3">{matrix.corner}</th>
              {matrix.columns.map((column) => (
                <th key={column.id} className="min-w-12 px-1 text-center text-xs font-medium text-ink-2">
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row, r) => (
              <tr key={row.key}>
                <th className="pr-3 text-left text-xs font-medium whitespace-nowrap text-ink-2">
                  <span className="flex items-center gap-1.5">
                    {row.values.map((value) => (
                      <span key={value.id} className="flex items-center gap-1.5">
                        {value.hex ? <ColorDot color={value.hex} /> : null}
                        {value.name}
                      </span>
                    ))}
                  </span>
                </th>
                {matrix.columns.map((column, c) => {
                  const key = matrix.cellKey(r, c)
                  const qty = qtyOf(key)
                  return (
                    <td key={column.id}>
                      <div
                        className={cn(
                          'tabular flex h-8 min-w-12 items-center justify-center rounded-md border px-2',
                          !key && 'border-dashed border-line',
                          key && !qty && 'border-line text-ink-3',
                          qty > 0 && 'border-accent/40 bg-accent-soft font-semibold text-accent-ink',
                        )}
                      >
                        {key ? formatNumber(qty) : ''}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-3">
        {t('stock.total')}:{' '}
        <span className="tabular font-semibold text-ink">
          {formatNumber(total)} {unit}
        </span>
        {cost && allQty ? (
          <>
            {' · '}
            {t('stock.unitCost')}:{' '}
            <span className="tabular text-ink">{formatMoney(unitCost(cost, allQty), base(), { minor: 'never' })}</span>
          </>
        ) : null}
      </p>
    </div>
  )
}
