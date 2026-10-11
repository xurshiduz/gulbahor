import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => amount * 100
const PIN = '4821'

interface Sale {
  id: string
  number: string
  payments: { method: string; amount: number }[]
  due: { id: string; dueDate: string | null } | null
}
interface Account {
  currency: string
  balance: number
  owed: number
  credit: number
  overdue: number
  overdueSince: string | null
  nextDue: string | null
  nextDueAmount: number
}

/**
 * Debts are the customer's account (KEYINGI-REJA, 16.3): what is theirs there
 * is spent first, the rest is lent and falls due on its day, money in pays
 * what falls due first, and a cashier lends only as far as the customer's
 * terms and the business's limit go.
 */
describe('Customer accounts', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let cashier: Agent
  let alphaUserId: string

  let registerId: string
  let coat: string
  let drawer: string
  let safe: string
  let today: string
  let nodira: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })
  const day = async (offset: number) =>
    (await sql<{ day: string }[]>(`SELECT ($1::date + $2::int)::text AS day`, [today, offset]))[0].day

  /** Coats on the customer's account, 500 000 so'm each, all of it unless `amount` says less. */
  const onAccount = (
    customerId: string,
    coats = 1,
    more: { amount?: number; dueDate?: string | null; approval?: unknown } = {},
    agent = alpha,
  ) => {
    const total = som(500_000) * coats
    const amount = more.amount ?? total
    return agent.post('/api/sales').send({
      clientKey: randomUUID(),
      registerId,
      customerId,
      lines: [{ variantId: coat, qty: coats }],
      total,
      payments: amount < total ? [{ method: 'cash', currency: 'UZS', amount: total - amount }] : [],
      onAccount: { amount, ...(more.dueDate !== undefined ? { dueDate: more.dueDate } : {}) },
      ...(more.approval ? { approval: more.approval } : {}),
    })
  }
  const customer = async (body: Record<string, unknown>) =>
    (await alpha.post('/api/customers').send(body).expect(201)).body.id as string
  const accountOf = async (customerId: string, agent = alpha) =>
    ((await agent.get(`/api/customers/${customerId}`).expect(200)).body.balances as Account[])[0]
  const pay = (customerId: string, amount: number, accountId = drawer, agent = alpha) =>
    agent.post('/api/customer-payments').send({
      clientKey: randomUUID(),
      customerId,
      kind: 'in',
      lines: [{ accountId, amount }],
      settled: amount,
    })
  const setLimit = (debtLimit: number) =>
    alpha
      .put('/api/org')
      .send({ name: 'Alpha', settings: { autoLockMinutes: 10, debtLimit } })
      .expect(200)

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    alphaUserId = (await alpha.get('/api/auth/me').expect(200)).body.user.id
    today = (
      await sql<{ day: string }[]>(
        `SELECT (now() AT TIME ZONE timezone)::date::text AS day FROM organizations WHERE name = 'Alpha'`,
      )
    )[0].day
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
        lines: [{ variantId: coat, qty: 60, price: som(200_000) }],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${receipt.body.id}/post`).expect(201)
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    await alpha.post('/api/shifts').send({ registerId, cash: {} }).expect(201)
    safe = (
      await alpha.post('/api/money/accounts').send({ kind: 'safe', name: 'Seyf', locationId: shopId }).expect(201)
    ).body.id
    const places = (await alpha.get('/api/customer-payments/accounts').expect(200)).body as {
      id: string
      registerId: string | null
      currency: string
    }[]
    drawer = places.find((place) => place.registerId === registerId && place.currency === 'UZS')!.id
    nodira = await customer({ name: 'Nodira Karimova', phone: '90 123 45 67' })

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

  describe('a sale on account', () => {
    it('falls due after the business’s days unless another day is set, and never on a day gone by', async () => {
      const sale: Sale = (await onAccount(nodira).expect(201)).body
      expect(sale.payments).toEqual([expect.objectContaining({ method: 'account', amount: som(500_000) })])
      expect(sale.due).toEqual({ id: expect.any(String), dueDate: await day(30) })
      const dated: Sale = (await onAccount(nodira, 1, { dueDate: await day(5) }).expect(201)).body
      expect(dated.due?.dueDate).toBe(await day(5))
      const past = await onAccount(nodira, 1, { dueDate: await day(-1) })
      expect(past.body.error.fields['onAccount.dueDate']).toBe('Qarz muddati o‘tgan kunga qo‘yilmaydi')
      // Never falling due is for a customer whose debts are given no day.
      const never = await onAccount(nodira, 1, { dueDate: null })
      expect(never.body.error.fields['onAccount.dueDate']).toBe('Qarz muddatini kiriting')
      expect(await accountOf(nodira)).toMatchObject({
        balance: som(1_000_000),
        owed: som(1_000_000),
        overdue: 0,
        nextDue: await day(5),
        nextDueAmount: som(500_000),
      })
    })

    it('takes a customer’s own days, or none at all, from their card', async () => {
      const weekly = await customer({ name: 'Haftalik', phone: '90 000 00 01' })
      const never = await customer({ name: 'Muddatsiz', phone: '90 000 00 02' })
      for (const [id, terms] of [
        [weekly, { dueDays: 7 }],
        [never, { noDue: true }],
      ] as const) {
        const card = (await alpha.get(`/api/customers/${id}`)).body
        await alpha
          .put(`/api/customers/${id}`)
          .send({ name: card.name, phone: card.phone, groupIds: [], tags: [], isSupplier: false, terms })
          .expect(200)
      }
      expect((await onAccount(weekly).expect(201)).body.due.dueDate).toBe(await day(7))
      expect((await onAccount(never).expect(201)).body.due).toMatchObject({ dueDate: null })
      expect(await accountOf(never)).toMatchObject({ owed: som(500_000), nextDue: null })
    })
  })

  describe('what a cashier may lend', () => {
    it('is nothing without someone’s word while the business lends nothing, and up to its limit once it does', async () => {
      const refused = await onAccount(nodira, 1, {}, cashier)
      expect(refused.status).toBe(400)
      expect(refused.body.error.code).toBe('DEBT_OVER_LIMIT')
      expect(refused.body.error.fields.onAccount).toBe('Nodira Karimova: qarzga faqat rahbar tasdig‘i bilan beriladi')
      const vouched = await onAccount(nodira, 1, { approval: { userId: alphaUserId, pin: PIN } }, cashier)
      expect(vouched.status).toBe(201)
      expect(vouched.body.approvedByName).toBe('Alpha Owner')

      // She owes 1 500 000 now; the business lends 2 500 000 to one customer.
      await setLimit(som(2_500_000))
      await onAccount(nodira, 1, {}, cashier).expect(201)
      const over = await onAccount(nodira, 2, {}, cashier)
      expect(over.body.error.code).toBe('DEBT_OVER_LIMIT')
      expect(over.body.error.fields.onAccount.replace(/\s/g, ' ')).toContain('(3 000 000 so‘m, chegara 2 500 000 so‘m)')
    })

    it('stops at a customer with no phone, one not lent to, and a supplier — unless their card says otherwise', async () => {
      const stranger = await customer({ name: 'Telefonsiz' })
      expect((await onAccount(stranger, 1, {}, cashier)).body.error.code).toBe('NO_PHONE')
      const group = (await alpha.post('/api/customers/groups').send({ name: 'Qarzsiz', noDebt: true }).expect(201)).body
      const barred = await customer({ name: 'Sardor', phone: '93 555 11 22', groupIds: [group.id] })
      expect((await onAccount(barred, 1, {}, cashier)).body.error.code).toBe('NO_DEBT')
      const supplier = await customer({ name: 'Yiwu Textile', phone: '93 555 11 33', isSupplier: true })
      expect((await onAccount(supplier, 1, {}, cashier)).body.error.code).toBe('SUPPLIER_ON_ACCOUNT')

      // Their own ceiling: lent without a phone, past the business's limit, up to it and no further.
      const card = (await alpha.get(`/api/customers/${stranger}`)).body
      await alpha
        .put(`/api/customers/${stranger}`)
        .send({ name: card.name, groupIds: [], tags: [], terms: { credit: 'limit', creditLimit: som(3_000_000) } })
        .expect(200)
      await onAccount(stranger, 6, {}, cashier).expect(201)
      expect((await onAccount(stranger, 1, {}, cashier)).body.error.code).toBe('DEBT_OVER_LIMIT')
      // Whoever may lend needs nobody's word.
      await onAccount(barred).expect(201)
    })

    it('needs nobody’s word to spend what is theirs, and lends only the rest', async () => {
      const prepaid = await customer({ name: 'Avansli', phone: '90 000 00 03' })
      await alpha
        .post('/api/customer-payments/opening')
        .send({ clientKey: randomUUID(), customerId: prepaid, owes: 'us', amount: som(700_000) })
        .expect(201)
      await setLimit(0)
      const covered: Sale = (await onAccount(prepaid, 1, {}, cashier).expect(201)).body
      expect(covered.due).toBeNull()
      const [row] = await sql<{ prepaid: string }[]>(
        `SELECT prepaid FROM sale_payments WHERE sale_id = $1 AND method = 'account'`,
        [covered.id],
      )
      expect(Number(row.prepaid)).toBe(som(500_000))
      // 200 000 of theirs is left: the next coat lends 300 000, and that needs a word.
      expect((await onAccount(prepaid, 1, {}, cashier)).body.error.code).toBe('DEBT_OVER_LIMIT')
      const lent: Sale = (await onAccount(prepaid, 1).expect(201)).body
      expect(lent.due?.dueDate).toBe(await day(30))
      expect(await accountOf(prepaid)).toMatchObject({ balance: som(300_000), owed: som(300_000), credit: 0 })
    })
  })

  describe('a debt past its day', () => {
    let late: string
    let first: Sale
    let second: Sale

    beforeAll(async () => {
      late = await customer({ name: 'Aziz', phone: '90 000 00 04' })
      first = (await onAccount(late, 4).expect(201)).body
      second = (await onAccount(late, 2).expect(201)).body
    })

    it('is moved by whoever keeps the debts, and the till sees it late', async () => {
      await cashier
        .put(`/api/customers/dues/${first.due!.id}`)
        .send({ dueDate: await day(-1) })
        .expect(403)
      await alpha
        .put(`/api/customers/dues/${first.due!.id}`)
        .send({ dueDate: await day(-1) })
        .expect(204)
      const [account] = (await cashier.get('/api/pos/customers').query({ q: 'aziz' }).expect(200)).body[0]
        .accounts as Account[]
      expect(account).toMatchObject({
        owed: som(3_000_000),
        overdue: som(2_000_000),
        overdueSince: await day(-1),
        nextDue: await day(30),
        nextDueAmount: som(1_000_000),
      })
      await setLimit(som(100_000_000))
      expect((await onAccount(late, 1, {}, cashier)).body.error.code).toBe('DEBT_OVERDUE')
      const history = (await alpha.get('/api/audit').query({ entity: 'customer' }).expect(200)).body.items
      expect(history[0]).toMatchObject({ action: 'customer.due' })
    })

    it('is paid first by money brought in, at the till as anywhere', async () => {
      // A cashier takes it into the drawer, not into the safe.
      const places = (await cashier.get('/api/customer-payments/accounts').expect(200)).body as { id: string }[]
      expect(places.map((place) => place.id)).not.toContain(safe)
      const intoSafe = await pay(late, som(100_000), safe, cashier)
      expect(intoSafe.body.error.fields['lines.0.accountId']).toBe('Hisob topilmadi')
      await pay(late, som(1_500_000), drawer, cashier).expect(201)
      expect(await accountOf(late)).toMatchObject({ owed: som(1_500_000), overdue: som(500_000) })
      await pay(late, som(500_000)).expect(201)
      expect(await accountOf(late)).toMatchObject({ owed: som(1_000_000), overdue: 0, nextDue: await day(30) })
      await onAccount(late, 1, {}, cashier).expect(201)
    })

    it('takes goods brought back off their own receipt', async () => {
      const lines = (await alpha.get(`/api/sales/${second.id}`).expect(200)).body.lines as { id: string }[]
      await alpha
        .post('/api/returns')
        .send({
          clientKey: randomUUID(),
          registerId,
          saleId: second.id,
          lines: [{ saleLineId: lines[0].id, qty: 1 }],
          refunds: [],
          total: som(500_000),
        })
        .expect(201)
      // Nothing is handed back: it came off the account.
      expect(await accountOf(late)).toMatchObject({ owed: som(1_000_000), nextDueAmount: som(1_000_000) })
    })

    it('goes with a voided sale, though its day stays written down', async () => {
      const voided: Sale = (await onAccount(late, 1).expect(201)).body
      const before = (await accountOf(late)).owed
      await alpha.post(`/api/sales/${voided.id}/void`).send({ reason: 'Xato' }).expect(200)
      expect((await accountOf(late)).owed).toBe(before - som(500_000))
    })
  })

  it('keeps a day on an opening debt, and the statement shows each day beside its debt', async () => {
    const old = await customer({ name: 'Eski qarzdor', phone: '90 000 00 05' })
    const opening = (
      await alpha
        .post('/api/customer-payments/opening')
        .send({
          clientKey: randomUUID(),
          customerId: old,
          owes: 'customer',
          amount: som(900_000),
          dueDate: await day(-10),
        })
        .expect(201)
    ).body
    expect(await accountOf(old)).toMatchObject({
      owed: som(900_000),
      overdue: som(900_000),
      overdueSince: await day(-10),
    })
    const sale: Sale = (await onAccount(old).expect(201)).body
    const statement = (await alpha.get(`/api/customers/${old}/statement`).expect(200)).body
    expect(statement.lines.map((line: { number: string; due: unknown }) => [line.number, line.due])).toEqual([
      [opening.number, { id: expect.any(String), dueDate: await day(-10) }],
      [sale.number, { id: sale.due!.id, dueDate: await day(30) }],
    ])
    const debtors = (await alpha.get('/api/customers/debtors').query({ state: 'overdue' }).expect(200)).body
    expect(debtors.items.map((row: { customerName: string }) => row.customerName)).toContain('Eski qarzdor')
    expect(debtors.summary.overdueDebtors).toBe(debtors.items.length)
  })

  it('lists who owes, oldest late first, with the sums in the base', async () => {
    const list = (await alpha.get('/api/customers/debtors').expect(200)).body as {
      items: { customerName: string; owed: number; overdue: number }[]
      summary: { owed: number; debtors: number; overdue: number }
    }
    expect(list.items[0].overdue).toBeGreaterThan(0)
    expect(list.summary.owed).toBe(list.items.reduce((sum, row) => sum + row.owed, 0))
    expect(list.summary.debtors).toBe(new Set(list.items.map((row) => row.customerName)).size)
    // A cashier keeps nobody's debts.
    await cashier.get('/api/customers/debtors').expect(403)
  })

  it('shows one business nothing of another', async () => {
    expect((await beta.get('/api/customers/debtors').expect(200)).body.items).toEqual([])
    const [{ id }] = await sql<{ id: string }[]>(`SELECT id FROM customer_dues LIMIT 1`)
    await beta.put(`/api/customers/dues/${id}`).send({ dueDate: today }).expect(404)
  })
})
