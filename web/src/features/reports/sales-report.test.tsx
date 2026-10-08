import { NO_SALES, type SalesFigures, type SalesReportDto } from '@erp/core'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { describe, expect, it, vi } from 'vitest'

import { bucketLabel, PeriodPicker, rangeLabel, shortSom } from './parts'
import { SalesReport } from './sales-report'

const som = (amount: number) => amount * 100
/** Thousands are kept apart by a space that does not break: here it is only a space. */
const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

const figures = (over: Partial<SalesFigures>): SalesFigures => ({ ...NO_SALES, ...over })

/** Five days of October: two shops, a return, and a day on which more came back than was sold. */
const report: SalesReportDto = {
  from: '2026-10-01',
  to: '2026-10-05',
  bucket: 'day',
  totals: figures({
    receipts: 40,
    qty: 56,
    gross: som(21_500_000),
    discount: som(1_500_000),
    sold: som(20_000_000),
    returns: 2,
    returnedQty: 3,
    returned: som(1_000_000),
    net: som(19_000_000),
    cost: som(12_000_000),
    profit: som(7_000_000),
  }),
  previous: {
    from: '2026-09-26',
    to: '2026-09-30',
    totals: figures({
      receipts: 50,
      qty: 60,
      gross: som(17_000_000),
      discount: som(1_000_000),
      sold: som(16_000_000),
      returns: 4,
      returnedQty: 4,
      returned: som(800_000),
      net: som(15_200_000),
      cost: som(10_000_000),
      profit: som(5_200_000),
    }),
  },
  series: [
    { key: '2026-10-01', receipts: 10, net: som(5_000_000), profit: som(1_800_000) },
    { key: '2026-10-02', receipts: 12, net: som(6_400_000), profit: som(2_400_000) },
    { key: '2026-10-03', receipts: 0, net: -som(400_000), profit: -som(150_000) },
    { key: '2026-10-04', receipts: 18, net: som(8_000_000), profit: som(2_950_000) },
    { key: '2026-10-05', receipts: 0, net: 0, profit: 0 },
  ],
  shops: [
    { id: 's1', name: 'Gulbahor 1', receipts: 26, net: som(12_000_000), profit: som(4_500_000) },
    { id: 's2', name: 'Gulbahor 2', receipts: 14, net: som(7_000_000), profit: som(2_500_000) },
  ],
  payments: [
    { method: 'cash', currency: 'UZS', amount: som(11_000_000), base: som(11_000_000) },
    { method: 'card', currency: 'UZS', amount: som(6_000_000), base: som(6_000_000) },
    { method: 'cash', currency: 'USD', amount: 15_000, base: som(1_800_000) },
    { method: 'debt', currency: 'UZS', amount: som(200_000), base: som(200_000) },
  ],
  cashiers: [{ id: 'c1', name: 'Dilnoza Karimova', receipts: 40, sold: som(20_000_000) }],
  products: [
    { id: 'p1', name: 'Palto', sku: '1042-00', image: null, qty: 12, net: som(9_000_000), profit: som(3_600_000) },
    { id: 'p2', name: 'Sharf', sku: '2210-01', image: null, qty: 30, net: som(2_400_000), profit: som(1_500_000) },
  ],
  categories: [
    { id: 'k1', name: 'Ustki kiyim', qty: 12, net: som(9_000_000) },
    { id: null, name: null, qty: 30, net: som(2_400_000) },
  ],
}

/** The same days for someone who may not see what goods cost. */
const withoutCost: SalesReportDto = {
  ...report,
  totals: { ...report.totals, cost: null, profit: null },
  previous: { ...report.previous, totals: { ...report.previous.totals, cost: null, profit: null } },
  series: report.series.map((point) => ({ ...point, profit: null })),
  shops: report.shops.map((shop) => ({ ...shop, profit: null })),
  products: report.products.map((product) => ({ ...product, profit: null })),
}

const tile = (label: string) => plain(screen.getByText(label, { selector: 'p' }).parentElement?.textContent)

describe('the sales report', () => {
  it('gives the numbers of the days, what they are made of and how they moved', () => {
    render(<SalesReport data={report} />)
    // 19 against 15,2 million: a quarter more.
    expect(tile('Sof tushum')).toBe('Sof tushum19 000 000 so‘m+25%sotildi 20 mln')
    expect(tile('Foyda')).toBe('Foyda7 000 000 so‘m+34,6%ustama 58,3%')
    expect(tile('Cheklar')).toBe('Cheklar40−20%56 dona')
    // 500 000 a receipt against 320 000.
    expect(tile('O‘rtacha chek')).toBe('O‘rtacha chek500 000 so‘m+56,3%chekda 1,4 dona')
    expect(tile('Chegirma')).toBe('Chegirma1 500 000 so‘m+50%narxning 7%')
    expect(tile('Qaytarish')).toBe('Qaytarish1 000 000 so‘m+25%2 ta, 3 dona')
  })

  it('counts more takings as good news, and more given away or brought back as bad', () => {
    render(<SalesReport data={report} />)
    const moved = (label: string) =>
      screen.getByText(label, { selector: 'p' }).parentElement?.querySelector('.inline-flex')?.className ?? ''
    expect(moved('Sof tushum')).toContain('text-ok')
    expect(moved('Cheklar')).toContain('text-bad')
    expect(moved('Chegirma')).toContain('text-bad')
    expect(moved('Qaytarish')).toContain('text-bad')
  })

  it('draws a bar for each day, the quiet ones too, and reads a day out when it is pointed at', async () => {
    const { container } = render(<SalesReport data={report} />)
    const chart = container.querySelector('[data-chart]') as HTMLElement
    expect([...chart.querySelectorAll('[data-bar]')].map((bar) => bar.getAttribute('data-bar'))).toEqual(
      report.series.map((point) => point.key),
    )
    const above = chart.querySelector('[aria-live]') as HTMLElement
    // With nothing pointed at, it says which days these are and what they are set against.
    expect(plain(above.textContent)).toContain('01.10.2026 – 05.10.2026')
    expect(plain(above.textContent)).toContain('O‘tgan shunday davr (26.09.2026 – 30.09.2026): 15 200 000 so‘m')

    await userEvent.hover(chart.querySelector('[data-bar="2026-10-02"]') as HTMLElement)
    expect(plain(above.textContent)).toBe('02.10.2026Sof tushum: 6 400 000 so‘mFoyda: 2 400 000 so‘m12 ta chek')
    // The chart tops out at a round eight million: the tallest day reaches it, the first stands at five eighths.
    const height = (day: string) => (chart.querySelector(`[data-bar="${day}"] > span`) as HTMLElement).style.height
    expect(height('2026-10-04')).toBe('100%')
    expect(height('2026-10-01')).toBe('62.5%')
    expect([...chart.querySelectorAll('.h-52.flex-col span')].map((line) => line.textContent)).toEqual([
      '8 mln',
      '6 mln',
      '4 mln',
      '2 mln',
      '0',
    ])
    // A day on which more came back than was sold is marked, not passed over as an empty one.
    expect(chart.querySelector('[data-bar="2026-10-03"] .bg-bad')).toBeTruthy()
    expect(height('2026-10-05')).toBe('0%')

    fireEvent.mouseLeave(chart.querySelector('[data-bar]')?.parentElement as HTMLElement)
    expect(plain(above.textContent)).toContain('01.10.2026 – 05.10.2026')
  })

  it('says where the money came from: the shops, the tenders, the hands, the goods', () => {
    render(<SalesReport data={report} />)
    const card = (title: string) => within(screen.getByRole('heading', { name: title }).parentElement as HTMLElement)
    const rows = (title: string) =>
      card(title)
        .getAllByRole('listitem')
        .map((row) => plain(row.textContent))

    expect(rows('Do‘konlar')).toEqual([
      'Gulbahor 112 000 000 so‘m63%26 ta chek · foyda 4,5 mln',
      'Gulbahor 27 000 000 so‘m37%14 ta chek · foyda 2,5 mln',
    ])
    // Dollars are counted in so'm with the rest; how many there were stands beside.
    expect(rows('To‘lov turlari')).toEqual([
      'Naqd so‘m11 000 000 so‘m58%',
      'Kartaga6 000 000 so‘m32%',
      'Naqd dollar1 800 000 so‘m9%150,00 $',
      'Qarzga200 000 so‘m1%',
    ])
    expect(rows('Kassirlar')).toEqual(['Dilnoza Karimova20 000 000 so‘m100%40 ta chek'])
    expect(rows('Kategoriyalar')).toEqual([
      'Ustki kiyim9 000 000 so‘m79%12 dona',
      'Kategoriyasiz2 400 000 so‘m21%30 dona',
    ])

    const goods = card('Eng ko‘p sotilgan tovarlar')
    expect(goods.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Tovar',
      'Soni',
      'Sof tushum',
      'Foyda',
    ])
    expect(
      goods
        .getAllByRole('row')
        .slice(1)
        .map((row) => plain(row.textContent)),
    ).toEqual(['Palto1042-00129 000 000 so‘m3 600 000 so‘m', 'Sharf2210-01302 400 000 so‘m1 500 000 so‘m'])
  })

  it('shows no profit, anywhere, to someone who may not see what goods cost', () => {
    const { container } = render(<SalesReport data={withoutCost} />)
    expect(container.textContent).not.toMatch(/foyda/i)
    expect(container.textContent).not.toContain('ustama')
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Tovar', 'Soni', 'Sof tushum'])
    // One shop alone is not a list of shops.
    render(<SalesReport data={{ ...withoutCost, shops: [withoutCost.shops[0]] }} />)
    expect(screen.getAllByRole('heading', { name: 'Do‘konlar' })).toHaveLength(1)
  })

  it('says so when nothing was sold, and what the days before had brought', () => {
    const quiet: SalesReportDto = {
      ...report,
      totals: figures({}),
      series: report.series.map((point) => ({ ...point, receipts: 0, net: 0, profit: 0 })),
      shops: [],
      payments: [],
      cashiers: [],
      products: [],
      categories: [],
    }
    render(<SalesReport data={quiet} />)
    expect(screen.getByText('Bu davrda savdo bo‘lmagan')).toBeTruthy()
    expect(plain(screen.getByText(/O‘tgan shunday davrda/).textContent)).toBe(
      'O‘tgan shunday davrda (26.09.2026 – 30.09.2026) 15 200 000 so‘m savdo bo‘lgan.',
    )
    expect(screen.queryByText('Sof tushum')).toBeNull()
  })
})

describe('how a report writes things', () => {
  it('shortens sums where the exact figure is beside the point', () => {
    const t = i18next.t.bind(i18next)
    expect(shortSom(som(1_250_000), t)).toBe('1,25 mln')
    expect(shortSom(som(850_000), t)).toBe('850 ming')
    expect(shortSom(som(2_400_000_000), t)).toBe('2,4 mlrd')
    expect(shortSom(som(950), t)).toBe('950')
    expect(shortSom(-som(400_000), t)).toBe('−400 ming')
    expect(shortSom(0, t)).toBe('0')
  })

  it('names hours, days and months, and the days a report covers', () => {
    expect(bucketLabel('14', 'hour')).toBe('14:00')
    expect(bucketLabel('2026-10-05', 'day')).toBe('05.10')
    expect(bucketLabel('2026-10', 'month')).toBe('10.2026')
    expect(rangeLabel({ from: '2026-10-05', to: '2026-10-05' })).toBe('05.10.2026')
    expect(rangeLabel({ from: '2026-10-01', to: '2026-10-05' })).toBe('01.10.2026 – 05.10.2026')
  })
})

describe('the days a report is asked for', () => {
  it('are a press away, and the one in force is marked', async () => {
    const onPeriod = vi.fn()
    render(
      <PeriodPicker
        period="month"
        range={{ from: '2026-10-01', to: '2026-10-05' }}
        onPeriod={onPeriod}
        onRange={() => undefined}
      />,
    )
    expect(screen.getAllByRole('button', { pressed: true }).map((button) => button.textContent)).toEqual(['Oy'])
    await userEvent.click(screen.getByRole('button', { name: 'O‘tgan oy' }))
    expect(onPeriod).toHaveBeenCalledWith('last_month')
    // The two dates show what the name stands for.
    expect(screen.getAllByRole('textbox').map((field) => (field as HTMLInputElement).value)).toEqual([
      '01.10.2026',
      '05.10.2026',
    ])
  })

  it('stay a range when a date is typed past the other', async () => {
    const onRange = vi.fn()
    render(
      <PeriodPicker
        period={null}
        range={{ from: '2026-10-01', to: '2026-10-05' }}
        onPeriod={() => undefined}
        onRange={onRange}
      />,
    )
    expect(screen.queryAllByRole('button', { pressed: true })).toEqual([])
    const [from, to] = screen.getAllByRole('textbox')
    await userEvent.clear(from)
    await userEvent.type(from, '08.10.2026{Enter}')
    expect(onRange).toHaveBeenLastCalledWith({ from: '2026-10-08', to: '2026-10-08' })
    await userEvent.clear(to)
    await userEvent.type(to, '28.09.2026{Enter}')
    expect(onRange).toHaveBeenLastCalledWith({ from: '2026-09-28', to: '2026-09-28' })
    // A date on the right side of the other moves alone.
    await userEvent.clear(to)
    await userEvent.type(to, '03.10.2026{Enter}')
    expect(onRange).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-03' })
  })
})
