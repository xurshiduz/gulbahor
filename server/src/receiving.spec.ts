import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

interface Named {
  id: string
  name: string
}

interface AttributeRow extends Named {
  kind: string
  values: Named[]
}

interface VariantRow {
  id: string
  valueIds: string[]
}

const usd = (dollars: number) => Math.round(dollars * 100)

/**
 * Receiving goods: what a receipt costs, what it puts on hand, and how a bill
 * that arrives late finds the goods it belongs to.
 */
describe('Receiving', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent

  let shopId: string
  let supplierId: string
  let tshirt: { id: string; variants: VariantRow[] }
  let jeans: { id: string; variants: VariantRow[] }
  let coat: { id: string; variants: VariantRow[] }

  /** The cargo from China worked through in docs/REJA.md, section 9. */
  const cargo = () => ({
    locationId: shopId,
    supplierId,
    docDate: '2026-10-01',
    currency: 'USD',
    usdRate: 1,
    uzsRate: 12_800,
    lines: [
      { variantId: tshirt.variants[0].id, qty: 300, price: usd(3), retailPrice: 90_000_00 },
      { variantId: tshirt.variants[1].id, qty: 200, price: usd(3), retailPrice: 90_000_00 },
      { variantId: jeans.variants[0].id, qty: 300, price: usd(8) },
      { variantId: coat.variants[0].id, qty: 100, price: usd(25) },
    ],
    expenses: [
      { name: 'Kargo', amount: usd(1000), currency: 'USD', basis: 'weight', isEstimate: true },
      { name: 'Boj', amount: usd(640), currency: 'USD', basis: 'value' },
      { name: 'Broker', amount: usd(64), currency: 'USD', basis: 'value' },
    ],
  })

  const stockOf = async (agent: Agent, productId: string) =>
    (await agent.get(`/api/stock/products/${productId}`).expect(200)).body as {
      variants: { variantId: string; qty: number; costUsd: number | null; byLocation: Record<string, number> }[]
    }

  const ledger = (documentId: string) =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return em.query(
        `SELECT kind, location_id, qty::float8 AS qty, cost_usd::float8 AS cost_usd FROM stock_movements WHERE document_id = $1 ORDER BY id`,
        [documentId],
      ) as Promise<{ kind: string; location_id: string | null; qty: number; cost_usd: number }[]>
    })

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)

    shopId = (await alpha.get('/api/locations')).body.items[0].id
    supplierId = (await alpha.post('/api/partners').send({ name: 'Guangzhou Textile', isSupplier: true }).expect(201))
      .body.id

    const attributes = (await alpha.get('/api/attributes')).body as AttributeRow[]
    const color = attributes.find((attribute) => attribute.kind === 'color')!
    const size = attributes.find((attribute) => attribute.name === "O'lcham (harfli)")!
    const value = (attribute: AttributeRow, name: string) => attribute.values.find((item) => item.name === name)!.id
    const model = async (name: string, weightG: number, sizes: string[]) =>
      (
        await alpha
          .post('/api/products')
          .send({
            name,
            weightG,
            axisIds: [color.id, size.id],
            variants: sizes.map((item) => ({ valueIds: [value(color, 'Qora'), value(size, item)] })),
          })
          .expect(201)
      ).body

    tshirt = await model('Futbolka', 200, ['S', 'M'])
    jeans = await model('Jinsi', 600, ['M'])
    coat = await model('Kurtka', 2200, ['L'])
  })

  afterAll(async () => {
    await harness.close()
  })

  describe('a draft', () => {
    it('is numbered, totalled as it is saved, and puts nothing on hand', async () => {
      const draft = await alpha.post('/api/receipts').send(cargo()).expect(201)
      expect(draft.body.number).toBe('K-000001')
      expect(draft.body.status).toBe('draft')
      expect(draft.body.totals).toMatchObject({ qty: 900, goods: usd(6400), costUsd: usd(8104) })
      expect(draft.body.products.map((product: Named) => product.name)).toEqual(['Futbolka', 'Jinsi', 'Kurtka'])
      expect(draft.body.lines[0].costUsd).toBeNull()

      expect((await stockOf(alpha, tshirt.id)).variants.every((variant) => variant.qty === 0)).toBe(true)

      const list = await alpha.get('/api/receipts').query({ q: 'guangzhou' }).expect(200)
      expect(list.body.items).toHaveLength(1)
      expect(list.body.items[0]).toMatchObject({ supplierName: 'Guangzhou Textile', hasEstimates: true })

      await alpha.delete(`/api/receipts/${draft.body.id}`).expect(204)
      expect((await alpha.get('/api/receipts')).body.total).toBe(0)
    })

    it('refuses goods, suppliers and places it does not know', async () => {
      const unknown = '00000000-0000-4000-8000-000000000001'
      const bad = await alpha.post('/api/receipts').send({
        ...cargo(),
        locationId: unknown,
        supplierId: unknown,
        lines: [{ variantId: unknown, qty: 1, price: 1 }],
      })
      expect(bad.status).toBe(400)
      expect(Object.keys(bad.body.error.fields).sort()).toEqual(['lines.0.variantId', 'locationId', 'supplierId'])

      await alpha
        .post('/api/receipts')
        .send({ ...cargo(), lines: [] })
        .expect(201)
      const empty = (await alpha.get('/api/receipts')).body.items[0]
      await alpha.post(`/api/receipts/${empty.id}/post`).expect(400)
      await alpha.delete(`/api/receipts/${empty.id}`).expect(204)
    })
  })

  describe('posting', () => {
    let receiptId: string

    it('puts each line on hand at its landed cost, to the cent', async () => {
      receiptId = (await alpha.post('/api/receipts').send(cargo()).expect(201)).body.id
      const posted = await alpha.post(`/api/receipts/${receiptId}/post`).expect(201)
      expect(posted.body.status).toBe('posted')
      expect(posted.body.totals).toMatchObject({ costUsd: usd(8104), costUzs: usd(8104) * 12_800 })

      // 500 T-shirts cost 1865 dollars together; the two sizes share it 300 : 200.
      const [small, medium, denim, parka] = posted.body.lines.map((line: { costUsd: number }) => line.costUsd)
      expect(small + medium).toBe(usd(1865))
      expect([small, medium]).toEqual([usd(1119), usd(746)])
      expect([denim, parka]).toEqual([usd(3024), usd(3215)])

      const stock = await stockOf(alpha, tshirt.id)
      expect(stock.variants.map((variant) => [variant.qty, variant.costUsd])).toEqual([
        [300, usd(1119)],
        [200, usd(746)],
      ])
      expect(stock.variants[0].byLocation).toEqual({ [shopId]: 300 })

      const list = await alpha.get('/api/stock').query({ q: 'futbolka' }).expect(200)
      expect(list.body.items[0]).toMatchObject({ qty: 500, costUsd: usd(1865), byLocation: { [shopId]: 500 } })
      expect((await alpha.get('/api/stock').query({ presence: 'out' })).body.total).toBe(0)
    })

    it('sets the selling prices written on its lines', async () => {
      const product = (await alpha.get(`/api/products/${tshirt.id}`)).body
      expect(product.prices).toHaveLength(1)
      expect(product.prices[0]).toMatchObject({ amount: 90_000_00, currency: 'UZS' })
      expect((await alpha.get(`/api/products/${jeans.id}`)).body.prices).toEqual([])
    })

    it('cannot be edited, posted twice or deleted once posted', async () => {
      await alpha.put(`/api/receipts/${receiptId}`).send(cargo()).expect(409)
      await alpha.post(`/api/receipts/${receiptId}/post`).expect(409)
      await alpha.delete(`/api/receipts/${receiptId}`).expect(409)
    })

    it('shares a late bill over the goods where they now are', async () => {
      // The cargo estimate of 1000 dollars turns out to be 1090.
      const revised = await alpha
        .put(`/api/receipts/${receiptId}/expenses`)
        .send({
          expenses: [
            { name: 'Kargo', amount: usd(1090), currency: 'USD', basis: 'weight' },
            { name: 'Boj', amount: usd(640), currency: 'USD', basis: 'value' },
            { name: 'Broker', amount: usd(64), currency: 'USD', basis: 'value' },
          ],
        })
        .expect(200)
      expect(revised.body.totals.costUsd).toBe(usd(8194))

      const stock = await alpha.get('/api/stock').expect(200)
      const total = stock.body.items.reduce((sum: number, item: { costUsd: number }) => sum + item.costUsd, 0)
      expect(total).toBe(usd(8194))
      expect((await alpha.get('/api/receipts')).body.items[0].hasEstimates).toBe(false)

      // The ledger holds the receipt and the revaluation; together they are the balance.
      const rows = await ledger(receiptId)
      expect(rows.filter((row) => row.kind === 'receipt')).toHaveLength(4)
      expect(rows.filter((row) => row.kind === 'revalue').every((row) => row.qty === 0)).toBe(true)
      expect(rows.reduce((sum, row) => sum + row.cost_usd, 0)).toBe(usd(8194))
    })

    it('is cancelled while its goods are untouched, and comes back as a draft copy', async () => {
      const cancelled = await alpha.post(`/api/receipts/${receiptId}/cancel`).expect(201)
      expect(cancelled.body.status).toBe('cancelled')
      expect((await alpha.get('/api/stock')).body.total).toBe(0)
      expect((await ledger(receiptId)).reduce((sum, row) => sum + row.cost_usd, 0)).toBe(0)
      await alpha.post(`/api/receipts/${receiptId}/cancel`).expect(409)

      const copy = await alpha.post(`/api/receipts/${receiptId}/copy`).expect(201)
      expect(copy.body).toMatchObject({ status: 'draft', number: 'K-000004' })
      expect(copy.body.lines).toHaveLength(4)
      expect(copy.body.expenses.map((expense: { amount: number }) => expense.amount)).toEqual([
        usd(1090),
        usd(640),
        usd(64),
      ])
    })

    it('never lets the ledger be rewritten', async () => {
      await expect(
        harness.dataSource.transaction(async (em) => {
          await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
          await em.query(`UPDATE stock_movements SET qty = 0`)
        }),
      ).rejects.toThrow(/append-only/)
    })
  })

  describe('currencies', () => {
    it('costs a yuan purchase in dollars and so’m, with expenses in any of the three', async () => {
      const draft = await alpha
        .post('/api/receipts')
        .send({
          locationId: shopId,
          docDate: '2026-10-02',
          currency: 'CNY',
          usdRate: 7.1,
          uzsRate: 12_800,
          extraCurrency: 'UZS',
          lines: [{ variantId: jeans.variants[0].id, qty: 10, price: 71_00, extra: 6_400_00 }],
          expenses: [
            { name: 'Kargo', amount: 142_00, currency: 'CNY', basis: 'quantity' },
            { name: 'Yetkazish', amount: 128_000_00, currency: 'UZS', basis: 'quantity' },
          ],
        })
        .expect(201)
      // Goods 710 yuan = 100 dollars; extras 10 × 6 400 so'm = 5 dollars; freight 142 yuan = 20; delivery 128 000 so'm = 10.
      expect(draft.body.totals).toMatchObject({
        goods: 710_00,
        goodsUsd: usd(100),
        expensesUsd: usd(35),
        costUsd: usd(135),
        costUzs: 1_728_000_00,
      })
      await alpha
        .post('/api/receipts')
        .send({
          ...cargo(),
          currency: 'CNY',
          usdRate: 7.1,
          expenses: [{ name: 'X', amount: 1, currency: 'TRY', basis: 'value' }],
        })
        .expect(400)
    })
  })

  describe('rights and isolation', () => {
    it('keeps receipts, stock and suppliers inside their business', async () => {
      expect((await beta.get('/api/receipts')).body.total).toBe(0)
      expect((await beta.get('/api/partners')).body.total).toBe(0)
      expect((await beta.get('/api/stock').query({ presence: 'all' })).body.total).toBe(0)
      const mine = (await alpha.get('/api/receipts')).body.items[0]
      await beta.get(`/api/receipts/${mine.id}`).expect(404)
      await beta.post(`/api/receipts/${mine.id}/post`).expect(404)

      const betaShop = (await beta.get('/api/locations')).body.items[0].id
      await beta
        .post('/api/receipts')
        .send({ ...cargo(), locationId: betaShop })
        .expect(400)
    })

    it('shows quantities to a cashier but not what the goods cost', async () => {
      const draft = (await alpha.post('/api/receipts').send(cargo()).expect(201)).body
      await alpha.post(`/api/receipts/${draft.id}/post`).expect(201)

      const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
      const role = (key: string) => roles.find((item) => item.templateKey === key)!.id
      const base = { password: PASSWORD, allLocations: true, locationIds: [] }
      await alpha.post('/api/users').send({ ...base, fullName: 'Kassir', login: 'kassir2', roleIds: [role('cashier')] })
      await alpha.post('/api/users').send({ ...base, fullName: 'Sklad', login: 'sklad2', roleIds: [role('warehouse')] })

      const cashier = await harness.signIn('kassir2')
      const seen = (await cashier.get('/api/stock').expect(200)).body.items[0]
      expect(seen.qty).toBeGreaterThan(0)
      expect(seen.costUsd).toBeNull()
      await cashier.get('/api/receipts').expect(403)

      // The warehouse keeper receives goods but does not set selling prices.
      const keeper = await harness.signIn('sklad2')
      const second = await keeper
        .post('/api/receipts')
        .send({ ...cargo(), lines: [{ variantId: jeans.variants[0].id, qty: 5, price: usd(8), retailPrice: 1_00 }] })
        .expect(201)
      await keeper.post(`/api/receipts/${second.body.id}/post`).expect(201)
      expect((await alpha.get(`/api/products/${jeans.id}`)).body.prices).toEqual([])
    })

    it('lets a person receive only where they work', async () => {
      const depot = (await alpha.post('/api/locations').send({ name: 'Depot', kind: 'warehouse' }).expect(201)).body
      const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
      const warehouse = roles.find((item) => item.templateKey === 'warehouse')!.id
      await alpha
        .post('/api/users')
        .send({
          fullName: 'Depo',
          login: 'depo',
          password: PASSWORD,
          roleIds: [warehouse],
          allLocations: false,
          locationIds: [depot.id],
        })
        .expect(201)
      const keeper = await harness.signIn('depo')

      await keeper.post('/api/receipts').send(cargo()).expect(400)
      await keeper
        .post('/api/receipts')
        .send({ ...cargo(), locationId: depot.id })
        .expect(201)
      const visible = (await keeper.get('/api/receipts')).body.items
      expect(visible.map((item: { locationName: string }) => item.locationName)).toEqual(['Depot'])
    })
  })
})
