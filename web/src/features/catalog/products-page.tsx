import {
  formatMoney,
  SEASON_LABELS,
  type Page as PageOf,
  type ProductListItemDto,
  type VariantLookupDto,
} from '@gulbahor/core'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Shirt, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterCombo, FilterSelect } from '@/components/ui/column-filters'
import { ColorDot } from '@/components/ui/combobox'
import { Menu } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { useConfirm } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut } from '@/components/ui/feedback'
import { Page, SearchInput } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api, ApiError } from '@/lib/api'
import { fetchAll, moneyCell } from '@/lib/excel'
import { useHotkey } from '@/lib/hotkeys'
import { withFilter } from '@/lib/list-search'
import { useScanner } from '@/lib/scanner'
import { toast } from '@/lib/toast'

import { useBrands, useCategories, useCategoryOptions } from './catalog'

const route = getRouteApi('/products')

const MAX_DOTS = 8
const MAX_SIZES = 8

export function ProductsPage() {
  const { t } = useTranslation()
  const { can } = useSession()
  const confirm = useConfirm()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const go = useNavigate()
  const canManage = can('products.manage')

  const list = useQuery({
    queryKey: ['products', 'list', search],
    queryFn: ({ signal }) => api.get<PageOf<ProductListItemDto>>('/products', search, signal),
    placeholderData: keepPreviousData,
  })
  const categories = useCategories()
  const brands = useBrands()
  const categoryOptions = useCategoryOptions(categories.data, search.categoryId)
  const brandOptions = useMemo(
    () => (brands.data ?? []).map((brand) => ({ value: brand.id, label: brand.name })),
    [brands.data],
  )

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post(`/products/${id}/${active ? 'restore' : 'archive'}`),
    onSuccess: (_data, { active }) => toast.success(active ? t('products.restored') : t('products.archived')),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => toast.success(t('products.deleted')),
  })

  const open = (productId: string) => void go({ to: '/products/$productId', params: { productId } })

  useHotkey('n', () => open('new'), { label: t('products.add'), group: t('shortcuts.groupList'), enabled: canManage })

  // A scanned barcode opens the model it belongs to, wherever the cursor is.
  useScanner((code) => {
    api
      .get<VariantLookupDto>('/products/lookup', { code })
      .then((found) => open(found.productId))
      .catch((error: unknown) => toast.error(error instanceof ApiError ? error.message : t('common.nothingFound')))
  })

  const columns = useMemo<ColumnDef<ProductListItemDto>[]>(
    () => [
      {
        id: 'sku',
        header: t('products.sku'),
        meta: {
          export: (row) => row.sku,
          sortKey: 'sku',
          className: 'w-px font-code text-xs text-ink-2 whitespace-nowrap',
        },
        cell: ({ row }) => row.original.sku,
      },
      {
        id: 'name',
        header: t('products.name'),
        meta: { export: (row) => row.name, sortKey: 'name', fixed: true },
        cell: ({ row }) => (
          <span>
            <span className="font-medium">{row.original.name}</span>
            {row.original.brandName ? <span className="text-ink-3"> · {row.original.brandName}</span> : null}
          </span>
        ),
      },
      { id: 'brand', header: t('products.brand'), meta: { exportOnly: true, export: (row) => row.brandName } },
      {
        id: 'category',
        header: t('products.category'),
        meta: { export: (row) => row.categoryName, sortKey: 'category', className: 'text-ink-2' },
        cell: ({ row }) => row.original.categoryName ?? <span className="text-ink-3">—</span>,
      },
      {
        id: 'variants',
        header: t('products.variants'),
        meta: { export: (row) => row.variantCount },
        cell: ({ row }) => <Variants product={row.original} />,
      },
      {
        id: 'price',
        header: t('products.retailPrice'),
        meta: {
          export: (row) => moneyCell(row.retailPrice?.amount, row.retailPrice?.currency),
          className: 'tabular text-right whitespace-nowrap',
          headerClassName: 'text-right',
        },
        cell: ({ row }) =>
          row.original.retailPrice ? (
            <span className="font-medium">
              {formatMoney(row.original.retailPrice.amount, row.original.retailPrice.currency)}
            </span>
          ) : (
            <span className="text-ink-3">—</span>
          ),
      },
      {
        id: 'season',
        header: t('products.season'),
        meta: {
          export: (row) => (row.season ? SEASON_LABELS[row.season] : null),
          className: 'whitespace-nowrap text-ink-2',
        },
        cell: ({ row }) => {
          const parts = [
            row.original.season ? SEASON_LABELS[row.original.season] : null,
            row.original.collectionYear,
          ].filter(Boolean)
          return parts.length ? parts.join(' ') : <span className="text-ink-3">—</span>
        },
      },
      {
        id: 'year',
        header: t('products.collectionYear'),
        meta: { exportOnly: true, export: (row) => row.collectionYear },
      },
      {
        id: 'status',
        header: t('common.status'),
        meta: { export: (row) => (row.isActive ? t('common.active') : t('common.archived')) },
        cell: ({ row }) =>
          row.original.isActive ? <Badge tone="ok">{t('common.active')}</Badge> : <Badge>{t('common.archived')}</Badge>,
      },
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
                  { label: t('common.edit'), icon: <Pencil />, onSelect: () => open(row.original.id) },
                  row.original.isActive
                    ? {
                        label: t('common.archive'),
                        icon: <Archive />,
                        onSelect: async () => {
                          if (
                            await confirm({
                              title: t('products.archiveConfirm', { name: row.original.name }),
                              confirmLabel: t('common.archive'),
                              tone: 'danger',
                            })
                          ) {
                            setActive.mutate({ id: row.original.id, active: false })
                          }
                        },
                      }
                    : {
                        label: t('common.restore'),
                        icon: <ArchiveRestore />,
                        onSelect: () => setActive.mutate({ id: row.original.id, active: true }),
                      },
                  'separator',
                  {
                    label: t('common.delete'),
                    icon: <Trash2 />,
                    tone: 'danger',
                    onSelect: async () => {
                      if (
                        await confirm({
                          title: t('products.deleteConfirm', { name: row.original.name }),
                          description: t('products.deleteHint'),
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
    [t, canManage],
  )

  const filtered = !!(search.q || search.categoryId || search.brandId)

  return (
    <Page
      title={t('products.title')}
      actions={
        canManage ? (
          <Button variant="primary" onClick={() => open('new')}>
            <Plus />
            {t('products.add')}
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
        onRowOpen={(row) => open(row.id)}
        exportAs={{
          fileName: t('products.title'),
          rows: () => fetchAll<ProductListItemDto>('/products', search),
        }}
        sort={search.sort ?? 'name'}
        order={search.order}
        onSortChange={(sort, order) => void navigate({ search: (previous) => withFilter(previous, { sort, order }) })}
        preferenceKey="products"
        rowClassName={(row) => (row.isActive ? undefined : 'text-ink-3')}
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
          status: (
            <FilterSelect
              value={search.status}
              onChange={(status) =>
                void navigate({
                  search: (previous) => withFilter(previous, { status: status as typeof search.status }),
                })
              }
              options={[
                { value: 'active', label: t('common.active') },
                { value: 'archived', label: t('common.archived') },
                { value: 'all', label: t('common.all') },
              ]}
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
          </>
        }
        empty={
          <EmptyState
            icon={Shirt}
            title={filtered ? t('common.nothingFound') : t('products.empty')}
            hint={filtered ? undefined : t('products.emptyHint')}
            action={
              canManage && !filtered ? (
                <Button variant="primary" size="sm" onClick={() => open('new')}>
                  <Plus />
                  {t('products.add')}
                </Button>
              ) : null
            }
          />
        }
      />
    </Page>
  )
}

/** The colours as dots, the sizes as text, and how many variants there are in all. */
function Variants({ product }: { product: ProductListItemDto }) {
  if (!product.axes.length) {
    return <span className="text-ink-3">—</span>
  }
  return (
    <span className="flex items-center gap-2.5 whitespace-nowrap">
      {product.axes.map((axis) =>
        axis.kind === 'color' ? (
          <span
            key={axis.attributeId}
            className="flex items-center gap-0.5"
            title={axis.values.map((value) => value.name).join(', ')}
          >
            {axis.values
              .slice(0, MAX_DOTS)
              .map((value) => (value.hex ? <ColorDot key={value.id} color={value.hex} /> : null))}
            {axis.values.length > MAX_DOTS ? (
              <span className="ml-0.5 text-xs text-ink-3">+{axis.values.length - MAX_DOTS}</span>
            ) : null}
            {axis.values.every((value) => !value.hex) ? (
              <span className="text-ink-2">{axis.values.map((value) => value.name).join(', ')}</span>
            ) : null}
          </span>
        ) : (
          <span
            key={axis.attributeId}
            className="tabular text-xs text-ink-2"
            title={axis.values.map((value) => value.name).join(', ')}
          >
            {axis.values
              .slice(0, MAX_SIZES)
              .map((value) => value.name)
              .join(' · ')}
            {axis.values.length > MAX_SIZES ? ` +${axis.values.length - MAX_SIZES}` : ''}
          </span>
        ),
      )}
      <span className="tabular text-xs text-ink-3">({product.variantCount})</span>
    </span>
  )
}
