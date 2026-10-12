import { randomUUID } from 'node:crypto'

import { startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)

interface Statement {
  from: string | null
  to: string | null
  opening: number
  closing: number
  balance: number
  lines: { kind: string; on: string; change: number; balance: number; qty: number | null }[]
}

/**
 * A customer's account for the days asked for — the reconciliation both sides
 * sign (KEYINGI-REJA, 16.5, case 46): what stood before those days, every
 * document in them with how many goods it moved, and what stands after.
 */
describe('A statement for a period', () => {
  let harness: Harness
  let alpha: Agent

  let registerId: string
  let scarf: string
  let textile: string
  let today: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })
  const statement = async (customerId: string, query: Record<string, string> = {}) =>
    (await alpha.get(`/api/customers/${customerId}/statement`).query(query).expect(200)).body as Statement
  const said = (lines: Statement['lines']) =>
    lines.map((line) => [line.kind, line.on, line.change, line.balance, line.qty])

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    ;[{ today }] = await sql<{ today: string }[]>(
      `SELECT (now() AT TIME ZONE timezone)::date::text AS today FROM organizations WHERE name = 'Alpha'`,
    )
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
    textile = (await alpha.post('/api/customers').send({ name: 'Textile', isSupplier: true }).expect(201)).body.id
    // Ten scarves received a month ago, five today: 300 000 and 150 000 owed to the supplier.
    for (const [docDate, qty] of [
      ['2026-09-10', 10],
      [today, 5],
    ] as const) {
      const receipt = await alpha
        .post('/api/receipts')
        .send({
          locationId: shopId,
          supplierId: textile,
          docDate,
          currency: 'UZS',
          lines: [{ variantId: scarf, qty, price: som(30_000) }],
        })
        .expect(201)
      await alpha.post(`/api/receipts/${receipt.body.id}/post`).expect(201)
    }
    await alpha
      .post('/api/customer-payments/opening')
      .send({ clientKey: randomUUID(), customerId: textile, owes: 'us', amount: som(50_000) })
      .expect(201)
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    await alpha.post('/api/shifts').send({ registerId, cash: {} }).expect(201)
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('is the whole account when no days are asked for', async () => {
    const whole = await statement(textile)
    expect(whole).toMatchObject({ from: null, to: null, opening: 0, closing: -som(500_000), balance: -som(500_000) })
    expect(said(whole.lines)).toEqual([
      ['receipt', '2026-09-10', -som(300_000), -som(300_000), 10],
      ['receipt', today, -som(150_000), -som(450_000), 5],
      ['opening', today, -som(50_000), -som(500_000), null],
    ])
  })

  it('opens with what stood before the days asked for, and closes with what stood after', async () => {
    const since = await statement(textile, { from: today })
    expect(since).toMatchObject({ from: today, to: null, opening: -som(300_000), closing: -som(500_000) })
    expect(said(since.lines)).toEqual([
      ['receipt', today, -som(150_000), -som(450_000), 5],
      ['opening', today, -som(50_000), -som(500_000), null],
    ])

    const september = await statement(textile, { from: '2026-09-01', to: '2026-09-30' })
    expect(september).toMatchObject({ opening: 0, closing: -som(300_000), balance: -som(500_000) })
    expect(said(september.lines)).toEqual([['receipt', '2026-09-10', -som(300_000), -som(300_000), 10]])

    // Days with nothing in them say what stood through them.
    const idle = await statement(textile, { from: '2026-09-11', to: '2026-09-30' })
    expect(idle).toMatchObject({ opening: -som(300_000), closing: -som(300_000), lines: [] })
    const early = await statement(textile, { to: '2026-09-01' })
    expect(early).toMatchObject({ opening: 0, closing: 0, lines: [] })
  })

  it('says how many goods a sale took, and how many came back', async () => {
    const buyer = (await alpha.post('/api/customers').send({ name: 'Nodira', phone: '90 123 45 67' }).expect(201)).body
      .id
    const sale = (
      await alpha
        .post('/api/sales')
        .send({
          clientKey: randomUUID(),
          registerId,
          customerId: buyer,
          lines: [{ variantId: scarf, qty: 2 }],
          total: som(150_000),
          payments: [],
          onAccount: { amount: som(150_000) },
        })
        .expect(201)
    ).body
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
    const account = await statement(buyer, { from: today, to: today })
    expect(said(account.lines)).toEqual([
      ['sale', today, som(150_000), som(150_000), 2],
      ['sale_return', today, -som(75_000), som(75_000), 1],
    ])
    expect(account).toMatchObject({ opening: 0, closing: som(75_000), balance: som(75_000) })
  })

  it('takes days as days', async () => {
    await alpha.get(`/api/customers/${textile}/statement`).query({ from: 'kecha' }).expect(400)
  })
})
