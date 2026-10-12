import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => amount * 100

interface PriceType {
  id: string
  kind: string
  name: string
  currency: string
  roundStep: number
  roundEnding: number
  tillAccess: string
  skipsFloor: boolean
}

/**
 * A sale at another price than the retail one: wholesale, a family price.
 * The business says for each price type who may sell at it at the till.
 */
describe('Price types at the till', () => {
  let harness: Harness
  let alpha: Agent
  let cashier: Agent
  let manager: Agent

  let registerId: string
  let managerId: string
  let dress: string
  const types: Record<string, PriceType> = {}

  const PIN = '4821'
  const cash = (amount: number) => ({ method: 'cash', currency: 'UZS', amount })
  const sell = (priceTypeId: string | null, total: number, more: Record<string, unknown> = {}, agent = cashier) =>
    agent.post('/api/sales').send({
      clientKey: randomUUID(),
      registerId,
      priceTypeId,
      lines: [{ variantId: dress, qty: 1 }],
      payments: [cash(total)],
      total,
      ...more,
    })
  const setType = (type: PriceType, change: Partial<PriceType>) =>
    alpha.put(`/api/price-types/${type.id}`).send({
      name: type.name,
      roundStep: type.roundStep,
      roundEnding: type.roundEnding,
      tillAccess: type.tillAccess,
      skipsFloor: type.skipsFloor,
      ...change,
    })

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    for (const type of (await alpha.get('/api/price-types').expect(200)).body as PriceType[]) {
      types[type.name === 'Ulgurji' ? 'wholesale' : type.kind] = type
    }
    const add = async (name: string, tillAccess: string, skipsFloor = false) =>
      (
        await alpha
          .post('/api/price-types')
          .send({ name, kind: 'other', currency: 'UZS', tillAccess, skipsFloor })
          .expect(201)
      ).body as PriceType
    types.family = await add('Oila', 'approval', true)
    types.vip = await add('VIP', 'permitted')
    types.list = await add('Ro‘yxat narxi', 'none')

    const price = (type: PriceType, amount: number) => ({ priceTypeId: type.id, amount, currency: 'UZS' })
    dress = (
      await alpha
        .post('/api/products')
        .send({
          name: 'Ko‘ylak',
          axisIds: [],
          variants: [{ valueIds: [] }],
          // No VIP price: there the retail one stands.
          prices: [
            price(types.retail, som(200_000)),
            price(types.wholesale, som(170_000)),
            price(types.min, som(160_000)),
            price(types.family, som(120_000)),
          ],
        })
        .expect(201)
    ).body.variants[0].id
    const draft = await alpha
      .post('/api/receipts')
      .send({
        locationId: shopId,
        docDate: '2026-10-01',
        currency: 'UZS',
        lines: [{ variantId: dress, qty: 20, price: som(120_000) }],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id

    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    const hire = async (fullName: string, login: string, templateKey: string) => {
      const user = await alpha
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
      return { id: user.body.id as string, agent: await harness.signIn(login) }
    }
    ;({ agent: cashier } = await hire('Dilnoza Kassir', 'kassir', 'cashier'))
    ;({ id: managerId, agent: manager } = await hire('Anvar Menejer', 'menejer', 'store_manager'))
    await manager.post('/api/auth/pin').send({ password: PASSWORD, pin: PIN }).expect(204)
    await cashier
      .post('/api/shifts')
      .send({ registerId, cash: { UZS: som(500_000) } })
      .expect(201)
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('are offered only when the business says who may sell at them', async () => {
    // Out of the box the till sells at the retail price and nothing else.
    const before = (await cashier.get(`/api/pos/context/${registerId}`).expect(200)).body
    expect(before.priceTypes.map((type: { name: string }) => type.name)).toEqual(['Oila'])
    expect((await sell(types.wholesale.id, som(170_000))).body.error.fields.priceTypeId).toBeDefined()
    expect((await sell(types.list.id, som(200_000))).status).toBe(400)

    types.wholesale = (await setType(types.wholesale, { tillAccess: 'all' }).expect(200)).body
    // The retail price is the till's own; the floor is never sold at.
    const retail = await setType(types.retail, { tillAccess: 'all' })
    expect(retail.status).toBe(400)
    expect(retail.body.error.fields.tillAccess).toBeDefined()
    expect((await setType(types.min, { tillAccess: 'approval' })).status).toBe(400)

    const context = (await cashier.get(`/api/pos/context/${registerId}`).expect(200)).body
    // One for those allowed to is not shown to a cashier; one that takes a manager's word is, and says so.
    expect(context.priceTypes).toEqual([
      { id: types.wholesale.id, name: 'Ulgurji', needsWord: false },
      { id: types.family.id, name: 'Oila', needsWord: true },
    ])
    expect(context.approvers).toEqual([
      {
        id: managerId,
        name: 'Anvar Menejer',
        discount: true,
        returns: true,
        prices: true,
        debts: true,
        advances: true,
      },
    ])
    const mine = (await manager.get(`/api/pos/context/${registerId}`).expect(200)).body
    expect(mine.priceTypes.map((type: { name: string; needsWord: boolean }) => [type.name, type.needsWord])).toEqual([
      ['Ulgurji', false],
      ['Oila', false],
      ['VIP', false],
    ])
  })

  it('price the goods the till finds, the retail price standing where they have none', async () => {
    const found = async (priceTypeId?: string) =>
      (await cashier.get('/api/pos/search').query({ registerId, q: 'ko‘ylak', priceTypeId }).expect(200)).body[0]
    expect((await found()).price).toBe(som(200_000))
    expect(await found(types.wholesale.id)).toMatchObject({ price: som(170_000), minPrice: som(160_000) })
    expect((await found(types.vip.id)).price).toBe(som(200_000))
    const again = (
      await cashier
        .post('/api/pos/items')
        .send({ registerId, variantIds: [dress], priceTypeId: types.family.id })
        .expect(200)
    ).body
    expect(again[0].price).toBe(som(120_000))
  })

  it('make a sale at that price, written on the receipt', async () => {
    // The sum the retail price gives is not what a wholesale sale comes to.
    expect((await sell(types.wholesale.id, som(200_000))).body.error.code).toBe('PRICE_CHANGED')
    const sale = (await sell(types.wholesale.id, som(170_000)).expect(201)).body
    expect(sale).toMatchObject({ total: som(170_000), priceTypeName: 'Ulgurji', approvedByName: null })
    expect(sale.lines[0]).toMatchObject({ price: som(170_000), total: som(170_000) })
    expect((await sell(null, som(200_000)).expect(201)).body.priceTypeName).toBeNull()
    const listed = (await alpha.get('/api/sales').expect(200)).body.items
    expect(listed.map((item: { priceTypeName: string | null }) => item.priceTypeName)).toEqual([null, 'Ulgurji'])
    const [entry] = await harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(`SELECT summary FROM audit_log WHERE action = 'sale.create' AND entity_id = $1`, [
        sale.id,
      ])) as { summary: string }[]
    })
    expect(entry.summary).toContain('narx: Ulgurji')

    // The floor still holds at a wholesale price: 15 000 off 170 000 lands under 160 000.
    const under = await sell(types.wholesale.id, som(155_000), {
      lines: [{ variantId: dress, qty: 1, discount: som(15_000) }],
    })
    expect(under.body.error.code).toBe('BELOW_MIN_PRICE')
  })

  it("take a manager's word where the business asks for one, and may be meant to go under the floor", async () => {
    const alone = await sell(types.family.id, som(120_000))
    expect(alone.status).toBe(400)
    expect(alone.body.error.code).toBe('PRICE_TYPE_NEEDS_WORD')
    expect(alone.body.error.message).toContain('Oila')

    // 120 000 is under the floor of 160 000: a family price is meant to be.
    const sale = (await sell(types.family.id, som(120_000), { approval: { userId: managerId, pin: PIN } }).expect(201))
      .body
    expect(sale).toMatchObject({ total: som(120_000), priceTypeName: 'Oila', approvedByName: 'Anvar Menejer' })
    // Who may sell at special prices needs nobody's word.
    expect((await sell(types.family.id, som(120_000), {}, manager).expect(201)).body.approvedByName).toBeNull()
  })

  it('are refused to those not allowed, where only the allowed may', async () => {
    const refused = await sell(types.vip.id, som(200_000))
    expect(refused.status).toBe(403)
    // Nor does a manager's PIN open it: it is theirs to sell at, not to lend.
    expect((await sell(types.vip.id, som(200_000), { approval: { userId: managerId, pin: PIN } })).status).toBe(403)
    const sale = (await sell(types.vip.id, som(200_000), {}, manager).expect(201)).body
    expect(sale).toMatchObject({ total: som(200_000), priceTypeName: 'VIP' })
    // No VIP price is set for the dress and no formula says how: it went at the retail price, and says so.
    expect(sale.lines[0]).toMatchObject({ price: som(200_000), priceFrom: 'retail' })
  })

  it('work a price out by the formula where none is set, and say where each price came from', async () => {
    const found = async (priceTypeId?: string) =>
      (await manager.get('/api/pos/search').query({ registerId, q: 'ko‘ylak', priceTypeId }).expect(200)).body[0]
    expect((await found()).priceFrom).toBeNull()
    expect((await found(types.wholesale.id)).priceFrom).toBe('type')
    expect(await found(types.vip.id)).toMatchObject({ price: som(200_000), priceFrom: 'retail' })

    // VIP is a tenth under the retail price from now on.
    await setType(types.vip, { formula: { base: 'retail', percent: -10 } } as Partial<PriceType>).expect(200)
    expect(await found(types.vip.id)).toMatchObject({ price: som(180_000), priceFrom: 'formula' })
    // The sale agrees with what the till was shown, and the receipt keeps the mark.
    expect((await sell(types.vip.id, som(200_000), {}, manager)).body.error.code).toBe('PRICE_CHANGED')
    const sale = (await sell(types.vip.id, som(180_000), {}, manager).expect(201)).body
    expect(sale.lines[0]).toMatchObject({ price: som(180_000), priceFrom: 'formula' })
    expect((await alpha.get(`/api/sales/${sale.id}`).expect(200)).body.lines[0].priceFrom).toBe('formula')

    // From what the goods cost — 120 000 each — a quarter over: a cashier is shown the price, never the cost.
    await setType(types.vip, { formula: { base: 'cost', percent: 25 } } as Partial<PriceType>).expect(200)
    expect(await found(types.vip.id)).toMatchObject({ price: som(150_000), priceFrom: 'formula' })
    // A line sold at a price that was set carries no mark.
    expect((await sell(types.wholesale.id, som(170_000)).expect(201)).body.lines[0].priceFrom).toBeNull()
  })

  it('hold a thing with no minimal price of its own at what the floor’s formula makes of its cost today', async () => {
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    const scarf = (
      await alpha
        .post('/api/products')
        .send({
          name: 'Sharf',
          axisIds: [],
          variants: [{ valueIds: [] }],
          prices: [{ priceTypeId: types.retail.id, amount: som(45_000), currency: 'UZS' }],
        })
        .expect(201)
    ).body as { id: string; variants: { id: string }[] }
    const bring = async (price: number) => {
      const draft = await alpha
        .post('/api/receipts')
        .send({
          locationId: shopId,
          docDate: '2026-10-01',
          currency: 'UZS',
          lines: [{ variantId: scarf.variants[0].id, qty: 10, price }],
        })
        .expect(201)
      await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)
    }
    const floors = async () =>
      (
        (
          await cashier
            .post('/api/pos/items')
            .send({ registerId, variantIds: [scarf.variants[0].id, dress] })
            .expect(200)
        ).body as { variantId: string; minPrice: number | null }[]
      )
        .sort((a, b) => (a.variantId === dress ? 1 : 0) - (b.variantId === dress ? 1 : 0))
        .map((item) => item.minPrice)

    await bring(som(40_000))
    // Out of the box nothing says how a floor is worked out: the scarf has none, the dress keeps its own.
    expect(await floors()).toEqual([null, som(160_000)])

    // The floor is the cost itself from now on.
    await setType(types.min, { formula: { base: 'cost', percent: 0 } } as Partial<PriceType>).expect(200)
    expect(await floors()).toEqual([som(40_000), som(160_000)])
    // A receipt sets no floor: it follows what is on hand. Ten more at 46 000 bring the average to 43 000.
    await bring(som(46_000))
    expect(await floors()).toEqual([som(43_000), som(160_000)])
    const prices = (await alpha.get(`/api/products/${scarf.id}`).expect(200)).body.prices as { priceTypeId: string }[]
    expect(prices.some((price) => price.priceTypeId === types.min.id)).toBe(false)

    // Under it a cashier is stopped, and not told what the goods cost.
    const under = await sell(null, som(42_000), {
      lines: [{ variantId: scarf.variants[0].id, qty: 1, discount: som(3_000) }],
    })
    expect(under.body.error.code).toBe('BELOW_MIN_PRICE')
    expect(under.body.error.fields['lines.0.discount']).toBe('Minimal narxdan past')
    await setType(types.min, { formula: null } as Partial<PriceType>).expect(200)
  })
})
