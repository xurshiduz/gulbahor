import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)
const usd = (amount: number) => Math.round(amount * 100)

interface Payment {
  id: string
  number: string
  kind: string
  status: string
  customerName: string
  currency: string
  change: number
  toCustomerName: string | null
  toCurrency: string | null
  toAmount: number | null
  fx: number
}

/**
 * What stands to one customer's good carried to another's account
 * (KEYINGI-REJA, 17.5): one pays for another, a buyer's debt is set against
 * what the business owes a supplier, a payment written to the wrong person
 * is put right. No money moves; both accounts show the one document, and it
 * can be taken back.
 */
describe('Transfers between customers', () => {
  let harness: Harness
  let alpha: Agent
  let cashier: Agent

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })
  const system = async (key: string) =>
    Number(
      (
        await sql<{ balance: string }[]>(
          `SELECT a.balance FROM accounts a JOIN organizations o ON o.id = a.org_id
           WHERE o.name = 'Alpha' AND a.system_key = $1`,
          [key],
        )
      )[0]?.balance ?? 0,
    )
  const customer = async (name: string, more: Record<string, unknown> = {}) =>
    (
      await alpha
        .post('/api/customers')
        .send({ name, ...more })
        .expect(201)
    ).body.id as string
  const balance = async (customerId: string, currency = 'UZS') =>
    (
      (await alpha.get(`/api/customers/${customerId}`).expect(200)).body.balances as {
        currency: string
        balance: number
      }[]
    ).find((account) => account.currency === currency)?.balance ?? 0
  const opening = (customerId: string, owes: 'customer' | 'us', amount: number, currency = 'UZS') =>
    alpha
      .post('/api/customer-payments/opening')
      .send({ clientKey: randomUUID(), customerId, currency, owes, amount })
      .expect(201)
  const transfer = (body: Record<string, unknown>, agent = alpha) =>
    agent.post('/api/customer-payments/transfer').send({ clientKey: randomUUID(), ...body })
  const statement = async (customerId: string, currency?: string) =>
    (
      await alpha
        .get(`/api/customers/${customerId}/statement`)
        .query(currency ? { currency } : {})
        .expect(200)
    ).body.lines as { kind: string; number: string; change: number; note: string | null }[]

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    await alpha.put('/api/currencies/USD/rate').send({ value: 12_650 }).expect(200)
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
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('lets one pay for another: what was theirs lessens, what the other owed lessens', async () => {
    const [aziz, bobur] = [await customer('Aziz'), await customer('Bobur')]
    // Aziz has 500 000 with the shop; Bobur owes it 300 000.
    await opening(aziz, 'us', som(500_000))
    await opening(bobur, 'customer', som(300_000))
    const made = (
      await transfer({
        customerId: aziz,
        toCustomerId: bobur,
        amount: som(300_000),
        settled: som(300_000),
        note: 'Akasi to‘ladi',
      }).expect(201)
    ).body as Payment
    expect(made).toMatchObject({
      kind: 'transfer',
      status: 'posted',
      customerName: 'Aziz',
      currency: 'UZS',
      change: som(300_000),
      toCustomerName: 'Bobur',
      toCurrency: 'UZS',
      toAmount: som(300_000),
      fx: 0,
    })
    expect(made.number).toMatch(/^TL-\d{6}$/)
    expect(await balance(aziz)).toBe(-som(200_000))
    expect(await balance(bobur)).toBe(0)

    // Both accounts show the one document, each saying who the other was.
    expect((await statement(aziz)).at(-1)).toMatchObject({
      kind: 'transfer',
      number: made.number,
      change: som(300_000),
      note: '→ Bobur · Akasi to‘ladi',
    })
    expect((await statement(bobur)).at(-1)).toMatchObject({
      kind: 'transfer',
      number: made.number,
      change: -som(300_000),
      note: '← Aziz · Akasi to‘ladi',
    })
    // And either customer's payments list it.
    for (const id of [aziz, bobur]) {
      const listed = (await alpha.get('/api/customer-payments').query({ customerId: id, kind: 'transfer' }).expect(200))
        .body.items as Payment[]
      expect(listed.map((item) => item.number)).toEqual([made.number])
    }
  })

  it('sets a buyer’s debt against what the business owes a supplier', async () => {
    const supplier = await customer('Textile', { isSupplier: true, currency: 'USD' })
    const buyer = await customer('Do‘kon Savdo')
    // The business owes Textile 1 000 $; the buyer owes the business 2 530 000 so'm — 200 $ at the day's rate.
    await opening(supplier, 'us', usd(1000), 'USD')
    await opening(buyer, 'customer', som(2_530_000))
    const fx = await system('fx')
    const made = (
      await transfer({ customerId: supplier, toCustomerId: buyer, amount: usd(200), settled: som(2_530_000) }).expect(
        201,
      )
    ).body as Payment
    expect(made).toMatchObject({
      currency: 'USD',
      change: usd(200),
      toCurrency: 'UZS',
      toAmount: som(2_530_000),
      fx: 0,
    })
    expect(await balance(supplier, 'USD')).toBe(-usd(800))
    expect(await balance(buyer)).toBe(0)
    expect(await system('fx')).toBe(fx)
  })

  it('takes an agreed sum where the two keep different currencies, and the rate keeps the difference', async () => {
    const [giver, taker] = [await customer('Elaris', { currency: 'USD' }), await customer('Nodira')]
    await opening(giver, 'us', usd(500), 'USD')
    await opening(taker, 'customer', som(5_000_000))
    const fx = await system('fx')
    // 100 $ set against 1 250 000 of the other's debt, though the rate makes them 1 265 000.
    const made = (
      await transfer({
        customerId: giver,
        toCustomerId: taker,
        amount: usd(100),
        received: som(1_250_000),
        settled: som(1_250_000),
      }).expect(201)
    ).body as Payment
    expect(made).toMatchObject({ toAmount: som(1_250_000), fx: som(15_000) })
    expect(await balance(giver, 'USD')).toBe(-usd(400))
    expect(await balance(taker)).toBe(som(3_750_000))
    expect((await system('fx')) - fx).toBe(-som(15_000))
    // What the screen showed is what is written: a sum the rate no longer makes is refused.
    const stale = await transfer({ customerId: giver, toCustomerId: taker, amount: usd(100), settled: som(1_000_000) })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('RATE_CHANGED')
  })

  it('is taken back whole, and both accounts stand as they stood', async () => {
    const [wrong, right] = [await customer('Adashgan'), await customer('To‘g‘ri')]
    await opening(wrong, 'us', som(100_000))
    const made = (
      await transfer({ customerId: wrong, toCustomerId: right, amount: som(100_000), settled: som(100_000) }).expect(
        201,
      )
    ).body as Payment
    expect([await balance(wrong), await balance(right)]).toEqual([0, -som(100_000)])
    const back = (
      await alpha.post(`/api/customer-payments/${made.id}/cancel`).send({ reason: 'Xato yozilgan' }).expect(200)
    ).body as Payment
    expect(back.status).toBe('cancelled')
    expect([await balance(wrong), await balance(right)]).toEqual([-som(100_000), 0])
  })

  it('is between two people, and for those who may put accounts right', async () => {
    const [one, other] = [await customer('Bir'), await customer('Ikki')]
    const same = await transfer({ customerId: one, toCustomerId: one, amount: som(1000), settled: som(1000) })
    expect(same.status).toBe(400)
    expect(same.body.error.fields.toCustomerId).toBeDefined()
    const nobody = await transfer({
      customerId: one,
      toCustomerId: randomUUID(),
      amount: som(1000),
      settled: som(1000),
    })
    expect(nobody.body.error.fields.toCustomerId).toBe('Mijoz topilmadi')
    await transfer({ customerId: one, toCustomerId: other, amount: som(1000), settled: som(1000) }, cashier).expect(403)
  })

  it('leaves every entry of the ledger in balance', async () => {
    const [unbalanced] = await sql<{ entries: string }[]>(
      `SELECT count(*) AS entries FROM (
         SELECT l.entry_id FROM ledger_lines l GROUP BY l.entry_id HAVING sum(l.base) <> 0
       ) x`,
    )
    expect(Number(unbalanced.entries)).toBe(0)
  })
})
