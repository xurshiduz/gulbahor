import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

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
 * What partners owe and the money that settles it: an account for each
 * partner in its own currency, payments in any currency valued at the rate
 * to the cent, and a statement that shows every change.
 */
describe('Partner payments', () => {
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

  /** Balances by account: drawers and safes by currency, partners by name, the ledger's own by their key. */
  const balances = async (): Promise<Record<string, number>> => {
    const rows = await sql<
      { kind: string; system_key: string | null; currency: string; name: string; balance: string }[]
    >(
      `SELECT a.kind, a.system_key, a.currency, a.name, a.balance FROM accounts a
       JOIN organizations o ON o.id = a.org_id WHERE o.name = 'Alpha'`,
    )
    return Object.fromEntries(
      rows.map((row) => [
        row.system_key ?? (row.kind === 'partner' ? row.name : `${row.kind}_${row.currency}`),
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
    agent.post('/api/partner-payments').send({ clientKey: randomUUID(), ...body })

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    safeId = (await alpha.post('/api/money/accounts').send({ kind: 'safe', name: 'Seyf' }).expect(201)).body.id
    cardId = (await alpha.post('/api/money/accounts').send({ kind: 'card', name: 'Humo', last4: '3073' }).expect(201))
      .body.id
    const [{ day }] = await sql<{ day: string }[]>(`SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day`)
    await alpha.put('/api/money/rates').send({ date: day, uzsPerUsd: 12_650 }).expect(200)
    shiftId = (
      await alpha
        .post('/api/shifts')
        .send({ registerId, cashUzs: som(1_000_000), cashUsd: usd(10) })
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

  describe('a partner', () => {
    it('has an account kept in one currency, shown to those who may see debts', async () => {
      const anvar = (
        await alpha.post('/api/partners').send({ name: 'Anvar', isBuyer: true, currency: 'USD' }).expect(201)
      ).body
      expect(anvar).toMatchObject({ currency: 'USD', balance: 0 })
      anvarId = anvar.id
      const supplier = (
        await alpha.post('/api/partners').send({ name: 'Guangzhou Textile', isSupplier: true }).expect(201)
      ).body
      expect(supplier).toMatchObject({ currency: 'UZS', balance: 0 })
      supplierId = supplier.id

      // The storekeeper names suppliers on receipts and has no business with what they are owed.
      const seen = (await keeper.get('/api/partners').expect(200)).body.items
      expect(seen.map((partner: { balance: number | null }) => partner.balance)).toEqual([null, null])
      await keeper.get(`/api/partners/${anvarId}/statement`).expect(403)
    })

    it('starts with what stood between them and the business before the books began', async () => {
      await dealer.post('/api/partner-payments/opening').send({}).expect(400)
      const opening = (
        await dealer
          .post('/api/partner-payments/opening')
          .send({ clientKey: randomUUID(), partnerId: anvarId, owes: 'partner', amount: usd(1850), note: 'Eski qarz' })
          .expect(201)
      ).body
      expect(opening).toMatchObject({
        number: 'TL-000001',
        kind: 'opening',
        status: 'posted',
        partnerName: 'Anvar',
        currency: 'USD',
        change: usd(1850),
        lines: [],
      })
      // The business owes its supplier five million.
      await alpha
        .post('/api/partner-payments/opening')
        .send({ clientKey: randomUUID(), partnerId: supplierId, owes: 'us', amount: som(5_000_000) })
        .expect(201)
      expect(await balances()).toMatchObject({ Anvar: usd(1850), 'Guangzhou Textile': -som(5_000_000) })
      const listed = (await accountant.get('/api/partners').query({ sort: 'name' }).expect(200)).body.items
      expect(listed.map((partner: { balance: number }) => partner.balance)).toEqual([usd(1850), -som(5_000_000)])
      await accountant
        .post('/api/partner-payments/opening')
        .send({ clientKey: randomUUID(), partnerId: anvarId, owes: 'partner', amount: usd(1) })
        .expect(403)
    })
  })

  describe('a payment', () => {
    let firstId: string

    it('takes money in any currency and settles the account to the cent', async () => {
      const accounts = (await dealer.get('/api/partner-payments/accounts').expect(200)).body as AccountRow[]
      expect(accounts.map((account) => account.name)).toEqual(['Kassa 1 (dollar)', "Kassa 1 (so'm)", 'Seyf', 'Humo'])
      // The till's shift is open: money can go through every one of them.
      expect(accounts.every((account) => account.open)).toBe(true)

      const before = await balances()
      const key = randomUUID()
      // 500 $ in cash, 6 325 000 so'm in cash and 1 265 000 so'm to the card, at 12 650: 500 + 500 + 100 dollars.
      const body = {
        clientKey: key,
        partnerId: anvarId,
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

      const payment = (await dealer.post('/api/partner-payments').send(body).expect(201)).body
      expect(payment).toMatchObject({
        number: 'TL-000003',
        kind: 'in',
        currency: 'USD',
        change: -usd(1100),
        createdByName: 'Jasur Hamkorchi',
        paidBy: "Kassa 1 (dollar), Kassa 1 (so'm), Humo",
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
      expect((await dealer.post('/api/partner-payments').send(body).expect(201)).body.id).toBe(firstId)
      expect((await balances()).Anvar).toBe(usd(750))
    })

    it("keeps the so'm a whole cent does not cover as an exchange difference", async () => {
      const before = await balances()
      // 1 000 000 / 12 650 = 79,0513…: 79,05 $ is settled, 17,50 so'm are left over.
      await pay({
        partnerId: anvarId,
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
        { partnerId: anvarId, kind: 'in', lines: [{ accountId: drawerId, amount: som(1_270_000) }], settled: usd(100) },
        dealer,
      )
      expect(stale.body.error.code).toBe('RATE_CHANGED')
      // Agreed, it settles the hundred dollars it was agreed for; the 5 000 so'm over are the rate's.
      const line = { accountId: drawerId, amount: som(1_270_000), settled: usd(100) }
      const payment = (await pay({ partnerId: anvarId, kind: 'in', lines: [line], settled: usd(100) }).expect(201)).body
      expect(payment.lines[0]).toMatchObject({ rate: 12_700, settled: usd(100), fx: som(5000) })
      expect((await balances()).Anvar).toBe(usd(1850 - 1100 - 79.05 - 100))
    })

    it('pays a supplier out of an account that holds the money, and no other', async () => {
      const empty = await pay({
        partnerId: supplierId,
        kind: 'out',
        lines: [{ accountId: safeId, amount: som(2_000_000) }],
        settled: som(2_000_000),
      })
      expect(empty.status).toBe(400)
      expect(empty.body.error.fields['lines.0.amount']).toBe("Hisobda buncha pul yo'q")

      const before = await balances()
      // Two million in so'm and a hundred dollars, worth 1 265 000 so'm, against a so'm account.
      const payment = (
        await pay({
          partnerId: supplierId,
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
          partnerId: supplierId,
          kind: 'out',
          lines: [{ accountId: drawerId, amount: som(500_000) }],
          settled: som(500_000),
        }).expect(201)
      ).body
      const before = await balances()
      await alpha.post(`/api/partner-payments/${made.id}/cancel`).send({}).expect(400)
      const cancelled = (
        await alpha.post(`/api/partner-payments/${made.id}/cancel`).send({ reason: 'Boshqa hamkorga edi' }).expect(200)
      ).body
      expect(cancelled).toMatchObject({
        status: 'cancelled',
        cancelledByName: 'Alpha Owner',
        cancelReason: 'Boshqa hamkorga edi',
      })
      expect(moved(before, await balances())).toEqual({ cash_UZS: som(500_000), 'Guangzhou Textile': -som(500_000) })
      const again = await alpha.post(`/api/partner-payments/${made.id}/cancel`).send({ reason: 'Yana' }).expect(409)
      expect(again.body.error.code).toBe('PAYMENT_CANCELLED')
    })

    it('shows on the account, change by change', async () => {
      const statement = (await accountant.get(`/api/partners/${anvarId}/statement`).expect(200)).body
      expect(statement.partner).toMatchObject({ name: 'Anvar', currency: 'USD' })
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

      const supplier = (await alpha.get(`/api/partners/${supplierId}/statement`).expect(200)).body
      expect(supplier.lines.map((line: { kind: string; change: number }) => [line.kind, line.change])).toEqual([
        ['opening', -som(5_000_000)],
        ['out', som(3_265_000)],
        ['out', som(500_000)],
        ['cancel', -som(500_000)],
      ])
      expect(supplier.lines[3].note).toBe('Boshqa hamkorga edi')
    })

    it('shows in the shift what partners brought to the drawer and took from it', async () => {
      const shift = (await alpha.get(`/api/shifts/${shiftId}`).expect(200)).body
      // The payment that was taken back moved nothing.
      expect(shift.totals).toMatchObject({
        partnersInUzs: som(6_325_000 + 1_000_000 + 1_270_000),
        partnersInUsd: usd(500),
        partnersOutUzs: som(2_000_000),
        partnersOutUsd: usd(100),
      })
    })

    it('that went through a drawer is not taken back once its shift is counted', async () => {
      await alpha
        .post(`/api/shifts/${shiftId}/close`)
        .send({ cashUzs: som(7_595_000), cashUsd: usd(410) })
        .expect(200)
      const closed = (await alpha.get(`/api/shifts/${shiftId}`).expect(200)).body
      // What the books expected is what the payments left in the drawer.
      expect(closed).toMatchObject({ diffUzs: 0, diffUsd: 0 })
      const late = await alpha.post(`/api/partner-payments/${firstId}/cancel`).send({ reason: 'Kech' }).expect(409)
      expect(late.body.error.code).toBe('SHIFT_CLOSED')
      // Nor does money go into a drawer nobody is counting.
      const closedTill = await pay({
        partnerId: anvarId,
        kind: 'in',
        lines: [{ accountId: drawerId, amount: som(100_000) }],
        settled: usd(7.91),
      })
      expect(closedTill.body.error.fields['lines.0.accountId']).toContain('smena ochilmagan')
      // The form is told so before anything is typed: the drawers are shut, the safe and the card are not.
      const accounts = (await alpha.get('/api/partner-payments/accounts').expect(200)).body as AccountRow[]
      expect(accounts.map((account) => [account.kind, account.open])).toEqual([
        ['cash', false],
        ['cash', false],
        ['safe', true],
        ['card', true],
      ])
    })
  })

  describe('rules', () => {
    it('keep an account in the currency it was started in', async () => {
      const refused = await alpha
        .put(`/api/partners/${anvarId}`)
        .send({ name: 'Anvar', isBuyer: true, currency: 'UZS' })
      expect(refused.status).toBe(400)
      expect(refused.body.error.fields.currency).toBeDefined()
      // A partner nothing has been owed with yet can still be changed.
      const fresh = (await alpha.post('/api/partners').send({ name: 'Yangi', isBuyer: true }).expect(201)).body
      await alpha.put(`/api/partners/${fresh.id}`).send({ name: 'Yangi', isBuyer: true, currency: 'USD' }).expect(200)
    })

    it('list who owes and who is owed, for those who may see debts', async () => {
      const names = async (agent: Agent, debt: string) =>
        (await agent.get('/api/partners').query({ debt }).expect(200)).body.items.map(
          (partner: { name: string }) => partner.name,
        )
      expect(await names(accountant, 'owes')).toEqual(['Anvar'])
      expect(await names(accountant, 'owed')).toEqual(['Guangzhou Textile'])
      // Asked by someone who may not see debts, it tells nothing: every partner comes back.
      expect(await names(keeper, 'owes')).toHaveLength(3)
    })

    it("keep partners' accounts out of the places money is kept", async () => {
      const accounts = (await alpha.get('/api/money/accounts').expect(200)).body as AccountRow[]
      expect(accounts.some((account) => account.kind === 'partner')).toBe(false)
      const [{ off }] = await sql<{ off: string }[]>(
        `SELECT count(*) AS off FROM (SELECT entry_id FROM ledger_lines GROUP BY entry_id HAVING sum(base) <> 0) x`,
      )
      expect(Number(off)).toBe(0)
    })

    it('are for those who deal with partners, each business seeing its own', async () => {
      const seen = (await accountant.get('/api/partner-payments').expect(200)).body
      expect(seen.total).toBe(7)
      expect(
        (await accountant.get('/api/partner-payments').query({ partnerId: supplierId, kind: 'out' }).expect(200)).body
          .total,
      ).toBe(2)
      await pay(
        { partnerId: anvarId, kind: 'in', lines: [{ accountId: safeId, amount: som(1) }], settled: 0 },
        accountant,
      ).expect(403)
      await keeper.get('/api/partner-payments').expect(403)

      expect((await beta.get('/api/partner-payments').expect(200)).body.total).toBe(0)
      const foreign = await pay(
        { partnerId: anvarId, kind: 'in', lines: [{ accountId: safeId, amount: som(1000) }], settled: som(1000) },
        beta,
      )
      expect(foreign.status).toBe(400)
      await beta.get(`/api/partners/${anvarId}/statement`).expect(400)
    })
  })
})
