import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => amount * 100

interface Promo {
  id: string
  name: string
  state: string
  code: string | null
  given: number
  sales: number
  isActive: boolean
}

/**
 * Promotions: for a while, in some shops, some goods are cheaper. They come
 * off by themselves at the till, and beside a customer's own discount the
 * customer gets whichever is more.
 */
describe('Promotions', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let cashier: Agent
  let manager: Agent

  let day: string
  let registerId: string
  let otherRegisterId: string
  let otherShopId: string
  let womenId: string
  let dress: string
  let dressProduct: string
  let scarf: string
  let regular: { id: string }
  let autumn: Promo
  let scarfPromo: Promo

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })
  const shift = (from: string, days: number) => {
    const [year, month, date] = from.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
  }
  const add = (body: Record<string, unknown>, agent = alpha) => agent.post('/api/promotions').send(body)
  const sell = (variantId: string, total: number, more: Record<string, unknown> = {}, till = registerId) =>
    cashier.post('/api/sales').send({
      clientKey: randomUUID(),
      registerId: till,
      lines: [{ variantId, qty: 1 }],
      payments: [{ method: 'cash', currency: 'UZS', amount: total }],
      total,
      ...more,
    })
  const found = async (q: string, more: Record<string, unknown> = {}, till = registerId) =>
    (
      await cashier
        .get('/api/pos/search')
        .query({ registerId: till, q, ...more })
        .expect(200)
    ).body[0] as {
      price: number
      promos: { name: string; kind: string; value: number; stackable: boolean }[]
    }

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    ;[{ day }] = await sql<{ day: string }[]>(`SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day`)
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    otherShopId = (await alpha.post('/api/locations').send({ name: 'Ikkinchi', kind: 'store' }).expect(201)).body.id
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    otherRegisterId = (
      await alpha.post('/api/money/registers').send({ name: 'Kassa 2', locationId: otherShopId }).expect(201)
    ).body.id

    womenId = (await alpha.post('/api/categories').send({ name: 'Ayollar (aksiya)', parentId: null }).expect(201)).body
      .id
    const dressesId = (
      await alpha.post('/api/categories').send({ name: "Ko'ylaklar (aksiya)", parentId: womenId }).expect(201)
    ).body.id
    const types = (await alpha.get('/api/price-types').expect(200)).body as { id: string; kind: string }[]
    const price = (kind: string, amount: number) => ({
      priceTypeId: types.find((type) => type.kind === kind)!.id,
      amount,
      currency: 'UZS',
    })
    const product = async (name: string, body: Record<string, unknown>) =>
      (
        await alpha
          .post('/api/products')
          .send({ name, axisIds: [], variants: [{ valueIds: [] }], ...body })
          .expect(201)
      ).body as { id: string; variants: { id: string }[] }
    const made = await product("Ko'ylak", {
      categoryId: dressesId,
      season: 'aw',
      prices: [price('retail', som(200_000)), price('wholesale', som(170_000))],
    })
    dressProduct = made.id
    dress = made.variants[0].id
    scarf = (await product('Sharf', { prices: [price('retail', som(50_000))] })).variants[0].id
    for (const locationId of [shopId, otherShopId]) {
      const draft = await alpha
        .post('/api/receipts')
        .send({
          locationId,
          docDate: '2026-10-01',
          uzsRate: 12_000,
          currency: 'UZS',
          usdRate: 12_000,
          lines: [
            { variantId: dress, qty: 30, price: som(100_000) },
            { variantId: scarf, qty: 30, price: som(20_000) },
          ],
        })
        .expect(201)
      await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)
    }

    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    const hire = async (fullName: string, login: string, templateKey: string) => {
      await alpha
        .post('/api/users')
        .send({
          fullName,
          login,
          password: PASSWORD,
          roleIds: [roles.find((role) => role.templateKey === templateKey)!.id],
          allLocations: true,
          locationIds: [],
        })
        .expect(201)
      return harness.signIn(login)
    }
    cashier = await hire('Dilnoza Kassir', 'kassir', 'cashier')
    manager = await hire('Anvar Menejer', 'menejer', 'store_manager')
    for (const till of [registerId, otherRegisterId]) {
      await cashier.post('/api/shifts').send({ registerId: till, cashUzs: 0 }).expect(201)
    }

    const group = (await alpha.post('/api/customers/groups').send({ name: 'Doimiy', discountPercent: 10 }).expect(201))
      .body
    regular = (
      await alpha
        .post('/api/customers')
        .send({ name: 'Nodira', phone: '90 123 45 67', groupIds: [group.id] })
        .expect(201)
    ).body
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe('setting one up', () => {
    it('says what, when and for which goods; and stands as scheduled, running or ended by the day', async () => {
      autumn = (
        await add({ name: 'Kuzgi aksiya', kind: 'percent', value: 20, startsOn: day, categoryIds: [womenId] }).expect(
          201,
        )
      ).body
      expect(autumn).toMatchObject({ name: 'Kuzgi aksiya', state: 'running', given: 0, sales: 0, code: null })
      const later = (
        await add({ name: 'Keyingi hafta', kind: 'percent', value: 50, startsOn: shift(day, 3) }).expect(201)
      ).body
      expect(later.state).toBe('scheduled')
      const past = (
        await add({
          name: "O'tgan hafta",
          kind: 'percent',
          value: 50,
          startsOn: shift(day, -9),
          endsOn: shift(day, -2),
        }).expect(201)
      ).body
      expect(past.state).toBe('ended')

      const states = async (state: string) =>
        ((await alpha.get('/api/promotions').query({ state }).expect(200)).body.items as Promo[]).map(
          (item) => item.name,
        )
      expect(await states('running')).toEqual(['Kuzgi aksiya'])
      expect(await states('scheduled')).toEqual(['Keyingi hafta'])
      expect(await states('ended')).toEqual(["O'tgan hafta"])
      expect((await alpha.get('/api/promotions').expect(200)).body.total).toBe(3)
      expect((await beta.get('/api/promotions').expect(200)).body.total).toBe(0)
    })

    it('is refused what does not exist, a percentage over the whole, and a code already taken', async () => {
      const base = { name: 'Xato', kind: 'percent', value: 10, startsOn: day }
      expect((await add({ ...base, categoryIds: [randomUUID()] })).body.error.fields.categoryIds).toBeDefined()
      expect((await add({ ...base, locationIds: [randomUUID()] })).body.error.fields.locationIds).toBeDefined()
      expect((await add({ ...base, value: 101 })).status).toBe(400)
      await add({ ...base, name: 'Instagram', code: 'insta' }).expect(201)
      const twice = await add({ ...base, name: 'Yana', code: 'INSTA' })
      expect(twice.body.error.fields.code).toContain('Instagram')
    })

    it('is for those who run the marketing: a shop sees what is on, a cashier only sells', async () => {
      await manager.get('/api/promotions').expect(200)
      await add({ name: 'Menejer', kind: 'percent', value: 10, startsOn: day }, manager).expect(403)
      await cashier.get('/api/promotions').expect(403)
    })
  })

  describe('at the till', () => {
    it('comes off by itself what it covers, a category covering what is under it', async () => {
      // The dress is in a category under the one the promotion names; the scarf is in none.
      expect((await found("ko'ylak")).promos).toEqual([
        { id: autumn.id, name: 'Kuzgi aksiya', kind: 'percent', value: 20, minQty: null, stackable: false },
      ])
      expect((await found('sharf')).promos).toEqual([])

      expect((await sell(dress, som(200_000))).body.error.code).toBe('PRICE_CHANGED')
      const sale = (await sell(dress, som(160_000)).expect(201)).body
      expect(sale).toMatchObject({
        subtotal: som(200_000),
        discount: som(40_000),
        autoDiscount: som(40_000),
        autoReason: 'Kuzgi aksiya',
        total: som(160_000),
        promoCode: null,
      })
      expect(sale.lines[0]).toMatchObject({
        promotionName: 'Kuzgi aksiya',
        promoDiscount: som(40_000),
        autoDiscount: som(40_000),
        total: som(160_000),
      })
      await sell(scarf, som(50_000)).expect(201)
      // What it has given so far is counted from the receipts.
      const now = (await alpha.get(`/api/promotions/${autumn.id}`).expect(200)).body
      expect(now).toMatchObject({ given: som(40_000), sales: 1 })
    })

    it("does not add up with the customer's own discount: whichever is more comes off", async () => {
      // 20% from the promotion, 10% of her own: the promotion.
      const more = (await sell(dress, som(160_000), { customerId: regular.id }).expect(201)).body
      expect(more).toMatchObject({ autoDiscount: som(40_000), autoReason: 'Kuzgi aksiya' })
      expect(more.lines[0].promotionName).toBe('Kuzgi aksiya')

      // 5% on scarves, 10% of her own: her own, and the promotion is not on the receipt.
      scarfPromo = (
        await add({ name: 'Sharf haftaligi', kind: 'percent', value: 5, startsOn: day, productIds: [] }).expect(201)
      ).body
      // With nothing named it covers everything: the dress has two promotions now, and the better one stands.
      expect((await found("ko'ylak")).promos.map((offer) => offer.name)).toEqual(['Kuzgi aksiya', 'Sharf haftaligi'])
      await sell(dress, som(160_000)).expect(201)
      const less = (await sell(scarf, som(45_000), { customerId: regular.id }).expect(201)).body
      expect(less).toMatchObject({ autoDiscount: som(5000), autoReason: 'Doimiy 10%' })
      expect(less.lines[0]).toMatchObject({ promotionName: null, promoDiscount: 0, autoDiscount: som(5000) })
      // Without her, the 5% is all there is.
      expect((await sell(scarf, som(47_500)).expect(201)).body.autoReason).toBe('Sharf haftaligi')
    })

    it('stacks with it only when the promotion says so, one after the other', async () => {
      await alpha
        .put(`/api/promotions/${scarfPromo.id}`)
        .send({ name: 'Sharf haftaligi', kind: 'percent', value: 5, startsOn: day, stackable: true })
        .expect(200)
      // 50 000 less 5% is 47 500; less 10% of that is 42 750.
      const sale = (await sell(scarf, som(42_750), { customerId: regular.id }).expect(201)).body
      expect(sale).toMatchObject({ autoDiscount: som(7250), autoReason: 'Sharf haftaligi, Doimiy 10%' })
      expect(sale.lines[0]).toMatchObject({ promotionName: 'Sharf haftaligi', promoDiscount: som(2500) })
    })

    it('sets one price for every piece, and may ask for a word the customer has to say', async () => {
      const coded = (
        await add({
          name: 'Bloger narxi',
          kind: 'price',
          value: som(150_000),
          startsOn: day,
          productIds: [dressProduct],
          code: 'bloger',
        }).expect(201)
      ).body
      expect(coded).toMatchObject({ code: 'BLOGER', products: [{ id: dressProduct, name: "Ko'ylak" }] })

      // Unsaid, it is not offered; the till is told what a word opens before the sale.
      expect((await found("ko'ylak")).promos.map((offer) => offer.name)).not.toContain('Bloger narxi')
      const opened = await cashier.get('/api/pos/promo-code').query({ registerId, code: 'Bloger' }).expect(200)
      expect(opened.body).toEqual([{ name: 'Bloger narxi' }])
      expect((await cashier.get('/api/pos/promo-code').query({ registerId, code: 'yoq' }).expect(200)).body).toEqual([])
      const withCode = await found("ko'ylak", { promoCode: 'bloger' })
      expect(withCode.promos.map((offer) => offer.name)).toContain('Bloger narxi')

      // 150 000 for the piece is more off than 20%: it is what stands.
      const sale = (await sell(dress, som(150_000), { promoCode: 'bloger' }).expect(201)).body
      expect(sale).toMatchObject({ autoDiscount: som(50_000), autoReason: 'Bloger narxi', promoCode: 'BLOGER' })
      const wrong = await sell(dress, som(160_000), { promoCode: 'yoq' })
      expect(wrong.status).toBe(400)
      expect(wrong.body.error.fields.promoCode).toBeDefined()
    })

    it('runs only in its shops, only on its days, and only at the retail price', async () => {
      const there = (
        await add({
          name: 'Ikkinchi do‘kon ochilishi',
          kind: 'percent',
          value: 30,
          startsOn: day,
          locationIds: [otherShopId],
          categoryIds: [womenId],
          seasons: ['aw'],
        }).expect(201)
      ).body
      expect((await found("ko'ylak")).promos.map((offer) => offer.name)).not.toContain(there.name)
      expect((await found("ko'ylak", {}, otherRegisterId)).promos.map((offer) => offer.name)).toContain(there.name)
      await sell(dress, som(140_000), {}, otherRegisterId).expect(201)

      // A cart sold at the wholesale price has no promotions at all.
      const types = (await alpha.get('/api/price-types').expect(200)).body as Record<string, unknown>[]
      const wholesale = types.find((type) => type.kind === 'wholesale') as { id: string }
      await alpha
        .put(`/api/price-types/${wholesale.id}`)
        .send({ ...wholesale, tillAccess: 'all' })
        .expect(200)
      expect((await found("ko'ylak", { priceTypeId: wholesale.id })).promos).toEqual([])
      const sale = (await sell(dress, som(170_000), { priceTypeId: wholesale.id }).expect(201)).body
      expect(sale).toMatchObject({ autoDiscount: 0, autoReason: null })
    })

    it('stops when it is stopped, and stays in the books once it has been on a receipt', async () => {
      const stopped = (await alpha.post(`/api/promotions/${autumn.id}/stop`).expect(200)).body
      expect(stopped).toMatchObject({ state: 'stopped', isActive: false })
      expect((await found("ko'ylak")).promos.map((offer) => offer.name)).not.toContain('Kuzgi aksiya')
      // The scarf promotion still covers the dress: 5% off 200 000.
      await sell(dress, som(190_000)).expect(201)

      const used = await alpha.delete(`/api/promotions/${autumn.id}`)
      expect(used.status).toBe(409)
      expect(used.body.error.code).toBe('IN_USE')
      const unused = ((await alpha.get('/api/promotions').expect(200)).body.items as Promo[]).find(
        (item) => item.name === 'Keyingi hafta',
      )!
      await alpha.delete(`/api/promotions/${unused.id}`).expect(204)
      expect((await alpha.post(`/api/promotions/${autumn.id}/resume`).expect(200)).body.state).toBe('running')
    })
  })

  describe('over the whole cart', () => {
    let trousers: { id: string; variants: { id: string }[] }
    let belt: { id: string; variants: { id: string }[] }
    let pair: Promo

    const cart = (lines: [variantId: string, qty: number][], total: number) =>
      cashier.post('/api/sales').send({
        clientKey: randomUUID(),
        registerId,
        lines: lines.map(([variantId, qty]) => ({ variantId, qty })),
        payments: [{ method: 'cash', currency: 'UZS', amount: total }],
        total,
      })

    beforeAll(async () => {
      // Nothing else is running: what comes off below is these promotions' alone.
      const running = (await alpha.get('/api/promotions').query({ state: 'running' }).expect(200)).body.items as Promo[]
      for (const promotion of running) {
        await alpha.post(`/api/promotions/${promotion.id}/stop`).expect(200)
      }
      const types = (await alpha.get('/api/price-types').expect(200)).body as { id: string; kind: string }[]
      const retail = types.find((type) => type.kind === 'retail')!.id
      const product = async (name: string, amount: number) =>
        (
          await alpha
            .post('/api/products')
            .send({
              name,
              axisIds: [],
              variants: [{ valueIds: [] }],
              prices: [{ priceTypeId: retail, amount, currency: 'UZS' }],
            })
            .expect(201)
        ).body
      trousers = await product('Shim', som(120_000))
      belt = await product('Kamar', som(40_000))
      const shopId = (await alpha.get('/api/locations')).body.items[0].id
      const draft = await alpha
        .post('/api/receipts')
        .send({
          locationId: shopId,
          docDate: '2026-10-01',
          uzsRate: 12_000,
          currency: 'UZS',
          usdRate: 12_000,
          lines: [
            { variantId: trousers.variants[0].id, qty: 30, price: som(60_000) },
            { variantId: belt.variants[0].id, qty: 30, price: som(15_000) },
          ],
        })
        .expect(201)
      await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)
    })

    it('gives the cheaper of every two pieces away, and leaves an odd one out as it is', async () => {
      pair = (
        await add({
          name: '1+1',
          kind: 'pair',
          value: 100,
          startsOn: day,
          productIds: [trousers.id, belt.id],
        }).expect(201)
      ).body
      const shim = trousers.variants[0].id
      const kamar = belt.variants[0].id

      // One piece has nothing to be paired with.
      await cart([[shim, 1]], som(120_000)).expect(201)
      // Trousers and a belt: the belt is the cheaper of the two.
      const two = (
        await cart(
          [
            [shim, 1],
            [kamar, 1],
          ],
          som(120_000),
        ).expect(201)
      ).body
      expect(two).toMatchObject({ autoDiscount: som(40_000), autoReason: '1+1' })
      expect(two.lines.map((line: { promoDiscount: number }) => line.promoDiscount)).toEqual([0, som(40_000)])
      // Two pairs of trousers and a belt: the second pair of trousers is free, the belt is the odd one out.
      const three = (
        await cart(
          [
            [shim, 2],
            [kamar, 1],
          ],
          som(160_000),
        ).expect(201)
      ).body
      expect(
        three.lines.map((line: { promoDiscount: number; total: number }) => [line.promoDiscount, line.total]),
      ).toEqual([
        [som(120_000), som(120_000)],
        [0, som(40_000)],
      ])
      // The till cannot leave it out, nor give more.
      expect((await cart([[shim, 2]], som(240_000))).body.error.code).toBe('PRICE_CHANGED')
    })

    it('takes so much off every piece once enough of them are taken', async () => {
      await alpha.post(`/api/promotions/${pair.id}/stop`).expect(200)
      const refused = await add({ name: 'Uchtasi', kind: 'quantity', value: 10, startsOn: day })
      expect(refused.body.error.fields.minQty).toBeDefined()
      const three = (
        await add({
          name: 'Uchtasi arzon',
          kind: 'quantity',
          value: 10,
          minQty: 3,
          startsOn: day,
          productIds: [trousers.id, belt.id],
        }).expect(201)
      ).body
      expect(three.minQty).toBe(3)
      const shim = trousers.variants[0].id
      const kamar = belt.variants[0].id

      // Two pieces: not yet.
      await cart(
        [
          [shim, 1],
          [kamar, 1],
        ],
        som(160_000),
      ).expect(201)
      // Two pairs of trousers and a belt are three pieces: a tenth off each.
      const sale = (
        await cart(
          [
            [shim, 2],
            [kamar, 1],
          ],
          som(252_000),
        ).expect(201)
      ).body
      expect(sale).toMatchObject({ autoDiscount: som(28_000), autoReason: 'Uchtasi arzon' })
    })
  })
})
