import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)
const usd = (amount: number) => Math.round(amount * 100)
const PIN = '4821'

interface Payment {
  id: string
  number: string
  kind: string
  status: string
  currency: string
  change: number
  forgiven: number
  categoryName: string | null
  toCurrency: string | null
  toAmount: number | null
  fx: number
  approvedByName: string | null
}

/**
 * Putting a customer's account right, and money at the till (KEYINGI-REJA,
 * 16.3): an adjustment against a kind of expense or income, an exchange
 * between two of the customer's currencies, a small remainder forgiven as a
 * payment is taken, a drawer that pays out only what the customer is owed —
 * on a manager's word where the person at the till has no say — and a
 * terminal that takes a customer's payment at a till and is checked against
 * its slip.
 */
describe('Customer adjustments', () => {
  let harness: Harness
  let alpha: Agent
  let cashier: Agent
  let manager: Agent
  let managerId: string

  let registerId: string
  let shiftId: string
  let drawer: string
  let safe: string
  let terminal: string
  let card: string
  let badDebts: string
  let otherIncome: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })
  /** What one of the business's own accounts holds, in the base. */
  const system = async (key: string) =>
    Number(
      (
        await sql<{ balance: string }[]>(
          `SELECT a.balance FROM accounts a JOIN organizations o ON o.id = a.org_id
           WHERE o.name = 'Alpha' AND a.system_key = $1`,
          [key],
        )
      )[0]?.balance ?? 0,
    )
  const customer = async (name: string, more: Record<string, unknown> = {}) =>
    (
      await alpha
        .post('/api/customers')
        .send({ name, ...more })
        .expect(201)
    ).body.id as string
  const balance = async (customerId: string, currency = 'UZS') =>
    (
      (await alpha.get(`/api/customers/${customerId}`).expect(200)).body.balances as {
        currency: string
        balance: number
      }[]
    ).find((account) => account.currency === currency)?.balance ?? 0
  const opening = (customerId: string, owes: 'customer' | 'us', amount: number, currency = 'UZS') =>
    alpha
      .post('/api/customer-payments/opening')
      .send({ clientKey: randomUUID(), customerId, currency, owes, amount })
      .expect(201)
  const pay = (
    agent: Agent,
    kind: 'in' | 'out',
    customerId: string,
    accountId: string,
    amount: number,
    more: Record<string, unknown> = {},
  ) =>
    agent.post('/api/customer-payments').send({
      clientKey: randomUUID(),
      customerId,
      kind,
      lines: [{ accountId, amount }],
      settled: amount,
      ...more,
    })
  const adjust = (
    agent: Agent,
    customerId: string,
    categoryId: string,
    amount: number,
    note: string | null = 'Sabab',
  ) =>
    agent
      .post('/api/customer-payments/adjust')
      .send({ clientKey: randomUUID(), customerId, categoryId, amount, ...(note ? { note } : {}) })
  const exchange = (customerId: string, amount: number, settled: number, received?: number) =>
    alpha.post('/api/customer-payments/exchange').send({
      clientKey: randomUUID(),
      customerId,
      from: 'USD',
      to: 'UZS',
      amount,
      settled,
      ...(received ? { received } : {}),
    })

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    await alpha.put('/api/currencies/USD/rate').send({ value: 12_650 }).expect(200)
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    shiftId = (await alpha.post('/api/shifts').send({ registerId, cash: {} }).expect(201)).body.id
    safe = (
      await alpha.post('/api/money/accounts').send({ kind: 'safe', name: 'Seyf', locationId: shopId }).expect(201)
    ).body.id
    terminal = (await alpha.post('/api/money/accounts').send({ kind: 'terminal', name: 'Terminal 1' }).expect(201)).body
      .id
    card = (await alpha.post('/api/money/accounts').send({ kind: 'card', name: 'Humo', last4: '3073' }).expect(201))
      .body.id
    const places = (await alpha.get('/api/customer-payments/accounts').expect(200)).body as {
      id: string
      registerId: string | null
      currency: string
    }[]
    drawer = places.find((place) => place.registerId === registerId && place.currency === 'UZS')!.id

    const categories = (await alpha.get('/api/money/categories').expect(200)).body as {
      id: string
      name: string
      kind: string
    }[]
    badDebts = categories.find((item) => item.name === 'Umidsiz qarzlar' && item.kind === 'expense')!.id
    otherIncome = categories.find((item) => item.name === 'Boshqa daromad' && item.kind === 'income')!.id
    // Money to pay out with: the owner puts some into the safe and the drawer.
    const owner = categories.find((item) => item.name === 'Egasi qo‘shdi' && item.kind === 'income')!.id
    for (const accountId of [safe, drawer]) {
      await alpha
        .post('/api/money/ops')
        .send({
          clientKey: randomUUID(),
          kind: 'income',
          categoryId: owner,
          lines: [{ accountId, amount: som(5_000_000) }],
          total: som(5_000_000),
        })
        .expect(201)
    }

    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    const hire = async (fullName: string, login: string, templateKey: string) => {
      const id = (
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
      ).body.id as string
      return { id, agent: await harness.signIn(login) }
    }
    cashier = (await hire('Dilnoza Kassir', 'kassir', 'cashier')).agent
    ;({ agent: manager, id: managerId } = await hire('Anvar Menejer', 'menejer', 'store_manager'))
    await manager.post('/api/auth/pin').send({ password: PASSWORD, pin: PIN }).expect(204)
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe('an adjustment', () => {
    it('gives a hopeless debt up as an expense, and takes it back when cancelled', async () => {
      const lost = await customer('Yo‘qolgan Mijoz')
      await opening(lost, 'customer', som(300_000))
      const before = await system('expenses')

      const made: Payment = (await adjust(alpha, lost, badDebts, som(300_000), 'Topilmadi').expect(201)).body
      expect(made).toMatchObject({ kind: 'adjust', change: -som(300_000), categoryName: 'Umidsiz qarzlar' })
      expect(await balance(lost)).toBe(0)
      expect((await system('expenses')) - before).toBe(som(300_000))

      const statement = (await alpha.get(`/api/customers/${lost}/statement`).expect(200)).body
      expect(statement.lines.at(-1)).toMatchObject({ kind: 'adjust', number: made.number, change: -som(300_000) })

      await alpha.post(`/api/customer-payments/${made.id}/cancel`).send({ reason: 'Topildi' }).expect(200)
      expect(await balance(lost)).toBe(som(300_000))
      expect(await system('expenses')).toBe(before)
    })

    it('counts a supplier’s bonus as income: the business owes them less', async () => {
      const dordoy = await customer('Dordoy', { isSupplier: true })
      await opening(dordoy, 'us', som(1_000_000))
      const made: Payment = (await adjust(alpha, dordoy, otherIncome, som(100_000), 'Bonus').expect(201)).body
      expect(made.change).toBe(som(100_000))
      expect(await balance(dordoy)).toBe(-som(900_000))
    })

    it('is for those who may put accounts right, and always says why', async () => {
      const someone = await customer('Kimdir')
      await opening(someone, 'customer', som(50_000))
      await adjust(manager, someone, badDebts, som(50_000)).expect(403)
      await adjust(cashier, someone, badDebts, som(50_000)).expect(403)
      const silent = await adjust(alpha, someone, badDebts, som(50_000), null)
      expect(silent.status).toBe(400)
      expect(silent.body.error.fields.note).toBeDefined()
    })
  })

  describe('an exchange inside the account', () => {
    it('sets what is theirs in dollars against what they owe in so’m, at the day’s rate', async () => {
      const elaris = await customer('Elaris')
      await opening(elaris, 'us', usd(100), 'USD')
      await opening(elaris, 'customer', som(1_265_000))

      const stale = await exchange(elaris, usd(100), som(1_200_000))
      expect(stale.status).toBe(409)
      expect(stale.body.error.code).toBe('RATE_CHANGED')

      const made: Payment = (await exchange(elaris, usd(100), som(1_265_000)).expect(201)).body
      expect(made).toMatchObject({
        kind: 'exchange',
        currency: 'USD',
        change: usd(100),
        toCurrency: 'UZS',
        toAmount: som(1_265_000),
        fx: 0,
      })
      expect(await balance(elaris, 'USD')).toBe(0)
      expect(await balance(elaris, 'UZS')).toBe(0)
      // It stands in both accounts' statements, under one number.
      for (const [currency, change] of [
        ['USD', usd(100)],
        ['UZS', -som(1_265_000)],
      ] as const) {
        const statement = (await alpha.get(`/api/customers/${elaris}/statement?currency=${currency}`).expect(200)).body
        expect(statement.lines.at(-1)).toMatchObject({ kind: 'exchange', number: made.number, change })
      }
    })

    it('takes a sum agreed, and writes down what the rate made of it', async () => {
      const buyer = await customer('Kelishgan Mijoz')
      await opening(buyer, 'us', usd(50), 'USD')
      await opening(buyer, 'customer', som(650_000))
      const before = await system('fx')

      // Fifty dollars are worth 632 500 today; they are taken for 650 000.
      const made: Payment = (await exchange(buyer, usd(50), som(650_000), som(650_000)).expect(201)).body
      expect(made).toMatchObject({ toAmount: som(650_000), fx: -som(17_500) })
      expect(await balance(buyer, 'USD')).toBe(0)
      expect(await balance(buyer, 'UZS')).toBe(0)
      expect((await system('fx')) - before).toBe(som(17_500))

      await alpha.post(`/api/customer-payments/${made.id}/cancel`).send({ reason: 'Xato' }).expect(200)
      expect(await balance(buyer, 'USD')).toBe(-usd(50))
      expect(await balance(buyer, 'UZS')).toBe(som(650_000))
      expect(await system('fx')).toBe(before)
    })

    it('needs two currencies, and the right to put accounts right', async () => {
      const someone = await customer('Bir Valyuta')
      const same = await alpha.post('/api/customer-payments/exchange').send({
        clientKey: randomUUID(),
        customerId: someone,
        from: 'USD',
        to: 'USD',
        amount: usd(10),
        settled: usd(10),
      })
      expect(same.status).toBe(400)
      await manager
        .post('/api/customer-payments/exchange')
        .send({ clientKey: randomUUID(), customerId: someone, from: 'USD', to: 'UZS', amount: usd(10), settled: 1 })
        .expect(403)
    })
  })

  describe('a remainder forgiven', () => {
    it('closes what is left of a debt as the money is taken, up to the step change is rounded by', async () => {
      const buyer = await customer('Qoldiqli Mijoz')
      await opening(buyer, 'customer', som(500_500))
      const before = await system('rounding')

      const tooMuch = await pay(alpha, 'in', buyer, drawer, som(500_000), { forgive: som(1_000) })
      expect(tooMuch.status).toBe(400)
      expect(tooMuch.body.error.fields.forgive).toBe('Qolgan qarzdan ko‘p kechib bo‘lmaydi')

      // A cashier lets it go too: it is the change nobody counts out.
      const made: Payment = (await pay(cashier, 'in', buyer, drawer, som(500_000), { forgive: som(500) }).expect(201))
        .body
      expect(made).toMatchObject({ change: -som(500_500), forgiven: som(500) })
      expect(await balance(buyer)).toBe(0)
      expect((await system('rounding')) - before).toBe(som(500))
    })

    it('is not a way to give a debt up', async () => {
      const buyer = await customer('Katta Qoldiq')
      await opening(buyer, 'customer', som(505_000))
      const refused = await pay(alpha, 'in', buyer, drawer, som(500_000), { forgive: som(5_000) })
      expect(refused.status).toBe(400)
      expect(refused.body.error.fields.forgive).toContain('hisob tuzatish')
      const paidOut = await pay(alpha, 'out', buyer, safe, som(1_000), { forgive: som(100) })
      expect(paidOut.status).toBe(400)
    })
  })

  describe('money out of a drawer', () => {
    it('is no more than the customer is owed, unless whoever keeps the money pays ahead', async () => {
      const buyer = await customer('Avansli Mijoz')
      await pay(alpha, 'in', buyer, drawer, som(200_000)).expect(201)
      expect(await balance(buyer)).toBe(-som(200_000))

      // A cashier hands back no more than the customer left, whoever gave the word.
      const over = await pay(cashier, 'out', buyer, drawer, som(300_000), {
        registerId,
        approval: { userId: managerId, pin: PIN },
      })
      expect(over.status).toBe(409)
      expect(over.body.error.code).toBe('ADVANCE_EXCEEDED')
      await pay(alpha, 'out', buyer, drawer, som(200_000)).expect(201)
      expect(await balance(buyer)).toBe(0)

      // The owner pays a supplier ahead out of a drawer as out of a safe.
      const supplier = await customer('Oldindan Olgan', { isSupplier: true })
      await pay(alpha, 'out', supplier, drawer, som(100_000)).expect(201)
      await pay(alpha, 'out', supplier, safe, som(100_000)).expect(201)
      expect(await balance(supplier)).toBe(som(200_000))
      // Given back, the drawer is as the shift's later counts expect it.
      await pay(alpha, 'in', supplier, drawer, som(100_000)).expect(201)
    })

    it('is handed back by whoever takes payments, from a drawer and to a customer only', async () => {
      const buyer = await customer('Qaytaruvchi')
      await pay(alpha, 'in', buyer, drawer, som(150_000)).expect(201)
      // The safe is not theirs to pay out of.
      const fromSafe = await pay(manager, 'out', buyer, safe, som(50_000))
      expect(fromSafe.status).toBe(400)
      await pay(manager, 'out', buyer, drawer, som(50_000)).expect(201)
      expect(await balance(buyer)).toBe(-som(100_000))

      const supplier = await customer('Ta’minotchi', { isSupplier: true })
      await opening(supplier, 'us', som(400_000))
      await pay(manager, 'out', supplier, drawer, som(100_000)).expect(403)
    })

    it('needs a manager’s word from a cashier', async () => {
      const buyer = await customer('PIN Bilan')
      await pay(alpha, 'in', buyer, drawer, som(120_000)).expect(201)

      const alone = await pay(cashier, 'out', buyer, drawer, som(120_000), { registerId })
      expect(alone.status).toBe(400)
      expect(alone.body.error.code).toBe('PAYOUT_NEEDS_WORD')
      const nowhere = await pay(cashier, 'out', buyer, drawer, som(120_000), {
        approval: { userId: managerId, pin: PIN },
      })
      expect(nowhere.body.error.code).toBe('PAYOUT_NEEDS_WORD')
      const wrong = await pay(cashier, 'out', buyer, drawer, som(120_000), {
        registerId,
        approval: { userId: managerId, pin: '0000' },
      })
      expect(wrong.status).toBe(400)
      expect(wrong.body.error.fields.approval).toBeDefined()

      const made: Payment = (
        await pay(cashier, 'out', buyer, drawer, som(120_000), {
          registerId,
          approval: { userId: managerId, pin: PIN },
        }).expect(201)
      ).body
      expect(made.approvedByName).toBe('Anvar Menejer')
      expect(await balance(buyer)).toBe(0)
    })
  })

  describe('a terminal at the till', () => {
    it('takes a customer’s payment while the shift is open, and its slip is checked against it', async () => {
      const buyer = await customer('Terminalchi')
      await opening(buyer, 'customer', som(400_000))

      // Offered only where it can be used: asked for from the till.
      const plain = (await cashier.get('/api/customer-payments/accounts').expect(200)).body as { id: string }[]
      expect(plain.some((place) => place.id === terminal)).toBe(false)
      const atTill = (await cashier.get(`/api/customer-payments/accounts?registerId=${registerId}`).expect(200))
        .body as { id: string }[]
      expect(atTill.some((place) => place.id === terminal)).toBe(true)

      const away = await pay(cashier, 'in', buyer, terminal, som(100_000))
      expect(away.status).toBe(400)
      expect(away.body.error.fields['lines.0.accountId']).toContain('terminal faqat kassada')
      const out = await pay(alpha, 'out', buyer, terminal, som(10_000), { registerId })
      expect(out.status).toBe(400)

      await pay(cashier, 'in', buyer, terminal, som(100_000), { registerId }).expect(201)
      await pay(cashier, 'in', buyer, card, som(50_000), { registerId }).expect(201)
      expect(await balance(buyer)).toBe(som(250_000))

      const open = (await alpha.get(`/api/shifts/${shiftId}`).expect(200)).body
      expect(open.totals.customers).toEqual([
        { kind: 'in', method: 'card', accountName: 'Humo', currency: 'UZS', amount: som(50_000) },
        { kind: 'in', method: 'terminal', accountName: 'Terminal 1', currency: 'UZS', amount: som(100_000) },
      ])
      // Neither went through the drawer: it holds only what the payments above put into it (500 000, 200 000,
      // 100 000, 150 000 and 120 000), less what went out of it.
      const drawerMoves = open.totals.cash.find((row: { currency: string }) => row.currency === 'UZS')
      expect(drawerMoves.customersIn).toBe(som(1_070_000))
      expect(drawerMoves.customersOut).toBe(som(470_000))

      const counted = drawerMoves.customersIn - drawerMoves.customersOut + som(5_000_000)
      await alpha
        .post(`/api/shifts/${shiftId}/close`)
        .send({ cash: { UZS: counted }, terminals: [{ accountId: terminal, amount: som(100_000) }] })
        .expect(200)
      const closed = (await alpha.get(`/api/shifts/${shiftId}`).expect(200)).body
      expect(closed.terminals).toEqual([
        { accountId: terminal, name: 'Terminal 1', counted: som(100_000), expected: som(100_000), diff: 0 },
      ])
    })
  })
})
