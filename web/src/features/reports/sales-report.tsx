import { averageReceipt, marginPercent, PAYMENT_METHOD_LABELS, rangeDays, type SalesReportDto } from '@gulbahor/core'
import { ChartNoAxesColumn } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/ui/feedback'
import { Card } from '@/components/ui/page'
import { Thumb } from '@/components/ui/thumb'
import { formatNumber } from '@/lib/format'

import { BarChart, bucketLabel, dayLabel, rangeLabel, ShareList, shortSom, som, Stat, type ChartBar } from './parts'

const percent = (value: number) => `${String(value).replace('.', ',')}%`

/** A bucket named in full, for the line above the chart. */
function bucketName(key: string, bucket: SalesReportDto['bucket']): string {
  if (bucket === 'hour') {
    return `${key}:00–${String(Number(key) + 1).padStart(2, '0')}:00`
  }
  return bucket === 'day' ? dayLabel(key) : bucketLabel(key, bucket)
}

/**
 * What a stretch of days sold, read top to bottom: the numbers and how
 * they moved, the days one by one, then where the money came from — which
 * shop, which tender, which hands — and what it was that sold.
 */
export function SalesReport({ data }: { data: SalesReportDto }) {
  const { t } = useTranslation()
  const { totals, previous } = data
  const before = previous.totals
  const seesProfit = totals.profit !== null
  const short = (value: number) => shortSom(value, t)

  if (!totals.receipts && !totals.returns) {
    return (
      <Card>
        <EmptyState
          icon={ChartNoAxesColumn}
          title={t('reports.nothingSold')}
          hint={before.net ? t('reports.beforeIt', { days: rangeLabel(previous), amount: som(before.net) }) : undefined}
        />
      </Card>
    )
  }

  const markup = marginPercent(totals.net, totals.cost)
  const perReceipt = totals.receipts ? Math.round((totals.qty / totals.receipts) * 10) / 10 : 0
  const offShare = totals.gross > 0 ? Math.round((totals.discount / totals.gross) * 1000) / 10 : 0

  const bars: ChartBar[] = data.series.map((point) => ({
    key: point.key,
    label: bucketLabel(point.key, data.bucket),
    value: point.net,
    inner: point.profit,
    detail: (
      <>
        <span className="font-medium">{bucketName(point.key, data.bucket)}</span>
        <span>
          <span className="text-ink-3">{t('reports.net')}: </span>
          <span className="tabular font-medium">{som(point.net)}</span>
        </span>
        {point.profit !== null ? (
          <span>
            <span className="text-ink-3">{t('reports.profit')}: </span>
            <span className="tabular font-medium">{som(point.profit)}</span>
          </span>
        ) : null}
        <span className="text-ink-3">{t('reports.receiptsCount', { n: formatNumber(point.receipts) })}</span>
      </>
    ),
  }))

  return (
    <div className="flex flex-col gap-4">
      <div
        className={
          seesProfit
            ? 'grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6'
            : 'grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5'
        }
      >
        <Stat
          label={t('reports.net')}
          value={som(totals.net)}
          delta={{ now: totals.net, before: before.net }}
          note={totals.returned ? t('reports.soldOf', { amount: short(totals.sold) }) : undefined}
        />
        {seesProfit ? (
          <Stat
            label={t('reports.profit')}
            value={som(totals.profit ?? 0)}
            tone={(totals.profit ?? 0) < 0 ? 'bad' : undefined}
            delta={{ now: totals.profit ?? 0, before: before.profit ?? 0 }}
            note={markup !== null ? t('reports.markup', { percent: percent(markup) }) : undefined}
          />
        ) : null}
        <Stat
          label={t('reports.receipts')}
          value={formatNumber(totals.receipts)}
          delta={{ now: totals.receipts, before: before.receipts }}
          note={t('reports.pieces', { n: formatNumber(totals.qty) })}
        />
        <Stat
          label={t('reports.average')}
          value={som(averageReceipt(totals))}
          delta={{ now: averageReceipt(totals), before: averageReceipt(before) }}
          note={perReceipt ? t('reports.perReceipt', { n: String(perReceipt).replace('.', ',') }) : undefined}
        />
        <Stat
          label={t('reports.discount')}
          value={som(totals.discount)}
          delta={{ now: totals.discount, before: before.discount, inverse: true }}
          note={offShare ? t('reports.ofGross', { percent: percent(offShare) }) : undefined}
        />
        <Stat
          label={t('reports.returns')}
          value={som(totals.returned)}
          delta={{ now: totals.returned, before: before.returned, inverse: true }}
          note={
            totals.returns
              ? t('reports.returnsNote', { n: formatNumber(totals.returns), pieces: formatNumber(totals.returnedQty) })
              : undefined
          }
        />
      </div>

      <Card title={t(`reports.by_${data.bucket}`)}>
        <BarChart
          bars={bars}
          axis={short}
          summary={
            <>
              <span className="font-medium">{rangeLabel(data)}</span>
              <span className="flex items-center gap-1.5 text-ink-2">
                <span
                  className={seesProfit ? 'size-2.5 rounded-sm bg-accent/25' : 'size-2.5 rounded-sm bg-accent/70'}
                />
                {t('reports.net')}
              </span>
              {seesProfit ? (
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="size-2.5 rounded-sm bg-accent" />
                  {t('reports.profit')}
                </span>
              ) : null}
              <span className="text-ink-3">
                {t(rangeDays(previous) === 1 ? 'reports.dayBefore' : 'reports.daysBefore', {
                  days: rangeLabel(previous),
                  amount: som(before.net),
                })}
              </span>
            </>
          }
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {data.shops.length > 1 ? (
          <Card title={t('reports.shops')}>
            <ShareList
              rows={data.shops.map((shop) => ({
                key: shop.id,
                name: shop.name,
                value: shop.net,
                note:
                  shop.profit !== null
                    ? `${t('reports.receiptsCount', { n: formatNumber(shop.receipts) })} · ${t('reports.profit').toLowerCase()} ${short(shop.profit)}`
                    : t('reports.receiptsCount', { n: formatNumber(shop.receipts) }),
              }))}
            />
          </Card>
        ) : null}
        <Card title={t('reports.payments')}>
          <ShareList
            rows={data.payments.map((payment) => ({
              key: `${payment.method}:${payment.currency}`,
              name:
                payment.method === 'cash'
                  ? t(payment.currency === 'USD' ? 'pos.payUsd' : 'pos.payCash')
                  : PAYMENT_METHOD_LABELS[payment.method],
              // Dollars are counted in so'm with the rest; how many of them there were stands beside.
              note: payment.currency === 'USD' ? `${formatNumber(payment.amount / 100)} $` : undefined,
              value: payment.base,
            }))}
          />
        </Card>
        <Card title={t('reports.cashiers')}>
          <ShareList
            rows={data.cashiers.map((person, index) => ({
              key: person.id ?? String(index),
              name: person.name || '—',
              value: person.sold,
              note: t('reports.receiptsCount', { n: formatNumber(person.receipts) }),
            }))}
          />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={t('reports.topProducts')} className="xl:col-span-2">
          {/* The card's own padding gives a focus ring or a wide number its room; the table only scrolls when it must. */}
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-xs text-ink-3">
                  <th className="pb-2 font-medium">{t('reports.product')}</th>
                  <th className="pb-2 pl-3 text-right font-medium">{t('reports.qty')}</th>
                  <th className="pb-2 pl-3 text-right font-medium">{t('reports.net')}</th>
                  {seesProfit ? <th className="pb-2 pl-3 text-right font-medium">{t('reports.profit')}</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.products.map((product) => (
                  <tr key={product.id} className="border-t border-line">
                    <td className="py-1.5">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Thumb image={product.image} className="size-8" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{product.name}</span>
                          <span className="font-code block text-xs text-ink-3">{product.sku}</span>
                        </span>
                      </span>
                    </td>
                    <td className="tabular py-1.5 pl-3 text-right whitespace-nowrap">{formatNumber(product.qty)}</td>
                    <td className="tabular py-1.5 pl-3 text-right font-medium whitespace-nowrap">{som(product.net)}</td>
                    {seesProfit ? (
                      <td className="tabular py-1.5 pl-3 text-right whitespace-nowrap text-ink-2">
                        {som(product.profit ?? 0)}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title={t('reports.categories')}>
          <ShareList
            rows={data.categories.map((category) => ({
              key: category.id ?? 'none',
              name: category.name ?? t('reports.noCategory'),
              value: category.net,
              note: t('reports.pieces', { n: formatNumber(category.qty) }),
            }))}
          />
        </Card>
      </div>
    </div>
  )
}
