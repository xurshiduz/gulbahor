import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)
const usd = (amount: number) => Math.round(amount * 100)
const PIN = '4821'

interface Sale {
  id: string
  number: string
  lines: { id: string }[]
}

/**
 * How the money for goods brought back goes (KEYINGI-REJA, 17.3). Beside
 * the way it was paid: it may stay on the customer's account — to pay what
 * they owe, or to be spent next time — with nobody's word, for no money
 * leaves the shop; notes of another currency may go back for a worth agreed;
 * goods taken instead may leave their difference on the account; and a
 * customer's own days for bringing goods back count before the shop's.
 */
describe('Money for goods brought back', () => {
  let harness: Harness
  let alpha: Agent
  let cashier: Agent
  let alphaUserId: string

  let registerId: string
  let shiftId: string
  let scarf: string
  let coat: string
  let nodira: string
  let elaris: string
  let textile: string
  let patient: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  /** A scarf at 75 000 so'm, paid in cash exactly. */
  const sell = async (body: Record<string, unknown> = {}, scarves = 1): Promise<Sale> =>
    (
      await alpha
        .post('/api/sales')
        .send({
          clientKey: randomUUID(),
          registerId,
          lines: [{ variantId: scarf, qty: scarves }],
          total: som(75_000) * scarves,
          payments: [{ method: 'cash', amount: som(75_000) * scarves }],
          ...body,
        })
        .expect(201)
    ).body
  /** One scarf of a sale comes back. */
  const giveBack = (sale: Sale, body: Record<string, unknown>, agent = cashier) =>
    agent.post('/api/returns').send({
      clientKey: randomUUID(),
      registerId,
      saleId: sale.id,
      lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
      total: som(75_000),
      refunds: [],
      ...body,
    })
  const held = async (where: string, params: unknown[] = []): Promise<number> => {
    const [row] = await sql<{ balance: string }[]>(
      `SELECT coalesce(sum(a.balance), 0) AS balance FROM accounts a JOIN organizations o ON o.id = a.org_id
       WHERE o.name = 'Alpha' AND ${where}`,
      params,
    )
    return Number(row.balance)
  }
  const drawer = (currency: string) =>
    held(`a.kind = 'cash' AND a.register_id = $1 AND a.currency = $2`, [registerId, currency])
  const owes = async (customerId: string, currency?: string) =>
    (
      await alpha
        .get(`/api/customers/${customerId}/statement`)
        .query(currency ? { currency } : {})
        .expect(200)
    ).body as { balance: number; lines: { source: string; number: string; change: number }[] }
  const balanced = async (documentId: string) => {
    const [books] = await sql<{ base: string }[]>(
      `SELECT coalesce(sum(l.base), 0) AS base FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
       WHERE e.document_id = $1`,
      [documentId],
    )
    return Number(books.base) === 0
  }

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    alphaUserId = (await alpha.get('/api/auth/me').expect(200)).body.user.id
    await alpha.put('/api/currencies/USD/rate').send({ value: 12_650 }).expect(200)
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    const retail = ((await alpha.get('/api/price-types')).body as { id: string; kind: string }[]).find(
      (type) => type.kind === 'retail',
    )!.id
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
    coat = await product('Palto', som(200_000))
    const receipt = await alpha
      .post('/api/receipts')
      .send({
        locationId: shopId,
        docDate: '2026-10-01',
        currency: 'UZS',
        lines: [
          { variantId: scarf, qty: 60, price: som(30_000) },
          { variantId: coat, qty: 10, price: som(90_000) },
        ],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${receipt.body.id}/post`).expect(201)
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    shiftId = (await alpha.post('/api/shifts').send({ registerId, cash: {} }).expect(201)).body.id

    nodira = (await alpha.post('/api/customers').send({ name: 'Nodira', phone: '90 123 45 67' }).expect(201)).body.id
    elaris = (await alpha.post('/api/customers').send({ name: 'Elaris', currency: 'USD' }).expect(201)).body.id
    textile = (await alpha.post('/api/customers').send({ name: 'Textile', isSupplier: true }).expect(201)).body.id
    patient = (
      await alpha
        .post('/api/customers')
        .send({ name: 'Ulgurji Savdo', terms: { returnDays: 30 } })
        .expect(201)
    ).body.id

    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    await alpha
      .post('/api/users')
      .send({
        fullName: 'Dilnoza Kassir',
        login: 'kassir',
        password: PASSWORD,
        roleIds: [roles.find((role) => role.templateKey === 'cashier')!.id],
        allLocations: true,
        locationIds: [],
      })
      .expect(201)
    cashier = await harness.signIn('kassir')
    await alpha.post('/api/auth/pin').send({ password: PASSWORD, pin: PIN }).expect(204)
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe('left on the customer’s account', () => {
    it('is theirs to spend next time, and takes nobody’s word', async () => {
      const sale = await sell({ customerId: nodira })
      const before = await drawer('UZS')
      const made = (await giveBack(sale, { keep: { amount: som(75_000) } }).expect(201)).body
      expect(made).toMatchObject({
        total: som(75_000),
        refunds: [],
        kept: { customerName: 'Nodira', currency: 'UZS', amount: som(75_000), base: som(75_000) },
        approvedByName: null,
      })
      // No money left the drawer.
      expect(await drawer('UZS')).toBe(before)
      const account = await owes(nodira)
      expect(account.balance).toBe(-som(75_000))
      expect(account.lines).toEqual([
        expect.objectContaining({ source: 'sale_return', number: made.number, change: -som(75_000) }),
      ])
      expect(await balanced(made.id)).toBe(true)
    })

    it('may be part of it, the rest handed back', async () => {
      const sale = await sell({ customerId: nodira })
      const before = { drawer: await drawer('UZS'), owed: (await owes(nodira)).balance }
      const made = (
        await giveBack(sale, {
          keep: { amount: som(50_000) },
          refunds: [{ method: 'cash', amount: som(25_000) }],
        }).expect(201)
      ).body
      expect(made.kept).toMatchObject({ amount: som(50_000) })
      expect(made.refunds).toEqual([expect.objectContaining({ method: 'cash', amount: som(25_000) })])
      expect((await drawer('UZS')) - before.drawer).toBe(-som(25_000))
      expect((await owes(nodira)).balance - before.owed).toBe(-som(50_000))
      // What is not kept is still to be handed back, and no more is kept than is owed.
      const short = await giveBack(await sell({ customerId: nodira }), { keep: { amount: som(50_000) } })
      expect(short.body.error.fields.refunds).toContain('qaytarilishi kerak')
      const over = await giveBack(await sell({ customerId: nodira }), { keep: { amount: som(80_000) } })
      expect(over.body.error.fields.keep).toContain('Hisobida ko‘pi bilan')
    })

    it('goes to whoever the receipt names, or to someone named now when it names nobody', async () => {
      const nobody = await sell()
      const unnamed = await giveBack(nobody, { keep: { amount: som(75_000) } })
      expect(unnamed.status).toBe(400)
      expect(unnamed.body.error.fields.keep).toBe('Hisobida qoldirish uchun mijozni tanlang')
      const before = (await owes(nodira)).balance
      const made = (await giveBack(nobody, { keep: { customerId: nodira, amount: som(75_000) } }).expect(201)).body
      expect(made.kept).toMatchObject({ customerName: 'Nodira' })
      expect((await owes(nodira)).balance - before).toBe(-som(75_000))

      // A receipt's own customer is the one it stays with.
      const theirs = await giveBack(await sell({ customerId: nodira }), {
        keep: { customerId: elaris, amount: som(75_000) },
      })
      expect(theirs.body.error.fields.keep).toBe('Pul chekdagi mijozning hisobida qoldiriladi')
    })

    it('goes on a supplier’s account on the word a sale on it takes', async () => {
      const keep = { keep: { customerId: textile, amount: som(75_000) } }
      const alone = await giveBack(await sell(), keep)
      expect(alone.status).toBe(400)
      expect(alone.body.error.code).toBe('SUPPLIER_ON_ACCOUNT')
      const before = (await owes(textile)).balance
      const vouched = (
        await giveBack(await sell(), { ...keep, approval: { userId: alphaUserId, pin: PIN } }).expect(201)
      ).body
      expect(vouched.approvedByName).toBeTruthy()
      // Whoever may lend needs nobody's word.
      const own = (await giveBack(await sell(), keep, alpha).expect(201)).body
      expect(own.approvedByName).toBeNull()
      expect((await owes(textile)).balance - before).toBe(-som(150_000))
    })

    it('goes on an account kept in dollars at the rate, or for a sum agreed within the shop’s limit', async () => {
      // 75 000 at 12 650 is 5,93 $.
      const made = (await giveBack(await sell({ customerId: elaris }), { keep: { amount: som(75_000) } }).expect(201))
        .body
      expect(made.kept).toMatchObject({ currency: 'USD', amount: usd(5.93), base: som(75_000) })
      expect((await owes(elaris, 'USD')).balance).toBe(-usd(5.93))
      expect(await balanced(made.id)).toBe(true)

      // Six dollars for it is 1,2% over the rate: a cashier's to give. Seven is not.
      await giveBack(await sell({ customerId: elaris }), { keep: { amount: som(75_000), settled: usd(6) } }).expect(201)
      expect((await owes(elaris, 'USD')).balance).toBe(-usd(11.93))
      const dear = await sell({ customerId: elaris })
      const refused = await giveBack(dear, { keep: { amount: som(75_000), settled: usd(7) } })
      expect(refused.status).toBe(400)
      expect(refused.body.error.code).toBe('RATE_LOSS_OVER_LIMIT')
      const allowed = (
        await giveBack(dear, {
          keep: { amount: som(75_000), settled: usd(7) },
          approval: { userId: alphaUserId, pin: PIN },
        }).expect(201)
      ).body
      expect(allowed.approvedByName).toBe('Alpha Owner')
      expect(await balanced(allowed.id)).toBe(true)
    })

    it('is not for goods taken on account: those come off the debt they made', async () => {
      const sale = await sell({
        customerId: nodira,
        payments: [],
        onAccount: { amount: som(75_000) },
      })
      const before = (await owes(nodira)).balance
      const refused = await giveBack(sale, { keep: { amount: som(75_000) } })
      expect(refused.body.error.fields.keep).toBe('Qaytariladigan pul yo‘q')
      const made = (await giveBack(sale, {}).expect(201)).body
      expect(made.kept).toBeNull()
      expect(made.refunds).toEqual([expect.objectContaining({ method: 'account', base: som(75_000) })])
      expect((await owes(nodira)).balance - before).toBe(-som(75_000))
    })
  })

  describe('handed back in another currency', () => {
    it('goes for a worth agreed, and the rate keeps the difference', async () => {
      const sale = await sell()
      const before = { usd: await drawer('USD'), fx: await held(`a.system_key = 'fx'`) }
      // Six dollars for the 75 000: the rate makes them 75 900.
      const made = (
        await giveBack(sale, {
          refunds: [{ method: 'cash', currency: 'USD', amount: usd(6), value: som(75_000) }],
        }).expect(201)
      ).body
      expect(made.refunds).toEqual([
        expect.objectContaining({ currency: 'USD', amount: usd(6), base: som(75_000), fx: -som(900) }),
      ])
      expect((await drawer('USD')) - before.usd).toBe(-usd(6))
      expect((await held(`a.system_key = 'fx'`)) - before.fx).toBe(som(900))
      expect(await balanced(made.id)).toBe(true)
    })

    it('needs a word once it gives away more than the shop lets a cashier', async () => {
      const sale = await sell()
      // Seven dollars for the 75 000 are 88 550 at the rate.
      const cheap = { refunds: [{ method: 'cash', currency: 'USD', amount: usd(7), value: som(75_000) }] }
      const refused = await giveBack(sale, cheap)
      expect(refused.status).toBe(400)
      expect(refused.body.error.code).toBe('RATE_LOSS_OVER_LIMIT')
      const made = (await giveBack(sale, { ...cheap, approval: { userId: alphaUserId, pin: PIN } }).expect(201)).body
      expect(made.approvedByName).toBe('Alpha Owner')
      // An agreed worth is for notes of another currency.
      const plain = await giveBack(await sell(), {
        refunds: [{ method: 'cash', currency: 'UZS', amount: som(75_000), value: som(70_000) }],
      })
      expect(plain.status).toBe(400)
    })
  })

  describe('sent from a card the receipt was not paid with', () => {
    it('takes the word of someone who may hand money back any way, and is one of the shop’s own', async () => {
      const shopId = (await alpha.get('/api/locations')).body.items[0].id
      const cardId = (
        await alpha
          .post('/api/money/accounts')
          .send({ kind: 'card', name: 'Humo', locationId: shopId, last4: '3073' })
          .expect(201)
      ).body.id
      const sale = await sell()
      const byCard = { refunds: [{ method: 'card', accountId: cardId, amount: som(75_000) }] }
      // The receipt was paid in cash: a cashier hands cash back, and nothing else.
      const refused = await giveBack(sale, byCard)
      expect(refused.status).toBe(400)
      expect(refused.body.error.fields['refunds.0.accountId']).toBe('Bu chek shu kartaga to‘lanmagan')
      const before = await drawer('UZS')
      const made = (await giveBack(sale, { ...byCard, approval: { userId: alphaUserId, pin: PIN } }).expect(201)).body
      expect(made.approvedByName).toBe('Alpha Owner')
      expect(made.refunds).toEqual([
        expect.objectContaining({ method: 'card', accountName: 'Humo', amount: som(75_000) }),
      ])
      // The drawer keeps its cash; the card is down by what it sent.
      expect(await drawer('UZS')).toBe(before)
      expect(await held(`a.id = $1`, [cardId])).toBe(-som(75_000))
    })
  })

  describe('goods taken instead', () => {
    it('may leave their difference on the customer’s account', async () => {
      const sale = await sell({ customerId: nodira })
      const before = (await owes(nodira)).balance
      // A coat for the scarf: 125 000 more, on the account.
      const made = (
        await giveBack(
          sale,
          {
            exchange: {
              customerId: nodira,
              lines: [{ variantId: coat, qty: 1 }],
              total: som(200_000),
              payments: [],
              onAccount: { amount: som(125_000) },
            },
          },
          alpha,
        ).expect(201)
      ).body
      expect(made).toMatchObject({ exchangeTotal: som(75_000), refunds: [], kept: null })
      expect((await owes(nodira)).balance - before).toBe(som(125_000))
      const taken = (await alpha.get(`/api/sales/${made.exchangeSaleId}`).expect(200)).body
      expect(taken.payments.map((payment: { method: string; base: number }) => [payment.method, payment.base])).toEqual(
        [
          ['exchange', som(75_000)],
          ['account', som(125_000)],
        ],
      )
    })
  })

  describe('the days goods may come back in', () => {
    it('are the customer’s own where their card gives them any', async () => {
      const [theirs, shops] = [await sell({ customerId: patient }), await sell({ customerId: nodira })]
      // Twenty days ago: past the shop's fourteen, within this customer's thirty.
      await sql(`UPDATE sales SET sold_on = sold_on - 20 WHERE id = ANY($1)`, [[theirs.id, shops.id]])
      const found = (await cashier.get('/api/returns/lookup').query({ code: theirs.number }).expect(200)).body
      expect(found).toMatchObject({ late: false, returnDays: 30 })
      await giveBack(theirs, { refunds: [{ method: 'cash', amount: som(75_000) }] }).expect(201)
      const late = (await cashier.get('/api/returns/lookup').query({ code: shops.number }).expect(200)).body
      expect(late).toMatchObject({ late: true, returnDays: 14 })
      const refused = await giveBack(shops, { refunds: [{ method: 'cash', amount: som(75_000) }] })
      expect(refused.body.error.code).toBe('RETURN_LATE')
    })
  })

  describe('in the shift’s report', () => {
    it('what stayed on accounts is told apart from what came off debts', async () => {
      const shift = (await alpha.get(`/api/shifts/${shiftId}`).expect(200)).body
      const onAccounts = (shift.totals.refunds as { method: string; currency: string; kept?: boolean; base: number }[])
        .filter((row) => row.method === 'account')
        .map((row) => [row.currency, !!row.kept, row.base])
      expect(onAccounts).toEqual([
        // Off the debt a sale on account had made.
        ['UZS', false, som(75_000)],
        // Kept: 75 000 + 50 000 + 75 000 and twice 75 000 for a supplier in so'm, three times 75 000 in dollars.
        ['UZS', true, som(350_000)],
        ['USD', true, som(225_000)],
      ])
    })
  })
})
