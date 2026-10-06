import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)
const usd = (amount: number) => Math.round(amount * 100)
const PIN = '4821'

interface Sale {
  id: string
  number: string
  total: number
  partnerId: string | null
  partnerName: string | null
  lines: { id: string }[]
  payments: { method: string; currency: string; amount: number; base: number; fx: number }[]
}

/**
 * A sale to a partner at the till: what of it is not paid there goes on the
 * partner's account, in the currency it is kept in — at the day's rate, or at
 * a sum agreed — after any discount. Goods brought back take off the share
 * the sale wrote there, not what today's rate would make of it.
 */
describe('Partner sales', () => {
  let harness: Harness
  let alpha: Agent
  let cashier: Agent
  let alphaUserId: string
  let today: string

  let registerId: string
  let shiftId: string
  let coat: string
  let elaris: string
  let somBuyer: string
  let customer: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  /** Coats at 1 265 000 so'm: 100 $ each at the day's 12 650. */
  const sell = (body: Record<string, unknown>, agent = alpha, coats = 1) =>
    agent.post('/api/sales').send({
      clientKey: randomUUID(),
      registerId,
      lines: [{ variantId: coat, qty: coats }],
      total: som(1_265_000) * coats,
      payments: [],
      ...body,
    })
  const owes = async (partnerId: string) =>
    (await alpha.get(`/api/partners/${partnerId}/statement`).expect(200)).body as {
      balance: number
      lines: { kind: string; source: string; number: string; change: number }[]
    }
  const ret = (sale: Sale, total: number) =>
    alpha.post('/api/returns').send({
      clientKey: randomUUID(),
      registerId,
      saleId: sale.id,
      lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
      refunds: [],
      total,
    })

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    alphaUserId = (await alpha.get('/api/auth/me').expect(200)).body.user.id
    today = (
      await sql<{ day: string }[]>(
        `SELECT (now() AT TIME ZONE timezone)::date::text AS day FROM organizations WHERE name = 'Alpha'`,
      )
    )[0].day
    await alpha.put('/api/money/rates').send({ date: today, uzsPerUsd: 12_650 }).expect(200)
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    const retail = ((await alpha.get('/api/price-types')).body as { id: string; kind: string }[]).find(
      (type) => type.kind === 'retail',
    )!.id
    coat = (
      await alpha
        .post('/api/products')
        .send({
          name: 'Palto',
          axisIds: [],
          variants: [{ valueIds: [] }],
          prices: [{ priceTypeId: retail, amount: som(1_265_000), currency: 'UZS' }],
        })
        .expect(201)
    ).body.variants[0].id
    const receipt = await alpha
      .post('/api/receipts')
      .send({
        locationId: shopId,
        docDate: '2026-10-01',
        uzsRate: 12_000,
        currency: 'UZS',
        usdRate: 12_000,
        lines: [{ variantId: coat, qty: 40, price: som(600_000) }],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${receipt.body.id}/post`).expect(201)
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    shiftId = (await alpha.post('/api/shifts').send({ registerId, cashUzs: 0 }).expect(201)).body.id

    elaris = (await alpha.post('/api/partners').send({ name: 'Elaris', isBuyer: true, currency: 'USD' }).expect(201))
      .body.id
    somBuyer = (
      await alpha.post('/api/partners').send({ name: 'Bozor Savdo', isBuyer: true, currency: 'UZS' }).expect(201)
    ).body.id
    customer = (await alpha.post('/api/customers').send({ name: 'Nodira', phone: '90 123 45 67' }).expect(201)).body.id

    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    await alpha
      .post('/api/users')
      .send({
        fullName: 'Dilnoza Kassir',
        login: 'kassir',
        password: PASSWORD,
        roleIds: [roles.find((role) => role.templateKey === 'cashier')!.id],
        allLocations: true,
        locationIds: [],
      })
      .expect(201)
    cashier = await harness.signIn('kassir')
    await alpha.post('/api/auth/pin').send({ password: PASSWORD, pin: PIN }).expect(204)
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe('finding a partner at the till', () => {
    it('shows who they are and what their account is kept in, never what they owe', async () => {
      const found = (await cashier.get('/api/pos/partners').query({ q: 'ela' }).expect(200)).body
      expect(found).toEqual([{ id: elaris, name: 'Elaris', phone: null, currency: 'USD' }])
      const context = (await cashier.get(`/api/pos/context/${registerId}`).expect(200)).body
      expect(context.maySellToPartners).toBe(false)
      expect(context.approvers).toEqual([expect.objectContaining({ id: alphaUserId, partners: true })])
    })
  })

  describe('a sale on the account', () => {
    it('is a partner’s or a customer’s, never both', async () => {
      const both = await sell({ customerId: customer, partnerId: elaris, onAccount: { amount: som(1_265_000) } })
      expect(both.status).toBe(400)
      expect(both.body.error.fields.partnerId).toBeDefined()
      const nobody = await sell({ onAccount: { amount: som(1_265_000) } })
      expect(nobody.body.error.fields.partnerId).toBeDefined()
    })

    it('takes a manager’s word from a cashier who may not sell to partners alone', async () => {
      const alone = await sell({ partnerId: elaris, onAccount: { amount: som(1_265_000) } }, cashier)
      expect(alone.status).toBe(400)
      expect(alone.body.error.code).toBe('PARTNER_SALE_NEEDS_WORD')
      const before = (await owes(elaris)).balance
      const sale = (
        await sell(
          {
            partnerId: elaris,
            onAccount: { amount: som(1_265_000) },
            approval: { userId: alphaUserId, pin: PIN },
          },
          cashier,
        ).expect(201)
      ).body as Sale
      expect(sale).toMatchObject({ partnerId: elaris, partnerName: 'Elaris' })
      // A coat of 1 265 000 so'm is 100 $ on a dollar account.
      expect(sale.payments).toEqual([
        expect.objectContaining({ method: 'partner', currency: 'USD', amount: usd(100), base: som(1_265_000), fx: 0 }),
      ])
      expect((await owes(elaris)).balance).toBe(before + usd(100))
    })

    it('goes at the day’s rate where part is paid there and then, the rounding to the exchange difference', async () => {
      const before = (await owes(elaris)).balance
      const sale = (
        await sell({
          partnerId: elaris,
          payments: [{ method: 'cash', currency: 'UZS', amount: som(265_000) }],
          onAccount: { amount: som(1_000_000) },
        }).expect(201)
      ).body as Sale
      // 1 000 000 so'm are 79,05 $, worth 999 982,50 so'm: 17,50 short of a cent, nobody's agreement.
      expect(sale.payments.find((payment) => payment.method === 'partner')).toMatchObject({
        amount: usd(79.05),
        base: som(1_000_000),
        fx: -som(17.5),
      })
      expect((await owes(elaris)).balance).toBe(before + usd(79.05))
    })

    it('stands at an agreed sum, within the limit or by someone who may give more', async () => {
      // "Put it down as 101 dollars": 0,99% from the day's rate, and the business gains 12 650 so'm.
      const sale = (
        await sell({ partnerId: elaris, onAccount: { amount: som(1_265_000), settled: usd(101) } }).expect(201)
      ).body as Sale
      expect(sale.payments[0]).toMatchObject({ amount: usd(101), fx: som(12_650) })
      // 110 $ is 8,7% off: a cashier needs a word for it as for a discount — the word for the partner is not enough.
      const far = await sell(
        {
          partnerId: elaris,
          onAccount: { amount: som(1_265_000), settled: usd(110) },
          approval: { userId: alphaUserId, pin: PIN },
        },
        cashier,
      )
      expect(far.status).toBe(201)
    })

    it('puts down what is left after the discount; the discount stays on the receipt', async () => {
      const before = (await owes(somBuyer)).balance
      const sale = (
        await sell({
          partnerId: somBuyer,
          discount: som(65_000),
          total: som(1_200_000),
          onAccount: { amount: som(1_200_000) },
        }).expect(201)
      ).body as Sale
      expect(sale.total).toBe(som(1_200_000))
      expect((await owes(somBuyer)).balance).toBe(before + som(1_200_000))
      // More than the receipt is not put on anyone's account.
      const over = await sell({ partnerId: somBuyer, onAccount: { amount: som(1_300_000) } })
      expect(over.body.error.fields.onAccount).toBeDefined()
    })
  })

  describe('goods brought back', () => {
    it('take off the share the sale wrote, at the sale’s rate, not today’s', async () => {
      const before = (await owes(elaris)).balance
      const sale = (await sell({ partnerId: elaris, onAccount: { amount: som(2_530_000) } }, alpha, 2).expect(201))
        .body as Sale
      expect((await owes(elaris)).balance).toBe(before + usd(200))

      const found = (await alpha.get('/api/returns/lookup').query({ code: sale.number }).expect(200)).body
      expect(found.caps).toMatchObject({ cash: 0, debt: 0, partner: som(2_530_000) })
      await ret(sale, som(1_265_000)).expect(201)
      expect((await owes(elaris)).balance).toBe(before + usd(100))

      // The dollar is dearer today: the second coat still takes off what the sale wrote.
      await alpha.put('/api/money/rates').send({ date: today, uzsPerUsd: 13_000 }).expect(200)
      await ret(sale, som(1_265_000)).expect(201)
      expect((await owes(elaris)).balance).toBe(before)
      await alpha.put('/api/money/rates').send({ date: today, uzsPerUsd: 12_650 }).expect(200)

      const statement = await owes(elaris)
      expect(statement.lines.slice(-3).map((line) => [line.kind, line.change])).toEqual([
        ['sale', usd(200)],
        ['sale_return', -usd(100)],
        ['sale_return', -usd(100)],
      ])
      expect(statement.lines.at(-3)?.number).toBe(sale.number)
    })

    it('give back the exchange difference with the last of them', async () => {
      // 101 $ agreed for a coat: the gain of 12 650 so'm goes back when the coat does.
      const sale = (
        await sell({ partnerId: elaris, onAccount: { amount: som(1_265_000), settled: usd(101) } }).expect(201)
      ).body as Sale
      const [{ fx: before }] = await sql<{ fx: string }[]>(
        `SELECT a.balance AS fx FROM accounts a JOIN organizations o ON o.id = a.org_id
         WHERE o.name = 'Alpha' AND a.system_key = 'fx'`,
      )
      await ret(sale, som(1_265_000)).expect(201)
      const [{ fx: after }] = await sql<{ fx: string }[]>(
        `SELECT a.balance AS fx FROM accounts a JOIN organizations o ON o.id = a.org_id
         WHERE o.name = 'Alpha' AND a.system_key = 'fx'`,
      )
      expect(Number(after) - Number(before)).toBe(som(12_650))
    })
  })

  describe('a void', () => {
    it('takes it off the account again', async () => {
      const before = (await owes(somBuyer)).balance
      const sale = (await sell({ partnerId: somBuyer, onAccount: { amount: som(1_265_000) } }).expect(201)).body as Sale
      await alpha.post(`/api/sales/${sale.id}/void`).send({ reason: 'Xato' }).expect(200)
      const statement = await owes(somBuyer)
      expect(statement.balance).toBe(before)
      expect(statement.lines.at(-1)).toMatchObject({ kind: 'cancel', change: -som(1_265_000) })
    })
  })

  describe('the shift and the books', () => {
    it('show what went on accounts as a line of its own, apart from the cash counted', async () => {
      const shift = (await alpha.get(`/api/shifts/${shiftId}`).expect(200)).body
      const partner = shift.totals.payments.filter((payment: { method: string }) => payment.method === 'partner')
      expect(partner.map((payment: { currency: string }) => payment.currency).sort()).toEqual(['USD', 'UZS'])
      expect(shift.totals.payments.find((payment: { method: string }) => payment.method === 'cash')).toMatchObject({
        amount: som(265_000),
      })
    })

    it('leave every entry in balance', async () => {
      const [{ off }] = await sql<{ off: string }[]>(
        `SELECT count(*) AS off FROM (SELECT entry_id FROM ledger_lines GROUP BY entry_id HAVING sum(base) <> 0) x`,
      )
      expect(Number(off)).toBe(0)
    })
  })
})
