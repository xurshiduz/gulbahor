import { randomUUID } from 'node:crypto'

import { startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => amount * 100

interface PriceType {
  id: string
  kind: string
  name: string
}

/**
 * A receipt names a price for every price type the business keeps, and
 * posting it puts those prices on the models.
 */
describe('Prices set by a receipt', () => {
  let harness: Harness
  let alpha: Agent
  let shopId: string
  let dress: { id: string; variants: { id: string }[] }
  let types: Record<'retail' | 'wholesale' | 'min' | 'family', string>

  const receipt = (lines: Record<string, unknown>[]) => ({
    locationId: shopId,
    docDate: '2026-10-01',
    currency: 'UZS',
    lines,
  })
  const pricesOf = async (productId: string): Promise<Record<string, number>> => {
    const product = (await alpha.get(`/api/products/${productId}`).expect(200)).body as {
      prices: { priceTypeId: string; amount: number }[]
    }
    return Object.fromEntries(product.prices.map((price) => [price.priceTypeId, price.amount]))
  }

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    shopId = (await alpha.get('/api/locations')).body.items[0].id
    const family = (
      await alpha
        .post('/api/price-types')
        .send({ name: 'Oila', kind: 'other', currency: 'UZS', roundStep: 0, roundEnding: 0 })
        .expect(201)
    ).body as PriceType
    const list = (await alpha.get('/api/price-types').expect(200)).body as PriceType[]
    const of = (kind: string) => list.find((type) => type.kind === kind)!.id
    types = { retail: of('retail'), wholesale: of('wholesale'), min: of('min'), family: family.id }
    dress = (
      await alpha
        .post('/api/products')
        .send({ name: 'Ko‘ylak', axisIds: [], variants: [{ valueIds: [] }], prices: [] })
        .expect(201)
    ).body
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('are kept on the draft for every price type, and put on the model when it is posted', async () => {
    const line = {
      variantId: dress.variants[0].id,
      qty: 4,
      price: som(120_000),
      retailPrice: som(200_000),
      wholesalePrice: som(170_000),
      otherPrices: { [types.min]: som(150_000), [types.family]: som(120_000) },
    }
    const draft = (
      await alpha
        .post('/api/receipts')
        .send(receipt([line]))
        .expect(201)
    ).body
    expect(draft.lines[0]).toMatchObject({
      retailPrice: som(200_000),
      otherPrices: { [types.min]: som(150_000), [types.family]: som(120_000) },
    })
    // Nothing is priced until the goods are in.
    expect(await pricesOf(dress.id)).toEqual({})

    await alpha.post(`/api/receipts/${draft.id}/post`).expect(201)
    expect(await pricesOf(dress.id)).toEqual({
      [types.retail]: som(200_000),
      [types.wholesale]: som(170_000),
      [types.min]: som(150_000),
      [types.family]: som(120_000),
    })

    // The till knows the floor from the same receipt.
    const registerId = (
      await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201)
    ).body.id
    const found = (await alpha.get('/api/pos/search').query({ registerId, q: 'ko‘ylak' }).expect(200)).body
    expect(found[0]).toMatchObject({ price: som(200_000), minPrice: som(150_000) })

    // A copy of the receipt carries them along.
    const copy = (await alpha.post(`/api/receipts/${draft.id}/copy`).expect(201)).body
    expect(copy.lines[0].otherPrices).toEqual({ [types.min]: som(150_000), [types.family]: som(120_000) })
  })

  it('leave alone what a later receipt does not name', async () => {
    const draft = (
      await alpha
        .post('/api/receipts')
        .send(
          receipt([
            {
              variantId: dress.variants[0].id,
              qty: 1,
              price: som(125_000),
              retailPrice: som(210_000),
              otherPrices: { [types.family]: som(125_000) },
            },
          ]),
        )
        .expect(201)
    ).body
    await alpha.post(`/api/receipts/${draft.id}/post`).expect(201)
    expect(await pricesOf(dress.id)).toEqual({
      [types.retail]: som(210_000),
      [types.wholesale]: som(170_000),
      [types.min]: som(150_000),
      [types.family]: som(125_000),
    })
  })

  it('are refused for a price type the business does not keep, or one that has a field of its own', async () => {
    const line = { variantId: dress.variants[0].id, qty: 1, price: som(120_000) }
    const unknown = await alpha
      .post('/api/receipts')
      .send(receipt([{ ...line, otherPrices: { [randomUUID()]: som(1000) } }]))
    expect(unknown.status).toBe(400)
    expect(unknown.body.error.fields['lines.0.otherPrices']).toBe('Narx turi topilmadi')
    // The retail price has its own field: it is not also taken from here.
    const twice = await alpha
      .post('/api/receipts')
      .send(receipt([{ ...line, otherPrices: { [types.retail]: som(1000) } }]))
    expect(twice.status).toBe(400)

    // An archived price type is no longer asked about.
    await alpha.post(`/api/price-types/${types.family}/archive`).expect(201)
    const archived = await alpha
      .post('/api/receipts')
      .send(receipt([{ ...line, otherPrices: { [types.family]: som(1000) } }]))
    expect(archived.status).toBe(400)
  })

  it("keeps the field for one model's own cost out of the way until the business asks for it", async () => {
    const me = (await alpha.get('/api/auth/me').expect(200)).body
    expect(me.org.settings.receiptLineExtra).toBe(false)
    const changed = (
      await alpha
        .put('/api/org')
        .send({ name: me.org.name, settings: { autoLockMinutes: 10, receiptLineExtra: true } })
        .expect(200)
    ).body
    expect(changed.settings).toMatchObject({ receiptLineExtra: true, maxDiscountPercent: 10 })
  })

  it('and the same for a model with a supplier of its own', async () => {
    const me = (await alpha.get('/api/auth/me').expect(200)).body
    expect(me.org.settings.receiptLineSupplier).toBe(false)
    const changed = (
      await alpha
        .put('/api/org')
        .send({ name: me.org.name, settings: { autoLockMinutes: 10, receiptLineSupplier: true } })
        .expect(200)
    ).body
    // What was not sent stays as it was.
    expect(changed.settings).toMatchObject({ receiptLineSupplier: true, receiptLineExtra: true })
  })
})
