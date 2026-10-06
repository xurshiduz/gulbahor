import type { AnyCurrency, PaymentAccountDto, RateBook } from '@gulbahor/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import {
  addRow,
  agreedOf,
  clearRows,
  fillFor,
  patchRow,
  PaymentLines,
  placeName,
  rateText,
  READY_ROWS,
  removeRow,
  spreadTotal,
  sparePlaces,
  startRows,
  switchTill,
  totalOf,
  valueLines,
  type PaymentRow,
  type ValuedLine,
} from './payment-lines'

const som = (amount: number) => Math.round(amount * 100)
const usd = (amount: number) => Math.round(amount * 100)

const account = (id: string, name: string, currency: AnyCurrency, more: Partial<PaymentAccountDto> = {}) =>
  ({ id, name, currency, kind: 'cash', balance: null, registerId: null, open: true, ...more }) as PaymentAccountDto

const ACCOUNTS = [account('uzs', 'Kassa (so‘m)', 'UZS'), account('usd', 'Kassa (dollar)', 'USD')]
const RATE = 12_650

/** Thousands are kept apart by a space that does not break: here it is only a space. */
const plain = (text: string) => text.replace(/\s/g, ' ')

const row = (accountId: string, amount: number | null = null, rate: number | null = null): PaymentRow => ({
  accountId,
  amount,
  rate,
  settled: null,
})

describe('the lines a payment opens with', () => {
  const till = [
    account('d1', 'Kassa 1 (dollar)', 'USD', { registerId: 'till-1' }),
    account('s1', 'Kassa 1 (so‘m)', 'UZS', { registerId: 'till-1' }),
    account('d2', 'Kassa 2 (dollar)', 'USD', { registerId: 'till-2' }),
    account('s2', 'Kassa 2 (so‘m)', 'UZS', { registerId: 'till-2' }),
    account('safe', 'Seyf', 'USD', { kind: 'safe' }),
    account('card', 'Humo', 'UZS', { kind: 'card' }),
  ]
  const ids = (rows: PaymentRow[]) => rows.map((line) => line.accountId)

  it("are the drawers of the till it goes through, so'm first, and no other till's", () => {
    expect(ids(startRows(till, [], 'till-1'))).toEqual(['s1', 'd1'])
    expect(ids(startRows(till, [], 'till-2'))).toEqual(['s2', 'd2'])
  })

  it('have after them the other places this computer paid through before', () => {
    // A place that is no longer there is forgotten; a drawer remembered from before is not laid out twice,
    // nor is another till's brought in by having been used once.
    expect(ids(startRows(till, ['safe', 'gone', 's1', 'd2', 'card'], 'till-1'))).toEqual(['s1', 'd1', 'safe', 'card'])
  })

  it('are the first few places that are no till when there is no till to go through', () => {
    expect(ids(startRows(till, [], null))).toEqual(['safe', 'card'])
    expect(ids(startRows(till, ['card'], null))).toEqual(['card'])
    const many = Array.from({ length: READY_ROWS + 4 }, (_, index) => account(`a${index}`, `Hisob ${index}`, 'UZS'))
    expect(startRows(many, [], null)).toHaveLength(READY_ROWS)
  })

  it("change one till's drawers for another's and keep the rest, with what was typed there", () => {
    const rows = [row('s1', som(500_000)), row('d1'), row('card', som(200_000))]
    expect(switchTill(rows, till, 'till-2')).toEqual([row('s2'), row('d2'), row('card', som(200_000))])
  })

  it("offer under “another account” only what is no till's drawer and has no line yet", () => {
    expect(sparePlaces(till, [row('s1'), row('safe')]).map((place) => place.id)).toEqual(['card'])
  })

  it('gain and lose a place, and are emptied for the next payment', () => {
    const rows = addRow([row('uzs', som(1000))], 'usd')
    expect(rows.map((line) => line.accountId)).toEqual(['uzs', 'usd'])
    // A place has one line.
    expect(addRow(rows, 'usd')).toHaveLength(2)
    expect(removeRow(rows, 'uzs').map((line) => line.accountId)).toEqual(['usd'])
    expect(clearRows(patchRow(rows, 'usd', { amount: usd(5), rate: 12_000 }))).toEqual([row('uzs'), row('usd')])
  })
})

describe('the lines of a payment', () => {
  it('are worth what they settle on the account being paid', () => {
    const three = [...ACCOUNTS, account('card', 'Humo', 'UZS', { kind: 'card' })]
    const lines = valueLines(
      [row('usd', usd(500)), row('uzs', som(1_000_000)), row('card', som(1_200_000), 12_000), row('gone')],
      three,
      'USD',
      RATE,
    )
    // A line whose place is not there is not a line.
    expect(lines).toHaveLength(3)
    // Dollars against a dollar account: as they are, in one field.
    expect(lines[0]).toMatchObject({ changes: false, settled: usd(500) })
    // So'm against it: both fields, at the day's rate.
    expect(lines[1]).toMatchObject({ changes: true, rate: RATE, settled: usd(79.05) })
    // A line's own rate wins over the day's.
    expect(lines[2]).toMatchObject({ changes: true, rate: 12_000, settled: usd(100) })
  })

  it('cannot change currency without a rate, but take the same currency as it is', () => {
    const lines = valueLines([row('uzs', som(1_000_000)), row('usd', usd(50))], ACCOUNTS, 'USD', null)
    expect(lines[0]).toMatchObject({ changes: true, rate: null, settled: null })
    expect(lines[1]).toMatchObject({ changes: false, settled: usd(50) })
    // Nobody is chosen yet: nothing can be said about what is settled.
    expect(valueLines([row('uzs', som(1_000_000))], ACCOUNTS, null, RATE)[0]).toMatchObject({
      changes: false,
      settled: null,
    })
  })

  it('show a rate the way it is said', () => {
    expect(plain(rateText(12_650))).toBe('12 650')
    expect(plain(rateText(12_650.5))).toBe('12 650,5')
  })
})

describe('the total, typed', () => {
  it("is made up by the line in the partner's own currency", () => {
    // 240 $ to settle, 1 707 750 so'm of it brought: that is 135 $, so 105 $ in dollars.
    const lines = valueLines([row('uzs', som(1_707_750)), row('usd')], ACCOUNTS, 'USD', RATE)
    expect(spreadTotal(lines, usd(240), 'USD')).toEqual({ accountId: 'usd', amount: usd(105) })
    // Exactly what the others settle: the line is left empty.
    expect(spreadTotal(lines, usd(135), 'USD')).toEqual({ accountId: 'usd', amount: null })
    // Less than they settle: no line can make that up.
    expect(spreadTotal(lines, usd(100), 'USD')).toBeNull()
  })

  it('goes at the rate where no line is in that currency', () => {
    const lines = valueLines([row('uzs')], ACCOUNTS, 'USD', RATE)
    expect(spreadTotal(lines, usd(100), 'USD')).toEqual({ accountId: 'uzs', amount: som(1_265_000) })
    expect(spreadTotal(valueLines([row('uzs')], ACCOUNTS, 'USD', null), usd(100), 'USD')).toBeNull()
  })

  it('never goes into a drawer whose shift is shut', () => {
    const shut = [account('uzs', 'Kassa (so‘m)', 'UZS'), account('usd', 'Kassa (dollar)', 'USD', { open: false })]
    const lines = valueLines([row('uzs'), row('usd')], shut, 'USD', RATE)
    expect(spreadTotal(lines, usd(100), 'USD')).toEqual({ accountId: 'uzs', amount: som(1_265_000) })
  })
})

describe('what "=" fills in', () => {
  it('is what is still owed, in the currency of the line', () => {
    const lines = valueLines([row('uzs'), row('usd', usd(500))], ACCOUNTS, 'USD', RATE)
    // 570,95 $ owed, 500 $ of it typed: 70,95 $ is 897 517,50 so'm.
    expect(fillFor(lines[0], lines, usd(570.95), 'USD')).toBe(som(897_517.5))
    // The line itself does not count against what it could take.
    expect(fillFor(lines[1], lines, usd(570.95), 'USD')).toBe(usd(570.95))
    // Nothing is left owed.
    expect(fillFor(lines[0], lines, usd(500), 'USD')).toBeUndefined()
  })
})

interface LinesProps {
  setsRates?: boolean
  start: PaymentRow[]
  accounts?: PaymentAccountDto[]
  owed?: number
  /** The currency of the account being settled, and which way the money goes. */
  currency?: AnyCurrency
  kind?: 'in' | 'out'
  /** What the lines would send, for whoever wants to look. */
  onLines?: (lines: ValuedLine[]) => void
}

function Lines({
  setsRates = false,
  start,
  accounts = ACCOUNTS,
  owed,
  currency = 'USD',
  kind = 'in',
  onLines,
}: LinesProps) {
  const [rows, setRows] = useState(start)
  // Anyone may agree a sum within 2% of the day's rate.
  const lines = valueLines(rows, accounts, currency, RATE, 2)
  onLines?.(lines)
  return (
    <PaymentLines
      kind={kind}
      lines={lines}
      spare={accounts.filter((item) => !rows.some((line) => line.accountId === item.id))}
      currency={currency}
      owed={owed ?? null}
      onPatch={(accountId, change) => setRows((current) => patchRow(current, accountId, change))}
      onAdd={(accountId) => setRows((current) => addRow(current, accountId))}
      onRemove={(accountId) => setRows((current) => removeRow(current, accountId))}
      onTotal={(total) => {
        const taken = spreadTotal(lines, total, currency)
        if (taken) {
          setRows((current) => patchRow(current, taken.accountId, { amount: taken.amount, settled: null }))
        }
        return !!taken
      }}
      setsRates={setsRates}
      dayRate={RATE}
    />
  )
}

/** The fields of the lines in reading order, the total last. */
const fields = () => screen.getAllByRole('textbox') as HTMLInputElement[]

describe('the ready lines', () => {
  it('are named by what they hold: the till they belong to is chosen above them', () => {
    const places = [
      account('uzs', 'Gulbahor 2 kassasi (so‘m)', 'UZS', { registerId: 'till-2' }),
      account('usd', 'Gulbahor 2 kassasi (dollar)', 'USD', { registerId: 'till-2' }),
      account('humo', 'Humo', 'UZS', { kind: 'card', cardNumber: '9860123456789012', last4: '9012' }),
      account('visa', 'Visa', 'USD', { kind: 'card', cardNumber: '4000123412341234', last4: '1234' }),
      account('old', 'Uzcard', 'UZS', { kind: 'card', last4: '8841' }),
      account('safe', 'Asosiy seyf', 'USD', { kind: 'safe' }),
      account('bank', 'Ipak yo‘li', 'UZS', { kind: 'bank' }),
    ]
    const t = i18next.t.bind(i18next)
    expect(places.map((place) => placeName(place, t))).toEqual([
      'So‘m naqd',
      'Dollar naqd',
      // A card is told from another by its whole number; one known only by its last four says so.
      'So‘m karta (9860 1234 5678 9012)',
      'Dollar karta (4000 1234 1234 1234)',
      'So‘m karta (Uzcard *8841)',
      'Dollar naqd (Asosiy seyf)',
      'So‘m bank (Ipak yo‘li)',
    ])
    render(<Lines start={[row('uzs'), row('usd'), row('humo')]} accounts={places} />)
    expect(screen.getByText('So‘m naqd')).toBeTruthy()
    expect(screen.getByText('Dollar naqd')).toBeTruthy()
    expect(screen.getByText('So‘m karta (9860 1234 5678 9012)')).toBeTruthy()
    expect(screen.queryByText(/Gulbahor 2 kassasi/)).toBeNull()
  })

  it('work what the money settles out from the rate as the money is typed', async () => {
    render(<Lines start={[row('uzs'), row('usd')]} />)
    // So'm against a dollar account has both fields; dollars have one. No place is picked: every line is ready.
    const [amount, settled, dollars, total] = fields()
    expect(fields()).toHaveLength(4)
    // The day's rate is only shown to those who may not set their own.
    expect(plain(screen.getByText(/12.650/).textContent ?? '')).toBe('12 650')

    await userEvent.type(amount, '1000000{Tab}')
    expect(settled.value).toBe('79,05')
    expect(total.value).toBe('79,05')
    // Left to the rate, nothing is said about a rate and nothing is sent as agreed.
    expect(document.querySelector('[data-agreed]')).toBeNull()

    await userEvent.type(dollars, '250{Tab}')
    expect(total.value).toBe('329,05')
  })

  it('work the money out when what it is to settle is typed into an empty line', async () => {
    render(<Lines start={[row('uzs'), row('usd')]} />)
    const [amount, settled] = fields()
    // "How many so'm are 500 dollars?" — 6 325 000 at the rate.
    await userEvent.type(settled, '500{Tab}')
    expect(plain(amount.value)).toBe('6 325 000')
    expect(settled.value).toBe('500,00')
    expect(document.querySelector('[data-agreed]')).toBeNull()
  })

  it('leave the money as it is when what it settles is typed over: both stand, the rate follows', async () => {
    let sent: ValuedLine[] = []
    // A partner who keeps count in so'm brings dollars.
    render(<Lines currency="UZS" start={[row('uzs'), row('usd')]} onLines={(lines) => (sent = lines)} />)
    const [, dollars, settled, total] = fields()
    await userEvent.type(dollars, '100{Tab}')
    expect(plain(settled.value)).toBe('1 265 000')

    // "Take these hundred dollars for 1 280 000."
    await userEvent.clear(settled)
    await userEvent.type(settled, '1280000{Tab}')
    // Neither field was rewritten.
    expect(dollars.value).toBe('100,00')
    expect(plain(settled.value)).toBe('1 280 000')
    expect(plain(total.value)).toBe('1 280 000')
    // The rate column goes on saying the day's rate: nobody is to take 12 800 for today's.
    expect(plain(screen.getByText(/^12.650$/).textContent ?? '')).toBe('12 650')
    // What the two sums make, and what that costs against the day's rate, is said in words under the line.
    const note = document.querySelector('[data-agreed="usd"]') as HTMLElement
    expect(plain(note.textContent ?? '')).toBe(
      'Kelishilgan kurs 12 800, kun kursi 12 650 (1,2% farq): 15 000 so‘m zararimizga',
    )
    expect(note.className).toContain('text-warn')
    expect(agreedOf(sent[1])).toBe(som(1_280_000))
    expect(sent[1]).toMatchObject({ agreed: true, strays: false, rate: 12_800 })

    // The money typed again is a new sum: what it settles is worked out afresh, at the day's rate.
    await userEvent.clear(dollars)
    await userEvent.type(dollars, '200{Tab}')
    expect(plain(settled.value)).toBe('2 530 000')
    expect(document.querySelector('[data-agreed]')).toBeNull()
    expect(agreedOf(sent[1])).toBeNull()

    // Emptied, the second field goes back to what the rate makes.
    await userEvent.clear(settled)
    await userEvent.type(settled, '2600000{Tab}')
    expect(plain(settled.value)).toBe('2 600 000')
    await userEvent.clear(settled)
    await userEvent.tab()
    expect(plain(settled.value)).toBe('2 530 000')
  })

  it('say which way an agreed sum cuts: money in worth more than it settles is the business’s gain', async () => {
    render(<Lines currency="UZS" start={[row('usd')]} />)
    const [dollars, settled] = fields()
    await userEvent.type(dollars, '100{Tab}')
    await userEvent.clear(settled)
    await userEvent.type(settled, '1250000{Tab}')
    const note = () => document.querySelector('[data-agreed="usd"]') as HTMLElement
    expect(plain(note().textContent ?? '')).toBe(
      'Kelishilgan kurs 12 500, kun kursi 12 650 (1,2% farq): 15 000 so‘m foydamizga',
    )
    expect(note().className).toContain('text-ok')
  })

  it('and money going out worth more than it settles is its loss', async () => {
    render(<Lines kind="out" currency="UZS" start={[row('usd')]} />)
    const [dollars, settled] = fields()
    await userEvent.type(dollars, '100{Tab}')
    await userEvent.clear(settled)
    await userEvent.type(settled, '1250000{Tab}')
    expect(plain(document.querySelector('[data-agreed="usd"]')?.textContent ?? '')).toBe(
      'Kelishilgan kurs 12 500, kun kursi 12 650 (1,2% farq): 15 000 so‘m zararimizga',
    )
  })

  it('warn, before anything is sent, of a sum further from the rate than anyone may agree to', async () => {
    let sent: ValuedLine[] = []
    render(<Lines currency="UZS" start={[row('usd')]} onLines={(lines) => (sent = lines)} />)
    const [dollars, settled] = fields()
    await userEvent.type(dollars, '100{Tab}')
    await userEvent.clear(settled)
    await userEvent.type(settled, '1400000{Tab}')
    const note = document.querySelector('[data-agreed="usd"]') as HTMLElement
    expect(plain(note.textContent ?? '')).toBe(
      'Kelishilgan kurs 14 000, kun kursi 12 650 (10,7% farq): 135 000 so‘m zararimizga — kurs qo‘yish ruxsati kerak',
    )
    expect(note.className).toContain('text-bad')
    expect(settled.getAttribute('aria-invalid')).toBe('true')
    expect(sent[0]).toMatchObject({ agreed: true, strays: true })
  })

  it('make the total up in dollars when the total is typed', async () => {
    render(<Lines start={[row('uzs'), row('usd')]} />)
    const [amount, , dollars, total] = fields()
    await userEvent.type(amount, '1707750{Tab}')
    await userEvent.clear(total)
    await userEvent.type(total, '240{Tab}')
    expect(dollars.value).toBe('105,00')
    expect(total.value).toBe('240,00')

    // A total the so'm alone already pass is not taken: it goes back to what the lines settle.
    await userEvent.clear(total)
    await userEvent.type(total, '100{Tab}')
    expect(dollars.value).toBe('105,00')
    expect(fields().at(-1)?.value).toBe('240,00')
  })

  it('offer what is still owed, and take it at "="', async () => {
    render(<Lines start={[row('uzs'), row('usd')]} owed={usd(240)} />)
    const [amount, , dollars] = fields()
    expect(plain(amount.placeholder)).toBe('3 036 000')
    expect(dollars.placeholder).toBe('240,00')
    await userEvent.type(amount, '1707750{Tab}')
    // 135 $ of it came in so'm: 105 $ is left.
    expect(dollars.placeholder).toBe('105,00')
    await userEvent.type(dollars, '=')
    expect(dollars.value).toBe('105,00')
  })

  it('take nothing into a drawer whose shift is shut', () => {
    const shut = [account('uzs', 'Kassa (so‘m)', 'UZS', { open: false }), account('usd', 'Kassa (dollar)', 'USD')]
    render(<Lines start={[row('uzs'), row('usd')]} accounts={shut} />)
    const [amount, settled, dollars] = fields()
    expect(amount.disabled).toBe(true)
    expect(settled.disabled).toBe(true)
    expect(dollars.disabled).toBe(false)
  })

  it('let the one who sets rates give a line its own, or read it off an agreed sum', async () => {
    render(<Lines setsRates start={[row('uzs', som(1_200_000))]} />)
    // The line, its rate, what it settles; then the place that has no line yet, and the total.
    const [amount, rate, settled] = fields()
    expect(settled.value).toBe('94,86')
    expect(plain(rate.placeholder)).toBe('12 650')
    expect(rate.value).toBe('')
    await userEvent.type(rate, '12000{Tab}')
    expect(settled.value).toBe('100,00')
    // 1 200 000 so'm for a hundred dollars that are worth 1 265 000: whoever sets rates is told what it costs,
    // and is not stopped.
    const note = document.querySelector('[data-agreed="uzs"]') as HTMLElement
    expect(plain(note.textContent ?? '')).toBe(
      'Kelishilgan kurs 12 000, kun kursi 12 650 (5,4% farq): 65 000 so‘m zararimizga',
    )
    expect(note.className).toContain('text-warn')

    // The sum typed over the rate: the money stands, and the rate field goes back to showing the day's, faintly —
    // what the two sums now make is said under the line.
    await userEvent.clear(settled)
    await userEvent.type(settled, '96{Tab}')
    expect(plain(amount.value)).toBe('1 200 000')
    expect(rate.value).toBe('')
    expect(plain(document.querySelector('[data-agreed="uzs"]')?.textContent ?? '')).toContain('Kelishilgan kurs 12 500')
    // The money typed again goes back to the day's rate, and the rate field to showing it faintly.
    await userEvent.clear(amount)
    await userEvent.type(amount, '1265000{Tab}')
    expect(settled.value).toBe('100,00')
    expect(rate.value).toBe('')
  })
})

/** An expense: no partner on the other side, everything counted in so'm. */
function Expense({ start }: { start: PaymentRow[] }) {
  const [rows, setRows] = useState(start)
  const lines = valueLines(rows, ACCOUNTS, 'UZS', RATE)
  return (
    <>
      <PaymentLines
        kind="out"
        lines={lines}
        spare={[]}
        currency="UZS"
        owed={null}
        onPatch={(accountId, change) => setRows((current) => patchRow(current, accountId, change))}
        onAdd={() => undefined}
        onRemove={() => undefined}
        onTotal={(total) => {
          const taken = spreadTotal(lines, total, 'UZS')
          if (taken) {
            setRows((current) => patchRow(current, taken.accountId, { amount: taken.amount, settled: null }))
          }
          return !!taken
        }}
        setsRates={false}
        dayRate={RATE}
        headings={{ ours: 'Bizdan chiqdi', theirs: 'So‘mda' }}
      />
      <output aria-label="total">{totalOf(lines) / 100}</output>
    </>
  )
}

describe('the ready lines of an expense', () => {
  it("are counted in so'm, dollars at the day's rate, under words of their own", async () => {
    render(<Expense start={[row('uzs'), row('usd')]} />)
    expect(screen.getByText('So‘mda')).toBeTruthy()
    expect(screen.queryByText('Hamkor hisobiga')).toBeNull()

    // So'm have one field; dollars have their worth in so'm beside them.
    const [som1, dollars, worth, total] = fields()
    expect(fields()).toHaveLength(4)
    await userEvent.type(som1, '494000{Tab}')
    await userEvent.type(dollars, '40{Tab}')
    expect(plain(worth.value)).toBe('506 000')
    expect(plain(total.value)).toBe('1 000 000')
    expect(screen.getByLabelText('total').textContent).toBe('1000000')

    // The worth typed over leaves the dollars as they are: forty dollars counted as 510 000.
    await userEvent.clear(worth)
    await userEvent.type(worth, '510000{Tab}')
    expect(dollars.value).toBe('40,00')
    expect(plain(worth.value)).toBe('510 000')
    expect(screen.getByLabelText('total').textContent).toBe('1004000')
    // Typed into an empty line, it works the dollars out.
    await userEvent.clear(dollars)
    await userEvent.tab()
    await userEvent.type(worth, '253000{Tab}')
    expect(dollars.value).toBe('20,00')
  })
})

describe('a line in another currency the business keeps', () => {
  /** So'm the base, the dollar 12 650, the yuan named against the dollar. */
  const book: RateBook = {
    base: 'UZS',
    rates: { USD: { against: 'UZS', way: 'in', value: 12_650 }, CNY: { against: 'USD', way: 'per', value: 7.25 } },
  }
  const yuan = (amount: number) => Math.round(amount * 100)
  const places = [
    ...ACCOUNTS,
    account('cny', 'Yuan seyfi', 'CNY', { kind: 'safe' }),
    account('union', 'UnionPay', 'CNY', { kind: 'card', cardNumber: '6200123456789012', last4: '9012' }),
  ]

  it('is named by its currency like any other place', () => {
    const t = i18next.t.bind(i18next)
    expect(placeName(places[2], t)).toBe('Yuan naqd (Yuan seyfi)')
    expect(placeName(places[3], t)).toBe('Yuan karta (6200 1234 5678 9012)')
  })

  it('settles a dollar account through the yuan’s own rate, and so’m through the whole chain', () => {
    const [toDollars] = valueLines([row('cny', yuan(7250))], places, 'USD', book)
    // "1 $ = 7,25 ¥": 7 250 ¥ are a thousand dollars.
    expect(toDollars).toMatchObject({
      changes: true,
      pair: { one: 'USD', of: 'CNY' },
      dayRate: 7.25,
      rate: 7.25,
      settled: usd(1000),
      agreed: false,
    })
    // Counted in so'm: 1 000 × 12 650 / 7,25, and the rate reads "1 ¥ = 1 744,83 so'm".
    const [toSom] = valueLines([row('cny', yuan(1000))], places, 'UZS', book)
    expect(toSom).toMatchObject({ pair: { one: 'CNY', of: 'UZS' }, dayRate: 1744.83, settled: som(1_744_827.59) })
  })

  it('stands as agreed, and says what that comes to in so’m', () => {
    // "Take 7 300 yuan for a thousand dollars": the day would have asked 7 250.
    const [line] = valueLines([{ ...row('cny', yuan(7300)), settled: usd(1000) }], places, 'USD', book, 2)
    expect(line).toMatchObject({ settled: usd(1000), agreed: true, rate: 7.3, dayRate: 7.25, gap: 0.7, strays: false })
    expect(line.fx).toBe(som(87_241.38))
    expect(agreedOf(line)).toBe(usd(1000))
    // 8 000 yuan for the same thousand is 9,4% off: past what anyone may agree to.
    const [far] = valueLines([{ ...row('cny', yuan(8000)), settled: usd(1000) }], places, 'USD', book, 2)
    expect(far).toMatchObject({ agreed: true, strays: true })
  })

  it('goes by a rate of its own where someone who sets rates typed one for the pair', () => {
    // "1 $ = 7,30 ¥" for this line: 7 300 ¥ make the thousand, and that is an agreed sum against the day's 7,25.
    const [line] = valueLines([row('cny', yuan(7300), 7.3)], places, 'USD', book, 2)
    expect(line).toMatchObject({ rate: 7.3, settled: usd(1000), agreed: true })
    // "=" on an empty line asks for what is still owed, at the line's rate.
    const lines = valueLines([row('cny'), row('usd', usd(400))], places, 'USD', book)
    expect(fillFor(lines[0], lines, usd(1000), 'USD')).toBe(yuan(4350))
    // A total typed where yuan are the only line is made up in yuan.
    const alone = valueLines([row('cny')], places, 'USD', book)
    expect(spreadTotal(alone, usd(1000), 'USD')).toEqual({ accountId: 'cny', amount: yuan(7250) })
  })

  it('cannot be counted while a rate it hangs on is wanting', () => {
    const noDollar: RateBook = { base: 'UZS', rates: { CNY: { against: 'USD', way: 'per', value: 7.25 } } }
    const [line] = valueLines([row('cny', yuan(1000))], places, 'UZS', noDollar)
    expect(line).toMatchObject({ changes: true, pair: null, dayRate: null, settled: null })
  })

  it('shows the pair’s own rate in its line, said whole to whoever points at it', async () => {
    function Yuan() {
      const [rows, setRows] = useState<PaymentRow[]>([row('cny'), row('usd')])
      const lines = valueLines(rows, places, 'USD', book, 2)
      return (
        <PaymentLines
          kind="out"
          lines={lines}
          spare={[]}
          currency="USD"
          owed={null}
          onPatch={(accountId, change) => setRows((current) => patchRow(current, accountId, change))}
          onAdd={() => undefined}
          onRemove={() => undefined}
          onTotal={() => false}
          setsRates={false}
          dayRate={book}
        />
      )
    }
    render(<Yuan />)
    expect(screen.getByText('Yuan naqd (Yuan seyfi)')).toBeTruthy()
    expect(screen.getByTitle(/^1 \$ = 7,25 ¥$/).textContent).toBe('7,25')

    const [money, settled] = fields()
    await userEvent.type(money, '7250{Tab}')
    expect(plain(settled.value)).toBe('1 000,00')
    // The second sum typed over: the yuan stay, and what the agreement costs is said in so'm.
    await userEvent.clear(settled)
    await userEvent.type(settled, '990{Tab}')
    expect(plain(money.value)).toBe('7 250,00')
    expect(plain(document.querySelector('[data-agreed="cny"]')?.textContent ?? '')).toBe(
      'Kelishilgan kurs 7,3232, kun kursi 7,25 (1% farq): 126 500 so‘m zararimizga',
    )
  })
})
