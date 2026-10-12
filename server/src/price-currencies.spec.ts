import { startApp, type Agent, type Harness } from './testing/harness'

const minor = (amount: number) => Math.round(amount * 100)

interface Line {
  name: string
  old: number | null
  next: number | null
  unitCost: number | null
}

/**
 * Prices are kept in the base alone (KEYINGI-REJA, 16.18): what goods cost is in the base too, and the till
 * sells in it. Money may come in any currency the business keeps; a price is never written in one.
 */
describe('Prices in the base alone', () => {
  let harness: Harness
  let alpha: Agent
  let registerId: string
  let retail: string
  let dress: string

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    retail = ((await alpha.get('/api/price-types').expect(200)).body as { id: string; kind: string }[]).find(
      (type) => type.kind === 'retail',
    )!.id

    await alpha.post('/api/currencies').send({ code: 'CNY' }).expect(200)
    await alpha.put('/api/currencies/CNY/rate').send({ value: 1_750 }).expect(200)
    await alpha.put('/api/currencies/USD/rate').send({ value: 12_650 }).expect(200)

    dress = (
      await alpha
        .post('/api/products')
        .send({
          name: 'Ko‘ylak',
          axisIds: [],
          variants: [{ valueIds: [] }],
          prices: [{ priceTypeId: retail, amount: minor(200_000), currency: 'UZS' }],
        })
        .expect(201)
    ).body.variants[0].id
    // Bought in yuan: 70 ¥ at 1 750 is 122 500 so'm a piece.
    const draft = await alpha
      .post('/api/receipts')
      .send({
        locationId: shopId,
        docDate: '2026-10-01',
        currency: 'CNY',
        rate: 1_750,
        lines: [{ variantId: dress, qty: 5, price: minor(70) }],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    await alpha.post('/api/shifts').send({ registerId, cash: {} }).expect(201)
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('are refused in any other currency, one the business keeps or not', async () => {
    for (const currency of ['CNY', 'USD', 'EUR']) {
      const product = await alpha.post('/api/products').send({
        name: 'Sharf',
        axisIds: [],
        variants: [{ valueIds: [] }],
        prices: [{ priceTypeId: retail, amount: minor(30), currency }],
      })
      expect(product.status).toBe(400)
      expect(product.body.error.fields.prices).toBe('Narx asosiy valyutada bo‘ladi')
    }
  })

  it('make a price type in the base, whatever currency it is asked to be in', async () => {
    const yuan = (
      await alpha.post('/api/price-types').send({ name: 'Yuan narxi', currency: 'CNY', tillAccess: 'all' }).expect(201)
    ).body
    expect(yuan).toMatchObject({ kind: 'other', currency: 'UZS' })
    // Nothing is priced in the yuan, so it may be put away.
    await alpha.post('/api/currencies/CNY/archive').expect(200)
    await alpha.post('/api/currencies').send({ code: 'CNY' }).expect(200)
  })

  it('show at the till as they are set, whatever the rates do', async () => {
    const priced = async () =>
      (
        (
          await alpha
            .post('/api/pos/items')
            .send({ registerId, variantIds: [dress] })
            .expect(200)
        ).body as {
          price: number
        }[]
      )[0].price
    expect(await priced()).toBe(minor(200_000))
    await alpha.put('/api/currencies/USD/rate').send({ value: 13_000, confirmed: true }).expect(200)
    expect(await priced()).toBe(minor(200_000))
  })

  it('are marked up on the cost in the base', async () => {
    // Bought at 122 500 so'm, and half again is 183 750.
    const preview = (
      await alpha
        .post('/api/pricing/reprice')
        .send({
          priceTypeId: retail,
          filter: {},
          operation: { kind: 'formula', formula: { base: 'cost', percent: 50 } },
          round: false,
        })
        .expect(200)
    ).body as { lines: Line[] }
    const line = preview.lines.find((one) => one.name === 'Ko‘ylak')!
    expect(line.unitCost).toBe(minor(122_500))
    expect(line.next).toBe(minor(183_750))
  })
})
