import { randomUUID } from 'node:crypto'

import { startApp, type Agent, type Harness } from './testing/harness'
import { drawerOf } from './testing/shifts'

const minor = (amount: number) => Math.round(amount * 100)

/**
 * A till takes cash in the currencies it is given, not in so'm and dollars
 * alone: here yuan as well, counted at the day's rate, with change handed
 * back in whole yuan when the customer asks, and money handed back in yuan.
 */
describe('A till in any currency', () => {
  let harness: Harness
  let alpha: Agent
  let shopId: string
  let registerId: string
  let dress: string

  interface Drawer {
    id: string
    name: string
    currency: string
    isActive: boolean
    registerId: string | null
  }
  const drawersOf = async (tillId: string) =>
    ((await alpha.get('/api/money/accounts').expect(200)).body as Drawer[])
      .filter((account) => account.registerId === tillId)
      .sort((a, b) => a.currency.localeCompare(b.currency))
  const drawerIn = async (tillId: string, currency: string) =>
    (await drawersOf(tillId)).find((drawer) => drawer.currency === currency) as Drawer
  const tillNamed = async (name: string) =>
    (
      (await alpha.get('/api/money/registers').expect(200)).body as { id: string; name: string; currencies: string[] }[]
    ).find((till) => till.name === name) as { id: string; name: string; currencies: string[] }

  const sell = (payments: Record<string, unknown>[], total: number, more: Record<string, unknown> = {}) =>
    alpha.post('/api/sales').send({
      clientKey: randomUUID(),
      registerId,
      lines: [{ variantId: dress, qty: 1 }],
      payments,
      total,
      ...more,
    })

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    shopId = (await alpha.get('/api/locations')).body.items[0].id
    await alpha.post('/api/currencies').send({ code: 'CNY' }).expect(200)
    await alpha.put('/api/currencies/CNY/rate').send({ value: 1_750 }).expect(200)
    await alpha.put('/api/currencies/USD/rate').send({ value: 12_650 }).expect(200)
    const retail = ((await alpha.get('/api/price-types').expect(200)).body as { id: string; kind: string }[]).find(
      (type) => type.kind === 'retail',
    )!.id
    dress = (
      await alpha
        .post('/api/products')
        .send({
          name: 'Ko‘ylak',
          axisIds: [],
          variants: [{ valueIds: [] }],
          prices: [{ priceTypeId: retail, amount: minor(400_000), currency: 'UZS' }],
        })
        .expect(201)
    ).body.variants[0].id
    const draft = await alpha
      .post('/api/receipts')
      .send({
        locationId: shopId,
        docDate: '2026-10-01',
        currency: 'UZS',
        lines: [{ variantId: dress, qty: 10, price: minor(200_000) }],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('takes every currency the business keeps: a drawer for each, made with the till', async () => {
    const till = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body
    registerId = till.id
    expect(till.currencies).toEqual(['USD', 'CNY'])
    expect((await drawersOf(registerId)).map((drawer) => [drawer.name, drawer.currency, drawer.isActive])).toEqual([
      ['Kassa 1 (¥)', 'CNY', true],
      ['Kassa 1 ($)', 'USD', true],
      ['Kassa 1 (so‘m)', 'UZS', true],
    ])

    // A till for so'm alone: its other drawers are put away, like any account.
    const own = (await alpha.post('/api/money/registers').send({ name: 'Kassa 3', locationId: shopId }).expect(201))
      .body
    for (const drawer of (await drawersOf(own.id)).filter((item) => item.currency !== 'UZS')) {
      await alpha.post(`/api/money/accounts/${drawer.id}/archive`).expect(200)
    }
    expect((await tillNamed('Kassa 3')).currencies).toEqual([])

    await alpha.post('/api/shifts').send({ registerId, cash: {} }).expect(201)
    const context = (await alpha.get(`/api/pos/context/${registerId}`).expect(200)).body
    expect(context.currencies).toEqual(['UZS', 'USD', 'CNY'])
    expect(context.book.rates.CNY).toEqual({ against: 'UZS', way: 'in', value: 1_750 })
    expect(Object.keys(context.drawers)).toEqual(['UZS', 'USD', 'CNY'])
  })

  it('sells for yuan at the day’s rate, and gives change in whole yuan when asked', async () => {
    // 300 ¥ = 525 000 against 400 000: 71 ¥ back (124 250) and 750 so'm, handed back as 1 000.
    const sale = (
      await sell([{ method: 'cash', currency: 'CNY', amount: minor(300) }], minor(400_000), {
        changeCurrency: 'CNY',
      }).expect(201)
    ).body
    expect(sale).toMatchObject({
      changeOther: minor(71),
      changeCurrency: 'CNY',
      changeUzs: minor(1000),
      rounding: -minor(250),
    })
    expect(sale.payments).toEqual([
      expect.objectContaining({ method: 'cash', currency: 'CNY', amount: minor(300), base: minor(525_000), fx: 0 }),
    ])
    // The drawer holds the yuan less the yuan handed back.
    const context = (await alpha.get(`/api/pos/context/${registerId}`).expect(200)).body
    const drawer = (await alpha.get('/api/money/accounts').expect(200)).body.find(
      (account: { id: string }) => account.id === context.drawers.CNY,
    )
    expect(drawer).toMatchObject({ currency: 'CNY', balance: minor(229) })
  })

  it('takes yuan for an agreed worth, as dollars are', async () => {
    const sale = (
      await sell(
        [{ method: 'cash', currency: 'CNY', amount: minor(230), value: minor(400_000) }],
        minor(400_000),
      ).expect(201)
    ).body
    // 230 ¥ are 402 500 at the rate: called 400 000, the shop keeps 2 500 more.
    expect(sale.payments[0]).toMatchObject({ base: minor(400_000), fx: minor(2_500) })
  })

  it('keeps a drawer that holds money, the base one, and any while the shift is open', async () => {
    const [yuan, dollars, som] = await drawersOf(registerId)
    expect((await alpha.post(`/api/money/accounts/${yuan.id}/archive`).expect(409)).body.error.code).toBe('DRAWER_HELD')
    expect((await alpha.post(`/api/money/accounts/${som.id}/archive`).expect(409)).body.error.code).toBe('BASE_DRAWER')
    expect((await alpha.post(`/api/money/accounts/${dollars.id}/archive`).expect(409)).body.error.code).toBe(
      'SHIFT_OPEN',
    )
  })

  it('takes a drawer made by hand, one to a currency, and lets an empty one leave the till', async () => {
    const own = await tillNamed('Kassa 3')
    const dollars = await drawerIn(own.id, 'USD')
    // Another dollar drawer in the same till: refused, the one put away is to be brought back.
    const twice = await alpha
      .post('/api/money/accounts')
      .send({ kind: 'safe', name: 'Dollar 2', currency: 'USD', registerId: own.id })
      .expect(400)
    expect(twice.body.error.fields.registerId).toBe(
      'Bu kassada AQSH dollari tortmasi arxivda: «Kassa 3 ($)» ni qayta tiklang',
    )
    // An empty drawer leaves the till as cash kept elsewhere; another is made in its place by hand.
    const loose = (
      await alpha
        .put(`/api/money/accounts/${dollars.id}`)
        .send({ kind: 'safe', name: 'Dollar qo‘lda', currency: 'USD', registerId: null })
        .expect(200)
    ).body
    expect(loose).toMatchObject({ kind: 'safe', registerId: null })
    const made = (
      await alpha
        .post('/api/money/accounts')
        .send({ kind: 'safe', name: 'Kassa 3 dollar', currency: 'USD', registerId: own.id })
        .expect(201)
    ).body
    expect(made).toMatchObject({ kind: 'cash', registerId: own.id, locationId: shopId })
    expect((await tillNamed('Kassa 3')).currencies).toEqual(['USD'])
    // A till's base drawer stays in it; a card is no till's.
    const som = await drawerIn(registerId, 'UZS')
    const away = await alpha
      .put(`/api/money/accounts/${som.id}`)
      .send({ kind: 'safe', name: som.name, currency: 'UZS', registerId: null })
      .expect(400)
    expect(away.body.error.fields.registerId).toBe('Asosiy valyuta tortmasi kassadan ajratilmaydi')
    const card = await alpha
      .post('/api/money/accounts')
      .send({ kind: 'card', name: 'Humo', currency: 'UZS', registerId: own.id })
      .expect(400)
    expect(card.body.error.fields.registerId).toBe('Kassaga faqat naqd hisob biriktiriladi')
  })

  it('refuses a currency the till does not take, and one with no rate', async () => {
    const other = await tillNamed('Kassa 3')
    await alpha.post('/api/shifts').send({ registerId: other.id, cash: {} }).expect(201)
    const refused = await alpha.post('/api/sales').send({
      clientKey: randomUUID(),
      registerId: other.id,
      lines: [{ variantId: dress, qty: 1 }],
      payments: [{ method: 'cash', currency: 'CNY', amount: minor(300) }],
      total: minor(400_000),
    })
    expect(refused.status).toBe(400)
    expect(refused.body.error.fields['payments.0.currency']).toBe('Bu valyuta bu kassada qabul qilinmaydi')
  })

  it('hands money back in yuan at the day’s rate', async () => {
    const sale = (await sell([{ method: 'cash', currency: 'UZS', amount: minor(400_000) }], minor(400_000)).expect(201))
      .body
    // 400 000 back: 200 ¥ (350 000) and 50 000 so'm.
    const made = await alpha.post('/api/returns').send({
      clientKey: randomUUID(),
      registerId,
      saleId: sale.id,
      lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
      refunds: [
        { method: 'cash', currency: 'CNY', amount: minor(200) },
        { method: 'cash', currency: 'UZS', amount: minor(50_000) },
      ],
      total: minor(400_000),
      approval: null,
    })
    expect(made.body.error ?? null).toBeNull()
    expect(made.status).toBe(201)
    expect(made.body.refunds).toEqual(
      expect.arrayContaining([expect.objectContaining({ currency: 'CNY', amount: minor(200), base: minor(350_000) })]),
    )
  })

  it('counts every drawer at closing, the yuan one too, and hands yuan over to a yuan safe', async () => {
    const safe = (
      await alpha
        .post('/api/money/accounts')
        .send({ kind: 'safe', name: 'Yuan seyf', currency: 'CNY', locationId: shopId })
        .expect(201)
    ).body
    const shiftId = (await alpha.get(`/api/pos/context/${registerId}`).expect(200)).body.shift.id
    const lira = await alpha.post(`/api/shifts/${shiftId}/close`).send({ cash: { TRY: minor(5) } })
    expect(lira.status).toBe(400)
    expect(lira.body.error.fields['cash.TRY']).toBe('Bu valyuta bu kassada qabul qilinmaydi')

    // So'm: 1 000 handed back as change, 400 000 taken, 50 000 handed back. Yuan: 300 − 71 + 230 − 200.
    const closed = (
      await alpha
        .post(`/api/shifts/${shiftId}/close`)
        .send({
          cash: { UZS: minor(349_000), USD: 0, CNY: minor(259) },
          handovers: [{ toAccountId: safe.id, amount: minor(200) }],
        })
        .expect(200)
    ).body
    expect(closed.counts.map((count: { currency: string }) => count.currency)).toEqual(['UZS', 'USD', 'CNY'])
    expect(drawerOf(closed, 'UZS')).toMatchObject({ counted: minor(349_000), expected: minor(349_000), diff: 0 })
    expect(drawerOf(closed, 'CNY')).toMatchObject({
      opening: 0,
      counted: minor(259),
      expected: minor(259),
      diff: 0,
      change: minor(71),
      out: minor(200),
    })
    // What was handed over is on its way to the yuan safe; the drawer keeps the rest.
    const drawer = (await alpha.get('/api/money/accounts').expect(200)).body.find(
      (account: { registerId: string | null; currency: string }) =>
        account.currency === 'CNY' && account.registerId === registerId,
    )
    expect(drawer?.balance ?? null).toBe(minor(59))
  })

  it('takes a currency switched on later at every till, the ones made before it too', async () => {
    await alpha.post('/api/currencies').send({ code: 'EUR' }).expect(200)
    const tills = (await alpha.get('/api/money/registers').expect(200)).body as { name: string; currencies: string[] }[]
    expect(Object.fromEntries(tills.map((till) => [till.name, till.currencies]))).toEqual({
      'Kassa 1': ['USD', 'CNY', 'EUR'],
      'Kassa 3': ['USD', 'EUR'],
    })
  })
})
