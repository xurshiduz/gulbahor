import { addDays, averageReceipt, periodRange, todayIn, toIsoDate, type SalesReportDto } from '@erp/core'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/feedback'
import { useSession } from '@/features/auth/session'
import { formatNumber } from '@/lib/format'

import { BarChart, bucketLabel, dayLabel, shortSom, som, Stat } from './parts'
import { useSalesReport } from './sales-report-page'

/** How many days the first screen looks back over. */
const DAYS = 14

/**
 * The day so far and the two weeks behind it, on the first screen: what the
 * owner opens the system to see. It is the sales report asked two short
 * questions; the report itself is a press away.
 */
export function SalesToday() {
  const { me } = useSession()
  const today = todayIn(me.org.timezone)
  const day = useSalesReport(periodRange('today', today), undefined)
  const recent = useSalesReport({ from: toIsoDate(addDays(today, 1 - DAYS)), to: toIsoDate(today) }, undefined)
  return <SalesTodayView day={day.data} recent={recent.data} />
}

export function SalesTodayView({ day, recent }: { day?: SalesReportDto; recent?: SalesReportDto }) {
  const { t } = useTranslation()
  const short = (value: number) => shortSom(value, t)

  if (!day || !recent) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-22 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    )
  }

  const now = day.totals
  const before = day.previous.totals
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t('reports.todayNet')}
          value={som(now.net)}
          delta={{ now: now.net, before: before.net }}
          note={t('reports.yesterdayWas', { amount: short(before.net) })}
        />
        {now.profit !== null ? (
          <Stat
            label={t('reports.profit')}
            value={som(now.profit)}
            tone={now.profit < 0 ? 'bad' : undefined}
            delta={{ now: now.profit, before: before.profit ?? 0 }}
          />
        ) : null}
        <Stat
          label={t('reports.receipts')}
          value={formatNumber(now.receipts)}
          delta={{ now: now.receipts, before: before.receipts }}
          note={t('reports.pieces', { n: formatNumber(now.qty) })}
        />
        <Stat
          label={t('reports.average')}
          value={som(averageReceipt(now))}
          delta={{ now: averageReceipt(now), before: averageReceipt(before) }}
        />
        {now.profit === null ? (
          <Stat
            label={t('reports.returns')}
            value={som(now.returned)}
            delta={{ now: now.returned, before: before.returned, inverse: true }}
          />
        ) : null}
      </div>

      <section className="rounded-lg border border-line bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="eyebrow">{t('reports.lastDays', { n: DAYS })}</h2>
          <Link
            to="/reports/sales"
            search={{ period: 'month' }}
            className="flex items-center gap-1 text-xs font-medium text-accent-ink hover:underline"
          >
            {t('reports.open')}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <BarChart
          axis={short}
          bars={recent.series.map((point) => ({
            key: point.key,
            label: bucketLabel(point.key, recent.bucket),
            value: point.net,
            inner: point.profit,
            detail: (
              <>
                <span className="font-medium">{dayLabel(point.key)}</span>
                <span className="tabular font-medium">{som(point.net)}</span>
                <span className="text-ink-3">{t('reports.receiptsCount', { n: formatNumber(point.receipts) })}</span>
              </>
            ),
          }))}
          summary={
            <>
              <span className="text-ink-3">{t('reports.net')}:</span>
              <span className="tabular font-medium">{som(recent.totals.net)}</span>
              <span className="text-ink-3">
                {t('reports.receiptsCount', { n: formatNumber(recent.totals.receipts) })}
              </span>
            </>
          }
        />
      </section>
    </div>
  )
}
