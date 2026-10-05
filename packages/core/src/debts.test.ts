import { describe, expect, it } from 'vitest'

import { debtBar, debtPaymentInputSchema, debtState, saleDebtSchema, spreadOverDebts } from './debts'
import { saleInputSchema } from './pos'

const som = (amount: number) => amount * 100
const ID = '11111111-1111-4111-8111-111111111111'
const KEY = '22222222-2222-4222-8222-222222222222'

describe('how a debt stands', () => {
  it('is open until its day, overdue after it, and closed once nothing is owed', () => {
    const debt = { left: som(300_000), dueDate: '2026-11-04', cancelled: false }
    expect(debtState(debt, '2026-10-05')).toBe('open')
    // The day itself is still in time.
    expect(debtState(debt, '2026-11-04')).toBe('open')
    expect(debtState(debt, '2026-11-05')).toBe('overdue')
    expect(debtState({ ...debt, left: 0 }, '2026-12-01')).toBe('closed')
    expect(debtState({ ...debt, cancelled: true }, '2026-12-01')).toBe('cancelled')
  })
})

describe('money brought against debts', () => {
  const debts = [
    { id: 'old', left: som(200_000) },
    { id: 'paid', left: 0 },
    { id: 'new', left: som(500_000) },
  ]

  it('pays them in the order given, each as far as it is owed', () => {
    expect(spreadOverDebts(debts, som(300_000))).toEqual({
      parts: [
        { debtId: 'old', amount: som(200_000) },
        { debtId: 'new', amount: som(100_000) },
      ],
      rest: 0,
    })
    expect(spreadOverDebts(debts, som(150_000))).toEqual({ parts: [{ debtId: 'old', amount: som(150_000) }], rest: 0 })
  })

  it('leaves over what no debt takes', () => {
    expect(spreadOverDebts(debts, som(800_000)).rest).toBe(som(100_000))
    expect(spreadOverDebts([], som(1)).rest).toBe(som(1))
  })
})

describe('what stands in the way of lending more', () => {
  const customer = { noDebt: false, owed: som(400_000), overdue: 0 }

  it('is nothing for a customer in good standing, within what the shop lends', () => {
    expect(debtBar(customer, som(500_000), 0)).toBeNull()
    expect(debtBar(customer, som(600_000), som(1_000_000))).toBeNull()
  })

  it("is the group's bar first, then lateness, then the limit", () => {
    expect(debtBar({ ...customer, noDebt: true, overdue: som(1) }, som(1), som(1))).toBe('barred')
    expect(debtBar({ ...customer, overdue: som(100_000) }, som(1), 0)).toBe('overdue')
    expect(debtBar(customer, som(600_001), som(1_000_000))).toBe('over_limit')
  })
})

describe('the contracts', () => {
  it('take a debt as a sum and a day', () => {
    expect(saleDebtSchema.parse({ amount: som(100_000), dueDate: '2026-11-04' })).toEqual({
      amount: som(100_000),
      dueDate: '2026-11-04',
    })
    expect(saleDebtSchema.safeParse({ amount: 0, dueDate: '2026-11-04' }).success).toBe(false)
    expect(saleDebtSchema.safeParse({ amount: som(1), dueDate: '04.11.2026' }).success).toBe(false)
  })

  it('let a sale be made wholly on credit, to a customer who is on the books', () => {
    const sale = {
      clientKey: KEY,
      registerId: ID,
      customerId: ID,
      lines: [{ variantId: ID, qty: 1 }],
      total: som(500_000),
      debt: { amount: som(500_000), dueDate: '2026-11-04' },
    }
    expect(saleInputSchema.parse(sale)).toMatchObject({ payments: [], debt: sale.debt })
    // Nobody to owe it: no debt.
    expect(saleInputSchema.safeParse({ ...sale, customerId: null }).success).toBe(false)
    // Neither money nor a debt: not a sale.
    expect(saleInputSchema.safeParse({ ...sale, debt: null }).success).toBe(false)
  })

  it('take a payment in one or more places', () => {
    const payment = {
      clientKey: KEY,
      customerId: ID,
      lines: [{ accountId: ID, amount: som(100_000) }],
      total: som(100_000),
    }
    expect(debtPaymentInputSchema.parse(payment)).toMatchObject({ note: null })
    expect(debtPaymentInputSchema.safeParse({ ...payment, lines: [] }).success).toBe(false)
  })
})
