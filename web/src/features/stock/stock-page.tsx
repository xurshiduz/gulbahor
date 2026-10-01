import {
  formatMoney,
  UNIT_INFO,
  unitCost,
  type AttributeDto,
  type Page as PageOf,
  type ReceiptProductDto,
  type StockListItemDto,
  type StockLocationDto,
  type StockProductDto,
} from '@gulbahor/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Boxes } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ColorDot, Combobox } from '@/components/ui/combobox'
import { Select } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState, Spinner } from '@/components/ui/feedback'
import { Page, SearchInput } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { useAttributes, useBrands, useCategories, useCategoryOptions } from '@/features/catalog/catalog'
import { matrixOf } from '@/features/receipts/receipt-state'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'
import { withFilter } from '@/lib/list-search'

const route = getRouteApi('/stock')

const ALL = 'all'

export function StockPage() {
  const { t } = useTranslation()
  const { can } = useSession()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const seesCost = can('stock.cost')

  const { open, ...filters } = search
  const list = useQuery({
    queryKey: ['stock', 'list', filters],
    queryFn: ({ signal }) => api.get<PageOf<StockListItemDto>>('/stock', filters, signal),
    placeholderData: keepPreviousData,
  })
  const locations = useQuery({
    queryKey: ['stock', 'locations'],
    queryFn: ({ signal }) => api.get<StockLocationDto[]>('/stock/locations', undefined, signal),
  })
  const categories = useCategories()
  const brands = useBrands()
  const categoryOptions = useCategoryOptions(categories.data, search.categoryId)
  const brandOptions = useMemo(
    () => (brands.data ?? []).map((brand) => ({ value: brand.id, label: brand.name })),
    [brands.data],
  )

  // One column per place, unless the list is already narrowed to one.
  const shownLocations = useMemo(
    () => (search.locationId ? [] : (locations.data ?? [])),
    [locations.data, search.locationId],
  )

  const columns = useMemo<ColumnDef<StockListItemDto>[]>(
    () => [
      {
        id: 'sku',
        header: t('products.sku'),
        meta: { sortKey: 'sku', className: 'w-px font-code text-xs text-ink-2 whitespace-nowrap' },
        cell: ({ row }) => row.original.sku,
      },
      {
        id: 'name',
        header: t('products.name'),
        meta: { sortKey: 'name', fixed: true },
        cell: ({ row }) => (
          <span>
            <span className="font-medium">{row.original.name}</span>
            {row.original.brandName ? <span className="text-ink-3"> · {row.original.brandName}</span> : null}
          </span>
        ),
      },
      {
        id: 'category',
        header: t('products.category'),
        meta: { className: 'text-ink-2' },
        cell: ({ row }) => row.original.categoryName ?? <span className="text-ink-3">—</span>,
      },
      ...shownLocations.map((location): ColumnDef<StockListItemDto> => ({
        id: `at:${location.id}`,
        header: location.name,
        meta: { label: location.name, className: 'tabular text-right', headerClassName: 'text-right' },
        cell: ({ row }) => {
          const qty = row.original.byLocation[location.id]
          return qty ? formatNumber(qty) : <span className="text-ink-3">—</span>
        },
      })),
      {
        id: 'qty',
        header: t('stock.total'),
        meta: { sortKey: 'qty', className: 'tabular text-right font-semibold', headerClassName: 'text-right' },
        cell: ({ row }) => `${formatNumber(row.original.qty)} ${UNIT_INFO[row.original.unit].short}`,
      },
      ...(seesCost
        ? [
            {
              id: 'cost',
              header: t('stock.cost'),
              meta: { className: 'tabular text-right whitespace-nowrap', headerClassName: 'text-right' },
              cell: ({ row }) =>
                row.original.costUzs ? (
                  <span title={formatMoney(row.original.costUsd ?? 0, 'USD')}>
                    {formatMoney(row.original.costUzs, 'UZS', { minor: 'never' })}
                  </span>
                ) : (
                  <span className="text-ink-3">—</span>
                ),
            } satisfies ColumnDef<StockListItemDto>,
          ]
        : []),
      {
        id: 'price',
        header: t('products.retailPrice'),
        meta: { className: 'tabular text-right whitespace-nowrap', headerClassName: 'text-right' },
        cell: ({ row }) =>
          row.original.retailPrice ? (
            formatMoney(row.original.retailPrice.amount, row.original.retailPrice.currency)
          ) : (
            <span className="text-ink-3">—</span>
          ),
      },
    ],
    [t, shownLocations, seesCost],
  )

  const setOpen = (productId: string | undefined) =>
    void navigate({ search: (previous) => ({ ...previous, open: productId }) })
  const filtered = !!(search.q || search.categoryId || search.brandId || search.locationId)

  return (
    <Page title={t('stock.title')} subtitle={t('stock.subtitle')}>
      <DataTable
        columns={columns}
        data={list.data?.items}
        loading={list.isFetching}
        rowId={(row) => row.productId}
        onRowOpen={(row) => setOpen(row.productId)}
        sort={search.sort ?? 'name'}
        order={search.order}
        onSortChange={(sort, order) => void navigate({ search: (previous) => withFilter(previous, { sort, order }) })}
        preferenceKey="stock"
        pagination={{
          page: search.page,
          size: search.size,
          total: list.data?.total ?? 0,
          onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
          onSizeChange: (size) => void navigate({ search: (previous) => withFilter(previous, { size }) }),
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
              value={search.locationId ?? ALL}
              onChange={(locationId) =>
                void navigate({
                  search: (previous) =>
                    withFilter(previous, { locationId: locationId === ALL ? undefined : locationId }),
                })
              }
              options={[
                { value: ALL, label: t('stock.everywhere') },
                ...(locations.data ?? []).map((location) => ({ value: location.id, label: location.name })),
              ]}
              className="w-48"
            />
            <Combobox
              options={categoryOptions}
              value={search.categoryId ?? null}
              onChange={(categoryId) =>
                void navigate({ search: (previous) => withFilter(previous, { categoryId: categoryId ?? undefined }) })
              }
              placeholder={t('products.category')}
              className="w-56"
            />
            <Combobox
              options={brandOptions}
              value={search.brandId ?? null}
              onChange={(brandId) =>
                void navigate({ search: (previous) => withFilter(previous, { brandId: brandId ?? undefined }) })
              }
              placeholder={t('products.brand')}
              className="w-44"
            />
            <Select
              value={search.presence}
              onChange={(presence) =>
                void navigate({
                  search: (previous) => withFilter(previous, { presence: presence as typeof search.presence }),
                })
              }
              options={[
                { value: 'in', label: t('stock.present') },
                { value: 'out', label: t('stock.absent') },
                { value: 'all', label: t('common.all') },
              ]}
              className="w-40"
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
      {open ? (
        <StockProductDialog productId={open} locations={locations.data ?? []} onClose={() => setOpen(undefined)} />
      ) : null}
    </Page>
  )
}

interface DialogProps {
  productId: string
  locations: StockLocationDto[]
  onClose: () => void
}

/** One model across its colours and sizes: how many of each, here or everywhere. */
function StockProductDialog({ productId, locations, onClose }: DialogProps) {
  const { t } = useTranslation()
  const attributes = useAttributes()
  const [locationId, setLocationId] = useState(ALL)
  const product = useQuery({
    queryKey: ['stock', 'product', productId],
    queryFn: ({ signal }) => api.get<StockProductDto>(`/stock/products/${productId}`, undefined, signal),
  })

  const present = locations.filter((location) =>
    product.data?.variants.some((variant) => variant.byLocation[location.id]),
  )

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={product.data?.name ?? t('stock.title')}
      description={product.data ? `${t('products.sku')}: ${product.data.sku}` : undefined}
    >
      {product.data && attributes.data ? (
        <div className="flex flex-col gap-4">
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
          <StockMatrix product={product.data} attributes={attributes.data} locationId={locationId} />
        </div>
      ) : (
        <div className="flex justify-center py-10">
          <Spinner className="size-6" />
        </div>
      )}
    </Dialog>
  )
}

function StockMatrix({
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
            <span className="tabular text-ink">{formatMoney(unitCost(cost, allQty), 'UZS', { minor: 'never' })}</span>
          </>
        ) : null}
      </p>
    </div>
  )
}
