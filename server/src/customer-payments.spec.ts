import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'
import { drawerOf } from './testing/shifts'

const som = (amount: number) => Math.round(amount * 100)
const usd = (dollars: number) => Math.round(dollars * 100)

interface AccountRow {
  id: string
  kind: string
  name: string
  currency: string
  open?: boolean
}

/**
 * What customers owe and the money that settles it (TL-): an account for each
 * currency a customer deals in, payments in any currency valued at the rate
 * to the cent, and a statement that shows every change.
 */
describe('Customer payments', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let accountant: Agent
  let dealer: Agent
  let keeper: Agent

  let registerId: string
  let shiftId: string
  let drawerId: string
  let dollarDrawerId: string
  let safeId: string
  let cardId: string
  let anvarId: string
  let supplierId: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  /** Balances by account: drawers and safes by currency, customers by name, the ledger's own by their key. */
  const balances = async (): Promise<Record<string, number>> => {
    const rows = await sql<
      { kind: string; system_key: string | null; currency: string; name: string; balance: string }[]
    >(
      `SELECT a.kind, a.system_key, a.currency, a.name, a.balance FROM accounts a
       JOIN organizations o ON o.id = a.org_id WHERE o.name = 'Alpha'`,
    )
    return Object.fromEntries(
      rows.map((row) => [
        row.system_key ?? (row.kind === 'customer' ? row.name : `${row.kind}_${row.currency}`),
        Number(row.balance),
      ]),
    )
  }

  const moved = (before: Record<string, number>, after: Record<string, number>) =>
    Object.fromEntries(
      Object.keys(after)
        .map((key) => [key, after[key] - (before[key] ?? 0)] as const)
        .filter(([, delta]) => delta !== 0),
    )

  const pay = (body: Record<string, unknown>, agent = alpha) =>
    agent.post('/api/customer-payments').send({ clientKey: randomUUID(), ...body })

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    safeId = (await alpha.post('/api/money/accounts').send({ kind: 'safe', name: 'Seyf' }).expect(201)).body.id
    cardId = (await alpha.post('/api/money/accounts').send({ kind: 'card', name: 'Humo', last4: '3073' }).expect(201))
      .body.id
    await alpha.put('/api/currencies/USD/rate').send({ value: 12_650 }).expect(200)
    shiftId = (
      await alpha
        .post('/api/shifts')
        .send({ registerId, cash: { UZS: som(1_000_000), USD: usd(10) } })
        .expect(201)
    ).body.id
    const accounts = (await alpha.get('/api/money/accounts').expect(200)).body as AccountRow[]
    drawerId = accounts.find((account) => account.kind === 'cash' && account.currency === 'UZS')!.id
    dollarDrawerId = accounts.find((account) => account.kind === 'cash' && account.currency === 'USD')!.id

    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    const hire = async (fullName: string, login: string, templateKey: string) => {
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
      return harness.signIn(login)
    }
    accountant = await hire('Hilola Hisobchi', 'hisobchi', 'accountant')
    dealer = await hire('Jasur Hamkorchi', 'hamkorchi', 'partners_manager')
    keeper = await hire('Sobir Omborchi', 'omborchi', 'warehouse')
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe('a customer', () => {
    it('has an account for each currency they deal in, shown to those who may see it', async () => {
      const anvar = (await alpha.post('/api/customers').send({ name: 'Anvar', currency: 'USD' }).expect(201)).body
      expect(anvar).toMatchObject({ currency: 'USD', balances: [] })
      anvarId = anvar.id
      const supplier = (
        await alpha.post('/api/customers').send({ name: 'Guangzhou Textile', isSupplier: true }).expect(201)
      ).body
      expect(supplier).toMatchObject({ currency: 'UZS', isSupplier: true, balances: [] })
      supplierId = supplier.id

      // The storekeeper names suppliers on receipts and has no business with the book or what anyone is owed.
      await keeper.get('/api/customers').expect(403)
      const picked = (await keeper.get('/api/customers/brief').query({ q: 'guangzhou' }).expect(200)).body
      expect(picked).toEqual([expect.objectContaining({ id: supplierId, isSupplier: true, phoneTail: null })])
      await keeper.get(`/api/customers/${anvarId}/statement`).expect(403)
    })

    it('starts with what stood between them and the business before the books began', async () => {
      await dealer.post('/api/customer-payments/opening').send({}).expect(400)
      const opening = (
        await dealer
          .post('/api/customer-payments/opening')
          .send({
            clientKey: randomUUID(),
            customerId: anvarId,
            owes: 'customer',
            amount: usd(1850),
            note: 'Eski qarz',
          })
          .expect(201)
      ).body
      expect(opening).toMatchObject({
        number: 'TL-000001',
        kind: 'opening',
        status: 'posted',
        customerName: 'Anvar',
        currency: 'USD',
        change: usd(1850),
        lines: [],
      })
      // The business owes its supplier five million.
      await alpha
        .post('/api/customer-payments/opening')
        .send({ clientKey: randomUUID(), customerId: supplierId, owes: 'us', amount: som(5_000_000) })
        .expect(201)
      expect(await balances()).toMatchObject({ Anvar: usd(1850), 'Guangzhou Textile': -som(5_000_000) })
      const listed = (await accountant.get('/api/customers').query({ sort: 'name' }).expect(200)).body.items
      expect(listed.map((customer: { balances: unknown }) => customer.balances)).toMatchObject([
        [{ currency: 'USD', balance: usd(1850) }],
        [{ currency: 'UZS', balance: -som(5_000_000) }],
      ])
      // What stood before is set by who may adjust accounts.
      await accountant
        .post('/api/customer-payments/opening')
        .send({ clientKey: randomUUID(), customerId: anvarId, owes: 'customer', amount: usd(1) })
        .expect(403)
    })
  })

  describe('a payment', () => {
    let firstId: string

    it('takes money in any currency and settles the account to the cent', async () => {
      const accounts = (await dealer.get('/api/customer-payments/accounts').expect(200)).body as AccountRow[]
      expect(accounts.map((account) => account.name)).toEqual(['Kassa 1 ($)', 'Kassa 1 (so‘m)', 'Seyf', 'Humo'])
      // The till's shift is open: money can go through every one of them.
      expect(accounts.every((account) => account.open)).toBe(true)

      const before = await balances()
      const key = randomUUID()
      // 500 $ in cash, 6 325 000 so'm in cash and 1 265 000 so'm to the card, at 12 650: 500 + 500 + 100 dollars.
      const body = {
        clientKey: key,
        customerId: anvarId,
        kind: 'in',
        lines: [
          { accountId: dollarDrawerId, amount: usd(500) },
          { accountId: drawerId, amount: som(6_325_000) },
          { accountId: cardId, amount: som(1_265_000) },
        ],
        settled: usd(1100),
        note: 'Oktabr',
      }
      const stale = await pay({ ...body, clientKey: randomUUID(), settled: usd(1000) }, dealer)
      expect(stale.status).toBe(409)
      expect(stale.body.error.code).toBe('RATE_CHANGED')

      const payment = (await dealer.post('/api/customer-payments').send(body).expect(201)).body
      expect(payment).toMatchObject({
        number: 'TL-000003',
        kind: 'in',
        currency: 'USD',
        change: -usd(1100),
        createdByName: 'Jasur Hamkorchi',
        paidBy: 'Kassa 1 ($), Kassa 1 (so‘m), Humo',
      })
      expect(
        payment.lines.map((line: { currency: string; amount: number; rate: number | null; settled: number }) => [
          line.currency,
          line.amount,
          line.rate,
          line.settled,
        ]),
      ).toEqual([
        ['USD', usd(500), null, usd(500)],
        ['UZS', som(6_325_000), 12_650, usd(500)],
        ['UZS', som(1_265_000), 12_650, usd(100)],
      ])
      firstId = payment.id
      expect(moved(before, await balances())).toEqual({
        cash_USD: usd(500),
        cash_UZS: som(6_325_000),
        card_UZS: som(1_265_000),
        Anvar: -usd(1100),
      })
      // Sent again by a screen that did not hear back: it is the same payment.
      expect((await dealer.post('/api/customer-payments').send(body).expect(201)).body.id).toBe(firstId)
      expect((await balances()).Anvar).toBe(usd(750))
    })

    it("keeps the so'm a whole cent does not cover as an exchange difference", async () => {
      const before = await balances()
      // 1 000 000 / 12 650 = 79,0513…: 79,05 $ is settled, 17,50 so'm are left over.
      await pay({
        customerId: anvarId,
        kind: 'in',
        lines: [{ accountId: drawerId, amount: som(1_000_000) }],
        settled: usd(79.05),
      }).expect(201)
      expect(moved(before, await balances())).toEqual({
        cash_UZS: som(1_000_000),
        Anvar: -usd(79.05),
        fx: -som(17.5),
      })
    })

    it("is valued at the day's rate unless the two sides agreed what it settles", async () => {
      // Left to the rate, 1 270 000 at 12 650 is 100,40 $: a total that says 100 comes from a screen gone stale.
      const stale = await pay(
        {
          customerId: anvarId,
          kind: 'in',
          lines: [{ accountId: drawerId, amount: som(1_270_000) }],
          settled: usd(100),
        },
        dealer,
      )
      expect(stale.body.error.code).toBe('RATE_CHANGED')
      // Agreed, it settles the hundred dollars it was agreed for; the 5 000 so'm over are the rate's.
      const line = { accountId: drawerId, amount: som(1_270_000), settled: usd(100) }
      const payment = (await pay({ customerId: anvarId, kind: 'in', lines: [line], settled: usd(100) }).expect(201))
        .body
      expect(payment.lines[0]).toMatchObject({ rate: 12_700, settled: usd(100), fx: som(5000) })
      expect((await balances()).Anvar).toBe(usd(1850 - 1100 - 79.05 - 100))
    })

    it('pays a supplier out of an account that holds the money, and no other', async () => {
      const empty = await pay({
        customerId: supplierId,
        kind: 'out',
        lines: [{ accountId: safeId, amount: som(2_000_000) }],
        settled: som(2_000_000),
      })
      expect(empty.status).toBe(400)
      expect(empty.body.error.fields['lines.0.amount']).toBe('Hisobda buncha pul yo‘q')

      const before = await balances()
      // Two million in so'm and a hundred dollars, worth 1 265 000 so'm, against a so'm account.
      const payment = (
        await pay({
          customerId: supplierId,
          kind: 'out',
          lines: [
            { accountId: drawerId, amount: som(2_000_000) },
            { accountId: dollarDrawerId, amount: usd(100) },
          ],
          settled: som(3_265_000),
        }).expect(201)
      ).body
      expect(payment).toMatchObject({ kind: 'out', currency: 'UZS', change: som(3_265_000) })
      expect(moved(before, await balances())).toEqual({
        cash_UZS: -som(2_000_000),
        cash_USD: -usd(100),
        'Guangzhou Textile': som(3_265_000),
      })
      expect((await balances())['Guangzhou Textile']).toBe(-som(1_735_000))
    })

    it('is taken back whole, and stays in the books', async () => {
      const made = (
        await pay({
          customerId: supplierId,
          kind: 'out',
          lines: [{ accountId: drawerId, amount: som(500_000) }],
          settled: som(500_000),
        }).expect(201)
      ).body
      const before = await balances()
      await alpha.post(`/api/customer-payments/${made.id}/cancel`).send({}).expect(400)
      const cancelled = (
        await alpha.post(`/api/customer-payments/${made.id}/cancel`).send({ reason: 'Boshqa hamkorga edi' }).expect(200)
      ).body
      expect(cancelled).toMatchObject({
        status: 'cancelled',
        cancelledByName: 'Alpha Owner',
        cancelReason: 'Boshqa hamkorga edi',
      })
      expect(moved(before, await balances())).toEqual({ cash_UZS: som(500_000), 'Guangzhou Textile': -som(500_000) })
      const again = await alpha.post(`/api/customer-payments/${made.id}/cancel`).send({ reason: 'Yana' }).expect(409)
      expect(again.body.error.code).toBe('PAYMENT_CANCELLED')
    })

    it('shows on the account, change by change', async () => {
      const statement = (await accountant.get(`/api/customers/${anvarId}/statement`).expect(200)).body
      expect(statement).toMatchObject({ customer: { name: 'Anvar', currency: 'USD' }, currency: 'USD' })
      expect(
        statement.lines.map((line: { kind: string; change: number; balance: number }) => [
          line.kind,
          line.change,
          line.balance,
        ]),
      ).toEqual([
        ['opening', usd(1850), usd(1850)],
        ['in', -usd(1100), usd(750)],
        ['in', -usd(79.05), usd(670.95)],
        ['in', -usd(100), usd(570.95)],
      ])
      expect(statement.balance).toBe(usd(570.95))

      const supplier = (await alpha.get(`/api/customers/${supplierId}/statement`).expect(200)).body
      expect(supplier.lines.map((line: { kind: string; change: number }) => [line.kind, line.change])).toEqual([
        ['opening', -som(5_000_000)],
        ['out', som(3_265_000)],
        ['out', som(500_000)],
        ['cancel', -som(500_000)],
      ])
      expect(supplier.lines[3].note).toBe('Boshqa hamkorga edi')
    })

    it('shows in the shift what customers brought to the drawer and took from it', async () => {
      const shift = (await alpha.get(`/api/shifts/${shiftId}`).expect(200)).body
      // The payment that was taken back moved nothing.
      expect(drawerOf(shift, 'UZS')).toMatchObject({
        customersIn: som(6_325_000 + 1_000_000 + 1_270_000),
        customersOut: som(2_000_000),
      })
      expect(drawerOf(shift, 'USD')).toMatchObject({ customersIn: usd(500), customersOut: usd(100) })
    })

    it('that went through a drawer is not taken back once its shift is counted', async () => {
      await alpha
        .post(`/api/shifts/${shiftId}/close`)
        .send({ cash: { UZS: som(7_595_000), USD: usd(410) } })
        .expect(200)
      const closed = (await alpha.get(`/api/shifts/${shiftId}`).expect(200)).body
      // What the books expected is what the payments left in the drawer.
      expect(closed.counts.map((count: { diff: number }) => count.diff)).toEqual([0, 0])
      const late = await alpha.post(`/api/customer-payments/${firstId}/cancel`).send({ reason: 'Kech' }).expect(409)
      expect(late.body.error.code).toBe('SHIFT_CLOSED')
      // Nor does money go into a drawer nobody is counting.
      const closedTill = await pay({
        customerId: anvarId,
        kind: 'in',
        lines: [{ accountId: drawerId, amount: som(100_000) }],
        settled: usd(7.91),
      })
      expect(closedTill.body.error.fields['lines.0.accountId']).toContain('smena ochilmagan')
      // The form is told so before anything is typed: the drawers are shut, the safe and the card are not.
      const accounts = (await alpha.get('/api/customer-payments/accounts').expect(200)).body as AccountRow[]
      expect(accounts.map((account) => [account.kind, account.open])).toEqual([
        ['cash', false],
        ['cash', false],
        ['safe', true],
        ['card', true],
      ])
    })
  })

  describe('rules', () => {
    it('keep each currency apart: the main one is only what windows pick first', async () => {
      // Anvar now deals in so'm as a rule; what he owes in dollars stays dollars, on its own account.
      const card = (await alpha.get(`/api/customers/${anvarId}`).expect(200)).body
      const moved = (
        await alpha
          .put(`/api/customers/${anvarId}`)
          .send({ name: card.name, phone: null, groupIds: [], tags: [], currency: 'UZS' })
          .expect(200)
      ).body
      expect(moved).toMatchObject({ currency: 'UZS', balances: [{ currency: 'USD', balance: usd(570.95) }] })
      expect((await alpha.get(`/api/customers/${anvarId}/statement`).expect(200)).body).toMatchObject({
        currency: 'UZS',
        lines: [],
        balance: 0,
      })
      const dollars = (await alpha.get(`/api/customers/${anvarId}/statement`).query({ currency: 'USD' })).body
      expect(dollars.balance).toBe(usd(570.95))
    })

    it('list who owes and who is owed, for those who may see it', async () => {
      const names = async (agent: Agent, balance: string) =>
        (await agent.get('/api/customers').query({ balance }).expect(200)).body.items.map(
          (customer: { name: string }) => customer.name,
        )
      expect(await names(accountant, 'owes')).toEqual(['Anvar'])
      expect(await names(accountant, 'owed')).toEqual(['Guangzhou Textile'])
    })

    it('are not put away while their account holds anything', async () => {
      const refused = await alpha.post(`/api/customers/${supplierId}/archive`).expect(409)
      expect(refused.body.error.code).toBe('CUSTOMER_HAS_BALANCE')
    })

    it("keep customers' accounts out of the places money is kept", async () => {
      const accounts = (await alpha.get('/api/money/accounts').expect(200)).body as AccountRow[]
      expect(accounts.some((account) => account.kind === 'customer')).toBe(false)
      const [{ off }] = await sql<{ off: string }[]>(
        `SELECT count(*) AS off FROM (SELECT entry_id FROM ledger_lines GROUP BY entry_id HAVING sum(base) <> 0) x`,
      )
      expect(Number(off)).toBe(0)
    })

    it('are for those who deal with customers, each business seeing its own', async () => {
      const seen = (await accountant.get('/api/customer-payments').expect(200)).body
      expect(seen.total).toBe(7)
      expect(
        (await accountant.get('/api/customer-payments').query({ customerId: supplierId, kind: 'out' }).expect(200)).body
          .total,
      ).toBe(2)
      // The accountant takes payments, but pays nobody out.
      await pay(
        { customerId: supplierId, kind: 'out', lines: [{ accountId: safeId, amount: som(1) }], settled: som(1) },
        accountant,
      ).expect(403)
      await keeper.get('/api/customer-payments').expect(403)

      expect((await beta.get('/api/customer-payments').expect(200)).body.total).toBe(0)
      const foreign = await pay(
        { customerId: anvarId, kind: 'in', lines: [{ accountId: safeId, amount: som(1000) }], settled: som(1000) },
        beta,
      )
      expect(foreign.status).toBe(400)
      await beta.get(`/api/customers/${anvarId}/statement`).expect(400)
    })
  })
})
