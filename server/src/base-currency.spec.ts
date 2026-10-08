import { randomUUID } from 'node:crypto'

import type { AnyCurrency } from '@erp/core'

import { OrgsService } from './modules/orgs/orgs.service'
import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const minor = (amount: number) => Math.round(amount * 100)

interface Business {
  agent: Agent
  shopId: string
  retail: { id: string; currency: string; roundStep: number }
  registerId: string
}

/**
 * A business keeps its books in the currency it chose, not in so'm: a shop
 * in Almaty sells in tenge and takes dollars beside them, a dollar shop has
 * nothing beside its dollars. Everything the so'm business does — buying in
 * yuan, selling, change, handing back, the shift, the report — goes the same
 * way in another base, and the so'm is nowhere in it.
 */
describe('A base other than the so’m', () => {
  let harness: Harness
  let today: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  /** A business in `base`, set up with one shop, dollars taken where it may, and a till. */
  const open = async (
    name: string,
    login: string,
    base: AnyCurrency,
    modules: string[] = ['terminal'],
  ): Promise<Business> => {
    await harness.app.get(OrgsService).create({
      name,
      owner: { fullName: `${name} Owner`, login, password: PASSWORD },
      baseCurrency: base,
    })
    const agent = await harness.signIn(login)
    await agent
      .post('/api/org/setup')
      .send({ name, currencies: ['USD'], locations: [{ name: `${name} shop`, kind: 'store' }], modules })
      .expect(201)
    const shopId = (await agent.get('/api/locations').expect(200)).body.items[0].id
    const types = (await agent.get('/api/price-types').expect(200)).body as (Business['retail'] & { kind: string })[]
    const retail = types.find((type) => type.kind === 'retail')!
    const registerId = (
      await agent.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201)
    ).body.id
    return { agent, shopId, retail, registerId }
  }

  /** A model at one retail price, ten of it bought in yuan and posted to the shop. */
  const stocked = async (business: Business, price: { amount: number; currency: string }, rates: object) => {
    const { agent, shopId, retail } = business
    const variant = (
      await agent
        .post('/api/products')
        .send({
          name: 'Palto',
          axisIds: [],
          variants: [{ valueIds: [] }],
          prices: [{ priceTypeId: retail.id, ...price }],
        })
        .expect(201)
    ).body.variants[0].id as string
    const draft = (
      await agent
        .post('/api/receipts')
        .send({
          locationId: shopId,
          docDate: today,
          currency: 'CNY',
          ...rates,
          lines: [{ variantId: variant, qty: 10, price: minor(71) }],
        })
        .expect(201)
    ).body
    const posted = (await agent.post(`/api/receipts/${draft.id}/post`).expect(201)).body
    return { variant, receipt: posted }
  }

  beforeAll(async () => {
    harness = await startApp()
    ;[{ day: today }] = await sql<{ day: string }[]>(`SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day`)
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe('tenge, with dollars beside it', () => {
    let gamma: Business
    let variant: string
    let saleId: string
    let lineId: string

    beforeAll(async () => {
      gamma = await open('Gamma', 'gamma', 'KZT')
    }, 60_000)

    it('opens in tenge: the session, the price types and their rounding say so', async () => {
      const me = (await gamma.agent.get('/api/auth/me').expect(200)).body
      expect(me.org.baseCurrency).toBe('KZT')
      expect(me.org.currencies).toEqual(['USD'])
      // Prices are rounded to a hundred tenge, as tenge are counted.
      expect(gamma.retail).toMatchObject({ currency: 'KZT', roundStep: minor(100) })
      expect(me.org.settings.changeRoundStep).toBe(minor(10))
    })

    it('prices in tenge or dollars, and in nothing else', async () => {
      const type = (
        await gamma.agent
          .post('/api/price-types')
          .send({ name: 'So‘mda', kind: 'other', currency: 'UZS', roundStep: 0, roundEnding: 0 })
      ).body
      expect(type.error.fields.currency).toBe('Narx asosiy valyuta yoki dollarda bo‘ladi')
      const product = await gamma.agent.post('/api/products').send({
        name: 'Sharf',
        axisIds: [],
        variants: [{ valueIds: [] }],
        prices: [{ priceTypeId: gamma.retail.id, amount: minor(150_000), currency: 'UZS' }],
      })
      expect(product.status).toBe(400)
      expect(product.body.error.fields.prices).toBe('Narx asosiy valyuta yoki dollarda bo‘ladi')
    })

    it('buys in yuan and costs the goods in tenge and dollars', async () => {
      await gamma.agent.put('/api/currencies/USD/rate').send({ value: 480 }).expect(200)
      // 10 at 71 ¥ = 710 ¥ = 100 $ = 48 000 ₸.
      const bought = await stocked(gamma, { amount: minor(12_000), currency: 'KZT' }, { usdRate: 7.1, uzsRate: 480 })
      variant = bought.variant
      expect(bought.receipt.totals).toMatchObject({ goodsUsd: minor(100), goodsUzs: minor(48_000) })
      // An expense can be in tenge, dollars or yuan; so'm the receipt has no rate for.
      const so = await gamma.agent
        .put(`/api/receipts/${bought.receipt.id}/expenses`)
        .send({ expenses: [{ name: 'Kargo', amount: minor(100_000), currency: 'UZS', basis: 'quantity' }] })
      expect(so.status).toBe(400)
      expect(so.body.error.fields['expenses.0.currency']).toBeDefined()
    })

    it('keeps a terminal in tenge', async () => {
      const refused = await gamma.agent
        .post('/api/money/accounts')
        .send({ kind: 'terminal', name: 'POS $', currency: 'USD', locationId: gamma.shopId })
      expect(refused.body.error.fields.currency).toBe('Terminal faqat asosiy valyutada')
      // Named no currency, an account is in the base.
      const safe = (
        await gamma.agent.post('/api/money/accounts').send({ kind: 'safe', name: 'Seyf', locationId: gamma.shopId })
      ).body
      expect(safe.currency).toBe('KZT')
    })

    it('sells in tenge for tenge and dollars, and hands the change back in tenge', async () => {
      await gamma.agent
        .post('/api/shifts')
        .send({ registerId: gamma.registerId, cashUzs: minor(20_000) })
        .expect(201)
      const sell = (payments: object[]) =>
        gamma.agent.post('/api/sales').send({
          clientKey: randomUUID(),
          registerId: gamma.registerId,
          lines: [{ variantId: variant, qty: 1 }],
          payments,
          total: minor(12_000),
        })
      const inSom = await sell([{ method: 'cash', currency: 'UZS', amount: minor(1_000_000) }])
      expect(inSom.status).toBe(400)
      expect(inSom.body.error.fields['payments.0.currency']).toBe('Bu valyuta qabul qilinmaydi')

      // 2 000 ₸ and 25 $ (12 000 ₸): 2 000 ₸ over.
      const sale = (
        await sell([
          { method: 'cash', currency: 'KZT', amount: minor(2000) },
          { method: 'cash', currency: 'USD', amount: minor(25) },
        ]).expect(201)
      ).body
      expect(sale).toMatchObject({
        total: minor(12_000),
        changeUzs: minor(2000),
        changeUsd: 0,
        rounding: 0,
        costUzs: minor(4800),
      })
      expect(sale.payments.map((payment: { currency: string }) => payment.currency).sort()).toEqual(['KZT', 'USD'])
      saleId = sale.id
      lineId = sale.lines[0].id

      const drawers = await sql<{ name: string; currency: string; balance: string }[]>(
        `SELECT a.name, a.currency, a.balance FROM accounts a JOIN organizations o ON o.id = a.org_id
         WHERE o.name = 'Gamma' AND a.kind = 'cash' ORDER BY a.currency`,
      )
      expect(drawers.map((row) => [row.name, row.currency, Number(row.balance)])).toEqual([
        ['Kassa 1 (₸)', 'KZT', minor(20_000)],
        ['Kassa 1 (dollar)', 'USD', minor(25)],
      ])
      const books = await sql<{ currency: string }[]>(
        `SELECT DISTINCT a.currency FROM accounts a JOIN organizations o ON o.id = a.org_id
         WHERE o.name = 'Gamma' AND a.kind = 'system'`,
      )
      expect(books).toEqual([{ currency: 'KZT' }])
    })

    it('hands money back in tenge and shows the shift in tenge and dollars', async () => {
      await gamma.agent
        .post('/api/returns')
        .send({
          clientKey: randomUUID(),
          registerId: gamma.registerId,
          saleId,
          lines: [{ saleLineId: lineId, qty: 1 }],
          total: minor(12_000),
          refunds: [{ method: 'cash', amount: minor(12_000) }],
        })
        .expect(201)
      const shift = (await gamma.agent.get('/api/shifts').expect(200)).body.items[0]
      expect(shift.totals).toMatchObject({ changeUzs: minor(2000), changeUsd: 0 })
      expect(shift.totals.payments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ method: 'cash', currency: 'KZT', amount: minor(2000) }),
          expect.objectContaining({ method: 'cash', currency: 'USD', amount: minor(25) }),
        ]),
      )
      expect(shift.totals.refunds).toEqual([expect.objectContaining({ currency: 'KZT', amount: minor(12_000) })])
    })

    it('reports the money by the currencies it came in, so’m nowhere', async () => {
      const report = (await gamma.agent.get('/api/reports/sales').query({ from: today, to: today }).expect(200)).body
      const currencies = new Set(report.payments.map((payment: { currency: string }) => payment.currency))
      expect(currencies.has('UZS')).toBe(false)
      expect(currencies.has('USD')).toBe(true)
    })
  })

  describe('the dollar as the base', () => {
    let delta: Business

    beforeAll(async () => {
      delta = await open('Delta', 'delta', 'USD')
    }, 60_000)

    it('has no dollars beside its dollars: none switched on, no rate to set', async () => {
      const me = (await delta.agent.get('/api/auth/me').expect(200)).body
      expect(me.org.baseCurrency).toBe('USD')
      expect(me.org.currencies).toEqual([])
      expect(delta.retail).toMatchObject({ currency: 'USD', roundStep: minor(1) })
      await delta.agent.put('/api/currencies/USD/rate').send({ value: 12_650 }).expect(404)
      await delta.agent.post('/api/currencies').send({ code: 'USD' }).expect(400)
    })

    it('costs the goods once, in dollars, and sells for dollars with change in dollars', async () => {
      // 10 at 71 ¥ = 710 ¥ = 98 $ at 7,25; whatever so'm rate a form might send, a dollar is a dollar.
      const { variant, receipt } = await stocked(
        delta,
        { amount: minor(37.6), currency: 'USD' },
        { usdRate: 7.25, uzsRate: 12_650 },
      )
      expect(receipt.totals.goodsUzs).toBe(receipt.totals.goodsUsd)
      expect(receipt.totals.goodsUsd).toBe(minor(97.93))

      await delta.agent.post('/api/shifts').send({ registerId: delta.registerId, cashUzs: 0 }).expect(201)
      const sale = (
        await delta.agent
          .post('/api/sales')
          .send({
            clientKey: randomUUID(),
            registerId: delta.registerId,
            lines: [{ variantId: variant, qty: 1 }],
            // No currency named: the base.
            payments: [{ method: 'cash', amount: minor(50) }],
            total: minor(37.6),
          })
          .expect(201)
      ).body
      // 12,40 $ over: 12 $ handed back, a dollar being the smallest the till gives.
      expect(sale).toMatchObject({ changeUzs: minor(12), changeUsd: 0, rounding: minor(0.4) })
      expect(sale.payments).toEqual([expect.objectContaining({ currency: 'USD', amount: minor(50) })])
      const agreed = await delta.agent.post('/api/sales').send({
        clientKey: randomUUID(),
        registerId: delta.registerId,
        lines: [{ variantId: variant, qty: 1 }],
        payments: [{ method: 'cash', currency: 'USD', amount: minor(40), value: minor(38) }],
        total: minor(37.6),
      })
      expect(agreed.body.error.fields['payments.0.value']).toBe('Kelishilgan qiymat faqat dollar uchun yoziladi')
    })
  })

  describe('chosen until the first money is written', () => {
    let zeta: Business
    let product: string

    beforeAll(async () => {
      zeta = await open('Zeta', 'zeta', 'UZS', ['terminal', 'loyalty'])
      await zeta.agent.put('/api/currencies/USD/rate').send({ value: 12_650 }).expect(200)
      product = (
        await zeta.agent
          .post('/api/products')
          .send({
            name: 'Ko‘ylak',
            axisIds: [],
            variants: [{ valueIds: [] }],
            prices: [{ priceTypeId: zeta.retail.id, amount: minor(126_500), currency: 'UZS' }],
          })
          .expect(201)
      ).body.id
      await zeta.agent
        .put('/api/customers/loyalty')
        .send({ tiers: [{ from: minor(1_000_000), percent: 5 }] })
        .expect(200)
      await zeta.agent
        .put('/api/org')
        .send({ name: 'Zeta', settings: { autoLockMinutes: 10, debtLimit: minor(5_000_000) } })
        .expect(200)
    }, 60_000)

    it('says it may change, and what would be carried across', async () => {
      expect((await zeta.agent.get('/api/currencies/base').expect(200)).body).toEqual({
        base: 'UZS',
        locked: null,
        prices: 1,
      })
    })

    it('is the owner’s to change, and wants a rate for what it carries', async () => {
      const roles = (await zeta.agent.get('/api/roles')).body as { id: string; templateKey: string }[]
      await zeta.agent
        .post('/api/users')
        .send({
          fullName: 'Zeta Menejer',
          login: 'zeta-menejer',
          password: PASSWORD,
          roleIds: [roles.find((role) => role.templateKey === 'store_manager')!.id],
          allLocations: true,
          locationIds: [],
        })
        .expect(201)
      const manager = await harness.signIn('zeta-menejer')
      expect((await manager.put('/api/currencies/base').send({ currency: 'USD' })).status).toBe(403)

      const tenge = await zeta.agent.put('/api/currencies/base').send({ currency: 'KZT' })
      expect(tenge.status).toBe(400)
      expect(tenge.body.error.fields.currency).toBe('Qozog‘iston tengesi kursi qo‘yilmagan')
    })

    it('carries prices, thresholds and limits to dollars, and keeps the so’m as a currency with its rate', async () => {
      const state = (await zeta.agent.put('/api/currencies/base').send({ currency: 'USD' }).expect(200)).body
      expect(state).toEqual({ base: 'USD', locked: null, prices: 1 })

      const me = (await zeta.agent.get('/api/auth/me').expect(200)).body
      expect(me.org.baseCurrency).toBe('USD')
      expect(me.org.currencies).toEqual(['UZS'])
      // A dollar is counted in whole ones; the debt limit is 5 000 000 / 12 650 = 395,26 $.
      expect(me.org.settings).toMatchObject({ changeRoundStep: minor(1), debtLimit: minor(395) })

      const types = (await zeta.agent.get('/api/price-types').expect(200)).body as {
        currency: string
        roundStep: number
      }[]
      expect(new Set(types.map((type) => `${type.currency}/${type.roundStep}`))).toEqual(new Set(['USD/100']))
      const model = (await zeta.agent.get(`/api/products/${product}`).expect(200)).body
      // 126 500 so'm at 12 650 = 10 $.
      expect(model.prices).toEqual([expect.objectContaining({ amount: minor(10), currency: 'USD' })])
      expect((await zeta.agent.get('/api/customers/loyalty').expect(200)).body).toEqual([
        { from: minor(79), percent: 5 },
      ])

      const currencies = (await zeta.agent.get('/api/currencies').expect(200)).body
      expect(currencies.base).toBe('USD')
      const som = currencies.active.find((currency: { code: string }) => currency.code === 'UZS')
      expect(som).toMatchObject({
        form: { against: 'USD', way: 'per' },
        rate: expect.objectContaining({ value: 12_650 }),
      })
      // The base has no rate, and no row among the currencies beside it.
      expect(currencies.active.map((currency: { code: string }) => currency.code)).toEqual(['USD', 'UZS'])
    })

    it('goes back to so’m the same way, the dollar rate written afresh', async () => {
      await zeta.agent.put('/api/currencies/base').send({ currency: 'UZS' }).expect(200)
      const me = (await zeta.agent.get('/api/auth/me').expect(200)).body
      expect(me.org).toMatchObject({
        baseCurrency: 'UZS',
        currencies: ['USD'],
        settings: { changeRoundStep: minor(1000) },
      })
      const currencies = (await zeta.agent.get('/api/currencies').expect(200)).body
      // "1 $ = 12 650 so'm" again: the number that was typed, not one worked out and rounded.
      expect(currencies.active.find((currency: { code: string }) => currency.code === 'USD')).toMatchObject({
        form: { against: 'UZS', way: 'in' },
        rate: expect.objectContaining({ against: 'UZS', way: 'in', value: 12_650 }),
      })
      const model = (await zeta.agent.get(`/api/products/${product}`).expect(200)).body
      expect(model.prices).toEqual([expect.objectContaining({ amount: minor(127_000), currency: 'UZS' })])
    })

    it('is fixed once there is a draft receipt, and once goods are in', async () => {
      const draft = (
        await zeta.agent
          .post('/api/receipts')
          .send({ locationId: zeta.shopId, docDate: today, currency: 'USD', usdRate: 1, uzsRate: 12_650, lines: [] })
          .expect(201)
      ).body
      const drafted = await zeta.agent.put('/api/currencies/base').send({ currency: 'USD' })
      expect(drafted.status).toBe(409)
      expect(drafted.body.error.code).toBe('BASE_LOCKED')
      expect((await zeta.agent.get('/api/currencies/base').expect(200)).body.locked).toBe('drafts')
      await zeta.agent.delete(`/api/receipts/${draft.id}`).expect(204)

      await stocked(zeta, { amount: minor(127_000), currency: 'UZS' }, { usdRate: 7.25, uzsRate: 12_650 })
      const locked = await zeta.agent.put('/api/currencies/base').send({ currency: 'USD' })
      expect(locked.status).toBe(409)
      expect(locked.body.error.message).toBe('Tovar kirimi bor: asosiy valyuta endi o‘zgarmaydi')
    })
  })

  describe('chosen at the first setup', () => {
    it('opens a business in tenge, its price types with it', async () => {
      await harness.app.get(OrgsService).create({
        name: 'Eta',
        owner: { fullName: 'Eta Owner', login: 'eta', password: PASSWORD },
      })
      const eta = await harness.signIn('eta')
      await eta
        .post('/api/org/setup')
        .send({
          name: 'Eta',
          baseCurrency: 'KZT',
          currencies: ['USD'],
          locations: [{ name: 'Eta shop', kind: 'store' }],
          modules: [],
        })
        .expect(201)
      const me = (await eta.get('/api/auth/me').expect(200)).body
      expect(me.org).toMatchObject({
        baseCurrency: 'KZT',
        currencies: ['USD'],
        settings: { changeRoundStep: minor(10) },
      })
      const types = (await eta.get('/api/price-types').expect(200)).body as { currency: string; roundStep: number }[]
      expect(types.every((type) => type.currency === 'KZT' && type.roundStep === minor(100))).toBe(true)
      // The so'm it was opened with had nothing to it: it is not left among its currencies.
      const currencies = (await eta.get('/api/currencies').expect(200)).body
      expect(currencies.active.map((currency: { code: string }) => currency.code)).toEqual(['KZT', 'USD'])
    })
  })
})
