import { OrgsService } from './modules/orgs/orgs.service'
import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const minor = (amount: number) => Math.round(amount * 100)

interface Business {
  agent: Agent
  orgId: string
  shopId: string
  product: string
  variant: string
}

/**
 * A receipt in whatever currency the goods were bought in. Costs are kept in
 * the base alone: the receipt's one rate takes its goods there, an expense in
 * a third currency goes at the rate of the receipt's day — then and when the
 * bill comes late.
 */
describe('A receipt in any currency', () => {
  let harness: Harness
  let today: string
  let yesterday: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  const open = async (name: string, login: string, setup: Record<string, unknown>): Promise<Business> => {
    await harness.app.get(OrgsService).create({
      name,
      owner: { fullName: `${name} Owner`, login, password: PASSWORD },
      baseCurrency: (setup.baseCurrency as 'UZS' | 'USD' | undefined) ?? 'UZS',
    })
    const agent = await harness.signIn(login)
    await agent
      .post('/api/org/setup')
      .send({ name, currencies: [], locations: [{ name: `${name} shop`, kind: 'store' }], modules: [], ...setup })
      .expect(201)
    const orgId = (await agent.get('/api/auth/me').expect(200)).body.org.id
    const shopId = (await agent.get('/api/locations').expect(200)).body.items[0].id
    const model = (
      await agent
        .post('/api/products')
        .send({ name: 'Ko‘ylak', axisIds: [], variants: [{ valueIds: [] }], prices: [] })
        .expect(201)
    ).body
    return { agent, orgId, shopId, product: model.id, variant: model.variants[0].id }
  }

  const receipt = (business: Business, body: Record<string, unknown>) =>
    business.agent.post('/api/receipts').send({
      locationId: business.shopId,
      docDate: today,
      lines: [{ variantId: business.variant, qty: 10, price: minor(71) }],
      ...body,
    })

  beforeAll(async () => {
    harness = await startApp()
    ;[{ today, yesterday }] = await sql<{ today: string; yesterday: string }[]>(
      `SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS today,
              ((now() AT TIME ZONE 'Asia/Tashkent')::date - 1)::text AS yesterday`,
    )
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe('in a so’m business', () => {
    let gamma: Business

    beforeAll(async () => {
      gamma = await open('Gamma', 'gamma', { currencies: ['USD', 'CNY'] })
    }, 60_000)

    it('keeps costs in the base, with no other currency to choose', async () => {
      const me = (await gamma.agent.get('/api/auth/me').expect(200)).body
      expect(me.org.baseCurrency).toBe('UZS')
      expect([...me.org.currencies].sort()).toEqual(['CNY', 'USD'])
      expect(me.org.costCurrency).toBeUndefined()
      await gamma.agent.get('/api/currencies/cost').expect(404)
    })

    it('costs a yuan receipt by its one rate, the yuan in so’m', async () => {
      const unrated = await receipt(gamma, { currency: 'CNY' })
      expect(unrated.status).toBe(400)
      expect(unrated.body.error.fields.rate).toBe('Kursni yozing')

      // "1 ¥ = 1 750 so'm": the yuan is the dearer, written first. 10 at 71 ¥ = 710 ¥ = 1 242 500 so'm.
      const draft = (await receipt(gamma, { currency: 'CNY', rate: 1_750 }).expect(201)).body
      expect(draft).toMatchObject({ rate: 1_750, rateWay: 'in', extraCurrency: 'UZS' })
      expect(draft.totals).toMatchObject({ goods: minor(710), goodsUzs: minor(1_242_500), costUzs: minor(1_242_500) })
      await gamma.agent.delete(`/api/receipts/${draft.id}`).expect(204)

      // A receipt in the base has no rate, whatever a form sends.
      const som = (await receipt(gamma, { currency: 'UZS', rate: 99 }).expect(201)).body
      expect(som).toMatchObject({ rate: null, totals: { goodsUzs: minor(710) } })
      await gamma.agent.delete(`/api/receipts/${som.id}`).expect(204)
    })

    it('takes an expense in dollars at the rate of the receipt’s day, then and when the bill comes late', async () => {
      // Yesterday the dollar was 12 600; today it is 12 800.
      await gamma.agent.put('/api/currencies/USD/rate').send({ value: 12_600 }).expect(200)
      await sql(`UPDATE currency_rates SET rate_date = $2 WHERE org_id = $1 AND code = 'USD'`, [gamma.orgId, yesterday])
      await gamma.agent.put('/api/currencies/USD/rate').send({ value: 12_800 }).expect(200)

      const freight = (dollars: number) => [
        { name: 'Yo‘l', amount: minor(dollars), currency: 'USD', basis: 'quantity', isEstimate: true },
      ]
      const draft = (
        await receipt(gamma, { docDate: yesterday, currency: 'CNY', rate: 1_750, expenses: freight(100) }).expect(201)
      ).body
      // 100 $ at yesterday's 12 600: 1 260 000 so'm over ten pieces.
      expect(draft.totals).toMatchObject({ expensesUzs: minor(1_260_000), costUzs: minor(1_242_500 + 1_260_000) })
      const posted = (await gamma.agent.post(`/api/receipts/${draft.id}/post`).expect(201)).body
      expect(posted.expenses[0].amountUzs).toBe(minor(1_260_000))

      // The real bill is 200 $: still at the rate of the receipt's day, not today's.
      const revised = (
        await gamma.agent
          .put(`/api/receipts/${draft.id}/expenses`)
          .send({ expenses: [{ name: 'Yo‘l', amount: minor(200), currency: 'USD', basis: 'quantity' }] })
          .expect(200)
      ).body
      expect(revised.expenses[0].amountUzs).toBe(minor(2_520_000))
      expect(revised.totals.costUzs).toBe(minor(1_242_500 + 2_520_000))

      // A receipt of today goes at today's.
      const fresh = (await receipt(gamma, { currency: 'CNY', rate: 1_750, expenses: freight(100) }).expect(201)).body
      expect(fresh.totals.expensesUzs).toBe(minor(1_280_000))
      await gamma.agent.delete(`/api/receipts/${fresh.id}`).expect(204)
    })

    it('refuses an expense in a currency the business does not keep, or one with no rate on the day', async () => {
      const lira = await receipt(gamma, {
        currency: 'CNY',
        rate: 1_750,
        expenses: [{ name: 'Boj', amount: minor(100), currency: 'TRY', basis: 'value' }],
      })
      expect(lira.body.error.fields['expenses.0.currency']).toBe('Bu valyuta yoqilmagan: Pul → Kurslar')

      await gamma.agent.post('/api/currencies').send({ code: 'EUR' }).expect(200)
      const euro = await receipt(gamma, {
        currency: 'UZS',
        extraCurrency: 'EUR',
        lines: [{ variantId: gamma.variant, qty: 1, price: minor(100_000), extra: minor(1) }],
      })
      expect(euro.status).toBe(400)
      expect(euro.body.error.fields.extraCurrency).toBe('Yevro kursi qo‘yilmagan (kirim sanasiga)')
    })

    it('shows on the model what currency its goods came in, and at what price', async () => {
      const som = (
        await receipt(gamma, {
          currency: 'UZS',
          lines: [{ variantId: gamma.variant, qty: 10, price: minor(175_000) }],
        }).expect(201)
      ).body
      await gamma.agent.post(`/api/receipts/${som.id}/post`).expect(201)
      const arrivals = (await gamma.agent.get(`/api/products/${gamma.product}/arrivals`).expect(200)).body as {
        currency: string
        price: number
        qty: number
        unitCost: number | null
      }[]
      expect(arrivals.map((arrival) => [arrival.currency, arrival.price, arrival.qty, arrival.unitCost])).toEqual([
        // Newest first: 175 000 so'm as it is; 71 ¥ a piece, 124 250 so'm with 252 000 of the freight added.
        ['UZS', minor(175_000), 10, minor(175_000)],
        ['CNY', minor(71), 10, minor(376_250)],
      ])
    })
  })

  describe('in a dollar business', () => {
    it('reads the yuan the way the business writes it: one dollar is 7,25 yuan', async () => {
      const delta = await open('Delta', 'delta', { baseCurrency: 'USD', currencies: ['CNY'] })
      const draft = (await receipt(delta, { currency: 'CNY', rate: 7.25 }).expect(201)).body
      expect(draft).toMatchObject({ rate: 7.25, rateWay: 'per', extraCurrency: 'USD' })
      // 710 ¥ = 97,93 $.
      expect(draft.totals).toMatchObject({ goods: minor(710), goodsUzs: minor(97.93) })
    })
  })
})
