import { randomUUID } from 'node:crypto'

import type { HoldDto, HoldSummary, PosItemDto } from '@erp/core'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)
const cash = (amount: number) => ({ method: 'cash', currency: 'UZS', amount })

/**
 * Goods set aside for a customer ("Band qilish"; YOL-XARITA, K1): promised, not moved. While a hold stands
 * nobody else is sold its goods, sent them or has them written off; taken, it becomes an ordinary sale; let go,
 * the goods are anyone's again. It moves no money.
 */
describe('Goods set aside for a customer', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let cashier: Agent
  let seller: Agent

  let shopId: string
  let registerId: string
  let scarf: string
  let coat: string
  let nodira: string
  let aziz: string
  let barred: string

  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
  const hold = (body: Record<string, unknown>, agent = cashier) =>
    agent.post('/api/holds').send({ clientKey: randomUUID(), registerId, dueDate: inDays(3), ...body })
  const made = async (body: Record<string, unknown>, agent = cashier) =>
    (await hold(body, agent).expect(201)).body as HoldDto
  const list = async (query: Record<string, unknown> = {}, agent = alpha) =>
    (
      await agent
        .get('/api/holds')
        .query({ size: 100, ...query })
        .expect(200)
    ).body as {
      items: HoldDto[]
      total: number
      summary: HoldSummary
    }
  const sell = (body: Record<string, unknown>, agent = cashier) =>
    agent.post('/api/sales').send({ clientKey: randomUUID(), registerId, ...body })
  const item = async (variantId: string, holdId?: string) =>
    (
      (
        await cashier
          .post('/api/pos/items')
          .send({ registerId, variantIds: [variantId], holdId })
          .expect(200)
      ).body as PosItemDto[]
    )[0]

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    shopId = (await alpha.get('/api/locations')).body.items[0].id
    const types = (await alpha.get('/api/price-types').expect(200)).body as { id: string; kind: string }[]
    const retail = types.find((type) => type.kind === 'retail')!.id
    const product = async (name: string, price: number) =>
      (
        await alpha
          .post('/api/products')
          .send({
            name,
            axisIds: [],
            variants: [{ valueIds: [] }],
            prices: [{ priceTypeId: retail, amount: price, currency: 'UZS' }],
          })
          .expect(201)
      ).body.variants[0].id as string
    scarf = await product('Sharf', som(75_000))
    coat = await product('Palto', som(400_000))
    const receipt = (
      await alpha
        .post('/api/receipts')
        .send({
          locationId: shopId,
          docDate: '2026-10-01',
          currency: 'UZS',
          lines: [
            { variantId: scarf, qty: 5, price: som(30_000) },
            { variantId: coat, qty: 1, price: som(200_000) },
          ],
        })
        .expect(201)
    ).body
    await alpha.post(`/api/receipts/${receipt.id}/post`).expect(201)

    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    const user = async (login: string, templateKey: string) => {
      await alpha
        .post('/api/users')
        .send({
          fullName: login,
          login,
          password: PASSWORD,
          roleIds: [roles.find((role) => role.templateKey === templateKey)!.id],
          allLocations: false,
          locationIds: [shopId],
        })
        .expect(201)
      return harness.signIn(login)
    }
    cashier = await user('kassir', 'cashier')
    seller = await user('sotuvchi', 'seller')
    await cashier
      .post('/api/shifts')
      .send({ registerId, cash: { UZS: 0 } })
      .expect(201)

    const customer = async (body: Record<string, unknown>) =>
      (await alpha.post('/api/customers').send(body).expect(201)).body.id as string
    nodira = await customer({ name: 'Nodira Karimova', phone: '90 123 45 67' })
    aziz = await customer({ name: 'Aziz' })
    const group = (await alpha.post('/api/customers/groups').send({ name: 'Ishonchsiz', noLayaway: true }).expect(201))
      .body
    barred = await customer({ name: 'Sardor', groupIds: [group.id] })
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  let held: HoldDto

  it('are promised to them until a day, with what they sold for that day written down', async () => {
    const key = randomUUID()
    held = await made({
      clientKey: key,
      customerId: nodira,
      lines: [{ variantId: scarf, qty: 2 }],
      note: 'Ertaga keladi',
    })
    expect(held).toMatchObject({
      number: 'BQ-000001',
      status: 'active',
      locationId: shopId,
      customerId: nodira,
      customerName: 'Nodira Karimova',
      customerPhone: '+998901234567',
      dueDate: inDays(3),
      overdue: false,
      note: 'Ertaga keladi',
      total: som(150_000),
      qty: 2,
      saleId: null,
      createdByName: 'kassir',
      closedAt: null,
    })
    expect(held.lines).toEqual([
      expect.objectContaining({ variantId: scarf, name: 'Sharf', qty: 2, price: som(75_000) }),
    ])
    // Sent again by a till that did not hear back, it is the same hold.
    expect((await made({ clientKey: key, customerId: nodira, lines: [{ variantId: scarf, qty: 2 }] })).id).toBe(held.id)
    const listed = await list()
    expect(listed).toMatchObject({ total: 1, summary: { active: 1, overdue: 0 } })
    expect(listed.items[0].id).toBe(held.id)
    expect((await alpha.get(`/api/holds/${held.id}`).expect(200)).body.number).toBe('BQ-000001')
  })

  it('are nobody else’s meanwhile: not to buy, and not to have set aside', async () => {
    // Five came in, two are promised: the till has three to sell.
    expect((await item(scarf)).onHand).toBe(3)
    const greedy = await sell({
      lines: [{ variantId: scarf, qty: 4 }],
      total: som(300_000),
      payments: [cash(som(300_000))],
    })
    expect(greedy.status).toBe(400)
    expect(greedy.body.error.fields['lines.0.qty']).toBe('«Sharf»: qoldiq yetarli emas (bor 3, band qilingan 2)')
    await sell({ lines: [{ variantId: scarf, qty: 2 }], total: som(150_000), payments: [cash(som(150_000))] }).expect(
      201,
    )
    expect((await item(scarf)).onHand).toBe(1)
    // The shop's count is what is on its shelves, and says how much of that is promised.
    const counted = (await alpha.get('/api/stock').query({ q: 'Sharf' }).expect(200)).body.items[0]
    expect(counted).toMatchObject({ qty: 3, held: 2 })

    const second = await hold({ customerId: aziz, lines: [{ variantId: scarf, qty: 2 }] })
    expect(second.status).toBe(400)
    expect(second.body.error.fields['lines.0.qty']).toBe('«Sharf»: qoldiq yetarli emas (bor 1, band qilingan 2)')
    // Nor are they to be written off from under the customer.
    const draft = await alpha
      .post('/api/stock-documents')
      .send({
        kind: 'writeoff',
        locationId: shopId,
        docDate: '2026-10-05',
        reason: 'defect',
        lines: [{ variantId: scarf, qty: 2 }],
      })
      .expect(201)
    const refused = await alpha.post(`/api/stock-documents/${draft.body.id}/post`)
    expect(refused.status).toBe(400)
    expect(JSON.stringify(refused.body.error.fields)).toContain('Qoldiq yetarli emas: bor 1')
  })

  it('are refused where the day is past, the customer unknown, or their group not to have goods held', async () => {
    const line = [{ variantId: coat, qty: 1 }]
    expect((await hold({ customerId: aziz, lines: line, dueDate: inDays(-2) })).body.error.fields).toEqual({
      dueDate: 'Muddat o‘tgan kun bo‘lmaydi',
    })
    expect((await hold({ customerId: randomUUID(), lines: line })).body.error.fields).toEqual({
      customerId: 'Mijoz topilmadi',
    })
    const banned = await hold({ customerId: barred, lines: line })
    expect(banned.status).toBe(403)
    expect(banned.body.error.code).toBe('NO_HOLD')
    // Whoever is trusted to lend may give that word.
    const allowed = await made({ customerId: barred, lines: line }, alpha)
    await alpha.post(`/api/holds/${allowed.id}/release`).expect(200)
    // Someone who does not sell sets nothing aside, and sees none of it.
    await hold({ customerId: aziz, lines: line }, seller).expect(403)
    await seller.get('/api/holds').expect(403)
  })

  it('stand past their day until someone decides, and may be given longer', async () => {
    await harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      await em.query(`UPDATE holds SET due_date = current_date - 2 WHERE id = $1`, [held.id])
    })
    const late = await list({ state: 'overdue' })
    expect(late).toMatchObject({ total: 1, summary: { active: 1, overdue: 1 } })
    expect(late.items[0]).toMatchObject({ id: held.id, overdue: true, status: 'active' })
    // The goods are still behind the counter, whatever the calendar says: nothing lets them go by itself.
    expect((await item(scarf)).onHand).toBe(1)

    const longer = (
      await cashier
        .put(`/api/holds/${held.id}/due`)
        .send({ dueDate: inDays(5) })
        .expect(200)
    ).body as HoldDto
    expect(longer).toMatchObject({ dueDate: inDays(5), overdue: false })
    expect((await list({ state: 'overdue' })).total).toBe(0)
    await cashier
      .put(`/api/holds/${held.id}/due`)
      .send({ dueDate: inDays(-1) })
      .expect(400)
  })

  it('are the customer’s to buy when they come: the hold becomes that sale', async () => {
    // To the cart that takes the hold its goods are there to be sold.
    expect((await item(scarf, held.id)).onHand).toBe(3)
    const wrong = await sell({
      customerId: aziz,
      holdId: held.id,
      lines: [{ variantId: scarf, qty: 2 }],
      total: som(150_000),
      payments: [cash(som(150_000))],
    })
    expect(wrong.body.error.fields).toEqual({ holdId: 'BQ-000001 boshqa mijoz uchun band qilingan: Nodira Karimova' })

    const sale = (
      await sell({
        customerId: nodira,
        holdId: held.id,
        lines: [{ variantId: scarf, qty: 2 }],
        total: som(150_000),
        payments: [cash(som(150_000))],
      }).expect(201)
    ).body
    const taken = (await alpha.get(`/api/holds/${held.id}`).expect(200)).body as HoldDto
    expect(taken).toMatchObject({ status: 'taken', saleId: sale.id, saleNumber: sale.number, closedByName: 'kassir' })
    expect((await list()).summary).toEqual({ active: 0, overdue: 0 })
    expect((await list({ state: 'taken' })).items.map((row) => row.id)).toEqual([held.id])
    expect((await item(scarf)).onHand).toBe(1)
    // It is over: it is not taken twice, moved or let go.
    const again = await sell({
      customerId: nodira,
      holdId: held.id,
      lines: [{ variantId: scarf, qty: 1 }],
      total: som(75_000),
      payments: [cash(som(75_000))],
    })
    expect(again.body.error.fields.holdId).toContain('yopilgan')
    expect((await cashier.post(`/api/holds/${held.id}/release`)).body.error.code).toBe('HOLD_CLOSED')
    expect((await cashier.put(`/api/holds/${held.id}/due`).send({ dueDate: inDays(9) })).body.error.code).toBe(
      'HOLD_CLOSED',
    )
  })

  it('are anyone’s again when let go, and what a customer leaves behind of a hold is free with the sale', async () => {
    const both = await made({
      customerId: aziz,
      lines: [
        { variantId: scarf, qty: 1 },
        { variantId: coat, qty: 1 },
      ],
    })
    expect(both.total).toBe(som(475_000))
    expect((await item(coat)).onHand).toBe(0)
    // He takes the coat and leaves the scarf: the hold is over all the same.
    await sell({
      customerId: aziz,
      holdId: both.id,
      lines: [{ variantId: coat, qty: 1 }],
      total: som(400_000),
      payments: [cash(som(400_000))],
    }).expect(201)
    expect((await item(scarf)).onHand).toBe(1)

    const last = await made({ customerId: nodira, lines: [{ variantId: scarf, qty: 1 }] })
    expect((await item(scarf)).onHand).toBe(0)
    const freed = (await cashier.post(`/api/holds/${last.id}/release`).expect(200)).body as HoldDto
    expect(freed).toMatchObject({ status: 'released', closedByName: 'kassir' })
    expect((await item(scarf)).onHand).toBe(1)
    await sell({ lines: [{ variantId: scarf, qty: 1 }], total: som(75_000), payments: [cash(som(75_000))] }).expect(201)
  })

  it('are one business’s own, looked for by number, name or telephone', async () => {
    expect(await list({ state: 'all' }, beta)).toMatchObject({ total: 0, summary: { active: 0, overdue: 0 } })
    await beta.get(`/api/holds/${held.id}`).expect(404)
    await beta.post(`/api/holds/${held.id}/release`).expect(404)

    const all = await list({ state: 'all' })
    expect(all.total).toBe(4)
    expect((await list({ state: 'all', q: 'nodira' })).items.map((row) => row.customerName)).toEqual([
      'Nodira Karimova',
      'Nodira Karimova',
    ])
    expect((await list({ state: 'all', q: '4567' })).total).toBe(2)
    expect((await list({ state: 'all', q: 'BQ-000003' })).items.map((row) => row.customerName)).toEqual(['Aziz'])
    expect((await list({ state: 'released' })).total).toBe(2)
    expect((await list({ state: 'all', customerId: aziz })).total).toBe(1)
  })
})
