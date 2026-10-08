import { OrgsService } from './modules/orgs/orgs.service'
import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const minor = (amount: number) => Math.round(amount * 100)

interface Business {
  agent: Agent
  shopId: string
  product: string
  variant: string
}

/**
 * What a business keeps its costs in beside its base: dollars, yuan, or
 * nothing but the base. Chosen at the first setup or in the settings while
 * nothing has been costed; every receipt goes through it.
 */
describe('The cost currency', () => {
  let harness: Harness

  const open = async (name: string, login: string, setup: Record<string, unknown>): Promise<Business> => {
    await harness.app.get(OrgsService).create({ name, owner: { fullName: `${name} Owner`, login, password: PASSWORD } })
    const agent = await harness.signIn(login)
    await agent
      .post('/api/org/setup')
      .send({ name, currencies: [], locations: [{ name: `${name} shop`, kind: 'store' }], modules: [], ...setup })
      .expect(201)
    const shopId = (await agent.get('/api/locations').expect(200)).body.items[0].id
    const model = (
      await agent
        .post('/api/products')
        .send({ name: 'Ko‘ylak', axisIds: [], variants: [{ valueIds: [] }], prices: [] })
        .expect(201)
    ).body
    return { agent, shopId, product: model.id, variant: model.variants[0].id }
  }

  const receipt = (business: Business, body: Record<string, unknown>) =>
    business.agent.post('/api/receipts').send({
      locationId: business.shopId,
      docDate: '2026-10-01',
      lines: [{ variantId: business.variant, qty: 10, price: minor(71) }],
      ...body,
    })

  beforeAll(async () => {
    harness = await startApp()
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe('kept in the base alone', () => {
    let gamma: Business

    beforeAll(async () => {
      gamma = await open('Gamma', 'gamma', { currencies: ['CNY'] })
    }, 60_000)

    it('is the base where nothing else was chosen', async () => {
      const me = (await gamma.agent.get('/api/auth/me').expect(200)).body
      expect(me.org).toMatchObject({ baseCurrency: 'UZS', costCurrency: 'UZS', currencies: ['CNY'] })
      expect((await gamma.agent.get('/api/currencies/cost').expect(200)).body).toEqual({ cost: 'UZS', locked: null })
    })

    it('costs a yuan receipt by one rate, the yuan in so’m, and keeps the base twice', async () => {
      // "1 ¥ = 1 750 so'm": the yuan is the dearer, the rate is written against it.
      const draft = (await receipt(gamma, { currency: 'CNY', usdRate: 1, uzsRate: 1_750 }).expect(201)).body
      expect(draft).toMatchObject({ usdRate: 1, uzsRate: 1_750, extraCurrency: 'UZS' })
      // 10 at 71 ¥ = 710 ¥ = 1 242 500 so'm.
      expect(draft.totals).toMatchObject({ goods: minor(710), goodsUzs: minor(1_242_500), goodsUsd: minor(1_242_500) })
      // An expense in dollars has no rate to go by.
      const dollars = await gamma.agent.put(`/api/receipts/${draft.id}`).send({
        locationId: gamma.shopId,
        docDate: '2026-10-01',
        currency: 'CNY',
        usdRate: 1,
        uzsRate: 1_750,
        lines: [{ variantId: gamma.variant, qty: 10, price: minor(71) }],
        expenses: [{ name: 'Yo‘l', amount: minor(10), currency: 'USD', basis: 'quantity' }],
      })
      expect(dollars.status).toBe(400)
      expect(dollars.body.error.fields['expenses.0.currency']).toBe(
        'Tannarx valyutasi, asosiy valyuta yoki hujjat valyutasini tanlang',
      )
      // A draft is costed in the cost currency of now: it may not change under it.
      const drafted = await gamma.agent.put('/api/currencies/cost').send({ currency: 'CNY' })
      expect(drafted.status).toBe(409)
      expect(drafted.body.error.code).toBe('COST_LOCKED')
      await gamma.agent.delete(`/api/receipts/${draft.id}`).expect(204)
    })

    it('may be another currency the business has, chosen by the owner before anything is costed', async () => {
      await gamma.agent.put('/api/currencies/cost').send({ currency: 'EUR' }).expect(400)
      const yuan = (await gamma.agent.put('/api/currencies/cost').send({ currency: 'CNY' }).expect(200)).body
      expect(yuan).toEqual({ cost: 'CNY', locked: null })
      expect((await gamma.agent.get('/api/auth/me').expect(200)).body.org.costCurrency).toBe('CNY')
      // The currency costs are kept in is not put away.
      const away = await gamma.agent.post('/api/currencies/CNY/archive').expect(409)
      expect(away.body.error.code).toBe('CURRENCY_COST')

      // Costed in yuan beside so'm: a so'm receipt of 1 750 000 is 1 000 ¥ at 1 750.
      const draft = (
        await receipt(gamma, {
          currency: 'UZS',
          usdRate: 1_750,
          uzsRate: 1_750,
          lines: [{ variantId: gamma.variant, qty: 10, price: minor(175_000) }],
        }).expect(201)
      ).body
      expect(draft.totals).toMatchObject({ goodsUzs: minor(1_750_000), goodsUsd: minor(1_000) })
      await gamma.agent.post(`/api/receipts/${draft.id}/post`).expect(201)
      const locked = await gamma.agent.put('/api/currencies/cost').send({ currency: 'UZS' })
      expect(locked.status).toBe(409)
      expect(locked.body.error.message).toBe('Tovar kirimi bor: tannarx valyutasi endi o‘zgarmaydi')
      expect((await gamma.agent.get('/api/currencies/cost').expect(200)).body.locked).toBe('stock')
    })

    it('shows on the model what currency its goods came in, and at what price', async () => {
      // Costs in yuan: a yuan receipt asks only the yuan in so'm.
      const yuan = (await receipt(gamma, { currency: 'CNY', usdRate: 1, uzsRate: 1_750 }).expect(201)).body
      await gamma.agent.post(`/api/receipts/${yuan.id}/post`).expect(201)
      const arrivals = (await gamma.agent.get(`/api/products/${gamma.product}/arrivals`).expect(200)).body as {
        currency: string
        price: number
        qty: number
        unitCost: number | null
      }[]
      expect(arrivals.map((arrival) => [arrival.currency, arrival.price, arrival.qty, arrival.unitCost])).toEqual([
        // Newest first: 71 ¥ a piece, 124 250 so'm with nothing added.
        ['CNY', minor(71), 10, minor(124_250)],
        ['UZS', minor(175_000), 10, minor(175_000)],
      ])
    })
  })

  describe('chosen at the first setup', () => {
    it('is dollars where the business says so, and the base where it names one it does not have', async () => {
      const delta = await open('Delta', 'delta', { currencies: ['USD'], costCurrency: 'USD' })
      expect((await delta.agent.get('/api/auth/me').expect(200)).body.org.costCurrency).toBe('USD')
      const eta = await open('Eta', 'eta', { currencies: [], costCurrency: 'USD' })
      expect((await eta.agent.get('/api/auth/me').expect(200)).body.org.costCurrency).toBe('UZS')
    })

    it('is changed by the owner alone', async () => {
      const zeta = await open('Zeta', 'zeta', { currencies: ['USD'] })
      const roles = (await zeta.agent.get('/api/roles')).body as { id: string; templateKey: string }[]
      await zeta.agent
        .post('/api/users')
        .send({
          fullName: 'Zeta Boshqaruvchi',
          login: 'zeta-boss',
          password: PASSWORD,
          roleIds: [roles.find((role) => role.templateKey === 'manager')!.id],
          allLocations: true,
          locationIds: [],
        })
        .expect(201)
      const boss = await harness.signIn('zeta-boss')
      await boss.put('/api/currencies/cost').send({ currency: 'USD' }).expect(403)
    })
  })
})
