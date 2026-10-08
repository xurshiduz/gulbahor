import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => amount * 100
const PIN = '4821'

interface Debt {
  id: string
  customerName: string
  saleNumber: string
  amount: number
  paid: number
  returned: number
  left: number
  dueDate: string
  state: string
}
interface Sale {
  id: string
  number: string
  total: number
  lines: { id: string }[]
  payments: { method: string; amount: number }[]
  debt: { amount: number; left: number; dueDate: string } | null
}

/**
 * Selling on credit: what a sale leaves owing is written down against the
 * customer and the receipt, paid off the oldest first, taken off again by
 * goods brought back, and at every step equal to what the books say
 * customers owe.
 */
describe('Customer debts', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let cashier: Agent
  let alphaUserId: string

  let registerId: string
  let coat: string
  let drawer: string
  let safe: string
  let nodira: string
  let barred: string
  let today: string
  let nextMonth: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  const sell = (body: Record<string, unknown>, agent = alpha) =>
    agent.post('/api/sales').send({ clientKey: randomUUID(), registerId, ...body })
  const cash = (amount: number) => ({ method: 'cash', currency: 'UZS', amount })
  /** One coat, 500 000 so'm, with so much of it left owing. */
  const onCredit = (customerId: string | null, owed: number, more: Record<string, unknown> = {}, agent = alpha) =>
    sell(
      {
        customerId,
        lines: [{ variantId: coat, qty: 1 }],
        total: som(500_000),
        payments: owed < som(500_000) ? [cash(som(500_000) - owed)] : [],
        debt: { amount: owed, dueDate: nextMonth },
        ...more,
      },
      agent,
    )
  const pay = (customerId: string, amount: number, accountId = drawer, agent = alpha) =>
    agent
      .post('/api/customer-debts/payments')
      .send({ clientKey: randomUUID(), customerId, lines: [{ accountId, amount }], total: amount })
  const debts = async (query: Record<string, unknown> = {}) =>
    (await alpha.get('/api/customer-debts').query(query).expect(200)).body as {
      items: Debt[]
      summary: { owed: number; debtors: number; overdue: number; overdueDebtors: number }
    }
  const owes = async (phone: string) =>
    (await alpha.get('/api/pos/customers').query({ q: phone }).expect(200)).body[0].debt as {
      owed: number
      overdue: number
    }
  /** What the books say customers owe, and what is in the drawer. */
  const books = async () => {
    const rows = await sql<{ key: string; balance: string }[]>(
      `SELECT coalesce(a.system_key, a.kind || '_' || a.currency) AS key, a.balance FROM accounts a
       JOIN organizations o ON o.id = a.org_id WHERE o.name = 'Alpha'`,
    )
    const of = (key: string) => Number(rows.find((row) => row.key === key)?.balance ?? 0)
    return { receivables: of('receivables'), drawer: of('cash_UZS') }
  }

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    const me = (await alpha.get('/api/auth/me').expect(200)).body
    alphaUserId = me.user.id
    today = (
      await sql<{ day: string }[]>(
        `SELECT (now() AT TIME ZONE timezone)::date::text AS day FROM organizations WHERE name = 'Alpha'`,
      )
    )[0].day
    nextMonth = (await sql<{ day: string }[]>(`SELECT ($1::date + 30)::text AS day`, [today]))[0].day
    const shopId = (await alpha.get('/api/locations')).body.items[0].id

    const retail = ((await alpha.get('/api/price-types')).body as { id: string; kind: string }[]).find(
      (type) => type.kind === 'retail',
    )!.id
    coat = (
      await alpha
        .post('/api/products')
        .send({
          name: 'Palto',
          axisIds: [],
          variants: [{ valueIds: [] }],
          prices: [{ priceTypeId: retail, amount: som(500_000), currency: 'UZS' }],
        })
        .expect(201)
    ).body.variants[0].id
    const receipt = await alpha
      .post('/api/receipts')
      .send({
        locationId: shopId,
        docDate: '2026-10-01',
        currency: 'UZS',
        lines: [{ variantId: coat, qty: 30, price: som(200_000) }],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${receipt.body.id}/post`).expect(201)

    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    await alpha.post('/api/shifts').send({ registerId, cashUzs: 0 }).expect(201)
    safe = (
      await alpha.post('/api/money/accounts').send({ kind: 'safe', name: 'Seyf', locationId: shopId }).expect(201)
    ).body.id
    const places = (await alpha.get('/api/customer-debts/accounts').expect(200)).body as {
      id: string
      registerId: string | null
      currency: string
    }[]
    drawer = places.find((place) => place.registerId === registerId && place.currency === 'UZS')!.id

    nodira = (await alpha.post('/api/customers').send({ name: 'Nodira Karimova', phone: '90 123 45 67' }).expect(201))
      .body.id
    const group = (await alpha.post('/api/customers/groups').send({ name: 'Qarzsiz', noDebt: true }).expect(201)).body
    barred = (
      await alpha
        .post('/api/customers')
        .send({ name: 'Sardor Aliyev', phone: '93 555 11 22', groupIds: [group.id] })
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

  describe('a sale on credit', () => {
    let first: Sale

    it('needs a customer to owe it, a day to come, and no more than the receipt', async () => {
      const nobody = await onCredit(null, som(500_000))
      expect(nobody.status).toBe(400)
      expect(nobody.body.error.fields.customerId).toBeDefined()
      const yesterday = (await sql<{ day: string }[]>(`SELECT ($1::date - 1)::text AS day`, [today]))[0].day
      const late = await onCredit(nodira, som(500_000), { debt: { amount: som(500_000), dueDate: yesterday } })
      expect(late.body.error.fields.debt).toBeDefined()
      const tooMuch = await onCredit(nodira, som(500_000), {
        payments: [],
        debt: { amount: som(600_000), dueDate: nextMonth },
      })
      expect(tooMuch.body.error.fields.debt).toBeDefined()
      expect((await debts()).items).toEqual([])
    })

    it('lets the goods go and writes down what is owed, by whom and by when', async () => {
      first = (await onCredit(nodira, som(500_000)).expect(201)).body
      expect(first.debt).toEqual({ amount: som(500_000), left: som(500_000), dueDate: nextMonth })
      expect(first.payments).toEqual([expect.objectContaining({ method: 'debt', amount: som(500_000) })])
      // Nothing went into the drawer: it is all owed.
      expect(await books()).toEqual({ receivables: som(500_000), drawer: 0 })

      // Part now, the rest later.
      const second: Sale = (await onCredit(nodira, som(200_000)).expect(201)).body
      expect(second.payments.map((payment) => payment.method)).toEqual(['cash', 'debt'])
      expect(await books()).toEqual({ receivables: som(700_000), drawer: som(300_000) })

      const list = await debts()
      expect(list.items.map((debt) => [debt.saleNumber, debt.left, debt.state])).toEqual([
        [first.number, som(500_000), 'open'],
        [second.number, som(200_000), 'open'],
      ])
      expect(list.summary).toEqual({ owed: som(700_000), debtors: 1, overdue: 0, overdueDebtors: 0 })
      expect(await owes('90123')).toMatchObject({ owed: som(700_000), overdue: 0 })
      const card = (await alpha.get(`/api/customers/${nodira}`).expect(200)).body
      expect(card).toMatchObject({ debt: som(700_000), overdue: 0 })
    })

    it('is any cashier’s to make, until the shop’s rules say stop', async () => {
      // An ordinary customer, nothing in the way.
      const plain: Sale = (await onCredit(nodira, som(100_000), {}, cashier).expect(201)).body
      expect(plain.debt?.amount).toBe(som(100_000))

      // A customer whose group is not lent to.
      const refused = await onCredit(barred, som(100_000), {}, cashier)
      expect(refused.status).toBe(400)
      expect(refused.body.error.code).toBe('NO_DEBT')
      // With a manager's word it goes through, and the receipt says whose word it was.
      const vouched = await onCredit(barred, som(100_000), { approval: { userId: alphaUserId, pin: PIN } }, cashier)
      expect(vouched.status).toBe(201)
      expect(vouched.body.approvedByName).toBe('Alpha Owner')
      // Whoever may lend needs nobody's word.
      await onCredit(barred, som(100_000)).expect(201)
    })

    it('stops at what the shop lends to one customer, and at a customer who is late', async () => {
      // Nodira owes 800 000; the shop lends 1 000 000 to one customer.
      await alpha.put('/api/org').send({ name: 'Alpha', settings: { autoLockMinutes: 10, debtLimit: som(1_000_000) } })
      const over = await onCredit(nodira, som(300_000), {}, cashier)
      expect(over.status).toBe(400)
      expect(over.body.error.code).toBe('DEBT_OVER_LIMIT')
      await onCredit(nodira, som(200_000), {}, cashier).expect(201)
      await alpha
        .put('/api/org')
        .send({ name: 'Alpha', settings: { autoLockMinutes: 10, debtLimit: 0 } })
        .expect(200)

      // Her oldest debt falls due and is not paid.
      await sql(`UPDATE customer_debts SET due_date = $2::date - 3 WHERE sale_id = $1`, [first.id, today])
      expect(await owes('90123')).toMatchObject({ owed: som(1_000_000), overdue: som(500_000) })
      const late = await onCredit(nodira, som(100_000), {}, cashier)
      expect(late.body.error.code).toBe('DEBT_OVERDUE')
      const list = await debts({ state: 'overdue' })
      expect(list.items.map((debt) => debt.saleNumber)).toEqual([first.number])
      expect(list.summary).toMatchObject({ overdue: som(500_000), overdueDebtors: 1 })
    })
  })

  describe('money brought against a debt', () => {
    let paymentId: string

    it('pays the debt due first, and the next with what is left over', async () => {
      const before = await books()
      const key = randomUUID()
      const body = { clientKey: key, customerId: nodira, lines: [{ accountId: drawer, amount: som(600_000) }] }
      const stale = await alpha.post('/api/customer-debts/payments').send({ ...body, total: som(1) })
      expect(stale.status).toBe(409)
      const payment = (
        await alpha
          .post('/api/customer-debts/payments')
          .send({ ...body, total: som(600_000) })
          .expect(200)
      ).body
      paymentId = payment.id
      expect(payment).toMatchObject({ number: 'QZ-000001', status: 'posted', total: som(600_000) })
      // The overdue receipt in full, then the next one in part.
      expect(payment.parts.map((part: { amount: number }) => part.amount)).toEqual([som(500_000), som(100_000)])
      // Sent again, it is the same payment.
      expect((await alpha.post('/api/customer-debts/payments').send({ ...body, total: som(600_000) })).body.id).toBe(
        paymentId,
      )
      expect(await books()).toEqual({
        receivables: before.receivables - som(600_000),
        drawer: before.drawer + som(600_000),
      })
      expect(await owes('90123')).toMatchObject({ owed: som(400_000), overdue: 0 })
      const closed = (await debts({ state: 'closed' })).items
      expect(closed.map((debt) => [debt.paid, debt.left, debt.state])).toEqual([[som(500_000), 0, 'closed']])
    })

    it('is never more than is owed', async () => {
      const over = await pay(nodira, som(400_001))
      expect(over.status).toBe(400)
      expect(over.body.error.fields.total).toBeDefined()
      // Someone who owes nothing has nothing to pay.
      const stranger = (await alpha.post('/api/customers').send({ name: 'Yangi', phone: '97 700 00 01' })).body.id
      expect((await pay(stranger, som(1_000))).status).toBe(409)
    })

    it('is taken at the till by a cashier, and anywhere by whoever keeps the debts', async () => {
      await pay(nodira, som(50_000), drawer, cashier).expect(200)
      // A safe is not a cashier's to put money into.
      const refused = await pay(nodira, som(50_000), safe, cashier)
      expect(refused.status).toBe(400)
      expect(refused.body.error.fields['lines.0.accountId']).toBeDefined()
      await pay(nodira, som(50_000), safe).expect(200)
      // The list of debts is not a cashier's to read.
      await cashier.get('/api/customer-debts').expect(403)
      await cashier.get('/api/customer-debts/payments').expect(403)

      const shift = (await alpha.get('/api/shifts').query({ status: 'open' }).expect(200)).body.items[0]
      const report = (await alpha.get(`/api/shifts/${shift.id}`).expect(200)).body
      // What came into the drawer for debts: 600 000 and 50 000. The safe is not the till's.
      expect(report.totals).toMatchObject({ debtsUzs: som(650_000), debtsUsd: 0 })
      expect(report.totals.payments.find((row: { method: string }) => row.method === 'debt')).toBeDefined()
    })

    it('can be taken back, and is owed again', async () => {
      const before = await books()
      await cashier.post(`/api/customer-debts/payments/${paymentId}/cancel`).send({}).expect(403)
      const cancelled = (
        await alpha
          .post(`/api/customer-debts/payments/${paymentId}/cancel`)
          .send({ reason: 'Xato kiritildi' })
          .expect(200)
      ).body
      expect(cancelled).toMatchObject({ status: 'cancelled', cancelReason: 'Xato kiritildi' })
      await alpha.post(`/api/customer-debts/payments/${paymentId}/cancel`).send({}).expect(409)
      expect(await books()).toEqual({
        receivables: before.receivables + som(600_000),
        drawer: before.drawer - som(600_000),
      })
      // The receipt that was late is owed in full again; the two later payments stay on the one they went to.
      expect(await owes('90123')).toMatchObject({ owed: som(900_000), overdue: som(500_000) })
      const posted = (await alpha.get('/api/customer-debts/payments').query({ status: 'posted' }).expect(200)).body
      expect(posted.total).toBe(2)
    })
  })

  describe('goods brought back', () => {
    const giveBack = (sale: Sale, refunds: unknown[], total = som(500_000)) =>
      alpha.post('/api/returns').send({
        clientKey: randomUUID(),
        registerId,
        saleId: sale.id,
        lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
        refunds,
        total,
      })

    it('come off what their receipt left owing, and no money is handed back for what was never paid', async () => {
      const customer = (await alpha.post('/api/customers').send({ name: 'Zilola', phone: '94 111 22 33' })).body.id
      const sale: Sale = (await onCredit(customer, som(500_000)).expect(201)).body
      const found = (await alpha.get('/api/returns/lookup').query({ code: sale.number }).expect(200)).body
      expect(found.caps).toEqual({ cash: 0, accounts: [], debt: som(500_000), partner: 0 })

      const before = await books()
      // Money asked for what is still owed: refused.
      expect((await giveBack(sale, [cash(som(500_000))])).status).toBe(400)
      const made = (await giveBack(sale, []).expect(201)).body
      expect(made.refunds).toEqual([expect.objectContaining({ method: 'debt', amount: som(500_000) })])
      expect(await books()).toEqual({ receivables: before.receivables - som(500_000), drawer: before.drawer })
      expect(await owes('94111')).toMatchObject({ owed: 0 })
      const [debt] = (await debts({ state: 'all', customerId: customer })).items
      expect(debt).toMatchObject({ returned: som(500_000), paid: 0, left: 0, state: 'closed' })
    })

    it('give back in money only what has been paid in money', async () => {
      const customer = (await alpha.post('/api/customers').send({ name: 'Malika', phone: '94 111 22 44' })).body.id
      const sale: Sale = (await onCredit(customer, som(500_000)).expect(201)).body
      await pay(customer, som(200_000)).expect(200)
      const found = (await alpha.get('/api/returns/lookup').query({ code: sale.number }).expect(200)).body
      // 300 000 is still owed; the 200 000 she paid may go back as cash.
      expect(found.caps).toEqual({ cash: som(200_000), accounts: [], debt: som(300_000), partner: 0 })

      const before = await books()
      expect((await giveBack(sale, [])).status).toBe(400)
      await giveBack(sale, [cash(som(200_000))]).expect(201)
      expect(await books()).toEqual({
        receivables: before.receivables - som(300_000),
        drawer: before.drawer - som(200_000),
      })
      expect(await owes('94 111 22 44')).toMatchObject({ owed: 0 })
    })
  })

  describe('a receipt undone', () => {
    it('leaves nothing owing; one that has been paid against is not undone', async () => {
      const customer = (await alpha.post('/api/customers').send({ name: 'Kamola', phone: '95 000 11 22' })).body.id
      const sale: Sale = (await onCredit(customer, som(200_000)).expect(201)).body
      const before = await books()
      await alpha.post(`/api/sales/${sale.id}/void`).send({ reason: 'Xato chek' }).expect(200)
      expect(await books()).toEqual({
        receivables: before.receivables - som(200_000),
        drawer: before.drawer - som(300_000),
      })
      expect(await owes('95000')).toMatchObject({ owed: 0 })
      const [debt] = (await debts({ state: 'all', customerId: customer })).items
      expect(debt).toMatchObject({ left: 0, state: 'cancelled' })
      expect((await alpha.get(`/api/sales/${sale.id}`).expect(200)).body.debt).toBeNull()

      const paid: Sale = (await onCredit(customer, som(200_000)).expect(201)).body
      await pay(customer, som(50_000)).expect(200)
      const refused = await alpha.post(`/api/sales/${paid.id}/void`).send({ reason: 'Xato chek' })
      expect(refused.status).toBe(409)
      expect(refused.body.error.code).toBe('SALE_DEBT_PAID')
    })
  })

  it("takes dollars for an agreed sum of so'm, and writes the difference down as the rate's", async () => {
    await alpha.put('/api/currencies/USD/rate').send({ value: 11_800 }).expect(200)
    const vault = (
      await alpha.post('/api/money/accounts').send({ kind: 'safe', name: 'Seyf $', currency: 'USD' }).expect(201)
    ).body.id
    const of = async (where: string, params: unknown[] = []) =>
      Number(
        (
          await sql<{ balance: string }[]>(
            `SELECT a.balance FROM accounts a JOIN organizations o ON o.id = a.org_id
             WHERE o.name = 'Alpha' AND ${where}`,
            params,
          )
        )[0]?.balance ?? 0,
      )
    const customer = (await alpha.post('/api/customers').send({ name: 'Dilshod', phone: '95 000 33 44' })).body.id
    await onCredit(customer, som(500_000)).expect(201)
    const before = { receivables: (await books()).receivables, fx: await of(`a.system_key = 'fx'`) }

    // Forty dollars are worth 472 000; they are taken for 480 000 of what she owes.
    const payment = (
      await alpha
        .post('/api/customer-debts/payments')
        .send({
          clientKey: randomUUID(),
          customerId: customer,
          lines: [{ accountId: vault, amount: 4000, settled: som(480_000) }],
          total: som(480_000),
        })
        .expect(200)
    ).body
    expect(payment.total).toBe(som(480_000))
    expect(payment.lines).toEqual([
      { accountName: 'Seyf $', currency: 'USD', amount: 4000, base: som(480_000), fx: -som(8000) },
    ])
    expect((await owes('9500033')).owed).toBe(som(20_000))
    expect((await books()).receivables).toBe(before.receivables - som(480_000))
    expect(await of(`a.id = $1`, [vault])).toBe(4000)
    // The 8 000 she was let off are written down as let off.
    expect(await of(`a.system_key = 'fx'`)).toBe(before.fx + som(8000))
  })

  it('always comes to what the books say customers owe', async () => {
    const { summary } = await debts()
    expect((await books()).receivables).toBe(summary.owed)
    // The ledger's own check: every entry adds up to nothing.
    const [{ off }] = await sql<{ off: string }[]>(
      `SELECT count(*) AS off FROM (
         SELECT entry_id FROM ledger_lines GROUP BY entry_id HAVING sum(base) <> 0
       ) broken`,
    )
    expect(Number(off)).toBe(0)
  })

  it('shows one business nothing of another', async () => {
    expect((await beta.get('/api/customer-debts').expect(200)).body).toMatchObject({
      total: 0,
      summary: { owed: 0, debtors: 0 },
    })
    const foreign = await beta
      .post('/api/customer-debts/payments')
      .send({ clientKey: randomUUID(), customerId: nodira, lines: [{ accountId: drawer, amount: 1 }], total: 1 })
    expect(foreign.status).toBe(400)
  })
})
