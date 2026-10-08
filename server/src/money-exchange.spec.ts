import { randomUUID } from 'node:crypto'

import type { MoneyTransferDto } from '@erp/core'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)
const usd = (amount: number) => Math.round(amount * 100)
const yuan = (amount: number) => Math.round(amount * 100)

/**
 * A transfer between places in two currencies: an exchange. What leaves
 * is the anchor; what enters follows from the day's rate unless the two
 * sides agreed another sum. The rate is fixed when the money is sent; what
 * the exchange made or cost against the day's rates reaches the books when
 * the money arrives, and nothing of it when the money goes back.
 */
describe('Money exchange', () => {
  let harness: Harness
  let alpha: Agent
  let manager: Agent
  let cashier: Agent
  let today: string

  let somSafe: string
  let dollarSafe: string
  let yuanSafe: string
  let registerId: string
  let drawer: string
  let shiftId: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  /** Balances: places by their name, the ledger's own by their key. */
  const balances = async (): Promise<Record<string, number>> => {
    const rows = await sql<{ system_key: string | null; name: string; balance: string }[]>(
      `SELECT a.system_key, a.name, a.balance FROM accounts a
       JOIN organizations o ON o.id = a.org_id WHERE o.name = 'Alpha'`,
    )
    return Object.fromEntries(rows.map((row) => [row.system_key ?? row.name, Number(row.balance)]))
  }
  const moved = (before: Record<string, number>, after: Record<string, number>) =>
    Object.fromEntries(
      Object.keys(after)
        .map((key) => [key, after[key] - (before[key] ?? 0)] as const)
        .filter(([, delta]) => delta !== 0),
    )

  const send = (body: Record<string, unknown>, agent = alpha) =>
    agent.post('/api/money/transfers').send({ clientKey: randomUUID(), ...body })
  const receive = (id: string, agent = alpha) => agent.post(`/api/money/transfers/${id}/receive`).expect(200)
  const place = async (name: string, currency: string) =>
    (await alpha.post('/api/money/accounts').send({ kind: 'safe', name, currency }).expect(201)).body.id as string

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    ;[{ day: today }] = await sql<{ day: string }[]>(`SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day`)
    await alpha.put('/api/money/rates').send({ date: today, uzsPerUsd: 12_850 }).expect(200)

    somSafe = await place('Seyf', 'UZS')
    dollarSafe = await place('Seyf $', 'USD')
    const categories = (await alpha.get('/api/money/categories').expect(200)).body as {
      id: string
      name: string
      kind: string
    }[]
    const owner = categories.find((item) => item.name === 'Egasi qo‘shdi' && item.kind === 'income')!.id
    const bring = (accountId: string, amount: number, total: number) =>
      alpha
        .post('/api/money/ops')
        .send({ clientKey: randomUUID(), kind: 'income', categoryId: owner, lines: [{ accountId, amount }], total })
        .expect(201)
    await bring(somSafe, som(10_000_000), som(10_000_000))
    await bring(dollarSafe, usd(1000), som(12_850_000))

    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id

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
    // A shop's manager carries money between places and sets no rates: what he may agree to has a limit.
    manager = await hire('Anvar Menejer', 'menejer', 'store_manager')
    cashier = await hire('Dilnoza Kassir', 'kassir', 'cashier')
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe('at the day’s rate', () => {
    it('fixes what enters when the money is sent, and leaves only the rounding to the exchange difference', async () => {
      const before = await balances()
      const sent = (await send({ fromAccountId: somSafe, toAccountId: dollarSafe, amount: som(1_000_000) }).expect(201))
        .body as MoneyTransferDto
      // 1 000 000 so'm at 12 850 are 77,82 $, worth 999 987 so'm: 13 so'm short of a cent, nobody's agreement.
      expect(sent).toMatchObject({
        status: 'sent',
        currency: 'UZS',
        amount: som(1_000_000),
        toCurrency: 'USD',
        toAmount: usd(77.82),
        fx: -som(13),
      })
      // On its way it is in neither place: what left is carried at what it was worth.
      expect(moved(before, await balances())).toEqual({ Seyf: -som(1_000_000), transit: som(1_000_000) })

      await receive(sent.id, manager)
      expect(moved(before, await balances())).toEqual({ Seyf: -som(1_000_000), 'Seyf $': usd(77.82), fx: som(13) })
    })
  })

  describe('at an agreed sum', () => {
    it('takes what enters as it was said, and writes down what lies between it and the day', async () => {
      const before = await balances()
      // "Give me 78 dollars for this million": 12 820,51 against the day's 12 850, a gain of 2 300 so'm.
      const sent = (
        await send(
          { fromAccountId: somSafe, toAccountId: dollarSafe, amount: som(1_000_000), received: usd(78) },
          manager,
        ).expect(201)
      ).body as MoneyTransferDto
      expect(sent).toMatchObject({ amount: som(1_000_000), toAmount: usd(78), fx: som(2_300) })
      await receive(sent.id)
      expect(moved(before, await balances())).toEqual({ Seyf: -som(1_000_000), 'Seyf $': usd(78), fx: -som(2_300) })
    })

    it('holds a person who sets no rates to the limit; whoever sets them agrees what they like', async () => {
      // 80 $ for a million is 12 500: 2,8% off the day's rate.
      const far = await send(
        { fromAccountId: somSafe, toAccountId: dollarSafe, amount: som(1_000_000), received: usd(80) },
        manager,
      ).expect(400)
      expect(far.body.error.fields.received).toContain('2,8%')

      const before = await balances()
      const sent = (
        await send({
          fromAccountId: somSafe,
          toAccountId: dollarSafe,
          amount: som(1_000_000),
          received: usd(80),
        }).expect(201)
      ).body as MoneyTransferDto
      expect(sent.fx).toBe(som(28_000))
      await receive(sent.id)
      expect(moved(before, await balances())).toEqual({ Seyf: -som(1_000_000), 'Seyf $': usd(80), fx: -som(28_000) })
    })

    it('reads nothing into a sum "received" between places of one currency', async () => {
      const other = await place('Seyf 2', 'UZS')
      const sent = (
        await send({ fromAccountId: somSafe, toAccountId: other, amount: som(100_000), received: som(1) }).expect(201)
      ).body as MoneyTransferDto
      expect(sent).toMatchObject({ toCurrency: 'UZS', toAmount: som(100_000), fx: 0 })
      await receive(sent.id)
    })
  })

  describe('between two currencies that are not the base', () => {
    it('goes along the chain of rates: dollars to yuan and back', async () => {
      await alpha.post('/api/currencies').send({ code: 'CNY' }).expect(200)
      yuanSafe = await place('Seyf ¥', 'CNY')
      // Without the yuan's rate nothing is changed into it, and what is wanting is named.
      const none = await send({ fromAccountId: dollarSafe, toAccountId: yuanSafe, amount: usd(100) }).expect(400)
      expect(none.body.error.fields.amount).toBe('Xitoy yuani kursi qo‘yilmagan')
      await alpha.put('/api/currencies/CNY/rate').send({ value: 7.25 }).expect(200)

      const before = await balances()
      const there = (await send({ fromAccountId: dollarSafe, toAccountId: yuanSafe, amount: usd(100) }).expect(201))
        .body as MoneyTransferDto
      // 100 $ are 725 ¥, both worth 1 285 000 so'm: nothing between them.
      expect(there).toMatchObject({ toCurrency: 'CNY', toAmount: yuan(725), fx: 0 })
      await receive(there.id)

      // "Take these 725 yuan for 99 dollars": the business gives 12 850 so'm more than it gets.
      const back = (
        await send({ fromAccountId: yuanSafe, toAccountId: dollarSafe, amount: yuan(725), received: usd(99) }).expect(
          201,
        )
      ).body as MoneyTransferDto
      expect(back).toMatchObject({ toCurrency: 'USD', toAmount: usd(99), fx: -som(12_850) })
      await receive(back.id)
      expect(moved(before, await balances())).toEqual({ 'Seyf $': -usd(1), fx: som(12_850) })
    })
  })

  describe('refused or taken back', () => {
    it('returns to where it came from exactly, with no exchange difference', async () => {
      const before = await balances()
      const refused = (
        await send(
          { fromAccountId: somSafe, toAccountId: dollarSafe, amount: som(500_000), received: usd(39) },
          manager,
        ).expect(201)
      ).body as MoneyTransferDto
      await alpha.post(`/api/money/transfers/${refused.id}/reject`).send({ reason: 'Kurs kelishilmagan' }).expect(200)
      const taken = (
        await send({ fromAccountId: dollarSafe, toAccountId: somSafe, amount: usd(10) }, manager).expect(201)
      ).body as MoneyTransferDto
      await manager.post(`/api/money/transfers/${taken.id}/cancel`).expect(200)
      expect(moved(before, await balances())).toEqual({})
    })
  })

  describe('what stands in the way', () => {
    it('is money that is not there, and a currency without a rate', async () => {
      const over = await send({ fromAccountId: dollarSafe, toAccountId: somSafe, amount: usd(5000) }).expect(400)
      expect(over.body.error.fields.amount).toBe('Hisobda buncha pul yo‘q')

      await alpha.post('/api/currencies').send({ code: 'EUR' }).expect(200)
      const euros = await place('Seyf €', 'EUR')
      const none = await send({ fromAccountId: somSafe, toAccountId: euros, amount: som(100_000) }).expect(400)
      expect(none.body.error.fields.amount).toBe('Yevro kursi qo‘yilmagan')
    })
  })

  describe('at a till', () => {
    it('offers every safe of the shop, whatever it holds', async () => {
      shiftId = (await cashier.post('/api/shifts').send({ registerId, cashUzs: 0, cashUsd: 0 }).expect(201)).body.id
      const context = (await cashier.get(`/api/pos/context/${registerId}`).expect(200)).body
      expect(context.safes.map((safe: { name: string }) => safe.name).sort()).toEqual(
        ['Seyf', 'Seyf $', 'Seyf 2', 'Seyf ¥', 'Seyf €'].sort(),
      )
      drawer = context.drawers.UZS
    })

    it('counts in the shift what left a drawer in its currency, and what entered it in its own', async () => {
      // Dollars brought to the till change into so'm on the way: 50 $ are 642 500 so'm.
      const brought = (await send({ fromAccountId: dollarSafe, toAccountId: drawer, amount: usd(50) }).expect(201))
        .body as MoneyTransferDto
      expect(brought).toMatchObject({ toCurrency: 'UZS', toAmount: som(642_500) })
      await receive(brought.id, cashier)

      // The cashier hands 600 000 so'm over to the dollar safe, as 46 $ agreed.
      const handed = (
        await send(
          { fromAccountId: drawer, toAccountId: dollarSafe, amount: som(600_000), received: usd(46) },
          cashier,
        ).expect(201)
      ).body as MoneyTransferDto
      expect(handed.toAmount).toBe(usd(46))
      await receive(handed.id)

      const shift = (await alpha.get(`/api/shifts/${shiftId}`).expect(200)).body
      expect(shift.totals).toMatchObject({ outUzs: som(600_000), outUsd: 0, inUzs: som(642_500), inUsd: 0 })
    })
  })

  describe('the books', () => {
    it('list each exchange with both of its sums', async () => {
      const list = (await alpha.get('/api/money/transfers').query({ accountId: yuanSafe }).expect(200)).body
      expect(
        list.items.map((item: MoneyTransferDto) => [item.currency, item.amount, item.toCurrency, item.toAmount]),
      ).toEqual([
        ['CNY', yuan(725), 'USD', usd(99)],
        ['USD', usd(100), 'CNY', yuan(725)],
      ])
    })

    it('leave every entry in balance, and the whole at nothing', async () => {
      const [{ off }] = await sql<{ off: string }[]>(
        `SELECT count(*) AS off FROM (SELECT entry_id FROM ledger_lines GROUP BY entry_id HAVING sum(base) <> 0) x`,
      )
      expect(Number(off)).toBe(0)
      const [{ transit }] = await sql<{ transit: string }[]>(
        `SELECT a.balance AS transit FROM accounts a JOIN organizations o ON o.id = a.org_id
         WHERE o.name = 'Alpha' AND a.system_key = 'transit'`,
      )
      expect(Number(transit)).toBe(0)
    })
  })
})
