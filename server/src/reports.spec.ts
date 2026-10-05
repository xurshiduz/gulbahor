import { randomUUID } from 'node:crypto'

import type { SalesReportDto } from '@gulbahor/core'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => amount * 100

/**
 * The sales report: what the tills sold, read back by day, shop, tender and
 * goods. Two shops sell, one takes a coat back, one receipt is undone and
 * one belongs to yesterday; every number below is counted from those.
 */
describe('Sales report', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let manager: Agent
  let cashier: Agent

  let today: string
  let yesterday: string
  let hour: string
  const shops = { one: '', two: '' }
  const tills = { one: '', two: '' }
  let coat: string
  let scarf: string
  let cardId: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })
  const sell = (registerId: string, body: Record<string, unknown>) =>
    alpha.post('/api/sales').send({ clientKey: randomUUID(), registerId, ...body })
  const cash = (amount: number) => ({ method: 'cash', currency: 'UZS', amount })
  const report = async (query: Record<string, unknown>, agent = alpha) =>
    (await agent.get('/api/reports/sales').query(query).expect(200)).body as SalesReportDto

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    const days = await sql<{ today: string; yesterday: string; hour: string }[]>(
      `SELECT (now() AT TIME ZONE timezone)::date::text AS today,
              ((now() AT TIME ZONE timezone)::date - 1)::text AS yesterday,
              to_char(now() AT TIME ZONE timezone, 'HH24') AS hour
       FROM organizations WHERE name = 'Alpha'`,
    )
    ;({ today, yesterday, hour } = days[0])

    shops.one = (await alpha.get('/api/locations')).body.items[0].id
    shops.two = (await alpha.post('/api/locations').send({ name: 'Ikkinchi', kind: 'store' }).expect(201)).body.id

    const outerwear = (await alpha.post('/api/categories').send({ name: 'Ustki kiyim', parentId: null }).expect(201))
      .body.id
    const retail = ((await alpha.get('/api/price-types')).body as { id: string; kind: string }[]).find(
      (type) => type.kind === 'retail',
    )!.id
    const model = async (name: string, price: number, categoryId: string | null) =>
      (
        await alpha
          .post('/api/products')
          .send({
            name,
            categoryId,
            axisIds: [],
            variants: [{ valueIds: [] }],
            prices: [{ priceTypeId: retail, amount: price, currency: 'UZS' }],
          })
          .expect(201)
      ).body.variants[0].id as string
    coat = await model('Palto', som(500_000), outerwear)
    scarf = await model('Sharf', som(90_000), null)

    const receive = async (locationId: string, lines: { variantId: string; qty: number; price: number }[]) => {
      const receipt = await alpha
        .post('/api/receipts')
        .send({ locationId, docDate: yesterday, uzsRate: 12_000, currency: 'UZS', usdRate: 12_000, lines })
        .expect(201)
      await alpha.post(`/api/receipts/${receipt.body.id}/post`).expect(201)
    }
    await receive(shops.one, [
      { variantId: coat, qty: 30, price: som(200_000) },
      { variantId: scarf, qty: 30, price: som(30_000) },
    ])
    await receive(shops.two, [{ variantId: coat, qty: 10, price: som(200_000) }])

    for (const key of ['one', 'two'] as const) {
      tills[key] = (
        await alpha
          .post('/api/money/registers')
          .send({ name: `Kassa ${key}`, locationId: shops[key] })
          .expect(201)
      ).body.id
      await alpha.post('/api/shifts').send({ registerId: tills[key], cashUzs: 0 }).expect(201)
    }
    cardId = (await alpha.post('/api/money/accounts').send({ kind: 'card', name: 'Humo', last4: '3073' }).expect(201))
      .body.id

    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    const hire = async (fullName: string, login: string, templateKey: string, locationIds: string[] | null) => {
      await alpha
        .post('/api/users')
        .send({
          fullName,
          login,
          password: PASSWORD,
          roleIds: [roles.find((role) => role.templateKey === templateKey)!.id],
          allLocations: !locationIds,
          locationIds: locationIds ?? [],
        })
        .expect(201)
      return harness.signIn(login)
    }
    // A shop's manager works at the second shop alone; a cashier works everywhere and reads no reports.
    manager = await hire('Anvar Menejer', 'menejer', 'store_manager', [shops.two])
    cashier = await hire('Dilnoza Kassir', 'kassir', 'cashier', null)

    // ── What was sold ──
    // Two coats for cash.
    const two = (
      await sell(tills.one, {
        lines: [{ variantId: coat, qty: 2 }],
        total: som(1_000_000),
        payments: [cash(som(1_000_000))],
      }).expect(201)
    ).body
    // A scarf with 10 000 off, paid with a 100 000 note: 20 000 goes back as change.
    await sell(tills.one, {
      lines: [{ variantId: scarf, qty: 1, discount: som(10_000) }],
      total: som(80_000),
      payments: [cash(som(100_000))],
    }).expect(201)
    // A coat at the other shop, by card.
    await sell(tills.two, {
      lines: [{ variantId: coat, qty: 1 }],
      total: som(500_000),
      payments: [{ method: 'card', accountId: cardId, amount: som(500_000) }],
    }).expect(201)
    // A receipt made by mistake and undone: it is no part of any day.
    const mistaken = (
      await sell(tills.one, {
        lines: [{ variantId: scarf, qty: 1 }],
        total: som(90_000),
        payments: [cash(som(90_000))],
      }).expect(201)
    ).body
    await alpha.post(`/api/sales/${mistaken.id}/void`).send({ reason: 'Xato chek' }).expect(200)
    // A coat sold yesterday.
    const earlier = (
      await sell(tills.one, {
        lines: [{ variantId: coat, qty: 1 }],
        total: som(500_000),
        payments: [cash(som(500_000))],
      }).expect(201)
    ).body
    await sql(`UPDATE sales SET sold_on = sold_on - 1, sold_at = sold_at - interval '1 day' WHERE id = $1`, [
      earlier.id,
    ])
    // One of the two coats comes back the same day.
    await alpha
      .post('/api/returns')
      .send({
        clientKey: randomUUID(),
        registerId: tills.one,
        saleId: two.id,
        lines: [{ saleLineId: two.lines[0].id, qty: 1 }],
        total: som(500_000),
        refunds: [cash(som(500_000))],
        reason: 'Katta keldi',
      })
      .expect(201)
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('counts a day: what was sold, what came back, what it cost and what was made', async () => {
    const day = await report({ from: today, to: today })
    expect(day).toMatchObject({ from: today, to: today, bucket: 'hour' })
    expect(day.totals).toEqual({
      // The undone receipt is not counted, nor yesterday's.
      receipts: 3,
      qty: 4,
      gross: som(1_590_000),
      discount: som(10_000),
      sold: som(1_580_000),
      returns: 1,
      returnedQty: 1,
      returned: som(500_000),
      net: som(1_080_000),
      // Three coats and a scarf went out, one coat came back.
      cost: som(430_000),
      profit: som(650_000),
    })
    // It is measured against the day before.
    expect(day.previous).toMatchObject({
      from: yesterday,
      to: yesterday,
      totals: {
        receipts: 1,
        sold: som(500_000),
        returned: 0,
        net: som(500_000),
        cost: som(200_000),
        profit: som(300_000),
      },
    })
  })

  it('cuts a day into its hours, the business’s own, and keeps the quiet ones', async () => {
    const { series } = await report({ from: today, to: today })
    const keys = series.map((point) => point.key)
    // Opening hours are always there; trade outside them widens the chart.
    expect(keys).toEqual(expect.arrayContaining(['09', '12', '21', hour]))
    expect(keys).toEqual([...keys].sort())
    const now = series.find((point) => point.key === hour)!
    expect(now).toEqual({ key: hour, receipts: 3, net: som(1_080_000), profit: som(650_000) })
    expect(series.filter((point) => point.key !== hour).every((point) => !point.receipts && !point.net)).toBe(true)
  })

  it('cuts several days into days, and sets them against as many days before', async () => {
    const days = await report({ from: yesterday, to: today })
    expect(days.bucket).toBe('day')
    expect(days.series).toEqual([
      { key: yesterday, receipts: 1, net: som(500_000), profit: som(300_000) },
      { key: today, receipts: 3, net: som(1_080_000), profit: som(650_000) },
    ])
    expect(days.totals).toMatchObject({ receipts: 4, net: som(1_580_000), profit: som(950_000) })
    expect(days.previous.totals).toMatchObject({ receipts: 0, sold: 0, net: 0, profit: 0 })
    const span = await sql<{ from: string; to: string }[]>(
      `SELECT ($1::date - 2)::text AS "from", ($1::date - 1)::text AS "to"`,
      [yesterday],
    )
    expect(days.previous).toMatchObject(span[0])
  })

  it('says which shop sold what, how the money came and who took it', async () => {
    const day = await report({ from: today, to: today })
    // A return comes off the shop that took the goods back.
    expect(day.shops).toEqual([
      { id: shops.one, name: expect.any(String), receipts: 2, net: som(580_000), profit: som(350_000) },
      { id: shops.two, name: 'Ikkinchi', receipts: 1, net: som(500_000), profit: som(300_000) },
    ])
    // Cash is what stayed in the drawer: the change given and the money handed back are out of it.
    expect(day.payments).toEqual([
      { method: 'cash', currency: 'UZS', amount: som(580_000), base: som(580_000) },
      { method: 'card', currency: 'UZS', amount: som(500_000), base: som(500_000) },
    ])
    expect(day.cashiers).toEqual([{ id: expect.any(String), name: 'Alpha Owner', receipts: 3, sold: som(1_580_000) }])

    const one = await report({ from: today, to: today, locationId: shops.one })
    expect(one.totals).toMatchObject({ receipts: 2, net: som(580_000), profit: som(350_000) })
    expect(one.shops.map((shop) => shop.id)).toEqual([shops.one])
    expect(one.payments).toEqual([{ method: 'cash', currency: 'UZS', amount: som(580_000), base: som(580_000) }])
  })

  it('names what sold best, after what came back', async () => {
    const day = await report({ from: today, to: today })
    expect(day.products).toEqual([
      // Three coats out and one back.
      {
        id: expect.any(String),
        name: 'Palto',
        sku: expect.any(String),
        image: null,
        qty: 2,
        net: som(1_000_000),
        profit: som(600_000),
      },
      {
        id: expect.any(String),
        name: 'Sharf',
        sku: expect.any(String),
        image: null,
        qty: 1,
        net: som(80_000),
        profit: som(50_000),
      },
    ])
    expect(day.categories).toEqual([
      { id: expect.any(String), name: 'Ustki kiyim', qty: 2, net: som(1_000_000) },
      { id: null, name: null, qty: 1, net: som(80_000) },
    ])
  })

  it('shows a person their own shops, and what goods cost only to those who may see costs', async () => {
    const mine = await report({ from: today, to: today }, manager)
    expect(mine.totals).toMatchObject({ receipts: 1, sold: som(500_000), net: som(500_000), cost: null, profit: null })
    expect(mine.shops).toEqual([{ id: shops.two, name: 'Ikkinchi', receipts: 1, net: som(500_000), profit: null }])
    expect(mine.series.every((point) => point.profit === null)).toBe(true)
    expect(mine.products).toEqual([expect.objectContaining({ name: 'Palto', qty: 1, profit: null })])
    expect(mine.previous.totals).toMatchObject({ receipts: 0, profit: null })

    // Another shop's numbers are not theirs to ask for.
    await manager.get('/api/reports/sales').query({ from: today, to: today, locationId: shops.one }).expect(403)
    // A cashier sells and reads no reports.
    await cashier.get('/api/reports/sales').query({ from: today, to: today }).expect(403)
  })

  it('keeps businesses apart and refuses days that make no sense', async () => {
    const theirs = await report({ from: today, to: today }, beta)
    expect(theirs.totals).toMatchObject({ receipts: 0, sold: 0, net: 0, cost: 0, profit: 0 })
    expect(theirs).toMatchObject({ shops: [], payments: [], cashiers: [], products: [], categories: [] })
    await beta.get('/api/reports/sales').query({ from: today, to: today, locationId: shops.one }).expect(200)

    const backwards = await alpha.get('/api/reports/sales').query({ from: today, to: yesterday }).expect(400)
    expect(backwards.body.error.fields.to).toBe('Davr oxiri boshidan oldin')
    await alpha.get('/api/reports/sales').query({ from: '2020-01-01', to: today }).expect(400)
    await alpha.get('/api/reports/sales').query({ from: 'kecha', to: today }).expect(400)
  })
})
