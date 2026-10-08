import {
  periodOf,
  periodRange,
  todayIn,
  type DateRange,
  type ReportPeriod,
  type SalesPoint,
  type SalesReportDto,
} from '@gulbahor/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { FileSpreadsheet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/controls'
import { Skeleton, Tooltip } from '@/components/ui/feedback'
import { Page } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { base } from '@/lib/base'
import { moneyCell, saveExcel, type ExportColumn } from '@/lib/excel'

import { bucketLabel, dayLabel, PeriodPicker } from './parts'
import { SalesReport } from './sales-report'

const route = getRouteApi('/reports/sales')

const EVERY_SHOP = 'all'

interface Place {
  id: string
  name: string
  kind: string
}

/** The report asked of the server; kept under the sales' own name, so that every receipt and return refreshes it. */
export function useSalesReport(range: DateRange, locationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['sales', 'report', range.from, range.to, locationId ?? null],
    queryFn: ({ signal }) =>
      api.get<SalesReportDto>('/reports/sales', { from: range.from, to: range.to, locationId }, signal),
    placeholderData: keepPreviousData,
    enabled,
  })
}

/**
 * How the shops are selling. The days and the shop are in the address, so a
 * report can be bookmarked or sent on — "this month" stays this month
 * tomorrow, while days picked by hand stay those days.
 */
export function SalesReportPage() {
  const { t } = useTranslation()
  const { me } = useSession()
  const search = route.useSearch()
  const navigate = route.useNavigate()

  const today = todayIn(me.org.timezone)
  const picked = search.from && search.to ? { from: search.from, to: search.to } : null
  const range = picked ?? periodRange(search.period, today)
  const period = picked ? periodOf(picked, today) : search.period

  const places = useQuery({
    queryKey: ['locations', 'options'],
    queryFn: ({ signal }) => api.get<Place[]>('/locations/options', undefined, signal),
  })
  const shops = (places.data ?? []).filter((place) => place.kind === 'store')
  // A shop that is no longer this person's to see is not asked about.
  const shop = shops.some((item) => item.id === search.shop) ? search.shop : undefined
  const report = useSalesReport(range, shop)

  const setPeriod = (next: ReportPeriod) =>
    void navigate({ search: (previous) => ({ ...previous, period: next, from: undefined, to: undefined }) })
  const setRange = (next: DateRange) =>
    void navigate({ search: (previous) => ({ ...previous, period: 'today', ...next }), replace: true })

  const save = () => {
    const data = report.data
    if (!data) {
      return
    }
    const columns: ExportColumn<SalesPoint>[] = [
      {
        title: t(`reports.bucket_${data.bucket}`),
        value: (point) => (data.bucket === 'day' ? dayLabel(point.key) : bucketLabel(point.key, data.bucket)),
      },
      { title: t('reports.receipts'), value: (point) => point.receipts },
      { title: t('reports.net'), value: (point) => moneyCell(point.net, base()) },
      ...(data.totals.profit !== null
        ? [{ title: t('reports.profit'), value: (point: SalesPoint) => moneyCell(point.profit, base()) }]
        : []),
    ]
    void saveExcel(`${t('reports.salesTitle')} ${data.from}_${data.to}`, columns, data.series)
  }

  return (
    <Page title={t('reports.salesTitle')} flow>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker period={period} range={range} onPeriod={setPeriod} onRange={setRange} />
        <div className="flex items-center gap-2">
          {shops.length > 1 ? (
            <Select
              value={shop ?? EVERY_SHOP}
              onChange={(value) =>
                void navigate({
                  search: (previous) => ({ ...previous, shop: value === EVERY_SHOP ? undefined : value }),
                })
              }
              options={[
                { value: EVERY_SHOP, label: t('reports.everyShop') },
                ...shops.map((item) => ({ value: item.id, label: item.name })),
              ]}
              className="w-52"
            />
          ) : null}
          <Tooltip content={t('table.export')}>
            <Button size="icon" aria-label={t('table.export')} disabled={!report.data} onClick={save}>
              <FileSpreadsheet />
            </Button>
          </Tooltip>
        </div>
      </div>

      {report.data ? (
        // Numbers of the days asked before stay in sight, dimmed, while the new ones are on their way.
        <div className={report.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <SalesReport data={report.data} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-22 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-lg" />
        </div>
      )}
    </Page>
  )
}
