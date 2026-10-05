import { describe, expect, it } from 'vitest'

import {
  averageReceipt,
  bucketKeys,
  changePercent,
  MAX_REPORT_DAYS,
  periodOf,
  periodRange,
  previousRange,
  rangeDays,
  reportBucket,
  reportQuerySchema,
} from './reports'

// A Thursday.
const today = { year: 2026, month: 10, day: 8 }

describe('the days a report is asked for', () => {
  it('are named: today, yesterday, this week from its Monday, this month, the last one, this year', () => {
    expect(periodRange('today', today)).toEqual({ from: '2026-10-08', to: '2026-10-08' })
    expect(periodRange('yesterday', today)).toEqual({ from: '2026-10-07', to: '2026-10-07' })
    // A period still running ends today: the days to come have sold nothing.
    expect(periodRange('week', today)).toEqual({ from: '2026-10-05', to: '2026-10-08' })
    expect(periodRange('month', today)).toEqual({ from: '2026-10-01', to: '2026-10-08' })
    expect(periodRange('last_month', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(periodRange('year', today)).toEqual({ from: '2026-01-01', to: '2026-10-08' })
    // On a Monday the week is that one day; in January last month is last year's.
    expect(periodRange('week', { year: 2026, month: 10, day: 5 })).toEqual({ from: '2026-10-05', to: '2026-10-05' })
    expect(periodRange('week', { year: 2026, month: 10, day: 11 })).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(periodRange('last_month', { year: 2026, month: 1, day: 3 })).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    })
    expect(periodRange('yesterday', { year: 2026, month: 1, day: 1 })).toEqual({ from: '2025-12-31', to: '2025-12-31' })
  })

  it('are known by their name again, unless they were picked by hand', () => {
    expect(periodOf({ from: '2026-10-01', to: '2026-10-08' }, today)).toBe('month')
    expect(periodOf({ from: '2026-10-08', to: '2026-10-08' }, today)).toBe('today')
    expect(periodOf({ from: '2026-10-02', to: '2026-10-08' }, today)).toBeNull()
  })

  it('are counted with both ends', () => {
    expect(rangeDays({ from: '2026-10-08', to: '2026-10-08' })).toBe(1)
    expect(rangeDays({ from: '2026-09-28', to: '2026-10-08' })).toBe(11)
    expect(rangeDays({ from: '2024-02-01', to: '2024-03-01' })).toBe(30)
    expect(rangeDays({ from: '2026-10-08', to: '2026-10-07' })).toBe(0)
    expect(rangeDays({ from: 'kecha', to: '2026-10-07' })).toBe(0)
  })

  it('are set against as many days before; a whole month against the month before', () => {
    expect(previousRange({ from: '2026-10-08', to: '2026-10-08' })).toEqual({ from: '2026-10-07', to: '2026-10-07' })
    expect(previousRange({ from: '2026-10-05', to: '2026-10-08' })).toEqual({ from: '2026-10-01', to: '2026-10-04' })
    expect(previousRange({ from: '2026-10-01', to: '2026-10-08' })).toEqual({ from: '2026-09-23', to: '2026-09-30' })
    // March has three days more than February: the whole of each is what is compared.
    expect(previousRange({ from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(previousRange({ from: '2026-01-01', to: '2026-01-31' })).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })

  it('are cut by the hour, the day or the month, the empty ones kept', () => {
    expect(reportBucket({ from: '2026-10-08', to: '2026-10-08' })).toBe('hour')
    expect(reportBucket({ from: '2026-10-07', to: '2026-10-08' })).toBe('day')
    expect(reportBucket({ from: '2026-07-09', to: '2026-10-08' })).toBe('day')
    expect(reportBucket({ from: '2026-07-08', to: '2026-10-08' })).toBe('month')

    const hours = bucketKeys({ from: '2026-10-08', to: '2026-10-08' })
    expect(hours).toHaveLength(24)
    expect([hours[0], hours[9], hours[23]]).toEqual(['00', '09', '23'])
    expect(bucketKeys({ from: '2026-09-29', to: '2026-10-02' })).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ])
    expect(bucketKeys({ from: '2025-10-20', to: '2026-02-03' })).toEqual([
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
    expect(bucketKeys({ from: '2026-10-08', to: '2026-10-01' }, 'day')).toEqual([])
  })

  it('must run forwards and not for ever', () => {
    const ask = (from: string, to: string) => reportQuerySchema.safeParse({ from, to })
    expect(ask('2026-10-01', '2026-10-08').success).toBe(true)
    expect(ask('2026-10-08', '2026-10-08').success).toBe(true)
    expect(ask('2026-10-08', '2026-10-01').success).toBe(false)
    expect(ask('2026-10-08', '08.10.2026').success).toBe(false)
    expect(rangeDays({ from: '2023-10-04', to: '2026-10-08' })).toBeGreaterThan(MAX_REPORT_DAYS)
    expect(ask('2023-10-04', '2026-10-08').success).toBe(false)
    expect(reportQuerySchema.safeParse({ from: '2026-10-01', to: '2026-10-08', locationId: 'do‘kon' }).success).toBe(
      false,
    )
  })
})

describe('what the numbers say', () => {
  it('an average receipt, and none when nothing was sold', () => {
    expect(averageReceipt({ receipts: 3, sold: 158_000_000 })).toBe(52_666_667)
    expect(averageReceipt({ receipts: 0, sold: 0 })).toBe(0)
  })

  it('how a number stands against the one before, and nothing where there was nothing before', () => {
    expect(changePercent(112_500, 100_000)).toBe(12.5)
    expect(changePercent(80_000, 100_000)).toBe(-20)
    expect(changePercent(0, 100_000)).toBe(-100)
    expect(changePercent(100_000, 0)).toBeNull()
  })
})
