import type { CurrenciesDto, CurrencyDto } from '@gulbahor/core'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

/**
 * The currencies a business keeps beside its base: switched on from a list
 * that is given, each with one rate written against the base or against
 * another currency the business has, and worth in the base what the chain
 * of those rates makes of it.
 */
describe('Currencies', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let cashier: Agent
  let accountant: Agent
  let today: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  const list = async (agent = alpha) => (await agent.get('/api/currencies').expect(200)).body as CurrenciesDto
  const one = (currencies: CurrenciesDto, code: string) =>
    currencies.active.find((currency) => currency.code === code) as CurrencyDto
  const enable = (code: string, form?: { against: string; way: 'per' | 'in' }, agent = alpha) =>
    agent.post('/api/currencies').send({ code, form })
  const rate = (code: string, value: number, confirmed?: boolean, agent = alpha) =>
    agent.put(`/api/currencies/${code}/rate`).send({ value, confirmed })

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    ;[{ day: today }] = await sql<{ day: string }[]>(`SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day`)

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
    cashier = await hire('Dilnoza Kassir', 'kassir', 'cashier')
    accountant = await hire('Hilola Hisobchi', 'hisobchi', 'accountant')
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('are the base and the dollar to begin with: the one has no rate, the other none yet', async () => {
    const currencies = await list()
    expect(currencies.base).toBe('UZS')
    expect(currencies.active.map((currency) => currency.code)).toEqual(['UZS', 'USD'])
    expect(one(currencies, 'UZS')).toMatchObject({ base: true, fixed: true, form: null, rate: null, missing: null })
    // No rate was ever set: the dollar is worth nothing that can be named — and never one so'm.
    expect(one(currencies, 'USD')).toMatchObject({
      base: false,
      fixed: true,
      form: { against: 'UZS', way: 'in' },
      rate: null,
      worth: null,
      missing: 'USD',
    })
    // Sixteen are known; the two that are there are not offered again.
    expect(currencies.available).toHaveLength(14)
    expect(currencies.available).toEqual(expect.arrayContaining(['CNY', 'EUR', 'RUB', 'KZT', 'TJS', 'GBP']))

    await enable('USD').expect(400)
    await enable('UZS').expect(400)
    await enable('XXX').expect(400)
    await alpha.post('/api/currencies/UZS/archive').expect(404)
    await alpha.post('/api/currencies/USD/archive').expect(404)
  })

  it('are switched on by whoever runs the money, each named against the dollar as the market names it', async () => {
    await enable('CNY', undefined, cashier).expect(403)
    const currencies = (await enable('CNY').expect(200)).body as CurrenciesDto
    expect(one(currencies, 'CNY')).toMatchObject({
      base: false,
      fixed: false,
      form: { against: 'USD', way: 'per' },
      rate: null,
      missing: 'CNY',
    })
    expect(currencies.available).not.toContain('CNY')
    // The euro is dearer than the dollar and named in it; a rouble can be told to be written straight in so'm.
    await enable('EUR').expect(200)
    const all = (await enable('RUB', { against: 'UZS', way: 'in' }).expect(200)).body as CurrenciesDto
    expect(one(all, 'EUR').form).toEqual({ against: 'USD', way: 'in' })
    expect(one(all, 'RUB').form).toEqual({ against: 'UZS', way: 'in' })
    // The dollar carries the two written against it.
    expect(one(all, 'USD').carries).toEqual(['CNY', 'EUR'])
    // Switched on twice, it is still there once.
    const again = (await enable('CNY').expect(200)).body as CurrenciesDto
    expect(again.active.filter((currency) => currency.code === 'CNY')).toHaveLength(1)
  })

  it('take a rate from whoever sets rates, and need a currency to be switched on first', async () => {
    await rate('CNY', 7.25, undefined, cashier).expect(403)
    await rate('KZT', 500).expect(404)
    await rate('CNY', 0).expect(400)
    await rate('CNY', 7.1234567).expect(400)

    const currencies = (await rate('CNY', 7.25, undefined, accountant).expect(200)).body as CurrenciesDto
    expect(one(currencies, 'CNY').rate).toMatchObject({ date: today, against: 'USD', way: 'per', value: 7.25 })
    expect(one(currencies, 'CNY').rate?.setByName).toBe('Hilola Hisobchi')
    // Its own rate is there; the dollar's it is written against is not. It is still worth nothing that can be named.
    expect(one(currencies, 'CNY')).toMatchObject({ worth: null, missing: 'USD' })
  })

  it('are worth in the base what the chain of rates makes of them, and follow the dollar', async () => {
    await alpha.put('/api/money/rates').send({ date: today, uzsPerUsd: 12_650 }).expect(200)
    await rate('EUR', 1.08).expect(200)
    let currencies = (await rate('RUB', 135).expect(200)).body as CurrenciesDto
    expect(one(currencies, 'USD')).toMatchObject({ worth: '12650.00', missing: null })
    // 12 650 / 7,25, 12 650 × 1,08, and 135 as it was written.
    expect(one(currencies, 'CNY')).toMatchObject({ worth: '1744.83', missing: null, stale: false })
    expect(one(currencies, 'EUR').worth).toBe('13662.00')
    expect(one(currencies, 'RUB').worth).toBe('135.00')

    // The dollar moves: the yuan and the euro move with it, the rouble does not.
    await alpha.put('/api/money/rates').send({ date: today, uzsPerUsd: 13_000 }).expect(200)
    currencies = await list()
    expect(one(currencies, 'CNY').worth).toBe('1793.10')
    expect(one(currencies, 'EUR').worth).toBe('14040.00')
    expect(one(currencies, 'RUB').worth).toBe('135.00')
  })

  it('ask before taking a rate far from the last: a slip of the hand, more often than a market', async () => {
    const slip = await rate('CNY', 72.5).expect(409)
    expect(slip.body.error.code).toBe('RATE_JUMP')
    expect(one(await list(), 'CNY').rate?.value).toBe(7.25)
    // A day's movement is taken as it is; a leap is taken once it is said to be meant.
    await rate('CNY', 7.31).expect(200)
    const meant = (await rate('CNY', 9, true).expect(200)).body as CurrenciesDto
    expect(one(meant, 'CNY').rate?.value).toBe(9)

    // The dollar's own rate is asked about the same way.
    const dollar = await alpha.put('/api/money/rates').send({ date: today, uzsPerUsd: 1_300 }).expect(409)
    expect(dollar.body.error.code).toBe('RATE_JUMP')
    await alpha.put('/api/money/rates').send({ date: today, uzsPerUsd: 13_100 }).expect(200)
    await alpha.put('/api/money/rates').send({ date: today, uzsPerUsd: 9_000, confirmed: true }).expect(200)
  })

  it('keep a rate whole, as it was written, when the business comes to write it another way', async () => {
    // Yuan from now on straight in so'm: the rate in force is still the one written against the dollar.
    let currencies = (await enable('CNY', { against: 'UZS', way: 'in' }).expect(200)).body as CurrenciesDto
    expect(one(currencies, 'CNY')).toMatchObject({ form: { against: 'UZS', way: 'in' }, worth: '1000.00' })
    expect(one(currencies, 'CNY').rate).toMatchObject({ against: 'USD', way: 'per', value: 9 })
    // The next rate is written the new way, and is not set beside the old number to be called a leap.
    currencies = (await rate('CNY', 1_750).expect(200)).body
    expect(one(currencies, 'CNY')).toMatchObject({ worth: '1750.00' })
    expect(one(currencies, 'CNY').rate).toMatchObject({ against: 'UZS', way: 'in', value: 1_750 })
    const history = (await alpha.get('/api/currencies/CNY/rates').expect(200)).body as { value: number }[]
    // One rate a day: today's was written over, not added to.
    expect(history).toHaveLength(1)
  })

  it('may lean on one another, but never round in a ring, nor on one that is not there', async () => {
    // The rouble named against the yuan, which is written in so'm: two steps down, and sound.
    let currencies = (await enable('RUB', { against: 'CNY', way: 'per' }).expect(200)).body as CurrenciesDto
    expect(one(currencies, 'CNY').carries).toEqual(['RUB'])
    currencies = (await rate('RUB', 12.5, true).expect(200)).body
    // 1 ¥ = 1 750 so'm, 1 ¥ = 12,5 ₽: a rouble is 140 so'm.
    expect(one(currencies, 'RUB').worth).toBe('140.00')

    // The yuan against the rouble would leave the two worth only each other.
    const ring = await enable('CNY', { against: 'RUB', way: 'in' }).expect(400)
    expect(ring.body.error.fields.form).toBeDefined()
    await enable('EUR', { against: 'KZT', way: 'in' }).expect(400)
    await enable('EUR', { against: 'EUR', way: 'in' }).expect(400)
    // And the yuan stays while the rouble is written against it.
    const carried = await alpha.post('/api/currencies/CNY/archive').expect(409)
    expect(carried.body.error.code).toBe('CURRENCY_CARRIES')
    await enable('RUB', { against: 'UZS', way: 'in' }).expect(200)
  })

  it('point out a rate nobody has touched for a long while', async () => {
    await sql(`UPDATE currency_rates SET rate_date = rate_date - 30 WHERE code = 'EUR'`)
    const currencies = await list()
    expect(one(currencies, 'EUR')).toMatchObject({ stale: true })
    expect(one(currencies, 'EUR').worth).not.toBeNull()
    expect(one(currencies, 'CNY').stale).toBe(false)
  })

  it('are put away, not deleted: gone from the list, their rates kept for when they come back', async () => {
    await cashier.post('/api/currencies/EUR/archive').expect(403)
    const without = (await alpha.post('/api/currencies/EUR/archive').expect(200)).body as CurrenciesDto
    expect(without.active.map((currency) => currency.code)).toEqual(['UZS', 'USD', 'CNY', 'RUB'])
    expect(without.available).toContain('EUR')
    await rate('EUR', 1.1).expect(404)
    // Put away twice, there is nothing to put away.
    await alpha.post('/api/currencies/EUR/archive').expect(404)

    const back = (await enable('EUR').expect(200)).body as CurrenciesDto
    expect(one(back, 'EUR').form).toEqual({ against: 'USD', way: 'in' })
    expect(one(back, 'EUR').rate).toMatchObject({ value: 1.08 })
  })

  it('are each business’s own', async () => {
    const theirs = await list(beta)
    expect(theirs.active.map((currency) => currency.code)).toEqual(['UZS', 'USD'])
    expect(one(theirs, 'USD').rate).toBeNull()
    await rate('CNY', 7, undefined, beta).expect(404)
  })

  it('need no dollar where a business keeps none: every rate is written straight in the base', async () => {
    const me = (await beta.get('/api/auth/me').expect(200)).body
    const modules = (me.org.modules as string[]).filter((key) => key !== 'usd')
    await beta.put('/api/org/modules').send({ modules }).expect(200)
    let currencies = await list(beta)
    expect(currencies.active.map((currency) => currency.code)).toEqual(['UZS'])
    currencies = (await enable('CNY', undefined, beta).expect(200)).body
    expect(one(currencies, 'CNY').form).toEqual({ against: 'UZS', way: 'in' })
    // The dollar it does not keep is nothing to lean on.
    await enable('RUB', { against: 'USD', way: 'per' }, beta).expect(400)
    currencies = (await rate('CNY', 1_745, undefined, beta).expect(200)).body
    expect(one(currencies, 'CNY')).toMatchObject({ worth: '1745.00', missing: null })
    await beta.put('/api/org/modules').send({ modules: me.org.modules }).expect(200)
  })

  it('are written into the history: who switched what on, and who set which rate', async () => {
    const rows = await sql<{ action: string; summary: string }[]>(
      `SELECT a.action, a.summary FROM audit_log a JOIN organizations o ON o.id = a.org_id
       WHERE o.name = 'Alpha' AND (a.action LIKE 'currency.%' OR a.action = 'rate.set') ORDER BY a.created_at`,
    )
    expect(rows.map((row) => row.action)).toEqual(
      expect.arrayContaining(['currency.enable', 'currency.update', 'currency.disable']),
    )
    expect(rows.find((row) => row.action === 'currency.enable')?.summary).toBe('Xitoy yuani (CNY)')
    expect(rows.some((row) => row.summary === `${today}: 1 $ = 7,25 ¥`)).toBe(true)
  })
})
