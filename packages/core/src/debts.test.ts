import { describe, expect, it } from 'vitest'

import { accountBar, addedDebt, ageBalance, type AccountBarInput, type AccountEvent } from './debts'
import { saleInputSchema } from './pos'

const som = (amount: number) => amount * 100
const ID = '11111111-1111-4111-8111-111111111111'
const KEY = '22222222-2222-4222-8222-222222222222'

const balanceOf = (events: AccountEvent[]) =>
  events.reduce((sum, event) => sum + (event.type === 'credit' ? -event.amount : event.amount), 0)

describe('an account, aged', () => {
  // KEYINGI-REJA, 16.3: Aziz.
  const aziz: AccountEvent[] = [
    { type: 'charge', id: 'oct1', amount: som(2_000_000), due: '2026-10-31' },
    { type: 'charge', id: 'oct10', amount: som(1_000_000), due: '2026-11-09' },
    { type: 'credit', amount: som(1_500_000) },
  ]

  it('pays what falls due first, and calls what is left past its day overdue', () => {
    expect(ageBalance(aziz, '2026-11-02')).toEqual({
      owed: som(1_500_000),
      credit: 0,
      overdue: som(500_000),
      overdueSince: '2026-10-31',
      nextDue: '2026-11-09',
      nextDueAmount: som(1_000_000),
    })
    // Before the first day nothing is late, and the day itself is still in time.
    expect(ageBalance(aziz, '2026-10-31')).toMatchObject({
      overdue: 0,
      nextDue: '2026-10-31',
      nextDueAmount: som(500_000),
    })
  })

  it('takes goods brought back off the receipt they were sold on, not off what is late', () => {
    const back = ageBalance([...aziz, { type: 'credit', amount: som(400_000), target: 'oct10' }], '2026-11-02')
    expect(back).toMatchObject({ owed: som(1_100_000), overdue: som(500_000), nextDueAmount: som(600_000) })
  })

  it('spends what is theirs first, and lends only the rest', () => {
    const events: AccountEvent[] = [
      { type: 'credit', amount: som(500_000) },
      { type: 'charge', id: 'sale', amount: som(800_000), due: '2026-10-01' },
    ]
    expect(ageBalance(events, '2026-10-20')).toMatchObject({ owed: som(300_000), credit: 0, overdue: som(300_000) })
    expect(ageBalance(events.slice(0, 1), '2026-10-20')).toMatchObject({ owed: 0, credit: som(500_000) })
  })

  it('never makes a supplier late: what they are owed is no debt of theirs', () => {
    const supplier: AccountEvent[] = [
      { type: 'credit', amount: som(30_000) },
      { type: 'charge', id: 'goods', amount: som(2_000), due: null },
      { type: 'debit', amount: som(1_000) },
    ]
    expect(ageBalance(supplier, '2027-01-01')).toMatchObject({ owed: 0, credit: som(27_000), overdue: 0 })
    // The receipt undone, they owe — but nothing of it ever had a day.
    const undone = ageBalance([...supplier, { type: 'debit', amount: som(30_000) }], '2027-01-01')
    expect(undone).toMatchObject({ owed: som(3_000), overdue: 0, nextDue: null })
  })

  it('keeps a debt given no day out of what is late, and pays it after the dated ones', () => {
    const events: AccountEvent[] = [
      { type: 'charge', id: 'open', amount: som(100), due: null },
      { type: 'charge', id: 'dated', amount: som(100), due: '2026-10-01' },
      { type: 'debit', amount: som(100) },
      { type: 'credit', amount: som(150) },
    ]
    // The dated one is paid first, then half of the one with no day; money paid out to them waits last.
    expect(ageBalance(events, '2026-12-01')).toMatchObject({ owed: som(150), overdue: 0 })
  })

  it('always agrees with the balance', () => {
    const histories: AccountEvent[][] = [
      aziz,
      [
        { type: 'credit', amount: som(70) },
        { type: 'charge', id: 'a', amount: som(50), due: '2026-01-01' },
        { type: 'credit', amount: som(10), target: 'a' },
        { type: 'debit', amount: som(200) },
        { type: 'credit', amount: som(500) },
      ],
    ]
    for (const events of histories) {
      const age = ageBalance(events, '2026-06-01')
      expect(age.owed - age.credit).toBe(balanceOf(events))
      expect(age.owed > 0 && age.credit > 0).toBe(false)
    }
  })
})

describe('what stands in the way of a sale on account', () => {
  const customer: AccountBarInput = {
    supplier: false,
    barred: false,
    hasPhone: true,
    credit: 'default',
    creditLimit: null,
    owedBase: 0,
    overdue: false,
  }

  it('is nothing at all when their haqi covers it, unless they supply goods', () => {
    expect(addedDebt(-som(500_000), som(800_000))).toBe(som(300_000))
    expect(addedDebt(-som(500_000), som(400_000))).toBe(0)
    expect(addedDebt(som(100_000), som(400_000))).toBe(som(400_000))
    expect(accountBar(customer, 0, 0)).toBeNull()
    expect(accountBar({ ...customer, supplier: true }, 0, som(10_000_000))).toBe('supplier')
  })

  it('needs a word for every debt where the business lends nothing without one', () => {
    expect(accountBar(customer, som(1), 0)).toBe('over_limit')
    expect(accountBar(customer, som(1_000_000), som(1_000_000))).toBeNull()
    expect(accountBar({ ...customer, owedBase: som(1) }, som(1_000_000), som(1_000_000))).toBe('over_limit')
  })

  it('reads the card first: no credit, their own ceiling, or none at all', () => {
    expect(accountBar({ ...customer, credit: 'none' }, som(1), som(10_000_000))).toBe('barred')
    expect(accountBar({ ...customer, barred: true }, som(1), som(10_000_000))).toBe('barred')
    expect(accountBar({ ...customer, credit: 'limit', creditLimit: som(5_000_000) }, som(5_000_000), 0)).toBeNull()
    expect(accountBar({ ...customer, credit: 'unlimited', owedBase: som(99_000_000) }, som(1), 0)).toBeNull()
  })

  it('stops a customer with no phone unless their card says otherwise, and anyone already late', () => {
    expect(accountBar({ ...customer, hasPhone: false }, som(1), som(10_000_000))).toBe('no_phone')
    expect(accountBar({ ...customer, hasPhone: false, credit: 'unlimited' }, som(1), 0)).toBeNull()
    expect(accountBar({ ...customer, overdue: true, credit: 'unlimited' }, som(1), 0)).toBe('overdue')
  })
})

describe('a sale on account', () => {
  const sale = {
    clientKey: KEY,
    registerId: ID,
    lines: [{ variantId: ID, qty: 1 }],
    total: som(100_000),
  }

  it('needs a customer, and may say when the debt falls due', () => {
    const lent = saleInputSchema.safeParse({ ...sale, onAccount: { amount: som(100_000) } })
    expect(lent.error?.issues[0]).toMatchObject({ path: ['customerId'] })
    const dated = saleInputSchema.parse({
      ...sale,
      customerId: ID,
      onAccount: { amount: som(100_000), dueDate: '2026-11-04' },
    })
    expect(dated.onAccount).toMatchObject([{ amount: som(100_000), dueDate: '2026-11-04' }])
    // In several currencies at once: a line to each.
    const both = saleInputSchema.parse({
      ...sale,
      customerId: ID,
      onAccount: [
        { currency: 'USD', amount: som(12_000) },
        { currency: 'UZS', amount: som(88_000) },
      ],
    })
    expect(both.onAccount.map((line) => line.currency)).toEqual(['USD', 'UZS'])
    expect(saleInputSchema.parse({ ...sale, total: 0 }).onAccount).toEqual([])
    expect(
      saleInputSchema.safeParse({ ...sale, customerId: ID, onAccount: { amount: 1, dueDate: '4.11' } }).success,
    ).toBe(false)
  })

  it('is paid in some way: money, or the account', () => {
    expect(saleInputSchema.safeParse(sale).error?.issues[0]).toMatchObject({ path: ['payments'] })
  })
})
