import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)
const usd = (amount: number) => Math.round(amount * 100)

interface Balance {
  currency: string
  balance: number
  owed: number
  credit: number
  nextDue: string | null
  nextDueAmount: number
}

interface Card {
  id: string
  name: string
  phone: string | null
  note: string | null
  tags: string[]
  isActive: boolean
  isSupplier: boolean
  mergedInto: { id: string; name: string } | null
  balances: Balance[] | null
}

interface Sale {
  id: string
  number: string
  customerId: string | null
  lines: { id: string }[]
}

/**
 * One person written down twice is made one (KEYINGI-REJA, 16, decision 23).
 * What stood on the accounts of the card that goes is carried, by entries of
 * its own, to the accounts of the one that stays, each in its own currency;
 * nothing written before is changed, and what reaches the old accounts
 * afterwards is carried on as well. The history reads as one account.
 */
describe('Two cards of one person made one', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let cashier: Agent

  let registerId: string
  let scarf: string
  /** A day well ahead: a debt given it is not late. */
  const due = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10)

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })
  const customer = async (name: string, more: Record<string, unknown> = {}) =>
    (
      await alpha
        .post('/api/customers')
        .send({ name, ...more })
        .expect(201)
    ).body.id as string
  const card = async (id: string) => (await alpha.get(`/api/customers/${id}`).expect(200)).body as Card
  const account = async (id: string, currency = 'UZS') =>
    ((await card(id)).balances ?? []).find((item) => item.currency === currency) ?? null
  const opening = async (customerId: string, owes: 'customer' | 'us', amount: number, currency = 'UZS') =>
    (
      await alpha
        .post('/api/customer-payments/opening')
        .send({ clientKey: randomUUID(), customerId, currency, owes, amount })
        .expect(201)
    ).body as { id: string; number: string }
  const merge = (id: string, intoId: string, agent = alpha) => agent.post(`/api/customers/${id}/merge`).send({ intoId })
  const statement = async (id: string, currency?: string) =>
    (
      await alpha
        .get(`/api/customers/${id}/statement`)
        .query(currency ? { currency } : {})
        .expect(200)
    ).body as {
      customer: { id: string }
      balance: number
      lines: { kind: string; number: string | null; change: number; balance: number; due: { dueDate: string } | null }[]
    }
  /** What is left on the accounts that are a customer's own in the books, whoever they are now. */
  const left = async (id: string) =>
    (await sql<{ balance: string }[]>(`SELECT balance FROM accounts WHERE customer_id = $1`, [id])).map((row) =>
      Number(row.balance),
    )
  /** A scarf at 75 000 so'm, all of it on the customer's account. */
  const lend = async (customerId: string): Promise<Sale> =>
    (
      await alpha
        .post('/api/sales')
        .send({
          clientKey: randomUUID(),
          registerId,
          customerId,
          lines: [{ variantId: scarf, qty: 1 }],
          total: som(75_000),
          payments: [],
          onAccount: { amount: som(75_000), dueDate: due },
        })
        .expect(201)
    ).body

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
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
        lines: [{ variantId: scarf, qty: 40, price: som(30_000) }],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${receipt.body.id}/post`).expect(201)
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    await alpha.post('/api/shifts').send({ registerId, cash: {} }).expect(201)

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
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe('a buyer written down twice', () => {
    let first: string
    let second: string
    let sale: Sale

    beforeAll(async () => {
      first = await customer('Nodira', { tags: ['doimiy'], note: 'Chorsu' })
      second = await customer('Nodira opa', { phone: '90 123 45 67', tags: ['ulgurji'], note: 'Yakshanba kuni keladi' })
      // The first card owes 50 000 from before the books; the second, 75 000 for a scarf, and has 10 $ of her own.
      await opening(first, 'customer', som(50_000))
      sale = await lend(second)
      await opening(second, 'us', usd(10), 'USD')
    })

    it('carries what stood on each account to the other’s, in its own currency', async () => {
      const kept = (await merge(second, first).expect(200)).body as Card
      expect(kept).toMatchObject({ id: first, name: 'Nodira', isActive: true, mergedInto: null })
      expect(await account(first)).toMatchObject({
        balance: som(125_000),
        owed: som(125_000),
        // The scarf's day came along with its debt.
        nextDue: due,
        nextDueAmount: som(75_000),
      })
      // Dollars stay dollars: nothing is added across currencies.
      expect(await account(first, 'USD')).toMatchObject({ balance: -usd(10), credit: usd(10) })
      expect(await left(second)).toEqual([0, 0])
    })

    it('fills the card that stays from the one that goes, and puts that one away for good', async () => {
      const kept = await card(first)
      // The phone is one customer's alone: it moved.
      expect(kept.phone).toBe('+998901234567')
      expect(kept.tags.sort()).toEqual(['doimiy', 'ulgurji'])
      expect(kept.note).toBe('Chorsu\nYakshanba kuni keladi')
      const gone = await card(second)
      expect(gone).toMatchObject({
        isActive: false,
        phone: null,
        mergedInto: { id: first, name: 'Nodira' },
        balances: [],
      })
      const back = await alpha.post(`/api/customers/${second}/restore`)
      expect(back.status).toBe(409)
      expect(back.body.error.code).toBe('CUSTOMER_MERGED')
      const again = await merge(second, first)
      expect(again.status).toBe(409)
      expect(again.body.error.code).toBe('CUSTOMER_MERGED')
      // Nor is anyone merged into a card that is itself gone.
      const third = await customer('Nodira xola')
      expect((await merge(third, second)).body.error.fields.intoId).toContain('birlashtirilgan')
      expect((await merge(third, third)).status).toBe(400)
    })

    it('reads their history as one account, with the days debts fall due', async () => {
      const whole = await statement(first)
      expect(whole.balance).toBe(som(125_000))
      expect(whole.lines.map((line) => [line.kind, line.change, line.balance, line.due?.dueDate ?? null])).toEqual([
        ['opening', som(50_000), som(50_000), null],
        ['sale', som(75_000), som(125_000), due],
      ])
      // Asked for by the card that went, it is the same account.
      const same = await statement(second)
      expect(same.customer.id).toBe(first)
      expect(same.lines).toEqual(whole.lines)
      expect((await statement(first, 'USD')).balance).toBe(-usd(10))
      // The receipt is hers now, and says what she owes in all.
      const receipt = (await alpha.get(`/api/sales/${sale.id}`).expect(200)).body
      expect(receipt.customerId).toBe(first)
      expect(receipt.owes).toEqual([{ currency: 'UZS', balance: som(125_000) }])
      const debtors = (await alpha.get('/api/customers/debtors').expect(200)).body.items as {
        customerId: string
        owed: number
      }[]
      expect(debtors.filter((row) => row.customerId === first || row.customerId === second)).toEqual([
        expect.objectContaining({ customerId: first, owed: som(125_000) }),
      ])
    })

    it('takes goods brought back on an old receipt off the account that stays', async () => {
      await alpha
        .post('/api/returns')
        .send({
          clientKey: randomUUID(),
          registerId,
          saleId: sale.id,
          lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
          refunds: [],
          total: som(75_000),
        })
        .expect(201)
      expect(await account(first)).toMatchObject({ balance: som(50_000), owed: som(50_000), nextDue: null })
      expect(await left(second)).toEqual([0, 0])
      const whole = await statement(first)
      expect(whole.lines.map((line) => [line.kind, line.change, line.balance])).toEqual([
        ['opening', som(50_000), som(50_000)],
        ['sale', som(75_000), som(125_000)],
        ['sale_return', -som(75_000), som(50_000)],
      ])
    })

    it('pays, and is paid, as the one that stays', async () => {
      // A payment written to the card that went goes to who she is now.
      await opening(second, 'us', som(20_000))
      expect((await account(first))?.balance).toBe(som(30_000))
      expect(await left(second)).toEqual([0, 0])
    })
  })

  it('carries on an old payment undone afterwards', async () => {
    const [aziz, twin] = [await customer('Aziz'), await customer('Aziz aka')]
    const owed = await opening(twin, 'customer', som(100_000))
    await merge(twin, aziz).expect(200)
    expect((await account(aziz))?.balance).toBe(som(100_000))
    await alpha.post(`/api/customer-payments/${owed.id}/cancel`).send({ reason: 'Xato yozilgan' }).expect(200)
    expect((await account(aziz))?.balance ?? 0).toBe(0)
    expect(await left(twin)).toEqual([0])
    // Undone, it never was: nothing of it is left to be late or to be owed.
    expect((await statement(aziz)).lines.map((line) => [line.kind, line.change])).toEqual([
      ['opening', som(100_000)],
      ['cancel', -som(100_000)],
    ])
    expect((await account(aziz))?.owed ?? 0).toBe(0)
  })

  it('keeps whoever was merged before with the one that stays in the end', async () => {
    const [one, two, three] = [await customer('Bobur 1'), await customer('Bobur 2'), await customer('Bobur')]
    await opening(one, 'customer', som(10_000))
    await opening(two, 'customer', som(20_000))
    await opening(three, 'customer', som(30_000))
    await merge(one, two).expect(200)
    await merge(two, three).expect(200)
    expect((await card(one)).mergedInto).toEqual({ id: three, name: 'Bobur' })
    expect(await account(three)).toMatchObject({ balance: som(60_000), owed: som(60_000) })
    expect((await statement(three)).lines.map((line) => line.change)).toEqual([som(10_000), som(20_000), som(30_000)])
    expect([...(await left(one)), ...(await left(two))]).toEqual([0, 0])
  })

  it('makes a supplier of whoever takes a supplier in', async () => {
    const [buyer, supplier] = [await customer('Textile'), await customer('Textile MChJ', { isSupplier: true })]
    await opening(supplier, 'us', som(400_000))
    const kept = (await merge(supplier, buyer).expect(200)).body as Card
    expect(kept.isSupplier).toBe(true)
    expect((await account(buyer))?.balance).toBe(-som(400_000))
  })

  it('is for those who put accounts right, and stays inside the business', async () => {
    const [here, there] = [await customer('Sardor'), await customer('Sardor aka')]
    await merge(there, here, cashier).expect(403)
    await merge(there, here, beta).expect(404)
    expect((await merge(there, randomUUID())).body.error.fields.intoId).toBe('Mijoz topilmadi')
    const archived = await customer('Sardor eski')
    await alpha.post(`/api/customers/${archived}/archive`).expect(200)
    expect((await merge(there, archived)).body.error.fields.intoId).toContain('arxivda')
    // A card put away, but not merged, may still be merged into one that stands.
    await merge(archived, here).expect(200)
  })

  it('leaves every entry of the ledger in balance', async () => {
    const [unbalanced] = await sql<{ entries: string }[]>(
      `SELECT count(*) AS entries FROM (
         SELECT l.entry_id FROM ledger_lines l GROUP BY l.entry_id HAVING sum(l.base) <> 0
       ) x`,
    )
    expect(Number(unbalanced.entries)).toBe(0)
  })
})
