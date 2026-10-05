import type { CurrencyCode, PaymentAccountDto } from '@gulbahor/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import {
  addRow,
  clearRows,
  fillFor,
  patchRow,
  PaymentLines,
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
} from './payment-lines'

const som = (amount: number) => Math.round(amount * 100)
const usd = (amount: number) => Math.round(amount * 100)

const account = (id: string, name: string, currency: CurrencyCode, more: Partial<PaymentAccountDto> = {}) =>
  ({ id, name, currency, kind: 'cash', balance: null, registerId: null, open: true, ...more }) as PaymentAccountDto

const ACCOUNTS = [account('uzs', "Kassa (so'm)", 'UZS'), account('usd', 'Kassa (dollar)', 'USD')]
const RATE = 12_650

/** Thousands are kept apart by a space that does not break: here it is only a space. */
const plain = (text: string) => text.replace(/\s/g, ' ')

const row = (accountId: string, amount: number | null = null, rate: number | null = null): PaymentRow => ({
  accountId,
  amount,
  rate,
})

describe('the lines a payment opens with', () => {
  const till = [
    account('d1', 'Kassa 1 (dollar)', 'USD', { registerId: 'till-1' }),
    account('s1', "Kassa 1 (so'm)", 'UZS', { registerId: 'till-1' }),
    account('d2', 'Kassa 2 (dollar)', 'USD', { registerId: 'till-2' }),
    account('s2', "Kassa 2 (so'm)", 'UZS', { registerId: 'till-2' }),
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
    const shut = [account('uzs', "Kassa (so'm)", 'UZS'), account('usd', 'Kassa (dollar)', 'USD', { open: false })]
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
}

function Lines({ setsRates = false, start, accounts = ACCOUNTS, owed }: LinesProps) {
  const [rows, setRows] = useState(start)
  const lines = valueLines(rows, accounts, 'USD', RATE)
  return (
    <PaymentLines
      kind="in"
      lines={lines}
      spare={accounts.filter((item) => !rows.some((line) => line.accountId === item.id))}
      currency="USD"
      owed={owed ?? null}
      onPatch={(accountId, change) => setRows((current) => patchRow(current, accountId, change))}
      onAdd={(accountId) => setRows((current) => addRow(current, accountId))}
      onRemove={(accountId) => setRows((current) => removeRow(current, accountId))}
      onTotal={(total) => {
        const taken = spreadTotal(lines, total, 'USD')
        if (taken) {
          setRows((current) => patchRow(current, taken.accountId, { amount: taken.amount }))
        }
        return !!taken
      }}
      setsRates={setsRates}
    />
  )
}

/** The fields of the lines in reading order, the total last. */
const fields = () => screen.getAllByRole('textbox') as HTMLInputElement[]

describe('the ready lines', () => {
  it('work a pair out from the rate, whichever of the two is typed', async () => {
    render(<Lines start={[row('uzs'), row('usd')]} />)
    // So'm against a dollar account has both fields; dollars have one. No place is picked: every line is ready.
    const [amount, settled, dollars, total] = fields()
    expect(fields()).toHaveLength(4)
    // The day's rate is only shown to those who may not set their own.
    expect(plain(screen.getByText(/12.650/).textContent ?? '')).toBe('12 650')

    await userEvent.type(amount, '1000000{Tab}')
    expect(settled.value).toBe('79,05')
    expect(total.value).toBe('79,05')

    // Typed the other way round: 500 $ is 6 325 000 so'm.
    await userEvent.clear(settled)
    await userEvent.type(settled, '500{Tab}')
    expect(plain(amount.value)).toBe('6 325 000')
    expect(settled.value).toBe('500,00')

    await userEvent.type(dollars, '250{Tab}')
    expect(total.value).toBe('750,00')
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
    const shut = [account('uzs', "Kassa (so'm)", 'UZS', { open: false }), account('usd', 'Kassa (dollar)', 'USD')]
    render(<Lines start={[row('uzs'), row('usd')]} accounts={shut} />)
    const [amount, settled, dollars] = fields()
    expect(amount.disabled).toBe(true)
    expect(settled.disabled).toBe(true)
    expect(dollars.disabled).toBe(false)
  })

  it('let the one who sets rates give a line its own', async () => {
    render(<Lines setsRates start={[row('uzs', som(1_200_000))]} />)
    // The line, its rate, what it settles; then the place that has no line yet, and the total.
    const [, rate, settled] = fields()
    expect(settled.value).toBe('94,86')
    expect(plain(rate.placeholder)).toBe('12 650')
    await userEvent.type(rate, '12000{Tab}')
    expect(settled.value).toBe('100,00')
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
            setRows((current) => patchRow(current, taken.accountId, { amount: taken.amount }))
          }
          return !!taken
        }}
        setsRates={false}
        headings={{ ours: 'Bizdan chiqdi', theirs: "So'mda" }}
      />
      <output aria-label="total">{totalOf(lines) / 100}</output>
    </>
  )
}

describe('the ready lines of an expense', () => {
  it("are counted in so'm, dollars at the day's rate, under words of their own", async () => {
    render(<Expense start={[row('uzs'), row('usd')]} />)
    expect(screen.getByText("So'mda")).toBeTruthy()
    expect(screen.queryByText('Hamkor hisobiga')).toBeNull()

    // So'm have one field; dollars have their worth in so'm beside them.
    const [som1, dollars, worth, total] = fields()
    expect(fields()).toHaveLength(4)
    await userEvent.type(som1, '494000{Tab}')
    await userEvent.type(dollars, '40{Tab}')
    expect(plain(worth.value)).toBe('506 000')
    expect(plain(total.value)).toBe('1 000 000')
    expect(screen.getByLabelText('total').textContent).toBe('1000000')

    // The worth typed instead works the dollars out.
    await userEvent.clear(worth)
    await userEvent.type(worth, '253000{Tab}')
    expect(dollars.value).toBe('20,00')
  })
})
