import {
  changePercent,
  formatMoney,
  REPORT_PERIODS,
  type DateRange,
  type ReportBucket,
  type ReportPeriod,
} from '@erp/core'
import type { TFunction } from 'i18next'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DateInput } from '@/components/ui/date-input'
import { base } from '@/lib/base'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'

/** A sum in full: "1 250 000 so'm". */
export const som = (minor: number) => formatMoney(minor, base(), { minor: 'auto' })

/**
 * A sum for an axis or a tight corner, where the exact figure is beside the
 * point: "1,25 mln", "850 ming". So'm, not tiyin, and never the unit.
 */
export function shortSom(minor: number, t: TFunction): string {
  const value = Math.abs(minor) / 100
  const sign = minor < 0 ? '−' : ''
  const cut = (amount: number) => String(Math.round(amount * 100) / 100).replace('.', ',')
  if (value >= 1_000_000_000) {
    return `${sign}${cut(value / 1_000_000_000)} ${t('reports.billion')}`
  }
  if (value >= 1_000_000) {
    return `${sign}${cut(value / 1_000_000)} ${t('reports.million')}`
  }
  if (value >= 1000) {
    return `${sign}${cut(value / 1000)} ${t('reports.thousand')}`
  }
  return `${sign}${cut(value)}`
}

/** How a bucket of the chart is named under its bar: "14:00", "05.10", "10.2026". */
export function bucketLabel(key: string, bucket: ReportBucket): string {
  if (bucket === 'hour') {
    return `${key}:00`
  }
  const [year, month, day] = key.split('-')
  return bucket === 'day' ? `${day}.${month}` : `${month}.${year}`
}

/** A day of a range as it is read: "05.10.2026". */
export const dayLabel = (iso: string) => iso.split('-').reverse().join('.')

/** The days a report covers, in words: one day, or from one to another. */
export const rangeLabel = (range: DateRange) =>
  range.from === range.to ? dayLabel(range.from) : `${dayLabel(range.from)} – ${dayLabel(range.to)}`

// ───────────────────────────── The days asked about ─────────────────────────────

interface PeriodPickerProps {
  /** The named period in force; null when the days were picked by hand. */
  period: ReportPeriod | null
  range: DateRange
  onPeriod: (period: ReportPeriod) => void
  onRange: (range: DateRange) => void
}

/**
 * Which days a report is for: the usual ones are a press away, any others
 * are typed into the two dates beside them.
 */
export function PeriodPicker({ period, range, onPeriod, onRange }: PeriodPickerProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div
        role="group"
        aria-label={t('reports.period')}
        className="flex rounded-md border border-line-strong bg-surface p-0.5"
      >
        {REPORT_PERIODS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={period === item}
            onClick={() => onPeriod(item)}
            className={cn(
              'h-7 rounded px-2.5 text-[13px] whitespace-nowrap transition-colors',
              period === item
                ? 'bg-accent-soft font-medium text-accent-ink'
                : 'text-ink-2 hover:bg-sunken hover:text-ink',
            )}
          >
            {t(`reports.period_${item}`)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        {/* A start after the end, or an end before the start, moves the other with it: the days stay a range. */}
        <DateInput
          value={range.from}
          onChange={(from) => (from ? onRange({ from, to: from > range.to ? from : range.to }) : undefined)}
          className="w-32"
        />
        <span className="text-ink-3">–</span>
        <DateInput
          value={range.to}
          onChange={(to) => (to ? onRange({ from: to < range.from ? to : range.from, to }) : undefined)}
          className="w-32"
        />
      </div>
    </div>
  )
}

// ───────────────────────────── A number and how it moved ─────────────────────────────

/** How a number stands against the same days before: up or down, by how much. */
export function Delta({ now, before, inverse = false }: { now: number; before: number; inverse?: boolean }) {
  const change = changePercent(now, before)
  if (change === null || change === 0) {
    return null
  }
  const up = change > 0
  // More returns or more given away is not good news.
  const good = inverse ? !up : up
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={cn('tabular inline-flex items-center gap-1 font-medium', good ? 'text-ok' : 'text-bad')}>
      <Icon className="size-3.5" />
      {up ? '+' : '−'}
      {String(Math.abs(change)).replace('.', ',')}%
    </span>
  )
}

interface StatProps {
  label: string
  value: ReactNode
  /** What the same days before came to: the number moves against it. */
  delta?: { now: number; before: number; inverse?: boolean }
  /** A line under the number: what it is made of. */
  note?: ReactNode
  tone?: 'bad'
}

/** One number of a report, with what it is and how it moved. */
export function Stat({ label, value, delta, note, tone }: StatProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-3.5 shadow-card">
      <p className="truncate text-xs text-ink-3">{label}</p>
      {/* A sum too long for its tile is cut; pointing at it reads it out whole. */}
      <p
        title={typeof value === 'string' ? value : undefined}
        className={cn('tabular truncate text-xl leading-tight font-semibold', tone === 'bad' && 'text-bad')}
      >
        {value}
      </p>
      <p className="flex min-h-4 flex-wrap items-center gap-x-2 text-xs text-ink-3">
        {delta ? <Delta {...delta} /> : null}
        {note ? <span className="truncate">{note}</span> : null}
      </p>
    </div>
  )
}

// ───────────────────────────── Bars ─────────────────────────────

export interface ChartBar {
  key: string
  /** Under the bar. */
  label: string
  value: number
  /** A part of the value shown inside it, darker: the profit in the takings. */
  inner?: number | null
  /** What stands above the chart while the cursor is on this bar. */
  detail: ReactNode
}

/** The round number a chart's top line stands at: no less than its tallest bar. */
function ceiling(max: number): number {
  if (max <= 0) {
    return 1
  }
  const power = 10 ** Math.floor(Math.log10(max))
  const step = [1, 1.2, 1.6, 2, 2.4, 3.2, 4, 5, 6, 8, 10].find((item) => item * power >= max) ?? 10
  return step * power
}

interface BarChartProps {
  bars: ChartBar[]
  /** How a value is written beside the axis. */
  axis: (value: number) => string
  /** What stands above the chart while no bar is pointed at. */
  summary: ReactNode
}

/**
 * Bars over time, drawn with boxes rather than a library: the bars keep
 * their gaps whatever the width, and the page's own colours hold in the
 * dark. Pointing at a bar (or tapping it) puts its numbers above the chart
 * — nothing floats, so nothing is cut off at an edge.
 */
export function BarChart({ bars, axis, summary }: BarChartProps) {
  const [active, setActive] = useState<string | null>(null)
  const top = ceiling(Math.max(0, ...bars.map((bar) => bar.value)))
  const shown = bars.find((bar) => bar.key === active)
  // Room for a dozen names under the bars; the rest are read by pointing.
  const every = Math.ceil(bars.length / 12)
  const lines = [1, 0.75, 0.5, 0.25, 0]

  return (
    <div data-chart>
      <div className="mb-3 flex min-h-5 flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]" aria-live="polite">
        {shown ? shown.detail : summary}
      </div>
      <div className="flex gap-2">
        <div className="tabular flex h-52 flex-col justify-between text-right text-[11px] leading-none text-ink-3">
          {lines.map((part) => (
            <span key={part} className="-translate-y-1/2 last:translate-y-1/2">
              {axis(top * part)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-52">
            {lines.map((part) => (
              <span
                key={part}
                className={cn('absolute inset-x-0 border-t', part ? 'border-dashed border-line' : 'border-line-strong')}
                style={{ bottom: `${part * 100}%` }}
              />
            ))}
            <div
              className={cn('absolute inset-0 flex items-end', bars.length > 40 ? 'gap-px' : 'gap-1')}
              onMouseLeave={() => setActive(null)}
            >
              {bars.map((bar) => {
                const height = bar.value > 0 ? Math.max((bar.value / top) * 100, 0.8) : 0
                const inner = bar.inner && bar.inner > 0 && bar.value > 0 ? Math.min(bar.inner / bar.value, 1) * 100 : 0
                return (
                  <div
                    key={bar.key}
                    data-bar={bar.key}
                    className="flex h-full min-w-0 flex-1 cursor-default items-end justify-center"
                    onMouseEnter={() => setActive(bar.key)}
                    onClick={() => setActive((now) => (now === bar.key ? null : bar.key))}
                  >
                    {bar.value < 0 ? (
                      // More came back than was sold: there is nothing to draw upwards, and it should not pass for nothing.
                      <span className="h-0.5 w-full max-w-16 rounded-full bg-bad" />
                    ) : (
                      <span
                        className={cn(
                          // A few days are a few bars, not a few walls.
                          'relative w-full max-w-16 overflow-hidden rounded-t-sm transition-colors',
                          bar.inner === undefined || bar.inner === null ? 'bg-accent/70' : 'bg-accent/25',
                          active === bar.key &&
                            (bar.inner === undefined || bar.inner === null ? 'bg-accent' : 'bg-accent/40'),
                        )}
                        style={{ height: `${height}%` }}
                      >
                        {inner ? (
                          <span className="absolute inset-x-0 bottom-0 bg-accent" style={{ height: `${inner}%` }} />
                        ) : null}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className={cn('mt-1.5 flex', bars.length > 40 ? 'gap-px' : 'gap-1')}>
            {bars.map((bar, index) => (
              <span key={bar.key} className="flex h-3 min-w-0 flex-1 justify-center">
                {index % every === 0 ? (
                  <span className="tabular text-[11px] leading-none whitespace-nowrap text-ink-3">{bar.label}</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────── Shares ─────────────────────────────

export interface ShareRow {
  key: string
  name: ReactNode
  value: number
  /** Under the name, smaller: how many receipts, what was made. */
  note?: ReactNode
}

/**
 * Parts of a whole, the largest first: each with its sum, its share of the
 * total and a bar as long as that share.
 */
export function ShareList({ rows, format = som }: { rows: ShareRow[]; format?: (value: number) => string }) {
  const total = rows.reduce((sum, row) => sum + Math.max(row.value, 0), 0)
  return (
    <ul className="flex flex-col">
      {rows.map((row) => {
        const share = total > 0 ? (Math.max(row.value, 0) / total) * 100 : 0
        return (
          <li key={row.key} className="py-2 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{row.name}</span>
              <span className="tabular whitespace-nowrap">
                <span className="font-medium">{format(row.value)}</span>
                <span className="ml-2 inline-block w-9 text-right text-xs text-ink-3">
                  {formatNumber(Math.round(share))}%
                </span>
              </span>
            </div>
            {row.note ? <p className="mt-0.5 truncate text-xs text-ink-3">{row.note}</p> : null}
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-accent/60" style={{ width: `${share}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
