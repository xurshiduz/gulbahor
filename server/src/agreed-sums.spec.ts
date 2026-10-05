import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)
const usd = (dollars: number) => Math.round(dollars * 100)

interface AccountRow {
  id: string
  kind: string
  currency: string
}
interface Line {
  currency: string
  amount: number
  rate: number | null
  settled: number
  fx: number
}

/**
 * Money that changes currency on its way to a partner's account, and what
 * the two sides agree it is worth. The dollar stands at 11 800 so'm all
 * through; a hundred dollars are therefore worth 1 180 000, whatever anyone
 * agrees to take them for.
 *
 * Each case says what went where: the money account by what was handed
 * over, the partner's account by what was agreed, and the account of
 * exchange differences by what lay between them. That last one falls when
 * the business gains and rises when it loses.
 */
describe('Agreed sums', () => {
  let harness: Harness
  let alpha: Agent
  let dealer: Agent
  let manager: Agent

  let som_: string
  let dollars: string
  let card: string
  let elaris: string
  let anvar: string
  let textile: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  /** Balances: drawers and cards by kind and currency, partners by name, the ledger's own by their key. */
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
  /** One line of money in or out, and what the screen showed it settles. */
  const one = (
    partnerId: string,
    kind: 'in' | 'out',
    line: { accountId: string; amount: number; settled?: number },
    settled: number,
    agent = alpha,
  ) => pay({ partnerId, kind, lines: [line], settled }, agent)

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    const registerId = (
      await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201)
    ).body.id
    card = (await alpha.post('/api/money/accounts').send({ kind: 'card', name: 'Humo', last4: '3073' }).expect(201))
      .body.id
    const [{ day }] = await sql<{ day: string }[]>(`SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day`)
    await alpha.put('/api/money/rates').send({ date: day, uzsPerUsd: 11_800 }).expect(200)
    await alpha
      .post('/api/shifts')
      .send({ registerId, cashUzs: som(20_000_000), cashUsd: usd(2000) })
      .expect(201)
    const accounts = (await alpha.get('/api/money/accounts').expect(200)).body as AccountRow[]
    som_ = accounts.find((account) => account.kind === 'cash' && account.currency === 'UZS')!.id
    dollars = accounts.find((account) => account.kind === 'cash' && account.currency === 'USD')!.id

    const partner = async (body: Record<string, unknown>) =>
      (await alpha.post('/api/partners').send(body).expect(201)).body.id as string
    // Two buyers, one keeping count in so'm and one in dollars, and a supplier the business owes so'm.
    elaris = await partner({ name: 'Elaris', isBuyer: true, currency: 'UZS' })
    anvar = await partner({ name: 'Anvar', isBuyer: true, currency: 'USD' })
    textile = await partner({ name: 'Textile', isSupplier: true, currency: 'UZS' })

    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    await alpha
      .post('/api/users')
      .send({
        fullName: 'Jasur Hamkorchi',
        login: 'hamkorchi',
        password: PASSWORD,
        roleIds: [roles.find((role) => role.templateKey === 'partners_manager')!.id],
        allLocations: true,
        locationIds: [],
      })
      .expect(201)
    // He deals with partners and sets no rates: what he may agree to has a limit.
    dealer = await harness.signIn('hamkorchi')
    await alpha
      .post('/api/users')
      .send({
        fullName: 'Anvar Menejer',
        login: 'menejer',
        password: PASSWORD,
        roleIds: [roles.find((role) => role.templateKey === 'store_manager')!.id],
        allLocations: true,
        locationIds: [],
      })
      .expect(201)
    // A shop's manager writes expenses down, and sets no rates either.
    manager = await harness.signIn('menejer')
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe("dollars against an account kept in so'm", () => {
    it("are worth what the day's rate makes them when nothing was agreed", async () => {
      const before = await balances()
      const payment = (
        await one(elaris, 'in', { accountId: dollars, amount: usd(100) }, som(1_180_000), dealer).expect(201)
      ).body
      expect(payment.lines).toEqual([
        expect.objectContaining({ currency: 'USD', amount: usd(100), rate: 11_800, settled: som(1_180_000), fx: 0 }),
      ])
      expect(moved(before, await balances())).toEqual({ cash_USD: usd(100), Elaris: -som(1_180_000) })
    })

    it('settle what they were taken for, and the difference is the rate’s', async () => {
      const before = await balances()
      // "Take these 100 dollars for 1 200 000": 20 000 more than they are worth, 1,7% — within what anyone may agree to.
      const payment = (
        await one(
          elaris,
          'in',
          { accountId: dollars, amount: usd(100), settled: som(1_200_000) },
          som(1_200_000),
          dealer,
        ).expect(201)
      ).body
      // Neither sum was touched: a hundred dollars came in, 1 200 000 came off the account; the rate is what they make.
      expect(payment).toMatchObject({ change: -som(1_200_000), currency: 'UZS' })
      expect(payment.lines as Line[]).toEqual([
        expect.objectContaining({ amount: usd(100), rate: 12_000, settled: som(1_200_000), fx: -som(20_000) }),
      ])
      // The drawer holds a hundred dollars worth 1 180 000; the 20 000 given away are written down as given away.
      expect(moved(before, await balances())).toEqual({
        cash_USD: usd(100),
        Elaris: -som(1_200_000),
        fx: som(20_000),
      })
    })

    it('are not taken for much more or much less by someone who sets no rates', async () => {
      const before = await balances()
      // 1 300 000 for a hundred dollars is a tenth over the rate.
      const over = await one(
        elaris,
        'in',
        { accountId: dollars, amount: usd(100), settled: som(1_300_000) },
        som(1_300_000),
        dealer,
      )
      expect(over.status).toBe(400)
      expect(over.body.error.fields['lines.0.settled']).toBe(
        'Kelishilgan summa kun kursidan 10,2% farq qiladi: 2% dan ortig‘iga kurs qo‘yish ruxsati kerak',
      )
      // A slip the other way short-changes the partner, and is held to the same limit.
      const under = await one(
        elaris,
        'in',
        { accountId: dollars, amount: usd(100), settled: som(120_000) },
        som(120_000),
        dealer,
      )
      expect(under.body.error.fields['lines.0.settled']).toContain('89,8%')
      expect(moved(before, await balances())).toEqual({})

      // Whoever sets rates may agree to it.
      const payment = (
        await one(
          elaris,
          'in',
          { accountId: dollars, amount: usd(100), settled: som(1_300_000) },
          som(1_300_000),
        ).expect(201)
      ).body
      expect(payment.lines[0]).toMatchObject({ rate: 13_000, settled: som(1_300_000), fx: -som(120_000) })
      expect(moved(before, await balances())).toEqual({
        cash_USD: usd(100),
        Elaris: -som(1_300_000),
        fx: som(120_000),
      })
    })

    it('go out the same way: what was handed over, what it was counted as, and what lay between', async () => {
      const before = await balances()
      // The supplier takes a hundred dollars as 1 170 000: the business hands over 10 000 more than is counted.
      const payment = (
        await one(
          textile,
          'out',
          { accountId: dollars, amount: usd(100), settled: som(1_170_000) },
          som(1_170_000),
          dealer,
        ).expect(201)
      ).body
      expect(payment).toMatchObject({ kind: 'out', change: som(1_170_000) })
      expect(payment.lines[0]).toMatchObject({ rate: 11_700, settled: som(1_170_000), fx: -som(10_000) })
      expect(moved(before, await balances())).toEqual({
        cash_USD: -usd(100),
        Textile: som(1_170_000),
        fx: som(10_000),
      })

      // Counted as more than they are worth, the same dollars are the business's gain.
      const second = await balances()
      const better = (
        await one(
          textile,
          'out',
          { accountId: dollars, amount: usd(100), settled: som(1_200_000) },
          som(1_200_000),
          dealer,
        ).expect(201)
      ).body
      expect(better.lines[0]).toMatchObject({ rate: 12_000, fx: som(20_000) })
      expect(moved(second, await balances())).toEqual({
        cash_USD: -usd(100),
        Textile: som(1_200_000),
        fx: -som(20_000),
      })
    })
  })

  describe("so'm against an account kept in dollars", () => {
    it('settle the dollars they were taken for', async () => {
      const before = await balances()
      // 1 200 000 so'm for a hundred dollars; by the rate they would be 101,69 $.
      const payment = (
        await one(anvar, 'in', { accountId: som_, amount: som(1_200_000), settled: usd(100) }, usd(100), dealer).expect(
          201,
        )
      ).body
      expect(payment).toMatchObject({ currency: 'USD', change: -usd(100) })
      expect(payment.lines[0]).toMatchObject({ currency: 'UZS', rate: 12_000, settled: usd(100), fx: som(20_000) })
      // The so'm are all in the drawer; a hundred dollars at the rate are 1 180 000 of them, and the rest is gain.
      expect(moved(before, await balances())).toEqual({
        cash_UZS: som(1_200_000),
        Anvar: -usd(100),
        fx: -som(20_000),
      })
    })

    it('by card as by cash, several ways at once, each line for itself', async () => {
      const before = await balances()
      const payment = (
        await pay({
          partnerId: anvar,
          kind: 'in',
          lines: [
            // Dollars against a dollar account are a single sum: what is said beside it is not heard.
            { accountId: dollars, amount: usd(50), settled: usd(70) },
            // Left to the rate: 590 000 so'm are 50 $.
            { accountId: som_, amount: som(590_000) },
            // Agreed: 2 370 000 by card for 200 $, which the rate would make 200,85 $.
            { accountId: card, amount: som(2_370_000), settled: usd(200) },
          ],
          settled: usd(300),
        }).expect(201)
      ).body
      expect(
        (payment.lines as Line[]).map((line) => [line.currency, line.amount, line.rate, line.settled, line.fx]),
      ).toEqual([
        ['USD', usd(50), null, usd(50), 0],
        ['UZS', som(590_000), 11_800, usd(50), 0],
        ['UZS', som(2_370_000), 11_850, usd(200), som(10_000)],
      ])
      expect(moved(before, await balances())).toEqual({
        cash_USD: usd(50),
        cash_UZS: som(590_000),
        card_UZS: som(2_370_000),
        Anvar: -usd(300),
        fx: -som(10_000),
      })
    })
  })

  describe('an expense paid in dollars', () => {
    it("may be counted as an agreed sum of so'm, the difference being the rate's", async () => {
      const categories = (await alpha.get('/api/money/categories').expect(200)).body as { id: string; name: string }[]
      const kitchen = categories.find((category) => category.name === 'Oshxona')!.id
      const spend = (settled: number, agent = manager) =>
        agent.post('/api/money/ops').send({
          clientKey: randomUUID(),
          kind: 'expense',
          categoryId: kitchen,
          lines: [{ accountId: dollars, amount: usd(50), settled }],
          total: settled,
        })

      const before = await balances()
      // Fifty dollars are worth 590 000; the bill said 600 000 and was paid with them.
      const op = (await spend(som(600_000)).expect(201)).body
      expect(op.total).toBe(som(600_000))
      expect(op.lines[0]).toMatchObject({
        currency: 'USD',
        amount: usd(50),
        rate: 12_000,
        base: som(600_000),
        fx: som(10_000),
      })
      // The expense is what the bill said; the drawer gave up 590 000 worth; 10 000 were saved on the rate.
      expect(moved(before, await balances())).toEqual({
        cash_USD: -usd(50),
        expenses: som(600_000),
        fx: -som(10_000),
      })

      // Far from the rate, it takes someone who sets rates.
      const far = await spend(som(800_000))
      expect(far.status).toBe(400)
      expect(far.body.error.fields['lines.0.settled']).toContain('35,6%')
      await spend(som(800_000), alpha).expect(201)
    })
  })

  describe('a card', () => {
    it('is known by its whole number, may hold dollars, and is one of a kind', async () => {
      const add = (body: Record<string, unknown>) => alpha.post('/api/money/accounts').send({ kind: 'card', ...body })
      // Typed as it is printed, with spaces; kept as digits, and called by its last four.
      const visa = (await add({ name: 'Visa', currency: 'USD', cardNumber: '4000 1234 5678 9010' }).expect(201)).body
      expect(visa).toMatchObject({ kind: 'card', currency: 'USD', cardNumber: '4000123456789010', last4: '9010' })

      const twice = await add({ name: 'Visa 2', currency: 'USD', cardNumber: '4000123456789010' })
      expect(twice.status).toBe(400)
      expect(twice.body.error.fields.cardNumber).toBe('Bu raqamli karta bor: Visa')
      const short = await add({ name: 'Qisqa', cardNumber: '9860 12' })
      expect(short.body.error.fields.cardNumber).toBe('Karta raqami 16 ta raqam')
      // A terminal takes so'm and nothing else.
      const terminal = await alpha
        .post('/api/money/accounts')
        .send({ kind: 'terminal', name: 'POS $', currency: 'USD' })
      expect(terminal.body.error.fields.currency).toBe('Terminal faqat so‘mda')

      // Dollars to the card settle a so'm account as dollars in the drawer do: here, as agreed.
      const before = await balances()
      const payment = (
        await one(
          elaris,
          'in',
          { accountId: visa.id, amount: usd(200), settled: som(2_400_000) },
          som(2_400_000),
          dealer,
        ).expect(201)
      ).body
      expect(payment.lines[0]).toMatchObject({
        currency: 'USD',
        rate: 12_000,
        settled: som(2_400_000),
        fx: -som(40_000),
      })
      expect(moved(before, await balances())).toEqual({
        card_USD: usd(200),
        Elaris: -som(2_400_000),
        fx: som(40_000),
      })

      // A sale at the till is in so'm: the dollar card is not among the cards it may be paid to.
      const registers = (await alpha.get('/api/money/registers').expect(200)).body as { id: string }[]
      const context = (await alpha.get(`/api/pos/context/${registers[0].id}`).expect(200)).body
      expect((context.cards as { name: string }[]).map((item) => item.name)).toEqual(['Humo'])
    })
  })

  describe('whatever was agreed', () => {
    it('the total the screen showed must be what the lines come to', async () => {
      // A line left to the rate against a total worked out at another: the screen is stale.
      const stale = await one(elaris, 'in', { accountId: dollars, amount: usd(10) }, som(120_000), dealer)
      expect(stale.status).toBe(409)
      expect(stale.body.error.code).toBe('RATE_CHANGED')
      // An agreed line against a total that is not its own.
      const wrong = await one(
        elaris,
        'in',
        { accountId: dollars, amount: usd(10), settled: som(119_000) },
        som(118_000),
        dealer,
      )
      expect(wrong.body.error.code).toBe('RATE_CHANGED')
    })

    it('a payment taken back takes the difference back with it', async () => {
      const before = await balances()
      const payment = (
        await one(
          elaris,
          'in',
          { accountId: dollars, amount: usd(100), settled: som(1_200_000) },
          som(1_200_000),
        ).expect(201)
      ).body
      await alpha.post(`/api/partner-payments/${payment.id}/cancel`).send({ reason: 'Xato kiritilgan' }).expect(200)
      expect(moved(before, await balances())).toEqual({})
    })

    it('every entry in the books still comes to nothing, and dollars lie in them at the day’s rate', async () => {
      const [{ off }] = await sql<{ off: string }[]>(
        `SELECT count(*) AS off FROM (SELECT entry_id FROM ledger_lines GROUP BY entry_id HAVING sum(base) <> 0) x`,
      )
      expect(Number(off)).toBe(0)
      // Every dollar that went through the drawer after it was opened was written down at 11 800, whatever was agreed.
      const lines = await sql<{ amount: string; base: string }[]>(
        `SELECT l.amount, l.base FROM ledger_lines l JOIN accounts a ON a.id = l.account_id
         JOIN ledger_entries e ON e.id = l.entry_id
         WHERE a.kind = 'cash' AND a.currency = 'USD' AND e.kind = 'partner_payment'`,
      )
      expect(lines.length).toBeGreaterThan(5)
      expect(lines.every((line) => Number(line.base) === Number(line.amount) * 11_800)).toBe(true)
    })
  })
})
