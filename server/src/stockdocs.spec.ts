import { RealtimeService } from './modules/realtime/realtime.service'
import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

interface StockRow {
  qty: number
  costUzs: number | null
  byLocation: Record<string, number>
}

const usd = (dollars: number) => Math.round(dollars * 100)
/** Goods come in dollars at 12 000 so'm: what so many dollars cost in the base. */
const inSom = (dollars: number) => usd(dollars) * 12_000

/**
 * Transfers, write-offs and counts: goods leave oldest batch first, a
 * transfer delivers what it collected, and whatever is undone comes back as
 * it left.
 */
describe('Stock documents', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent

  let events: jest.SpyInstance

  let shopId: string
  let depotId: string
  let shirt: string
  let scarf: string

  const receive = async (variantId: string, qty: number, price: number, docDate: string) => {
    const draft = await alpha
      .post('/api/receipts')
      .send({
        locationId: shopId,
        docDate,
        currency: 'USD',
        rate: 12_000,
        lines: [{ variantId, qty, price }],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)
    return draft.body.id as string
  }

  const stock = async (agent = alpha): Promise<StockRow> =>
    (await agent.get('/api/stock').query({ q: 'futbolka', presence: 'all' }).expect(200)).body.items[0]

  const doc = (kind: string, lines: { variantId: string; qty: number }[], extra: Record<string, unknown> = {}) => ({
    kind,
    locationId: shopId,
    docDate: '2026-10-05',
    lines,
    ...extra,
  })

  const user = async (login: string, templateKey: string, locationIds: string[]) => {
    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    await alpha
      .post('/api/users')
      .send({
        fullName: login,
        login,
        password: PASSWORD,
        roleIds: [roles.find((role) => role.templateKey === templateKey)!.id],
        allLocations: false,
        locationIds,
      })
      .expect(201)
    return harness.signIn(login)
  }

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    events = jest.spyOn(harness.app.get(RealtimeService), 'event')
    shopId = (await alpha.get('/api/locations')).body.items[0].id
    depotId = (await alpha.post('/api/locations').send({ name: 'Depot', kind: 'warehouse' }).expect(201)).body.id

    const product = async (name: string) =>
      (
        await alpha
          .post('/api/products')
          .send({ name, axisIds: [], variants: [{ valueIds: [] }] })
          .expect(201)
      ).body.variants[0].id as string
    shirt = await product('Futbolka')
    scarf = await product('Sharf')

    // Two batches of the same thing at different costs: ten at 3 dollars, then ten at 5.
    await receive(shirt, 10, usd(3), '2026-09-01')
    await receive(shirt, 10, usd(5), '2026-10-01')
  })

  afterAll(async () => {
    await harness.close()
  })

  describe('a transfer', () => {
    let transferId: string
    let transitId: string

    it('refuses to send more than is on hand, and says how much there is', async () => {
      const draft = await alpha
        .post('/api/stock-documents')
        .send(doc('transfer', [{ variantId: shirt, qty: 25 }], { toLocationId: depotId }))
        .expect(201)
      expect(draft.body).toMatchObject({ number: 'KO-000001', status: 'draft', qty: 25 })
      expect(draft.body.onHand[shirt]).toBe(20)

      const refused = await alpha.post(`/api/stock-documents/${draft.body.id}/send`).expect(400)
      expect(refused.body.error.fields['lines.0.qty']).toBe('Qoldiq yetarli emas: bor 20, kerak 25')
      await alpha.delete(`/api/stock-documents/${draft.body.id}`).expect(204)
    })

    it('needs somewhere else to go', async () => {
      const same = await alpha
        .post('/api/stock-documents')
        .send(doc('transfer', [{ variantId: shirt, qty: 1 }], { toLocationId: shopId }))
      expect(same.status).toBe(400)
      expect(same.body.error.fields.toLocationId).toBeDefined()
    })

    it('takes the oldest goods first and holds them on the way', async () => {
      transferId = (
        await alpha
          .post('/api/stock-documents')
          .send(doc('transfer', [{ variantId: shirt, qty: 12 }], { toLocationId: depotId }))
          .expect(201)
      ).body.id
      const sent = await alpha.post(`/api/stock-documents/${transferId}/send`).expect(201)
      // Ten at 3 dollars and two at 5.
      expect(sent.body).toMatchObject({ status: 'sent', costUzs: usd(40) * 12_000 })
      // The depot hears that goods are on their way to it.
      expect(events.mock.calls.filter((call) => call[1] === 'goods.sent').map((call) => call[2])).toEqual([
        {
          id: transferId,
          number: sent.body.number,
          fromName: sent.body.locationName,
          toName: 'Depot',
          toLocationId: depotId,
          sentBy: expect.any(String),
        },
      ])

      const places = (await alpha.get('/api/stock/locations')).body as { id: string; isTransit: boolean }[]
      transitId = places.find((place) => place.isTransit)!.id
      expect(places[places.length - 1].id).toBe(transitId)

      const now = await stock()
      expect(now).toMatchObject({ qty: 20, costUzs: inSom(80), byLocation: { [shopId]: 8, [transitId]: 12 } })

      // The place for goods on the way is the ledger's own: it is not among the places people work with.
      const listed = (await alpha.get('/api/locations').query({ status: 'all' })).body.items as { id: string }[]
      expect(listed.map((place) => place.id)).not.toContain(transitId)
    })

    it('lets a late bill find goods that are on the way', async () => {
      // Twenty more dollars on the second receipt: two dollars a piece, eight on the shelf and two on the road.
      const receipts = (await alpha.get('/api/receipts').query({ sort: 'docDate', order: 'desc' })).body.items
      await alpha
        .put(`/api/receipts/${receipts[0].id}/expenses`)
        .send({ expenses: [{ name: 'Kargo', amount: usd(20), currency: 'USD', basis: 'quantity' }] })
        .expect(200)
      expect((await stock()).costUzs).toBe(inSom(100))
    })

    it('is received by the place it goes to, short of what was lost on the way', async () => {
      const keeper = await user('depo', 'warehouse', [depotId])
      const clerk = await user('dokon', 'warehouse', [shopId])

      // Each sees it; only the destination receives it.
      await clerk.get(`/api/stock-documents/${transferId}`).expect(200)
      await clerk.post(`/api/stock-documents/${transferId}/receive`).send({}).expect(403)

      const lineId = (await keeper.get(`/api/stock-documents/${transferId}`)).body.lines[0].id
      await keeper
        .post(`/api/stock-documents/${transferId}/receive`)
        .send({ lines: [{ lineId, receivedQty: 13 }] })
        .expect(400)
      const received = await keeper
        .post(`/api/stock-documents/${transferId}/receive`)
        .send({ lines: [{ lineId, receivedQty: 11 }] })
        .expect(201)
      expect(received.body).toMatchObject({ status: 'posted', diffQty: 1 })
      expect(received.body.lines[0]).toMatchObject({ qty: 12, receivedQty: 11 })

      // Eleven arrived: ten at 3 dollars and one at 7 (5 plus the late 2). The one that did not was worth 7.
      const now = await stock()
      expect(now.byLocation).toEqual({ [shopId]: 8, [depotId]: 11 })
      expect(now.costUzs).toBe(inSom(8 * 7 + 30 + 7))
      await keeper.post(`/api/stock-documents/${transferId}/receive`).send({}).expect(409)
    })

    it('comes back whole when it is cancelled on the way', async () => {
      const before = await stock()
      const again = await alpha
        .post('/api/stock-documents')
        .send(doc('transfer', [{ variantId: shirt, qty: 3 }], { toLocationId: depotId }))
        .expect(201)
      await alpha.post(`/api/stock-documents/${again.body.id}/send`).expect(201)
      expect((await stock()).byLocation[transitId]).toBe(3)

      const cancelled = await alpha.post(`/api/stock-documents/${again.body.id}/cancel`).expect(201)
      expect(cancelled.body.status).toBe('cancelled')
      expect(await stock()).toEqual(before)
    })
  })

  describe('a write-off', () => {
    it('needs a reason, and someone with the right to approve it', async () => {
      await alpha
        .post('/api/stock-documents')
        .send(doc('writeoff', [{ variantId: shirt, qty: 1 }]))
        .expect(400)

      const clerk = await harness.signIn('dokon')
      const draft = await clerk
        .post('/api/stock-documents')
        .send(doc('writeoff', [{ variantId: shirt, qty: 2 }], { reason: 'defect' }))
        .expect(201)
      expect(draft.body.number).toBe('HC-000001')
      await clerk.post(`/api/stock-documents/${draft.body.id}/post`).expect(403)

      const before = await stock()
      const posted = await alpha.post(`/api/stock-documents/${draft.body.id}/post`).expect(201)
      // Two of the eight left in the shop, each worth 7 dollars.
      expect(posted.body).toMatchObject({ status: 'posted', costUzs: inSom(14) })
      expect(await stock()).toMatchObject({ qty: before.qty - 2, costUzs: (before.costUzs as number) - inSom(14) })

      // Cancelling puts the same pieces back at what they cost.
      await alpha.post(`/api/stock-documents/${draft.body.id}/cancel`).expect(201)
      expect(await stock()).toEqual(before)
    })
  })

  describe('a count', () => {
    it('hides what the books say from the one who counts', async () => {
      const clerk = await harness.signIn('dokon')
      const draft = await clerk
        .post('/api/stock-documents')
        .send(doc('count', [{ variantId: shirt, qty: 6 }]))
        .expect(201)
      expect(draft.body.onHand).toEqual({})
      expect((await alpha.get(`/api/stock-documents/${draft.body.id}`)).body.onHand).toEqual({ [shirt]: 8 })
      await clerk.delete(`/api/stock-documents/${draft.body.id}`).expect(204)
    })

    it('takes a shortage off the books and brings a surplus onto them', async () => {
      // The shop holds 8 shirts and no scarves. The count finds 6 shirts and 3 scarves.
      const draft = await alpha
        .post('/api/stock-documents')
        .send(
          doc('count', [
            { variantId: shirt, qty: 6 },
            { variantId: scarf, qty: 3 },
          ]),
        )
        .expect(201)
      const posted = await alpha.post(`/api/stock-documents/${draft.body.id}/post`).expect(201)
      expect(posted.body).toMatchObject({ status: 'posted', diffQty: 1 })
      expect(
        posted.body.lines.map((line: { qty: number; expectedQty: number }) => [line.qty, line.expectedQty]),
      ).toEqual([
        [6, 8],
        [3, 0],
      ])
      expect((await stock()).byLocation[shopId]).toBe(6)
      const scarves = (await alpha.get('/api/stock').query({ q: 'sharf' })).body.items[0]
      // Never received, so nothing is known of its cost: it comes in at zero.
      expect(scarves).toMatchObject({ qty: 3, costUzs: 0 })
      await alpha.post(`/api/stock-documents/${draft.body.id}/cancel`).expect(409)
    })

    it('counts what nobody counted as missing, when the count is a full one', async () => {
      const draft = await alpha
        .post('/api/stock-documents')
        .send(doc('count', [{ variantId: shirt, qty: 6 }], { fullCount: true }))
        .expect(201)
      const posted = await alpha.post(`/api/stock-documents/${draft.body.id}/post`).expect(201)
      // The three scarves the last count found were not counted this time.
      expect(posted.body.diffQty).toBe(-3)
      expect(posted.body.lines).toHaveLength(2)
      expect((await alpha.get('/api/stock').query({ q: 'sharf' })).body.total).toBe(0)
    })
  })

  describe('the ledger', () => {
    it('adds up to the balances, movement by movement', async () => {
      const totals = await harness.dataSource.transaction(async (em) => {
        await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
        const [moved] = await em.query(
          `SELECT coalesce(sum(qty) FILTER (WHERE location_id IS NOT NULL), 0)::float8 AS qty,
                  coalesce(sum(cost_uzs) FILTER (WHERE location_id IS NOT NULL), 0)::float8 AS cost
           FROM stock_movements`,
        )
        const [held] = await em.query(
          `SELECT coalesce(sum(qty), 0)::float8 AS qty, coalesce(sum(cost_uzs), 0)::float8 AS cost FROM stock_balances`,
        )
        return { moved, held }
      })
      expect(totals.moved).toEqual(totals.held)
      expect(totals.held.qty).toBe(17)
    })
  })

  describe('rights and isolation', () => {
    it('keeps documents inside their business and away from those without the right', async () => {
      expect((await beta.get('/api/stock-documents').query({ kind: 'transfer' })).body.total).toBe(0)
      const mine = (await alpha.get('/api/stock-documents').query({ kind: 'transfer' })).body.items[0]
      await beta.get(`/api/stock-documents/${mine.id}`).expect(404)
      await beta.post(`/api/stock-documents/${mine.id}/cancel`).expect(404)

      const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
      const cashier = roles.find((role) => role.templateKey === 'cashier')!.id
      await alpha
        .post('/api/users')
        .send({
          fullName: 'Kassir',
          login: 'kassir3',
          password: PASSWORD,
          roleIds: [cashier],
          allLocations: true,
          locationIds: [],
        })
        .expect(201)
      const agent = await harness.signIn('kassir3')
      await agent.get('/api/stock-documents').query({ kind: 'transfer' }).expect(403)
      await agent
        .post('/api/stock-documents')
        .send(doc('writeoff', [{ variantId: shirt, qty: 1 }], { reason: 'loss' }))
        .expect(403)
    })

    it('shows a person only the documents of the places they work in', async () => {
      const keeper = await harness.signIn('depo')
      const visible = (await keeper.get('/api/stock-documents').query({ kind: 'transfer' })).body.items
      expect(visible.length).toBeGreaterThan(0)
      expect((await keeper.get('/api/stock-documents').query({ kind: 'count' })).body.total).toBe(0)
      // And lets them make documents only where they work.
      await keeper
        .post('/api/stock-documents')
        .send(doc('count', [{ variantId: shirt, qty: 1 }]))
        .expect(400)
    })
  })
})
