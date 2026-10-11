import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)

interface Sale {
  id: string
  number: string
  customerId: string | null
  customerName: string | null
  lines: { id: string }[]
}

/**
 * A receipt rung up to the wrong customer is given to the right one
 * (KEYINGI-REJA, 16.5, case 33). What it put on the first one's account —
 * a debt, or change kept there — goes to the second one's, with the day the
 * debt falls due; a receipt goods have come back on stays whose it is.
 */
describe('A receipt given to another customer', () => {
  let harness: Harness
  let alpha: Agent
  let cashier: Agent

  let registerId: string
  let scarf: string
  let nodira: string
  let bobur: string
  let textile: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })
  /** A scarf at 75 000 so'm, paid in cash exactly unless said otherwise. */
  const sell = async (body: Record<string, unknown> = {}): Promise<Sale> =>
    (
      await alpha
        .post('/api/sales')
        .send({
          clientKey: randomUUID(),
          registerId,
          lines: [{ variantId: scarf, qty: 1 }],
          total: som(75_000),
          payments: [{ method: 'cash', amount: som(75_000) }],
          ...body,
        })
        .expect(201)
    ).body
  const give = (sale: Sale, customerId: string | null, agent = alpha) =>
    agent.post(`/api/sales/${sale.id}/customer`).send({ customerId })
  const account = async (customerId: string) =>
    (
      (await alpha.get(`/api/customers/${customerId}`).expect(200)).body.balances as {
        currency: string
        balance: number
        owed: number
        nextDue: string | null
      }[]
    ).find((item) => item.currency === 'UZS') ?? { currency: 'UZS', balance: 0, owed: 0, nextDue: null }
  const statement = async (customerId: string) =>
    (await alpha.get(`/api/customers/${customerId}/statement`).expect(200)).body.lines as {
      kind: string
      number: string
      change: number
      note: string | null
      due: { dueDate: string | null } | null
    }[]

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    const retail = ((await alpha.get('/api/price-types')).body as { id: string; kind: string }[]).find(
      (type) => type.kind === 'retail',
    )!.id
    scarf = (
      await alpha
        .post('/api/products')
        .send({
          name: 'Sharf',
          axisIds: [],
          variants: [{ valueIds: [] }],
          prices: [{ priceTypeId: retail, amount: som(75_000), currency: 'UZS' }],
        })
        .expect(201)
    ).body.variants[0].id
    const receipt = await alpha
      .post('/api/receipts')
      .send({
        locationId: shopId,
        docDate: '2026-10-01',
        currency: 'UZS',
        lines: [{ variantId: scarf, qty: 40, price: som(30_000) }],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${receipt.body.id}/post`).expect(201)
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    await alpha.post('/api/shifts').send({ registerId, cash: {} }).expect(201)
    nodira = (await alpha.post('/api/customers').send({ name: 'Nodira', phone: '90 123 45 67' }).expect(201)).body.id
    bobur = (await alpha.post('/api/customers').send({ name: 'Bobur', phone: '90 765 43 21' }).expect(201)).body.id
    textile = (await alpha.post('/api/customers').send({ name: 'Textile', isSupplier: true }).expect(201)).body.id

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

  it('takes a name, or gives one up, where nothing stands on an account', async () => {
    const sale = await sell()
    const named = (await give(sale, nodira).expect(200)).body as Sale
    expect(named).toMatchObject({ customerId: nodira, customerName: 'Nodira' })
    expect((await account(nodira)).balance).toBe(0)
    const listed = (await alpha.get('/api/sales').query({ q: 'nodira' }).expect(200)).body.items as Sale[]
    expect(listed.map((item) => item.number)).toContain(sale.number)
    const nobody = (await give(sale, null).expect(200)).body as Sale
    expect(nobody).toMatchObject({ customerId: null, customerName: null })
  })

  it('moves the debt it made, and the day it falls due, to the right customer', async () => {
    const sale = await sell({
      customerId: nodira,
      payments: [],
      onAccount: { amount: som(75_000), dueDate: '2026-12-01' },
    })
    expect(await account(nodira)).toMatchObject({ balance: som(75_000), owed: som(75_000), nextDue: '2026-12-01' })

    const moved = (await give(sale, bobur).expect(200)).body as Sale
    expect(moved).toMatchObject({ customerId: bobur, customerName: 'Bobur' })
    expect(await account(nodira)).toMatchObject({ balance: 0, owed: 0, nextDue: null })
    expect(await account(bobur)).toMatchObject({ balance: som(75_000), owed: som(75_000), nextDue: '2026-12-01' })

    // The first one's account says what happened; the day is no longer theirs to move.
    const first = (await statement(nodira)).filter((line) => line.number === sale.number)
    expect(first.map((line) => [line.change, line.note, line.due])).toEqual([
      [som(75_000), null, null],
      [-som(75_000), 'Chekning mijozi almashtirildi', null],
    ])
    const second = (await statement(bobur)).filter((line) => line.number === sale.number)
    expect(second).toEqual([
      expect.objectContaining({ change: som(75_000), due: expect.objectContaining({ dueDate: '2026-12-01' }) }),
    ])

    // Goods brought back afterwards come off the account the debt now stands on.
    await alpha
      .post('/api/returns')
      .send({
        clientKey: randomUUID(),
        registerId,
        saleId: sale.id,
        lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
        refunds: [],
        total: som(75_000),
      })
      .expect(201)
    expect((await account(bobur)).balance).toBe(0)
    expect((await account(nodira)).balance).toBe(0)
    // And once goods have come back, the receipt stays whose it is.
    const late = await give(sale, nodira)
    expect(late.status).toBe(409)
    expect(late.body.error.code).toBe('SALE_RETURNED')
  })

  it('moves change that was kept on the account as well', async () => {
    const sale = await sell({
      customerId: nodira,
      payments: [{ method: 'cash', amount: som(100_000) }],
      change: [{ way: 'account', amount: som(15_000) }],
    })
    expect((await account(nodira)).balance).toBe(-som(15_000))
    await give(sale, bobur).expect(200)
    expect((await account(nodira)).balance).toBe(0)
    expect((await account(bobur)).balance).toBe(-som(15_000))
    // Back again leaves both as they were.
    await give(sale, nodira).expect(200)
    expect([(await account(nodira)).balance, (await account(bobur)).balance]).toEqual([-som(15_000), 0])
    await give(sale, bobur).expect(200)
  })

  it('is undone with the receipt when the receipt is undone', async () => {
    const before = [(await account(nodira)).balance, (await account(bobur)).balance]
    const sale = await sell({ customerId: nodira, payments: [], onAccount: { amount: som(75_000) } })
    await give(sale, bobur).expect(200)
    expect((await account(bobur)).balance - before[1]).toBe(som(75_000))
    await alpha.post(`/api/sales/${sale.id}/void`).send({ reason: 'Xato urildi' }).expect(200)
    expect([(await account(nodira)).balance, (await account(bobur)).balance]).toEqual(before)
  })

  it('keeps what stands on an account with somebody, not a supplier, and is for those who put accounts right', async () => {
    const sale = await sell({ customerId: nodira, payments: [], onAccount: { amount: som(75_000) } })
    const nobody = await give(sale, null)
    expect(nobody.status).toBe(400)
    expect(nobody.body.error.fields.customerId).toContain('mijozsiz qoldirib bo‘lmaydi')
    const supplier = await give(sale, textile)
    expect(supplier.status).toBe(400)
    expect(supplier.body.error.fields.customerId).toContain('yetkazib beruvchi')
    expect((await give(sale, randomUUID())).body.error.fields.customerId).toBe('Mijoz topilmadi')
    await give(sale, bobur, cashier).expect(403)
    await alpha.post(`/api/sales/${sale.id}/void`).send({ reason: 'Tozalash' }).expect(200)
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
