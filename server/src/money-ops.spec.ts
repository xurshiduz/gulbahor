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
  balance?: number | null
}

interface CategoryRow {
  id: string
  kind: 'expense' | 'income'
  name: string
  inProfit: boolean
  isActive: boolean
}

/**
 * Expenses and other money in and out: each says what the money was for,
 * leaves or enters the accounts it names, and has its other side in the
 * books, so that everything still adds up to nothing.
 */
describe('Expenses and other income', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let manager: Agent
  let cashier: Agent
  let accountant: Agent

  let registerId: string
  let shiftId: string
  let drawerId: string
  let dollarDrawerId: string
  let safeId: string
  let cardId: string
  let categories: CategoryRow[]

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  /** Balances by account: drawers and safes by currency, the ledger's own by their key. */
  const balances = async (): Promise<Record<string, number>> => {
    const rows = await sql<{ kind: string; system_key: string | null; currency: string; balance: string }[]>(
      `SELECT a.kind, a.system_key, a.currency, a.balance FROM accounts a
       JOIN organizations o ON o.id = a.org_id WHERE o.name = 'Alpha'`,
    )
    return Object.fromEntries(rows.map((row) => [row.system_key ?? `${row.kind}_${row.currency}`, Number(row.balance)]))
  }
  const moved = (before: Record<string, number>, after: Record<string, number>) =>
    Object.fromEntries(
      Object.keys(after)
        .map((key) => [key, after[key] - (before[key] ?? 0)] as const)
        .filter(([, delta]) => delta !== 0),
    )

  const category = (name: string) => categories.find((item) => item.name === name)!.id
  const write = (body: Record<string, unknown>, agent = alpha) =>
    agent.post('/api/money/ops').send({ clientKey: randomUUID(), ...body })
  const spend = (name: string, lines: Record<string, unknown>[], total: number, agent = alpha, note?: string) =>
    write({ kind: 'expense', categoryId: category(name), lines, total, note }, agent)

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
    manager = await hire('Anvar Menejer', 'menejer', 'store_manager')
    cashier = await hire('Dilnoza Kassir', 'kassir', 'cashier')
    accountant = await hire('Hilola Hisobchi', 'hisobchi', 'accountant')

    shiftId = (
      await manager
        .post('/api/shifts')
        .send({ registerId, cash: { UZS: som(1_000_000), USD: usd(100) } })
        .expect(201)
    ).body.id
    const accounts = (await alpha.get('/api/money/accounts').expect(200)).body as AccountRow[]
    drawerId = accounts.find((account) => account.kind === 'cash' && account.currency === 'UZS')!.id
    dollarDrawerId = accounts.find((account) => account.kind === 'cash' && account.currency === 'USD')!.id
    categories = (await alpha.get('/api/money/categories').expect(200)).body
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe('what the money was for', () => {
    it('is a list every business starts with', () => {
      const names = (kind: string) => categories.filter((item) => item.kind === kind).map((item) => item.name)
      expect(names('expense')).toEqual(expect.arrayContaining(['Ijara', 'Ish haqi', 'Oshxona', 'Egasi oldi']))
      expect(names('income')).toEqual(['Boshqa daromad', 'Egasi qo‘shdi'])
      // What the owner takes or brings is neither spent nor earned.
      expect(categories.filter((item) => !item.inProfit).map((item) => item.name)).toEqual([
        'Egasi oldi',
        'Egasi qo‘shdi',
      ])
    })

    it('is added to, renamed and archived by those who may', async () => {
      const made = (await alpha.post('/api/money/categories').send({ kind: 'expense', name: 'Taksi' }).expect(201))
        .body as CategoryRow
      expect(made).toMatchObject({ kind: 'expense', name: 'Taksi', inProfit: true, isActive: true })
      const twice = await alpha.post('/api/money/categories').send({ kind: 'expense', name: 'taksi' })
      expect(twice.status).toBe(400)
      expect(twice.body.error.fields.name).toBeDefined()
      // The same name may stand among the other kind.
      await alpha.post('/api/money/categories').send({ kind: 'income', name: 'Taksi' }).expect(201)

      const renamed = (
        await accountant
          .put(`/api/money/categories/${made.id}`)
          .send({ kind: 'expense', name: 'Taksi va yo‘l haqi', inProfit: true })
          .expect(200)
      ).body
      expect(renamed.name).toBe('Taksi va yo‘l haqi')
      expect((await accountant.post(`/api/money/categories/${made.id}/archive`).expect(200)).body.isActive).toBe(false)

      // A shop's manager writes expenses but does not name their kinds; a cashier does neither.
      await manager.post('/api/money/categories').send({ kind: 'expense', name: 'Gul' }).expect(403)
      await manager.get('/api/money/categories').expect(200)
      await cashier.get('/api/money/categories').expect(403)
      categories = (await alpha.get('/api/money/categories').expect(200)).body
      // Nothing can be written under an archived kind.
      const refused = await spend('Taksi va yo‘l haqi', [{ accountId: drawerId, amount: som(10_000) }], som(10_000))
      expect(refused.status).toBe(400)
      expect(refused.body.error.fields.categoryId).toBeDefined()
    })
  })

  describe('an expense', () => {
    it('takes the money out of where it was paid from, and is written as spent', async () => {
      const before = await balances()
      const op = (
        await spend('Oshxona', [{ accountId: drawerId, amount: som(85_000) }], som(85_000), manager, 'Tushlik').expect(
          201,
        )
      ).body
      expect(op).toMatchObject({
        number: 'XR-000001',
        kind: 'expense',
        status: 'posted',
        categoryName: 'Oshxona',
        inProfit: true,
        total: som(85_000),
        paidBy: 'Kassa 1 (so‘m)',
        note: 'Tushlik',
        createdByName: 'Anvar Menejer',
      })
      expect(moved(before, await balances())).toEqual({ cash_UZS: -som(85_000), expenses: som(85_000) })
    })

    it('may be paid from several places at once, dollars at the rate', async () => {
      const before = await balances()
      // Rent: 40 $ out of the dollar drawer (506 000 at 12 650) and 494 000 from the card.
      const short = await spend(
        'Ijara',
        [
          { accountId: dollarDrawerId, amount: usd(40) },
          { accountId: cardId, amount: som(494_000) },
        ],
        som(1_000_000),
      )
      // There is nothing on the card to pay with.
      expect(short.status).toBe(400)
      expect(short.body.error.fields['lines.1.amount']).toBe('Hisobda buncha pul yo‘q')
      expect(moved(before, await balances())).toEqual({})

      const op = (
        await spend(
          'Ijara',
          [
            { accountId: dollarDrawerId, amount: usd(40) },
            { accountId: drawerId, amount: som(494_000) },
          ],
          som(1_000_000),
        ).expect(201)
      ).body
      expect(op.lines).toEqual([
        expect.objectContaining({ currency: 'USD', amount: usd(40), rate: 12_650, base: som(506_000) }),
        expect.objectContaining({ currency: 'UZS', amount: som(494_000), rate: null, base: som(494_000) }),
      ])
      expect(moved(before, await balances())).toEqual({
        cash_USD: -usd(40),
        cash_UZS: -som(494_000),
        expenses: som(1_000_000),
      })

      // A total the rate no longer gives is refused rather than written at another sum.
      const stale = await spend('Ijara', [{ accountId: dollarDrawerId, amount: usd(10) }], som(120_000))
      expect(stale.status).toBe(409)
      expect(stale.body.error.code).toBe('RATE_CHANGED')
    })

    it('sent twice is written once', async () => {
      const clientKey = randomUUID()
      const body = {
        clientKey,
        kind: 'expense',
        categoryId: category('Tozalik'),
        lines: [{ accountId: drawerId, amount: som(20_000) }],
        total: som(20_000),
      }
      const before = await balances()
      const first = (await alpha.post('/api/money/ops').send(body).expect(201)).body
      const second = (await alpha.post('/api/money/ops').send(body).expect(201)).body
      expect(second.id).toBe(first.id)
      expect(moved(before, await balances())).toEqual({ cash_UZS: -som(20_000), expenses: som(20_000) })
    })

    it('taken by the owner is kept apart from what was spent', async () => {
      const before = await balances()
      await spend('Egasi oldi', [{ accountId: drawerId, amount: som(200_000) }], som(200_000)).expect(201)
      expect(moved(before, await balances())).toEqual({ cash_UZS: -som(200_000), owner: som(200_000) })
    })
  })

  describe('other income', () => {
    it('comes into the account it was put in', async () => {
      const before = await balances()
      const op = (
        await write({
          kind: 'income',
          categoryId: category('Boshqa daromad'),
          lines: [{ accountId: safeId, amount: som(300_000) }],
          total: som(300_000),
          note: 'Eski javonlar sotildi',
        }).expect(201)
      ).body
      expect(op).toMatchObject({ number: 'KR-000001', kind: 'income', total: som(300_000), paidBy: 'Seyf' })
      expect(moved(before, await balances())).toEqual({ safe_UZS: som(300_000), other_income: -som(300_000) })

      // An expense cannot be written under a kind of income.
      const mixed = await write({
        kind: 'expense',
        categoryId: category('Boshqa daromad'),
        lines: [{ accountId: safeId, amount: som(1000) }],
        total: som(1000),
      })
      expect(mixed.body.error.fields.categoryId).toBeDefined()
    })
  })

  describe('the books', () => {
    it('still add up to nothing, entry by entry', async () => {
      const off = await sql<{ id: string }[]>(
        `SELECT e.id FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id
         GROUP BY e.id HAVING sum(l.base) <> 0`,
      )
      expect(off).toEqual([])
    })

    it('show each shift what was spent out of its drawer', async () => {
      const shift = (await alpha.get(`/api/shifts/${shiftId}`).expect(200)).body
      // 85 000 lunch, 494 000 of the rent, 20 000 cleaning and 200 000 to the owner; 40 $ of the rent.
      expect(drawerOf(shift, 'UZS')).toMatchObject({ expenses: som(799_000), income: 0 })
      expect(drawerOf(shift, 'USD')).toMatchObject({ expenses: usd(40), income: 0 })
    })

    it('list them for those who keep the books, and for the others only their own', async () => {
      const all = (await alpha.get('/api/money/ops').expect(200)).body
      expect(all.total).toBe(5)
      expect(all.sums).toEqual({ expense: som(1_305_000), income: som(300_000) })
      const lunch = (
        await alpha
          .get('/api/money/ops')
          .query({ categoryId: category('Oshxona') })
          .expect(200)
      ).body
      expect(lunch.items.map((item: { number: string }) => item.number)).toEqual(['XR-000001'])
      expect((await alpha.get('/api/money/ops').query({ kind: 'income' }).expect(200)).body.total).toBe(1)
      expect((await alpha.get('/api/money/ops').query({ q: 'tushlik' }).expect(200)).body.total).toBe(1)

      // The shop's manager wrote one of them.
      const own = (await manager.get('/api/money/ops').expect(200)).body
      expect(own.items.map((item: { number: string }) => item.number)).toEqual(['XR-000001'])
      await manager.get(`/api/money/ops/${all.items[0].id}`).expect(404)
      await cashier.get('/api/money/ops').expect(403)
      await cashier.post('/api/money/ops').send({}).expect(403)
      expect((await beta.get('/api/money/ops').expect(200)).body.total).toBe(0)
    })
  })

  describe('taking one back', () => {
    it('puts the money back where it was and keeps both in the books', async () => {
      const lunch = (
        await alpha
          .get('/api/money/ops')
          .query({ categoryId: category('Oshxona') })
          .expect(200)
      ).body.items[0]
      const before = await balances()
      await manager.post(`/api/money/ops/${lunch.id}/cancel`).send({}).expect(400)
      const cancelled = (
        await manager.post(`/api/money/ops/${lunch.id}/cancel`).send({ reason: 'Ikki marta yozilgan' }).expect(200)
      ).body
      expect(cancelled).toMatchObject({
        status: 'cancelled',
        cancelledByName: 'Anvar Menejer',
        cancelReason: 'Ikki marta yozilgan',
      })
      expect(moved(before, await balances())).toEqual({ cash_UZS: som(85_000), expenses: -som(85_000) })
      const again = await manager.post(`/api/money/ops/${lunch.id}/cancel`).send({ reason: 'Yana' })
      expect(again.body.error.code).toBe('OP_CANCELLED')
      // What was taken back no longer counts.
      expect((await alpha.get('/api/money/ops').expect(200)).body.sums.expense).toBe(som(1_220_000))
    })

    it('is refused for money that came in and has since been spent', async () => {
      const income = (await alpha.get('/api/money/ops').query({ kind: 'income' }).expect(200)).body.items[0]
      await spend('Reklama', [{ accountId: safeId, amount: som(250_000) }], som(250_000)).expect(201)
      const refused = await alpha.post(`/api/money/ops/${income.id}/cancel`).send({ reason: 'Xato' })
      expect(refused.status).toBe(409)
      expect(refused.body.error.code).toBe('NO_MONEY')
    })

    it('is not done once the shift it went through has been counted', async () => {
      const cleaning = (
        await alpha
          .get('/api/money/ops')
          .query({ categoryId: category('Tozalik') })
          .expect(200)
      ).body.items[0]
      const drawer = (await balances()).cash_UZS
      const dollars = (await balances()).cash_USD
      await manager
        .post(`/api/shifts/${shiftId}/close`)
        .send({ cash: { UZS: drawer, USD: dollars } })
        .expect(200)
      const late = await alpha.post(`/api/money/ops/${cleaning.id}/cancel`).send({ reason: 'Kech' })
      expect(late.status).toBe(409)
      expect(late.body.error.code).toBe('SHIFT_CLOSED')

      // Nor does money leave a drawer between shifts.
      const closed = await spend('Oshxona', [{ accountId: drawerId, amount: som(10_000) }], som(10_000))
      expect(closed.status).toBe(400)
      expect(closed.body.error.fields['lines.0.accountId']).toContain('smena ochilmagan')
      const places = (await alpha.get('/api/money/ops/accounts').expect(200)).body as AccountRow[]
      expect(places.find((account) => account.id === drawerId)?.open).toBe(false)
      expect(places.find((account) => account.id === safeId)?.open).toBe(true)
    })
  })
})
