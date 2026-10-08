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
const som = (amount: number) => Math.round(amount * 100)
/** The cargo comes in dollars at 12 800 so'm: what so many dollars cost in the base. */
const inSom = (dollars: number) => usd(dollars) * 12_800

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
    rate: 12_800,
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
      variants: { variantId: string; qty: number; costUzs: number | null; byLocation: Record<string, number> }[]
    }

  const ledger = (documentId: string) =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return em.query(
        `SELECT kind, location_id, qty::float8 AS qty, cost_uzs::float8 AS cost_uzs FROM stock_movements WHERE document_id = $1 ORDER BY id`,
        [documentId],
      ) as Promise<{ kind: string; location_id: string | null; qty: number; cost_uzs: number }[]>
    })

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)

    shopId = (await alpha.get('/api/locations')).body.items[0].id
    supplierId = (await alpha.post('/api/partners').send({ name: 'Guangzhou Textile', isSupplier: true }).expect(201))
      .body.id

    const attributes = (await alpha.get('/api/attributes')).body as AttributeRow[]
    const color = attributes.find((attribute) => attribute.kind === 'color')!
    const size = attributes.find((attribute) => attribute.name === 'O‘lcham (harfli)')!
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
      expect(draft.body.totals).toMatchObject({ qty: 900, goods: usd(6400), costUzs: inSom(8104) })
      expect(draft.body.products.map((product: Named) => product.name)).toEqual(['Futbolka', 'Jinsi', 'Kurtka'])
      expect(draft.body.lines[0].costUzs).toBeNull()

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
      expect(posted.body.totals).toMatchObject({
        goodsUzs: inSom(6400),
        expensesUzs: inSom(1704),
        costUzs: inSom(8104),
      })

      // 500 T-shirts cost 1865 dollars together; the two sizes share it 300 : 200.
      const [small, medium, denim, parka] = posted.body.lines.map((line: { costUzs: number }) => line.costUzs)
      expect(small + medium).toBe(inSom(1865))
      expect([small, medium]).toEqual([inSom(1119), inSom(746)])
      expect([denim, parka]).toEqual([inSom(3024), inSom(3215)])

      const stock = await stockOf(alpha, tshirt.id)
      expect(stock.variants.map((variant) => [variant.qty, variant.costUzs])).toEqual([
        [300, inSom(1119)],
        [200, inSom(746)],
      ])
      expect(stock.variants[0].byLocation).toEqual({ [shopId]: 300 })

      const list = await alpha.get('/api/stock').query({ q: 'futbolka' }).expect(200)
      expect(list.body.items[0]).toMatchObject({ qty: 500, costUzs: inSom(1865), byLocation: { [shopId]: 500 } })
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
      expect(revised.body.totals.costUzs).toBe(inSom(8194))

      const stock = await alpha.get('/api/stock').expect(200)
      const total = stock.body.items.reduce((sum: number, item: { costUzs: number }) => sum + item.costUzs, 0)
      expect(total).toBe(inSom(8194))
      expect((await alpha.get('/api/receipts')).body.items[0].hasEstimates).toBe(false)

      // The ledger holds the receipt and the revaluation; together they are the balance.
      const rows = await ledger(receiptId)
      expect(rows.filter((row) => row.kind === 'receipt')).toHaveLength(4)
      expect(rows.filter((row) => row.kind === 'revalue').every((row) => row.qty === 0)).toBe(true)
      expect(rows.reduce((sum, row) => sum + row.cost_uzs, 0)).toBe(inSom(8194))
    })

    it('is cancelled while its goods are untouched, and comes back as a draft copy', async () => {
      const cancelled = await alpha.post(`/api/receipts/${receiptId}/cancel`).expect(201)
      expect(cancelled.body.status).toBe('cancelled')
      expect((await alpha.get('/api/stock')).body.total).toBe(0)
      expect((await ledger(receiptId)).reduce((sum, row) => sum + row.cost_uzs, 0)).toBe(0)
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
    it('costs a yuan purchase in so’m at its own rate, with expenses in any currency the business keeps', async () => {
      await alpha
        .post('/api/currencies')
        .send({ code: 'CNY', form: { against: 'USD', way: 'per' } })
        .expect(200)
      const draft = await alpha
        .post('/api/receipts')
        .send({
          locationId: shopId,
          docDate: '2026-10-02',
          currency: 'CNY',
          rate: 1_800,
          extraCurrency: 'UZS',
          lines: [{ variantId: jeans.variants[0].id, qty: 10, price: 71_00, extra: 6_400_00 }],
          expenses: [
            { name: 'Kargo', amount: 142_00, currency: 'CNY', basis: 'quantity' },
            { name: 'Yetkazish', amount: 128_000_00, currency: 'UZS', basis: 'quantity' },
          ],
        })
        .expect(201)
      // "1 ¥ = 1 800 so'm", the yuan written first. Goods 710 ¥ = 1 278 000; extras 10 × 6 400 = 64 000;
      // freight 142 ¥ = 255 600; delivery 128 000 so'm as it is.
      expect(draft.body).toMatchObject({ rate: 1_800, rateWay: 'in' })
      expect(draft.body.totals).toMatchObject({
        goods: 710_00,
        goodsUzs: som(1_278_000),
        expensesUzs: som(447_600),
        costUzs: som(1_725_600),
      })

      // A receipt in another currency needs its rate; an expense, a currency the business keeps and a rate on the day.
      const unrated = await alpha.post('/api/receipts').send({ ...cargo(), currency: 'CNY', rate: undefined })
      expect(unrated.status).toBe(400)
      expect(unrated.body.error.fields.rate).toBe('Kursni yozing')
      const lira = await alpha
        .post('/api/receipts')
        .send({ ...cargo(), currency: 'CNY', expenses: [{ name: 'X', amount: 1, currency: 'TRY', basis: 'value' }] })
      expect(lira.body.error.fields['expenses.0.currency']).toBe('Bu valyuta yoqilmagan: Pul → Kurslar')
      const dollars = await alpha.post('/api/receipts').send({
        ...cargo(),
        currency: 'CNY',
        expenses: [{ name: 'Y', amount: usd(10), currency: 'USD', basis: 'value' }],
      })
      expect(dollars.status).toBe(400)
      expect(dollars.body.error.fields['expenses.0.currency']).toBe('Dollar kursi qo‘yilmagan (kirim sanasiga)')
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
      expect(seen.costUzs).toBeNull()
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

  describe('what suppliers are owed', () => {
    const systemBalance = async (key: string) =>
      harness.dataSource.transaction(async (em) => {
        await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
        const [row] = await em.query(`SELECT balance::float8 AS balance FROM accounts WHERE system_key = $1`, [key])
        return (row?.balance ?? 0) as number
      })
    const statement = async (partnerId: string) =>
      (await alpha.get(`/api/partners/${partnerId}/statement`).expect(200)).body as {
        balance: number
        lines: { kind: string; source: string; number: string; documentId: string; change: number; balance: number }[]
      }

    it("is the goods at their prices, in the currency of each one's account, and nothing more once cancelled", async () => {
      const dordoy = (
        await alpha.post('/api/partners').send({ name: 'Dordoy', isSupplier: true, currency: 'USD' }).expect(201)
      ).body.id
      const market = (
        await alpha.post('/api/partners').send({ name: 'Abu Saxiy', isSupplier: true, currency: 'UZS' }).expect(201)
      ).body.id
      const before = await systemBalance('purchases')

      // One shipment, two suppliers: the jeans are the market's. The cargo is paid to somebody else.
      const draft = await alpha
        .post('/api/receipts')
        .send({
          locationId: shopId,
          supplierId: dordoy,
          docDate: '2026-10-02',
          currency: 'USD',
          rate: 12_800,
          lines: [
            { variantId: tshirt.variants[0].id, qty: 100, price: usd(3) },
            { variantId: jeans.variants[0].id, supplierId: market, qty: 50, price: usd(8) },
          ],
          expenses: [{ name: 'Kargo', amount: usd(100), currency: 'USD', basis: 'value' }],
        })
        .expect(201)
      // A draft owes nobody anything yet.
      expect((await statement(dordoy)).lines).toEqual([])

      await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)
      // 300 dollars to the dollar supplier; 400 dollars of jeans are 5 120 000 so'm on the so'm one's account.
      expect(await statement(dordoy)).toMatchObject({
        balance: -usd(300),
        lines: [
          {
            kind: 'receipt',
            source: 'receipt',
            number: draft.body.number,
            documentId: draft.body.id,
            change: -usd(300),
          },
        ],
      })
      expect((await statement(market)).balance).toBe(-som(5_120_000))
      expect(await systemBalance('purchases')).toBe(before + som(300 * 12_800 + 5_120_000))
      const listed = (await alpha.get('/api/partners').query({ debt: 'owed' }).expect(200)).body.items
      // Both are now among those the business owes (with the supplier of the yuan purchase above).
      expect(listed.map((partner: { name: string }) => partner.name)).toEqual(
        expect.arrayContaining(['Abu Saxiy', 'Dordoy']),
      )

      await alpha.post(`/api/receipts/${draft.body.id}/cancel`).expect(201)
      const after = await statement(dordoy)
      expect(after.balance).toBe(0)
      expect(after.lines.map((line) => [line.kind, line.change])).toEqual([
        ['receipt', -usd(300)],
        ['cancel', usd(300)],
      ])
      expect((await statement(market)).balance).toBe(0)
      expect(await systemBalance('purchases')).toBe(before)
    })

    it('owes a supplier in yuan exactly what a yuan receipt says, and another currency at the day’s rate', async () => {
      const [{ day }] = await harness.dataSource.query(`SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day`)
      // The yuan is kept from the receipt above; the lira is kept, written against the dollar.
      await alpha
        .post('/api/currencies')
        .send({ code: 'TRY', form: { against: 'USD', way: 'per' } })
        .expect(200)
      const yiwu = (
        await alpha.post('/api/partners').send({ name: 'Yiwu', isSupplier: true, currency: 'CNY' }).expect(201)
      ).body.id
      const receipt = (currency: string, rate: number, price: number) =>
        alpha
          .post('/api/receipts')
          .send({
            locationId: shopId,
            supplierId: yiwu,
            docDate: day,
            currency,
            rate,
            lines: [{ variantId: coat.variants[0].id, qty: 10, price }],
          })
          .expect(201)

      // Billed 500 ¥ at the receipt's 1 780 so'm: owed 500 ¥, whatever the day's rate says.
      const inYuan = (await receipt('CNY', 1_780, 5000)).body
      await alpha.post(`/api/receipts/${inYuan.id}/post`).expect(201)
      expect((await statement(yiwu)).balance).toBe(-50_000)

      // Billed in lira: 340 ₺ in yuan come from the day's rates — 10 $ at 34 ₺, 72,50 ¥ at 7,25.
      const inLira = (await receipt('TRY', 376.47, 3400)).body
      const none = await alpha.post(`/api/receipts/${inLira.id}/post`).expect(409)
      expect(none.body.error.message).toContain('kursi qo‘yilmagan: yetkazib beruvchi qarzini hisoblab bo‘lmaydi')
      await alpha.put('/api/currencies/USD/rate').send({ value: 12_800 }).expect(200)
      await alpha.put('/api/currencies/CNY/rate').send({ value: 7.25 }).expect(200)
      await alpha.put('/api/currencies/TRY/rate').send({ value: 34 }).expect(200)
      await alpha.post(`/api/receipts/${inLira.id}/post`).expect(201)
      expect((await statement(yiwu)).balance).toBe(-50_000 - 7250)

      // Cancelled, exactly what was written comes off.
      await alpha.post(`/api/receipts/${inLira.id}/cancel`).expect(201)
      await alpha.put('/api/currencies/CNY/rate').send({ value: 7.1 }).expect(200)
      await alpha.post(`/api/receipts/${inYuan.id}/cancel`).expect(201)
      expect((await statement(yiwu)).balance).toBe(0)
    })

    it('leaves out goods that name no supplier: those were paid for on the spot', async () => {
      const before = await systemBalance('purchases')
      const draft = await alpha
        .post('/api/receipts')
        .send({
          locationId: shopId,
          docDate: '2026-10-02',
          currency: 'UZS',
          lines: [{ variantId: coat.variants[0].id, qty: 2, price: som(400_000) }],
        })
        .expect(201)
      await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)
      expect(await systemBalance('purchases')).toBe(before)
    })
  })
})
