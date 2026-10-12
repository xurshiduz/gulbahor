import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)
const usd = (amount: number) => Math.round(amount * 100)
const PIN = '4821'

interface Change {
  way: string
  accountName: string
  currency: string
  amount: number
  base: number
  fx: number
}

/**
 * Change at the till goes back in parts (KEYINGI-REJA, 17.2). What nobody
 * names is cash in the base, as ever. Beside it: another drawer's notes, at
 * the day's rate or for a worth agreed with the customer; a sum kept on the
 * customer's own account; a sum sent from one of the shop's cards when the
 * drawer has nothing to give. A card may be sent more than the sale comes
 * to, and what is over goes back the same ways; a terminal may not.
 */
describe('Change at the till', () => {
  let harness: Harness
  let alpha: Agent
  let cashier: Agent
  let alphaUserId: string

  let registerId: string
  let shiftId: string
  let scarf: string
  let cardId: string
  let terminalId: string
  let nodira: string
  let elaris: string
  let textile: string
  let today: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  /** A scarf at 75 000 so'm, paid — unless said otherwise — with a 100 000 note: 25 000 to come back. */
  const sell = (body: Record<string, unknown>, agent = alpha) =>
    agent.post('/api/sales').send({
      clientKey: randomUUID(),
      registerId,
      lines: [{ variantId: scarf, qty: 1 }],
      total: som(75_000),
      payments: [{ method: 'cash', amount: som(100_000) }],
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
  const system = (key: string) => held(`a.system_key = $1`, [key])
  const card = () => held(`a.id = $1`, [cardId])
  const owes = async (customerId: string, currency?: string) =>
    (
      await alpha
        .get(`/api/customers/${customerId}/statement`)
        .query(currency ? { currency } : {})
        .expect(200)
    ).body as { balance: number; lines: { source: string; number: string; change: number }[] }
  /** Every entry a sale wrote comes to nothing in the base. */
  const balanced = async (saleId: string) => {
    const [books] = await sql<{ base: string }[]>(
      `SELECT coalesce(sum(l.base), 0) AS base FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
       WHERE e.document_id = $1`,
      [saleId],
    )
    return Number(books.base) === 0
  }

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    alphaUserId = (await alpha.get('/api/auth/me').expect(200)).body.user.id
    ;[{ today }] = await sql<{ today: string }[]>(
      `SELECT (now() AT TIME ZONE timezone)::date::text AS today FROM organizations WHERE name = 'Alpha'`,
    )
    await alpha.put('/api/currencies/USD/rate').send({ value: 12_650 }).expect(200)
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    const retail = ((await alpha.get('/api/price-types')).body as { id: string; kind: string }[]).find(
      (type) => type.kind === 'retail',
    )!.id
    scarf = (
      await alpha
        .post('/api/products')
        .send({
          name: 'Sharf',
          axisIds: [],
          variants: [{ valueIds: [] }],
          prices: [{ priceTypeId: retail, amount: som(75_000), currency: 'UZS' }],
        })
        .expect(201)
    ).body.variants[0].id
    const receipt = await alpha
      .post('/api/receipts')
      .send({
        locationId: shopId,
        docDate: '2026-10-01',
        currency: 'UZS',
        lines: [{ variantId: scarf, qty: 60, price: som(30_000) }],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${receipt.body.id}/post`).expect(201)
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    cardId = (
      await alpha
        .post('/api/money/accounts')
        .send({ kind: 'card', name: 'Humo', locationId: shopId, last4: '3073' })
        .expect(201)
    ).body.id
    terminalId = (await alpha.post('/api/money/accounts').send({ kind: 'terminal', name: 'Terminal 1' }).expect(201))
      .body.id
    shiftId = (await alpha.post('/api/shifts').send({ registerId, cash: {} }).expect(201)).body.id

    nodira = (await alpha.post('/api/customers').send({ name: 'Nodira', phone: '90 123 45 67' }).expect(201)).body.id
    elaris = (await alpha.post('/api/customers').send({ name: 'Elaris', currency: 'USD' }).expect(201)).body.id
    textile = (await alpha.post('/api/customers').send({ name: 'Textile', isSupplier: true }).expect(201)).body.id

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

  it('is cash in the base when nobody says otherwise', async () => {
    const sale = (await sell({}, cashier).expect(201)).body
    expect(sale.change).toEqual([
      { way: 'cash', accountName: 'Kassa 1 (so‘m)', currency: 'UZS', amount: som(25_000), base: som(25_000), fx: 0 },
    ])
    expect(await drawer('UZS')).toBe(som(75_000))
    const context = (await cashier.get(`/api/pos/context/${registerId}`).expect(200)).body
    expect(context.mayReturnAny).toBe(false)
    // What the drawer holds is for those who may see balances: a cashier counts it blind.
    expect(context.held).toBeNull()
    const owners = (await alpha.get(`/api/pos/context/${registerId}`).expect(200)).body
    expect(owners.mayReturnAny).toBe(true)
    expect(owners.held[owners.drawers.UZS]).toBe(som(75_000))
    expect(owners.held[cardId]).toBe(0)
  })

  describe('in another currency', () => {
    it('goes for what was agreed, and the rate keeps the difference', async () => {
      const before = { usd: await drawer('USD'), som: await drawer('UZS'), fx: await system('fx') }
      // No so'm to give: two dollars for the 25 000, though the rate makes them 25 300 — 1,2%, a cashier's to give.
      const sale = (
        await sell({ change: [{ way: 'cash', currency: 'USD', amount: usd(2), value: som(25_000) }] }, cashier).expect(
          201,
        )
      ).body
      expect(sale.change).toEqual([
        { way: 'cash', accountName: 'Kassa 1 ($)', currency: 'USD', amount: usd(2), base: som(25_000), fx: -som(300) },
      ])
      expect(sale).toMatchObject({ rounding: 0, approvedByName: null })
      // The notes left the drawer; the so'm note stayed whole; the rate lost 300.
      expect((await drawer('USD')) - before.usd).toBe(-usd(2))
      expect((await drawer('UZS')) - before.som).toBe(som(100_000))
      expect((await system('fx')) - before.fx).toBe(som(300))
      expect(await balanced(sale.id)).toBe(true)
    })

    it('is part of it, the rest in the base as ever', async () => {
      // One dollar at the rate is 12 650; 12 350 is left, handed back as 12 000.
      const sale = (await sell({ change: [{ way: 'cash', currency: 'USD', amount: usd(1) }] }, cashier).expect(201))
        .body
      expect(sale.change.map((line: Change) => [line.currency, line.amount, line.base, line.fx])).toEqual([
        ['USD', usd(1), som(12_650), 0],
        ['UZS', som(12_000), som(12_000), 0],
      ])
      expect(sale.rounding).toBe(som(350))
    })

    it('does not go past what was paid over the sum', async () => {
      // Two dollars at the rate are 25 300.
      const over = await sell({ change: [{ way: 'cash', currency: 'USD', amount: usd(2) }] })
      expect(over.status).toBe(400)
      expect(over.body.error.fields.change).toContain('dan oshmasligi kerak')
      const none = await sell({
        payments: [{ method: 'cash', amount: som(75_000) }],
        change: [{ way: 'cash', currency: 'USD', amount: usd(1) }],
      })
      expect(none.body.error.fields.change).toBe('Ortiqcha to‘lov yo‘q: qaytim berilmaydi')
      // What is cash in the base is whatever is left: nobody writes it.
      const base = await sell({ change: [{ way: 'cash', currency: 'UZS', amount: som(5000) }] })
      expect(base.body.error.fields['change.0.currency']).toBeDefined()
      // A currency the till keeps no drawer of.
      const lira = await sell({ change: [{ way: 'cash', currency: 'TRY', amount: 100 }] })
      expect(lira.body.error.fields['change.0.currency']).toBeDefined()
    })

    it('needs a word once it gives away more than the shop lets a cashier', async () => {
      // Two dollars for 24 000: 1 300 under the rate, 5,1%.
      const cheap = (approval?: { userId: string; pin: string }, agent = cashier) =>
        sell({ change: [{ way: 'cash', currency: 'USD', amount: usd(2), value: som(24_000) }], approval }, agent)
      const refused = await cheap()
      expect(refused.status).toBe(400)
      expect(refused.body.error.code).toBe('RATE_LOSS_OVER_LIMIT')
      const sale = (await cheap({ userId: alphaUserId, pin: PIN }).expect(201)).body
      expect(sale.approvedByName).toBe('Alpha Owner')
      expect(sale.change.map((line: Change) => [line.currency, line.amount, line.fx])).toEqual([
        ['USD', usd(2), -som(1300)],
        ['UZS', som(1000), 0],
      ])
      // Someone who may give discounts past the limit gives this too, alone.
      expect((await cheap(undefined, alpha).expect(201)).body.approvedByName).toBeNull()
    })
  })

  describe('kept on the customer’s account', () => {
    it('is theirs to spend next time, with no word asked', async () => {
      const before = await drawer('UZS')
      const sale = (
        await sell({ customerId: nodira, change: [{ way: 'account', amount: som(15_000) }] }, cashier).expect(201)
      ).body
      // On the receipt the account has no name: it is theirs, not a place.
      expect(sale.change).toEqual([
        { way: 'account', accountName: '', currency: 'UZS', amount: som(15_000), base: som(15_000), fx: 0 },
        expect.objectContaining({ way: 'cash', currency: 'UZS', amount: som(10_000) }),
      ])
      expect(sale.approvedByName).toBeNull()
      // 100 000 in, 10 000 back out.
      expect((await drawer('UZS')) - before).toBe(som(90_000))
      const account = await owes(nodira)
      expect(account.balance).toBe(-som(15_000))
      expect(account.lines).toEqual([
        expect.objectContaining({ source: 'sale', number: sale.number, change: -som(15_000) }),
      ])
      expect(await balanced(sale.id)).toBe(true)
    })

    it('pays what they owe first', async () => {
      // A scarf on account: 75 000 lent, less the 15 000 that was theirs.
      await sell({ customerId: nodira, payments: [], onAccount: { amount: som(75_000) } }).expect(201)
      expect((await owes(nodira)).balance).toBe(som(60_000))
      await sell({ customerId: nodira, change: [{ way: 'account', amount: som(25_000) }] }, cashier).expect(201)
      expect((await owes(nodira)).balance).toBe(som(35_000))
      const [debtor] = (await alpha.get(`/api/customers/${nodira}`).expect(200)).body.balances
      expect(debtor).toMatchObject({ currency: 'UZS', balance: som(35_000), owed: som(35_000), credit: 0 })
    })

    it('goes on an account kept in another currency at the rate, or for a sum agreed', async () => {
      // A dollar on Elaris's account for 13 000 of the change: the rate makes it 12 650.
      const sale = (
        await sell(
          { customerId: elaris, change: [{ way: 'account', amount: usd(1), value: som(13_000) }] },
          cashier,
        ).expect(201)
      ).body
      expect(sale.change.map((line: Change) => [line.way, line.currency, line.amount, line.base, line.fx])).toEqual([
        ['account', 'USD', usd(1), som(13_000), som(350)],
        ['cash', 'UZS', som(12_000), som(12_000), 0],
      ])
      expect((await owes(elaris, 'USD')).balance).toBe(-usd(1))
      expect(await balanced(sale.id)).toBe(true)
    })

    it('goes on a supplier’s account on the word a sale on it takes', async () => {
      const kept = { customerId: textile, change: [{ way: 'account', amount: som(5000) }] }
      const alone = await sell(kept, cashier)
      expect(alone.status).toBe(400)
      expect(alone.body.error.code).toBe('SUPPLIER_ON_ACCOUNT')
      expect(alone.body.error.fields['change.0.way']).toContain('yetkazib beruvchi')
      const before = (await owes(textile)).balance
      const vouched = (await sell({ ...kept, approval: { userId: alphaUserId, pin: PIN } }, cashier).expect(201)).body
      expect(vouched.approvedByName).toBeTruthy()
      // Whoever may lend needs nobody's word, and none is written down.
      const own = (await sell(kept).expect(201)).body
      expect(own.approvedByName).toBeNull()
      expect((await owes(textile)).balance - before).toBe(-som(10_000))
      expect(await balanced(vouched.id)).toBe(true)
    })

    it('is somebody’s, and not beside a debt made in the same sale', async () => {
      const nobody = await sell({ change: [{ way: 'account', amount: som(5000) }] })
      expect(nobody.status).toBe(400)
      expect(nobody.body.error.fields.customerId).toBeDefined()
      const both = await sell({
        customerId: nodira,
        payments: [{ method: 'cash', amount: som(50_000) }],
        onAccount: { amount: som(30_000) },
        change: [{ way: 'account', amount: som(5000) }],
      })
      expect(both.status).toBe(400)
      expect(both.body.error.fields.change).toBeDefined()
    })
  })

  describe('sent from a card', () => {
    const sent = (approval?: { userId: string; pin: string }, agent = cashier) =>
      sell({ change: [{ way: 'card', accountId: cardId, amount: som(25_000) }], approval }, agent)

    it('takes the word of someone who may hand money back any way', async () => {
      const refused = await sent()
      expect(refused.status).toBe(400)
      expect(refused.body.error.code).toBe('CHANGE_NEEDS_WORD')
      expect(await card()).toBe(0)

      const before = await drawer('UZS')
      const sale = (await sent({ userId: alphaUserId, pin: PIN }).expect(201)).body
      expect(sale.change).toEqual([
        { way: 'card', accountName: 'Humo', currency: 'UZS', amount: som(25_000), base: som(25_000), fx: 0 },
      ])
      expect(sale.approvedByName).toBe('Alpha Owner')
      // The whole note stays in the drawer; the card is down by what it sent.
      expect((await drawer('UZS')) - before).toBe(som(100_000))
      expect(await card()).toBe(-som(25_000))
      expect(await balanced(sale.id)).toBe(true)

      // Whoever holds the right needs nobody.
      expect((await sent(undefined, alpha).expect(201)).body.approvedByName).toBeNull()
      expect(await card()).toBe(-som(50_000))
    })

    it('is one of the shop’s cards', async () => {
      const terminal = await sell({ change: [{ way: 'card', accountId: terminalId, amount: som(25_000) }] })
      expect(terminal.status).toBe(400)
      expect(terminal.body.error.fields['change.0.accountId']).toBe('Karta topilmadi')
    })
  })

  describe('a card sent more than the sale comes to', () => {
    it('gives the rest back as change; a terminal takes the sum and no more', async () => {
      const before = { card: await card(), som: await drawer('UZS') }
      const sale = (
        await sell({ payments: [{ method: 'card', accountId: cardId, amount: som(100_000) }] }, cashier).expect(201)
      ).body
      expect(sale.change).toEqual([expect.objectContaining({ way: 'cash', currency: 'UZS', amount: som(25_000) })])
      expect((await card()) - before.card).toBe(som(100_000))
      expect((await drawer('UZS')) - before.som).toBe(-som(25_000))

      const slip = await sell({ payments: [{ method: 'terminal', accountId: terminalId, amount: som(100_000) }] })
      expect(slip.status).toBe(400)
      expect(slip.body.error.fields.payments).toContain('Terminal summasi chekdan oshmasligi kerak')
    })
  })

  describe('afterwards', () => {
    it('is in the shift’s report: out of each drawer, and what came out of none', async () => {
      const shift = (await alpha.get(`/api/shifts/${shiftId}`).expect(200)).body
      const moved = Object.fromEntries(
        (shift.totals.cash as { currency: string; change: number }[]).map((row) => [row.currency, row.change]),
      )
      // Dollars: 2 + 1 + 2 + 2. So'm: 25 000 + 12 000 + 1 000 + 1 000 + 10 000 + 12 000 + 20 000 + 20 000 + 25 000.
      expect(moved).toMatchObject({ USD: usd(7), UZS: som(126_000) })
      expect(shift.totals.changes).toEqual([
        { way: 'account', accountName: '', currency: 'UZS', amount: som(50_000) },
        { way: 'account', accountName: '', currency: 'USD', amount: usd(1) },
        { way: 'card', accountName: 'Humo', currency: 'UZS', amount: som(50_000) },
      ])
    })

    it('comes off the way it went in what the day brought', async () => {
      const report = (await alpha.get('/api/reports/sales').query({ from: today, to: today }).expect(200)).body
      const brought = (report.payments as { base: number }[]).reduce((sum, row) => sum + row.base, 0)
      const [{ rounding }] = await sql<{ rounding: string }[]>(
        `SELECT coalesce(sum(s.rounding), 0) AS rounding FROM sales s JOIN organizations o ON o.id = s.org_id
         WHERE o.name = 'Alpha' AND s.status = 'completed'`,
      )
      // What was paid, less every part of the change, is what was sold and what rounding kept.
      expect(brought).toBe(report.totals.net + Number(rounding))
    })

    it('goes back with the sale when the sale is undone', async () => {
      const before = { card: await card(), owed: (await owes(nodira)).balance, usd: await drawer('USD') }
      const sale = (
        await sell({
          customerId: nodira,
          change: [
            { way: 'account', amount: som(5000) },
            { way: 'card', accountId: cardId, amount: som(7350) },
            { way: 'cash', currency: 'USD', amount: usd(1) },
          ],
        }).expect(201)
      ).body
      expect(sale.change).toHaveLength(3)
      expect((await owes(nodira)).balance).toBe(before.owed - som(5000))
      await alpha.post(`/api/sales/${sale.id}/void`).send({ reason: 'Xato urildi' }).expect(200)
      expect(await card()).toBe(before.card)
      expect((await owes(nodira)).balance).toBe(before.owed)
      expect(await drawer('USD')).toBe(before.usd)
    })

    it('leaves what the goods cost to go back when they are brought back', async () => {
      const sale = (
        await sell({ customerId: elaris, change: [{ way: 'account', amount: usd(1), value: som(13_000) }] }).expect(201)
      ).body
      const found = (await alpha.get('/api/returns/lookup').query({ code: sale.number }).expect(200)).body
      // The goods were paid for in cash; what was kept on the account is theirs still.
      expect(found.caps).toMatchObject({ cash: som(75_000), account: 0 })
      const owed = (await owes(elaris, 'USD')).balance
      await alpha
        .post('/api/returns')
        .send({
          clientKey: randomUUID(),
          registerId,
          saleId: sale.id,
          lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
          refunds: [{ method: 'cash', amount: som(75_000) }],
          total: som(75_000),
        })
        .expect(201)
      expect((await owes(elaris, 'USD')).balance).toBe(owed)
    })
  })
})
