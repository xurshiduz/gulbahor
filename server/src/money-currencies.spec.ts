import { randomUUID } from 'node:crypto'

import type { AccountDto, CurrenciesDto } from '@erp/core'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)
const usd = (amount: number) => Math.round(amount * 100)
const yuan = (amount: number) => Math.round(amount * 100)

/**
 * Money kept in a currency beside so'm and dollars: a safe of yuan, a card
 * of yuan. It comes in and goes out in its own currency, is worth in the
 * books what the chain of the day's rates makes of it, settles what a
 * partner is owed at those rates or at an agreed sum — and what lies
 * between an agreed sum and the day's rate is written down, never lost.
 */
describe('Money in any currency', () => {
  let harness: Harness
  let alpha: Agent
  let manager: Agent
  let dealer: Agent
  let today: string

  let yuanSafe: string
  let yuanCard: string
  let dollarSafe: string
  let supplier: string
  let categories: { id: string; name: string; kind: string }[]

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  /** Balances: places by their name, partners by theirs, the ledger's own by their key. */
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
  const account = (body: Record<string, unknown>, agent = alpha) => agent.post('/api/money/accounts').send(body)
  const op = (
    kind: 'expense' | 'income',
    name: string,
    lines: Record<string, unknown>[],
    total: number,
    agent = alpha,
  ) =>
    agent.post('/api/money/ops').send({
      clientKey: randomUUID(),
      kind,
      categoryId: categories.find((item) => item.name === name && item.kind === kind)!.id,
      lines,
      total,
    })
  const pay = (lines: Record<string, unknown>[], settled: number, agent = alpha) =>
    agent
      .post('/api/partner-payments')
      .send({ clientKey: randomUUID(), partnerId: supplier, kind: 'out', lines, settled })
  const move = (fromAccountId: string, toAccountId: string, amount: number) =>
    alpha.post('/api/money/transfers').send({ clientKey: randomUUID(), fromAccountId, toAccountId, amount })

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    ;[{ day: today }] = await sql<{ day: string }[]>(`SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day`)
    categories = (await alpha.get('/api/money/categories').expect(200)).body
    dollarSafe = (await account({ kind: 'safe', name: 'Dollar seyfi', currency: 'USD' }).expect(201)).body.id
    supplier = (
      await alpha
        .post('/api/partners')
        .send({ name: 'Guangzhou Textile', isSupplier: true, currency: 'USD' })
        .expect(201)
    ).body.id

    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
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
    // A shop's manager writes expenses down, and sets no rates: what he may agree to has a limit.
    manager = await harness.signIn('menejer')
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
    // He pays partners, and sets no rates either.
    dealer = await harness.signIn('hamkorchi')
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe('a place for it', () => {
    it('is opened only in a currency the business has switched on', async () => {
      const refused = await account({ kind: 'safe', name: 'Yuan seyfi', currency: 'CNY' }).expect(400)
      expect(refused.body.error.fields.currency).toBeDefined()

      await alpha.post('/api/currencies').send({ code: 'CNY' }).expect(200)
      const safe = (await account({ kind: 'safe', name: 'Yuan seyfi', currency: 'CNY' }).expect(201)).body as AccountDto
      expect(safe).toMatchObject({ kind: 'safe', currency: 'CNY', balance: 0 })
      yuanSafe = safe.id
      yuanCard = (
        await account({ kind: 'card', name: 'UnionPay', currency: 'CNY', cardNumber: '6200123456789012' }).expect(201)
      ).body.id

      // What is not switched on is still refused, and a terminal takes what the tills sell in.
      await account({ kind: 'bank', name: 'Tenge hisobi', currency: 'KZT' }).expect(400)
      const terminal = await account({ kind: 'terminal', name: 'Yuan terminal', currency: 'CNY' }).expect(400)
      expect(terminal.body.error.fields.currency).toBeDefined()
    })

    it('is offered where money is paid from, beside the others', async () => {
      const places = (await alpha.get('/api/partner-payments/accounts').expect(200)).body as AccountDto[]
      expect(places.find((place) => place.id === yuanSafe)).toMatchObject({ currency: 'CNY', open: true })
      expect(places.find((place) => place.id === yuanCard)).toMatchObject({
        currency: 'CNY',
        cardNumber: '6200123456789012',
      })
    })
  })

  describe('money coming into it', () => {
    it('is not counted while a rate it hangs on is wanting, and the one that is wanting is named', async () => {
      // Neither the yuan nor the dollar it is named against has a rate.
      const none = await op('income', 'Egasi qo‘shdi', [{ accountId: yuanSafe, amount: yuan(10_000) }], 0).expect(400)
      expect(none.body.error.fields['lines.0.amount']).toBe('Xitoy yuani kursi qo‘yilmagan')
      await alpha.put('/api/currencies/CNY/rate').send({ value: 7.25 }).expect(200)
      const half = await op('income', 'Egasi qo‘shdi', [{ accountId: yuanSafe, amount: yuan(10_000) }], 0).expect(400)
      expect(half.body.error.fields['lines.0.amount']).toBe('Dollar kursi qo‘yilmagan')
      await alpha.put('/api/money/rates').send({ date: today, uzsPerUsd: 12_650 }).expect(200)
    })

    it('is kept as yuan, and worth in the books what the chain of rates makes of it', async () => {
      const before = await balances()
      // 10 000 ¥ × 12 650 / 7,25 = 17 448 275,86 so'm.
      const worth = som(17_448_275.86)
      // What the screen showed is checked: a total worked out any other way is refused.
      await op('income', 'Egasi qo‘shdi', [{ accountId: yuanSafe, amount: yuan(10_000) }], som(17_450_000)).expect(409)
      const made = (
        await op('income', 'Egasi qo‘shdi', [{ accountId: yuanSafe, amount: yuan(10_000) }], worth).expect(201)
      ).body
      expect(made).toMatchObject({ total: worth })
      expect(made.lines[0]).toMatchObject({ currency: 'CNY', amount: yuan(10_000), base: worth, fx: 0 })
      // The rate the two sums make reads "1 ¥ = 1 744,83 so'm".
      expect(made.lines[0].rate).toBe(1744.83)
      expect(moved(before, await balances())).toEqual({ 'Yuan seyfi': yuan(10_000), owner: -worth })
    })
  })

  describe('money going out of it', () => {
    it('pays an expense: counted at the day’s rates, or at a sum that was agreed', async () => {
      const before = await balances()
      // 1 000 ¥ for the freight, at the day's rate.
      const day = som(1_744_827.59)
      await op('expense', 'Yuk haqi', [{ accountId: yuanSafe, amount: yuan(1000) }], day).expect(201)
      expect(moved(before, await balances())).toEqual({ 'Yuan seyfi': -yuan(1000), expenses: day })

      // "Count these 1 000 yuan as 1 760 000": the yuan are worth what the day says, the expense is what was agreed.
      const agreed = som(1_760_000)
      const then = await balances()
      const made = (
        await op('expense', 'Yuk haqi', [{ accountId: yuanSafe, amount: yuan(1000), settled: agreed }], agreed).expect(
          201,
        )
      ).body
      // Yuan worth 15 172,41 so'm less than the expense they settled: on the line, the business's gain on the rate.
      expect(made.lines[0]).toMatchObject({ base: agreed, fx: agreed - day })
      expect(moved(then, await balances())).toEqual({
        'Yuan seyfi': -yuan(1000),
        expenses: agreed,
        fx: -(agreed - day),
      })
    })

    it('holds a person who sets no rates to the limit, between yuan and so’m as between dollars and so’m', async () => {
      // 1 900 000 for 1 000 ¥ is 8,9% off the day's 1 744 827,59.
      const far = await op(
        'expense',
        'Yuk haqi',
        [{ accountId: yuanSafe, amount: yuan(1000), settled: som(1_900_000) }],
        som(1_900_000),
        manager,
      ).expect(400)
      expect(far.body.error.fields['lines.0.settled']).toContain('8,9%')
      // More than is there is not spent.
      const over = await op('expense', 'Yuk haqi', [{ accountId: yuanSafe, amount: yuan(50_000) }], 0).expect(400)
      expect(over.body.error.fields['lines.0.amount']).toBe('Hisobda buncha pul yo‘q')
    })
  })

  describe('a partner paid with it', () => {
    it('has a dollar account settled by yuan at the day’s rates, with nothing left over on a round sum', async () => {
      const before = await balances()
      // 2 900 ¥ at 7,25 to the dollar are 400 $, whatever the dollar costs.
      const paid = (await pay([{ accountId: yuanSafe, amount: yuan(2900) }], usd(400)).expect(201)).body
      expect(paid.lines[0]).toMatchObject({ currency: 'CNY', amount: yuan(2900), settled: usd(400), rate: 7.25, fx: 0 })
      // Paid, the business is owed: the supplier's account stands at 400 $ in its favour.
      expect(moved(before, await balances())).toEqual({ 'Yuan seyfi': -yuan(2900), 'Guangzhou Textile': usd(400) })
    })

    it('has it settled by what the two sides agreed, the difference written down', async () => {
      const before = await balances()
      // "Take 2 190 yuan for 300 dollars": the day would have made it 302,07 $.
      const paid = (await pay([{ accountId: yuanSafe, amount: yuan(2190), settled: usd(300) }], usd(300)).expect(201))
        .body
      expect(paid.lines[0]).toMatchObject({ settled: usd(300), rate: 7.3 })
      // 2 190 ¥ are worth 3 821 172,41 so'm; 300 $ are 3 795 000: 26 172,41 went for nothing — the business's loss.
      const lost = som(3_821_172.41) - som(3_795_000)
      expect(paid.lines[0].fx).toBe(-lost)
      expect(moved(before, await balances())).toEqual({
        'Yuan seyfi': -yuan(2190),
        'Guangzhou Textile': usd(300),
        fx: lost,
      })
      // An agreement far from the rate takes someone who sets rates.
      const far = await pay([{ accountId: yuanSafe, amount: yuan(2190), settled: usd(250) }], usd(250), dealer)
      expect(far.status).toBe(400)
      expect(far.body.error.fields['lines.0.settled']).toBeDefined()
    })
  })

  describe('money carried from one place to another', () => {
    it('stays what it is: yuan go to a place of yuan, and are worth on the way what the day says', async () => {
      const sent = (await move(yuanSafe, yuanCard, yuan(1500)).expect(201)).body
      expect(sent).toMatchObject({ currency: 'CNY', amount: yuan(1500), status: 'sent' })
      await alpha.post(`/api/money/transfers/${sent.id}/receive`).expect(200)
      const places = (await alpha.get('/api/money/accounts').expect(200)).body as AccountDto[]
      // 10 000 − 1 000 − 1 000 − 2 900 − 2 190 − 1 500.
      expect(places.find((place) => place.id === yuanSafe)?.balance).toBe(yuan(1410))
      expect(places.find((place) => place.id === yuanCard)?.balance).toBe(yuan(1500))
      // Into another currency it is an exchange: 100 ¥ at 7,25 to the dollar are 13,79 $.
      const across = (await move(yuanSafe, dollarSafe, yuan(100)).expect(201)).body
      expect(across).toMatchObject({ currency: 'CNY', toCurrency: 'USD', toAmount: usd(13.79) })
      await alpha.post(`/api/money/transfers/${across.id}/cancel`).expect(200)
    })
  })

  describe('a partner kept in yuan', () => {
    let yiwu: string
    const payYiwu = (lines: Record<string, unknown>[], settled: number) =>
      alpha
        .post('/api/partner-payments')
        .send({ clientKey: randomUUID(), partnerId: yiwu, kind: 'out', lines, settled })

    it('is opened only in a currency the business has switched on', async () => {
      const refused = await alpha
        .post('/api/partners')
        .send({ name: 'Almaty Trade', isSupplier: true, currency: 'KZT' })
        .expect(400)
      expect(refused.body.error.fields.currency).toBeDefined()
      const made = (
        await alpha.post('/api/partners').send({ name: 'Yiwu Market', isSupplier: true, currency: 'CNY' }).expect(201)
      ).body
      expect(made).toMatchObject({ currency: 'CNY', balance: 0 })
      yiwu = made.id
    })

    it('has what stood before the books valued along the chain of rates', async () => {
      const before = await balances()
      await alpha
        .post('/api/partner-payments/opening')
        .send({ clientKey: randomUUID(), partnerId: yiwu, owes: 'us', amount: yuan(10_000) })
        .expect(201)
      // The business owes 10 000 ¥, worth 17 448 275,86 so'm today.
      expect(moved(before, await balances())).toEqual({
        'Yiwu Market': -yuan(10_000),
        opening: som(17_448_275.86),
      })
    })

    it('is paid in yuan, in dollars and in so’m, each settling yuan', async () => {
      const before = await balances()
      await payYiwu([{ accountId: yuanSafe, amount: yuan(1000) }], yuan(1000)).expect(201)
      await alpha
        .post('/api/money/ops')
        .send({
          clientKey: randomUUID(),
          kind: 'income',
          categoryId: categories.find((item) => item.name === 'Egasi qo‘shdi' && item.kind === 'income')!.id,
          lines: [{ accountId: dollarSafe, amount: usd(100) }],
          total: som(1_265_000),
        })
        .expect(201)
      // 100 $ at 7,25 yuan to the dollar are 725 ¥.
      const paid = (await payYiwu([{ accountId: dollarSafe, amount: usd(100) }], yuan(725)).expect(201)).body
      expect(paid.lines[0]).toMatchObject({ currency: 'USD', settled: yuan(725), rate: 7.25 })
      expect(moved(before, await balances())).toMatchObject({
        'Yuan seyfi': -yuan(1000),
        'Yiwu Market': yuan(1725),
      })
      const statement = (await alpha.get(`/api/partners/${yiwu}/statement`).expect(200)).body
      expect(statement.balance).toBe(-yuan(10_000) + yuan(1725))
    })

    it('is not counted while its currency has no rate', async () => {
      await alpha.post('/api/currencies').send({ code: 'EUR' }).expect(200)
      const paris = (
        await alpha.post('/api/partners').send({ name: 'Paris Mode', isSupplier: true, currency: 'EUR' }).expect(201)
      ).body.id
      const none = await alpha
        .post('/api/partner-payments/opening')
        .send({ clientKey: randomUUID(), partnerId: paris, owes: 'us', amount: 100_000 })
        .expect(400)
      expect(none.body.error.fields.amount).toBe('Yevro kursi qo‘yilmagan')
    })
  })

  describe('the books', () => {
    it('add up to nothing after all of it', async () => {
      const [{ total }] = await sql<{ total: string }[]>(
        `SELECT coalesce(sum(l.base), 0)::text AS total FROM ledger_lines l
         JOIN organizations o ON o.id = l.org_id WHERE o.name = 'Alpha'`,
      )
      expect(Number(total)).toBe(0)
    })

    it('keep a currency that still holds money from being put away', async () => {
      const held = await alpha.post('/api/currencies/CNY/archive').expect(409)
      expect(held.body.error.code).toBe('CURRENCY_HELD')
      const currencies = (await alpha.get('/api/currencies').expect(200)).body as CurrenciesDto
      expect(currencies.active.find((currency) => currency.code === 'CNY')).toMatchObject({ held: true })
    })
  })
})
