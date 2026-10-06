import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const usd = (amount: number) => Math.round(amount * 100)
const yuan = (amount: number) => Math.round(amount * 100)

interface Doc {
  id: string
  number: string
  status: string
  receiptNumber: string | null
  partnerName: string | null
  credited: { amount: number; currency: string } | null
}

/**
 * Goods sent back to who supplied them. They leave from the batches of the
 * receipt they came on, and what the business owes for them comes off the
 * supplier's account at that receipt's prices, in the account's currency.
 * Cancelled, the goods and the debt both come back.
 */
describe('Supplier returns', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let keeper: Agent
  let shopId: string
  let coat: string
  let scarf: string
  let dordoy: string
  let yiwu: string
  let fromDordoy: { id: string; number: string }
  let today: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })
  const owes = async (partnerId: string) =>
    (await alpha.get(`/api/partners/${partnerId}/statement`).expect(200)).body as {
      balance: number
      lines: { kind: string; source: string; number: string; change: number }[]
    }
  const onHand = async (variantId: string) => {
    const [row] = await sql<{ qty: string }[]>(
      `SELECT coalesce(sum(qty), 0)::text AS qty FROM stock_balances WHERE variant_id = $1`,
      [variantId],
    )
    return Number(row.qty)
  }
  const receive = async (supplierId: string, currency: string, usdRate: number, lines: Record<string, unknown>[]) => {
    const draft = (
      await alpha
        .post('/api/receipts')
        .send({ locationId: shopId, supplierId, docDate: today, currency, usdRate, uzsRate: 12_800, lines })
        .expect(201)
    ).body
    await alpha.post(`/api/receipts/${draft.id}/post`).expect(201)
    return draft as { id: string; number: string }
  }
  const draft = (receiptId: string, lines: Record<string, unknown>[], agent = alpha) =>
    agent
      .post('/api/stock-documents')
      .send({ kind: 'supplier_return', locationId: shopId, docDate: today, receiptId, lines })

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    ;[{ day: today }] = await sql<{ day: string }[]>(`SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day`)
    shopId = (await alpha.get('/api/locations')).body.items[0].id
    const product = async (name: string) =>
      (
        await alpha
          .post('/api/products')
          .send({ name, axisIds: [], variants: [{ valueIds: [] }] })
          .expect(201)
      ).body.variants[0].id as string
    coat = await product('Palto')
    scarf = await product('Sharf')
    dordoy = (await alpha.post('/api/partners').send({ name: 'Dordoy', isSupplier: true, currency: 'USD' }).expect(201))
      .body.id
    await alpha.post('/api/currencies').send({ code: 'CNY' }).expect(200)
    yiwu = (await alpha.post('/api/partners').send({ name: 'Yiwu', isSupplier: true, currency: 'CNY' }).expect(201))
      .body.id
    fromDordoy = await receive(dordoy, 'USD', 1, [{ variantId: coat, qty: 10, price: usd(30) }])

    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    await alpha
      .post('/api/users')
      .send({
        fullName: 'Sardor Sklad',
        login: 'sklad',
        password: PASSWORD,
        roleIds: [roles.find((role) => role.templateKey === 'warehouse')!.id],
        allLocations: true,
        locationIds: [],
      })
      .expect(201)
    keeper = await harness.signIn('sklad')
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe('a draft', () => {
    it('names the receipt the goods came on, and only what it brought', async () => {
      const nothing = await alpha
        .post('/api/stock-documents')
        .send({ kind: 'supplier_return', locationId: shopId, docDate: today, lines: [{ variantId: coat, qty: 1 }] })
        .expect(400)
      expect(nothing.body.error.fields.receiptId).toBeDefined()
      const other = await draft(fromDordoy.id, [{ variantId: scarf, qty: 1 }]).expect(400)
      expect(other.body.error.fields['lines.0.variantId']).toBe('Bu tovar shu kirimda yo‘q')
    })

    it('is made by whoever keeps the stock; it is carried out by those who may', async () => {
      const made = (await draft(fromDordoy.id, [{ variantId: coat, qty: 3 }], keeper).expect(201)).body as Doc
      expect(made).toMatchObject({ status: 'draft', receiptNumber: fromDordoy.number, partnerName: 'Dordoy' })
      await keeper.post(`/api/stock-documents/${made.id}/post`).expect(403)
      await alpha.delete(`/api/stock-documents/${made.id}`).expect(204)
    })
  })

  describe('carried out', () => {
    let sent: Doc

    it('takes the goods off the shelf and what is owed off the account, at the receipt’s price', async () => {
      // A later receipt of the same coats from someone else: its batch is not the one that goes back.
      const other = (await alpha.post('/api/partners').send({ name: 'Boshqa', isSupplier: true, currency: 'USD' })).body
        .id
      await receive(other, 'USD', 1, [{ variantId: coat, qty: 5, price: usd(40) }])
      expect((await owes(dordoy)).balance).toBe(-usd(300))

      const made = (await draft(fromDordoy.id, [{ variantId: coat, qty: 3 }]).expect(201)).body as Doc
      sent = (await alpha.post(`/api/stock-documents/${made.id}/post`).expect(201)).body
      expect(sent).toMatchObject({ status: 'posted', credited: { amount: usd(90), currency: 'USD' } })
      expect(await onHand(coat)).toBe(12)
      const statement = await owes(dordoy)
      expect(statement.balance).toBe(-usd(210))
      expect(statement.lines.at(-1)).toMatchObject({
        kind: 'supplier_return',
        source: 'supplier_return',
        number: made.number,
        change: usd(90),
      })
      expect((await owes(other)).balance).toBe(-usd(200))
    })

    it('sends back no more of a receipt than is still there of it', async () => {
      const made = (await draft(fromDordoy.id, [{ variantId: coat, qty: 8 }]).expect(201)).body as Doc
      const refused = await alpha.post(`/api/stock-documents/${made.id}/post`).expect(400)
      expect(refused.body.error.fields['lines.0.qty']).toContain('bor 7')
    })

    it('cancelled, brings both the goods and the debt back', async () => {
      await alpha.post(`/api/stock-documents/${sent.id}/cancel`).expect(201)
      expect(await onHand(coat)).toBe(15)
      const statement = await owes(dordoy)
      expect(statement.balance).toBe(-usd(300))
      expect(statement.lines.at(-1)).toMatchObject({ kind: 'cancel', change: -usd(90) })
    })
  })

  describe('in a supplier’s own currency', () => {
    it('comes off at exactly what the receipt billed, whatever the rate', async () => {
      const inYuan = await receive(yiwu, 'CNY', 7.2, [{ variantId: scarf, qty: 10, price: yuan(50) }])
      expect((await owes(yiwu)).balance).toBe(-yuan(500))
      const made = (await draft(inYuan.id, [{ variantId: scarf, qty: 3 }]).expect(201)).body as Doc
      const posted = (await alpha.post(`/api/stock-documents/${made.id}/post`).expect(201)).body as Doc
      expect(posted.credited).toEqual({ amount: yuan(150), currency: 'CNY' })
      expect((await owes(yiwu)).balance).toBe(-yuan(350))
    })
  })

  describe('the books', () => {
    it('keep one business’s returns from another, and every entry in balance', async () => {
      const list = (await beta.get('/api/stock-documents').query({ kind: 'supplier_return' }).expect(200)).body
      expect(list.total).toBe(0)
      const mine = (await alpha.get('/api/stock-documents').query({ kind: 'supplier_return' }).expect(200)).body
      expect(mine.items[0]).toMatchObject({ partnerName: 'Yiwu' })
      const [{ off }] = await sql<{ off: string }[]>(
        `SELECT count(*) AS off FROM (SELECT entry_id FROM ledger_lines GROUP BY entry_id HAVING sum(base) <> 0) x`,
      )
      expect(Number(off)).toBe(0)
    })
  })
})
