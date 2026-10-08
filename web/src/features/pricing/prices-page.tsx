import {
  formatMoney,
  marginPercent,
  SEASON_LABELS,
  SEASONS,
  type Page as PageOf,
  type PriceListFilter,
  type PriceListItemDto,
  type PriceRevisionDto,
  type RepriceResult,
  type Season,
} from '@erp/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { BadgePercent, History, MoreHorizontal, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterCombo, FilterSelect } from '@/components/ui/column-filters'
import { Menu, Select, TabPanel, Tabs } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { useConfirm } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut } from '@/components/ui/feedback'
import { NumberInput } from '@/components/ui/number-input'
import { Page, SearchInput } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { useBrands, useCategories, useCategoryOptions, usePriceTypes } from '@/features/catalog/catalog'
import { api } from '@/lib/api'
import { base, baseWords, dollarsBeside } from '@/lib/base'
import { fetchAll, moneyCell } from '@/lib/excel'
import { cn } from '@/lib/cn'
import { formatDateTime, formatNumber } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { usePreference } from '@/lib/preferences'
import { toast } from '@/lib/toast'

import { MarkupRulesTab, percentText } from './markup-rules-tab'
import { RepriceDialog } from './reprice-dialog'

const route = getRouteApi('/prices')

/**
 * What every model sells for, beside what it cost. The filters above the
 * list are also the reach of a bulk change: "change prices" changes exactly
 * the models the list is showing.
 */
export function PricesPage() {
  const { t } = useTranslation()
  const { can } = useSession()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const go = useNavigate()
  const canPrice = can('products.prices')
  const seesCost = can('stock.cost')
  const [repricing, setRepricing] = useState(false)

  const { tab, ...listSearch } = search
  // So'm per dollar: with it, cost is what the goods would cost to buy today.
  const [uzsRate, setUzsRate] = usePreference<number | null>('pricing.uzsRate', null)

  const priceTypes = usePriceTypes()
  const types = useMemo(() => (priceTypes.data ?? []).filter((type) => type.isActive), [priceTypes.data])
  const categories = useCategories()
  const brands = useBrands()
  const categoryOptions = useCategoryOptions(categories.data, search.categoryId)

  const list = useQuery({
    queryKey: ['pricing', 'list', listSearch, uzsRate],
    queryFn: ({ signal }) =>
      api.get<PageOf<PriceListItemDto>>('/pricing/products', { ...listSearch, uzsRate: uzsRate ?? undefined }, signal),
    placeholderData: keepPreviousData,
    enabled: tab === 'list',
  })

  const filter = (patch: Partial<typeof search>, replace?: boolean) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace })

  const scopeFilter: PriceListFilter = {
    q: search.q,
    categoryId: search.categoryId,
    brandId: search.brandId,
    season: search.season,
    presence: search.presence,
  }
  const scopeText =
    [
      search.q ? `«${search.q}»` : null,
      categoryOptions.find((option) => option.value === search.categoryId)?.label,
      brands.data?.find((brand) => brand.id === search.brandId)?.name,
      search.season ? SEASON_LABELS[search.season] : null,
      search.presence === 'in' ? t('pricing.onlyInStock') : null,
    ]
      .filter(Boolean)
      .join(' · ') || t('pricing.everything')

  useHotkey('n', () => setRepricing(true), {
    label: t('pricing.reprice'),
    group: t('shortcuts.groupList'),
    enabled: canPrice && tab === 'list' && !repricing && types.length > 0,
  })

  const columns = useMemo<ColumnDef<PriceListItemDto>[]>(
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
        meta: { export: (row) => row.categoryName, className: 'text-ink-2' },
        cell: ({ row }) => row.original.categoryName ?? '',
      },
      {
        id: 'qty',
        header: t('stock.total'),
        meta: { export: (row) => row.qty, className: 'tabular text-right', headerClassName: 'text-right' },
        cell: ({ row }) => (row.original.qty ? formatNumber(row.original.qty) : <span className="text-ink-3">—</span>),
      },
      ...(seesCost
        ? [
            {
              id: 'cost',
              header: t('pricing.cost'),
              meta: {
                export: (row) => moneyCell(row.unitCostUzs),
                className: 'tabular text-right whitespace-nowrap',
                headerClassName: 'text-right',
              },
              cell: ({ row }) =>
                row.original.unitCostUzs === null ? (
                  <span className="text-ink-3">—</span>
                ) : (
                  formatMoney(row.original.unitCostUzs, base(), { minor: 'never' })
                ),
            } satisfies ColumnDef<PriceListItemDto>,
          ]
        : []),
      ...types.map((type): ColumnDef<PriceListItemDto> => ({
        id: type.id,
        header: type.name,
        meta: {
          className: 'tabular text-right whitespace-nowrap',
          headerClassName: 'text-right',
          export: (row) => moneyCell(row.prices[type.id], type.currency),
        },
        cell: ({ row }) => {
          const amount = row.original.prices[type.id]
          if (amount === undefined) {
            return <span className="text-ink-3">—</span>
          }
          const cost = type.currency === base() ? row.original.unitCostUzs : row.original.unitCostUsd
          const margin = marginPercent(amount, cost)
          return (
            <span className="inline-flex items-baseline gap-2">
              {margin === null ? null : (
                <span className={cn('text-xs', margin < 0 ? 'text-bad' : 'text-ink-3')}>{percentText(margin)}</span>
              )}
              <span className="font-medium">{formatMoney(amount, type.currency, { minor: 'auto' })}</span>
              {type.kind === 'retail' && row.original.overrides ? (
                <span className="text-xs text-ink-3" title={t('pricing.overridesHint')}>
                  +{row.original.overrides}
                </span>
              ) : null}
            </span>
          )
        },
      })),
    ],
    [t, seesCost, types],
  )

  const filtered = !!(search.q || search.categoryId || search.brandId || search.season) || search.presence !== 'all'

  return (
    <Page
      title={t('pricing.title')}
      actions={
        canPrice && tab === 'list' ? (
          <Button variant="primary" onClick={() => setRepricing(true)} disabled={!types.length}>
            <BadgePercent />
            {t('pricing.reprice')}
            <Shortcut combo="n" className="ml-1 opacity-70" />
          </Button>
        ) : null
      }
    >
      <Tabs
        value={tab}
        onChange={(value) => void navigate({ search: (previous) => ({ ...previous, tab: value as typeof tab }) })}
        tabs={[
          { value: 'list', label: t('pricing.tabList') },
          { value: 'rules', label: t('pricing.tabRules') },
          { value: 'history', label: t('pricing.tabHistory') },
        ]}
      >
        <TabPanel value="list">
          <DataTable
            columns={columns}
            data={list.data?.items}
            loading={list.isFetching}
            rowId={(row) => row.productId}
            exportAs={{
              fileName: t('pricing.title'),
              rows: () =>
                fetchAll<PriceListItemDto>('/pricing/products', { ...listSearch, uzsRate: uzsRate ?? undefined }),
            }}
            onRowOpen={(row) => void go({ to: '/products/$productId', params: { productId: row.productId } })}
            sort={search.sort ?? 'name'}
            order={search.order}
            onSortChange={(sort, order) => filter({ sort, order })}
            preferenceKey="pricing"
            pagination={{
              page: search.page,
              size: search.size,
              total: list.data?.total ?? 0,
              onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
              onSizeChange: (size) => filter({ size }),
            }}
            filters={{
              category: (
                <FilterCombo
                  options={categoryOptions}
                  value={search.categoryId ?? null}
                  onChange={(categoryId) => filter({ categoryId: categoryId ?? undefined })}
                />
              ),
              name: (
                <FilterCombo
                  options={(brands.data ?? []).map((brand) => ({ value: brand.id, label: brand.name }))}
                  value={search.brandId ?? null}
                  placeholder={t('products.brand')}
                  onChange={(brandId) => filter({ brandId: brandId ?? undefined })}
                />
              ),
              qty: (
                <FilterSelect
                  value={search.presence}
                  onChange={(presence) => filter({ presence: presence as typeof search.presence })}
                  options={[
                    { value: 'all', label: t('pricing.allModels') },
                    { value: 'in', label: t('pricing.onlyInStock') },
                  ]}
                />
              ),
            }}
            toolbar={
              <>
                <SearchInput value={search.q ?? ''} onChange={(q) => filter({ q: q || undefined }, true)} />
                <Select
                  value={search.season ?? 'any'}
                  onChange={(season) => filter({ season: season === 'any' ? undefined : (season as Season) })}
                  options={[
                    { value: 'any', label: `${t('products.season')}: ${t('common.all').toLowerCase()}` },
                    ...SEASONS.map((season) => ({ value: season, label: SEASON_LABELS[season] })),
                  ]}
                  className="w-44"
                />
                {/* A rate between the base and dollars: none where the dollar is the base. */}
                {seesCost && dollarsBeside('USD') ? (
                  <label
                    className="flex items-center gap-2 text-xs text-ink-3"
                    title={t('pricing.rateHint', baseWords(t))}
                  >
                    {t('pricing.rate')}
                    <NumberInput
                      value={uzsRate}
                      onChange={setUzsRate}
                      decimals={2}
                      max={1_000_000}
                      placeholder="—"
                      className="w-28"
                    />
                  </label>
                ) : null}
              </>
            }
            empty={<EmptyState icon={BadgePercent} title={filtered ? t('common.nothingFound') : t('common.empty')} />}
          />
        </TabPanel>
        <TabPanel value="rules">
          <MarkupRulesTab canManage={canPrice} />
        </TabPanel>
        <TabPanel value="history">
          <RevisionsTab canPrice={canPrice} />
        </TabPanel>
      </Tabs>

      {repricing ? (
        <RepriceDialog
          filter={scopeFilter}
          scope={scopeText}
          priceTypes={types}
          uzsRate={uzsRate}
          seesCost={seesCost}
          onClose={() => setRepricing(false)}
        />
      ) : null}
    </Page>
  )
}

/** Every bulk change, newest first; one that still stands can be put back. */
function RevisionsTab({ canPrice }: { canPrice: boolean }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)

  const list = useQuery({
    queryKey: ['pricing', 'revisions', page, size],
    queryFn: ({ signal }) => api.get<PageOf<PriceRevisionDto>>('/pricing/revisions', { page, size }, signal),
    placeholderData: keepPreviousData,
  })

  const revert = useMutation({
    mutationFn: (id: string) => api.post<RepriceResult>(`/pricing/revisions/${id}/revert`),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['pricing'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      if (result.skipped) {
        toast.warning(t('pricing.revertedPartly', { count: result.changed, skipped: result.skipped }))
      } else {
        toast.success(t('pricing.reverted', { count: result.changed }))
      }
    },
  })

  const columns = useMemo<ColumnDef<PriceRevisionDto>[]>(
    () => [
      {
        id: 'number',
        header: t('receipts.number'),
        meta: { fixed: true, className: 'w-px font-code text-xs whitespace-nowrap' },
        cell: ({ row }) => row.original.number,
      },
      {
        id: 'time',
        header: t('labels.time'),
        meta: { className: 'tabular w-px whitespace-nowrap text-ink-2' },
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      { id: 'type', header: t('pricing.priceType'), cell: ({ row }) => row.original.priceTypeName },
      {
        id: 'summary',
        header: t('pricing.what'),
        cell: ({ row }) => (
          <span>
            <span className="font-medium">{row.original.summary}</span>
            {row.original.note ? <span className="text-ink-3"> · {row.original.note}</span> : null}
          </span>
        ),
      },
      {
        id: 'changed',
        header: t('pricing.models'),
        meta: { className: 'tabular text-right', headerClassName: 'text-right' },
        cell: ({ row }) => formatNumber(row.original.changed),
      },
      {
        id: 'state',
        header: t('common.status'),
        cell: ({ row }) =>
          row.original.revertedByNumber ? (
            <Badge>{t('pricing.revertedBy', { number: row.original.revertedByNumber })}</Badge>
          ) : row.original.revertsNumber ? (
            <Badge tone="info">{t('pricing.undo')}</Badge>
          ) : (
            <Badge tone="ok">{t('pricing.stands')}</Badge>
          ),
      },
      {
        id: 'author',
        header: t('receipts.author'),
        meta: { className: 'text-ink-2' },
        cell: ({ row }) => row.original.createdByName ?? '',
      },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px' },
        cell: ({ row }) =>
          canPrice && !row.original.revertedByNumber && !row.original.revertsNumber ? (
            <Menu
              trigger={
                <Button variant="ghost" size="iconSm" tabIndex={-1} aria-label={t('common.actions')}>
                  <MoreHorizontal />
                </Button>
              }
              items={[
                {
                  label: t('pricing.revert'),
                  icon: <Undo2 />,
                  tone: 'danger',
                  onSelect: async () => {
                    if (
                      await confirm({
                        title: t('pricing.revertConfirm', { number: row.original.number }),
                        description: t('pricing.revertHint'),
                        confirmLabel: t('pricing.revert'),
                        tone: 'danger',
                      })
                    ) {
                      revert.mutate(row.original.id)
                    }
                  },
                },
              ]}
            />
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canPrice],
  )

  return (
    <DataTable
      columns={columns}
      data={list.data?.items}
      loading={list.isFetching}
      rowId={(row) => row.id}
      rowClassName={(row) => (row.revertedByNumber ? 'text-ink-3' : undefined)}
      pagination={{
        page,
        size,
        total: list.data?.total ?? 0,
        onPageChange: setPage,
        onSizeChange: (next) => {
          setSize(next)
          setPage(1)
        },
      }}
      empty={<EmptyState icon={History} title={t('pricing.noHistory')} hint={t('pricing.noHistoryHint')} />}
    />
  )
}
