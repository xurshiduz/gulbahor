import { randomUUID } from 'node:crypto'

import { startApp, type Agent, type Harness } from './testing/harness'

const minor = (amount: number) => Math.round(amount * 100)

interface Line {
  name: string
  old: number | null
  next: number | null
  unitCost: number | null
}

/**
 * Prices in any currency the business has switched on, not only in the base
 * or in dollars: a price type kept in yuan, a model priced in dollars. The
 * till shows each in the base at the day's rates, and sells at that.
 */
describe('Prices in any currency', () => {
  let harness: Harness
  let alpha: Agent
  let registerId: string
  let yuanType: string
  let retail: string
  let dress: string
  let coat: string
  let ring: string

  const items = (priceTypeId: string | null, variantIds: string[]) =>
    alpha.post('/api/pos/items').send({ registerId, variantIds, priceTypeId })
  const priced = async (priceTypeId: string | null, variantId: string) =>
    ((await items(priceTypeId, [variantId]).expect(200)).body as { price: number | null }[])[0].price

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    retail = ((await alpha.get('/api/price-types').expect(200)).body as { id: string; kind: string }[]).find(
      (type) => type.kind === 'retail',
    )!.id

    // The yuan written straight in so'm, the dollar too; the lira switched on with no rate yet.
    await alpha.post('/api/currencies').send({ code: 'CNY' }).expect(200)
    await alpha.post('/api/currencies').send({ code: 'TRY' }).expect(200)
    await alpha.put('/api/currencies/CNY/rate').send({ value: 1_750 }).expect(200)
    await alpha.put('/api/currencies/USD/rate').send({ value: 12_650 }).expect(200)

    yuanType = (
      await alpha
        .post('/api/price-types')
        .send({ name: 'Yuan narxi', kind: 'other', currency: 'CNY', tillAccess: 'all' })
        .expect(201)
    ).body.id
    const model = async (name: string, prices: { priceTypeId: string; amount: number; currency: string }[]) =>
      (
        await alpha
          .post('/api/products')
          .send({ name, axisIds: [], variants: [{ valueIds: [] }], prices })
          .expect(201)
      ).body.variants[0].id as string
    dress = await model('Ko‘ylak', [
      { priceTypeId: retail, amount: minor(200_000), currency: 'UZS' },
      { priceTypeId: yuanType, amount: minor(100), currency: 'CNY' },
    ])
    coat = await model('Palto', [{ priceTypeId: retail, amount: minor(20), currency: 'USD' }])
    ring = await model('Uzuk', [{ priceTypeId: retail, amount: minor(500), currency: 'TRY' }])

    const draft = await alpha
      .post('/api/receipts')
      .send({
        locationId: shopId,
        docDate: '2026-10-01',
        currency: 'UZS',
        lines: [{ variantId: dress, qty: 5, price: minor(122_500) }],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    await alpha.post('/api/shifts').send({ registerId, cashUzs: 0 }).expect(201)
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('are kept in a currency the business has switched on, and in no other', async () => {
    const euro = await alpha.post('/api/price-types').send({ name: 'Yevro narxi', kind: 'other', currency: 'EUR' })
    expect(euro.status).toBe(400)
    expect(euro.body.error.fields.currency).toBe('Narx asosiy valyuta yoki yoqilgan valyutada bo‘ladi')
    const product = await alpha.post('/api/products').send({
      name: 'Sharf',
      axisIds: [],
      variants: [{ valueIds: [] }],
      prices: [{ priceTypeId: retail, amount: minor(30), currency: 'EUR' }],
    })
    expect(product.status).toBe(400)
    expect(product.body.error.fields.prices).toBe('Narx asosiy valyuta yoki yoqilgan valyutada bo‘ladi')
  })

  it('show at the till in the base, at the day’s rates', async () => {
    // 100 ¥ at 1 750 so'm; 20 $ at 12 650.
    expect(await priced(yuanType, dress)).toBe(minor(175_000))
    expect(await priced(null, dress)).toBe(minor(200_000))
    expect(await priced(null, coat)).toBe(minor(253_000))
    // The lira has no rate: such a price is not one the till can name.
    expect(await priced(null, ring)).toBeNull()

    // The yuan moves, and so does what the price comes to.
    await alpha.put('/api/currencies/CNY/rate').send({ value: 1_760 }).expect(200)
    expect(await priced(yuanType, dress)).toBe(minor(176_000))
  })

  it('are sold at what the till showed, and a rate moved since is caught', async () => {
    const sell = (total: number) =>
      alpha.post('/api/sales').send({
        clientKey: randomUUID(),
        registerId,
        priceTypeId: yuanType,
        lines: [{ variantId: dress, qty: 1 }],
        payments: [{ method: 'cash', currency: 'UZS', amount: total }],
        total,
      })
    const stale = await sell(minor(175_000))
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('PRICE_CHANGED')
    const sale = (await sell(minor(176_000)).expect(201)).body
    expect(sale.total).toBe(minor(176_000))
  })

  it('are marked up on the cost, carried into the currency of the price', async () => {
    // Bought at 122 500 so'm: 69,6 ¥ at 1 760, and half again is 104,40 ¥.
    const preview = (
      await alpha
        .post('/api/pricing/reprice')
        .send({ priceTypeId: yuanType, filter: {}, operation: { kind: 'markup', percent: 50 }, round: false })
        .expect(200)
    ).body as { lines: Line[] }
    const line = preview.lines.find((one) => one.name === 'Ko‘ylak')!
    expect(line.unitCost).toBe(minor(69.6))
    expect(line.next).toBe(minor(104.4))
  })

  it('keep the currency they are in from being put away', async () => {
    const priced = await alpha.post('/api/currencies/CNY/archive').expect(409)
    expect(priced.body.error.code).toBe('CURRENCY_PRICED')
  })
})
