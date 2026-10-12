import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)
const usd = (amount: number) => Math.round(amount * 100)

interface Result {
  done: boolean
  created: number
  totals: { currency: string; owes: number; owed: number }[]
  rows: {
    row: number
    customerName: string
    created: boolean
    currency: string | null
    change: number
    balance: number | null
    again: boolean
    problem: string | null
  }[]
}

/**
 * What stood between the business and its customers before the books began,
 * from a spreadsheet (KEYINGI-REJA, 16.8): a trial that writes nothing, then
 * the same file for good — once, however often it is sent.
 */
describe('Opening balances from a sheet', () => {
  let harness: Harness
  let alpha: Agent
  let cashier: Agent

  let nodira: string
  let aziz: string
  const due = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10)

  const send = (rows: Record<string, unknown>[], more: Record<string, unknown> = {}, agent = alpha) =>
    agent.post('/api/customer-payments/opening/import').send({ clientKey: randomUUID(), rows, ...more })
  const book = async (q: string) =>
    (await alpha.get('/api/customers').query({ q, status: 'all' }).expect(200)).body.items as {
      id: string
      name: string
      phone: string | null
      currency: string
      isSupplier: boolean
      balances: { currency: string; balance: number; nextDue: string | null }[]
    }[]
  const owes = async (id: string, currency = 'UZS') =>
    (
      (await alpha.get(`/api/customers/${id}`).expect(200)).body.balances as { currency: string; balance: number }[]
    ).find((item) => item.currency === currency)?.balance ?? 0

  /** A file as the screen sends it: a buyer by phone, another by name, a supplier nobody has written down yet. */
  const file = () => [
    { row: 2, name: 'Nodira K.', phone: '+998901234567', owes: 'customer', amount: som(1_250_000), dueDate: due },
    { row: 3, name: 'aziz', owes: 'us', amount: som(300_000), note: 'Eski daftar' },
    { row: 4, name: 'Yiwu Textile', currency: 'USD', owes: 'us', amount: usd(4500.5), isSupplier: true },
    { row: 5, name: 'Yiwu Textile', currency: 'UZS', owes: 'customer', amount: som(100_000) },
  ]

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    await alpha.put('/api/currencies/USD/rate').send({ value: 12_650 }).expect(200)
    nodira = (await alpha.post('/api/customers').send({ name: 'Nodira', phone: '90 123 45 67' }).expect(201)).body.id
    aziz = (await alpha.post('/api/customers').send({ name: 'Aziz' }).expect(201)).body.id
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

  it('says, on a trial, what the file would do — and does none of it', async () => {
    const trial = (await send(file(), { dryRun: true }).expect(200)).body as Result
    expect(trial).toMatchObject({ done: false, created: 1 })
    expect(
      trial.rows.map((row) => [row.row, row.customerName, row.created, row.currency, row.change, row.balance]),
    ).toEqual([
      // Found by her phone, whatever the sheet calls her; by his name, however it is typed.
      [2, 'Nodira', false, 'UZS', som(1_250_000), som(1_250_000)],
      [3, 'Aziz', false, 'UZS', -som(300_000), -som(300_000)],
      // Written down by the file; its second row finds the one its first made.
      [4, 'Yiwu Textile', true, 'USD', -usd(4500.5), -usd(4500.5)],
      [5, 'Yiwu Textile', false, 'UZS', som(100_000), som(100_000)],
    ])
    expect(trial.rows.every((row) => !row.problem && !row.again)).toBe(true)
    expect(trial.totals).toEqual([
      { currency: 'UZS', owes: som(1_350_000), owed: som(300_000) },
      { currency: 'USD', owes: 0, owed: usd(4500.5) },
    ])
    expect(await owes(nodira)).toBe(0)
    expect(await book('Yiwu')).toEqual([])
  })

  it('writes the file once, however often it is sent', async () => {
    const clientKey = randomUUID()
    const done = (await send(file(), { clientKey }).expect(200)).body as Result
    expect(done).toMatchObject({ done: true, created: 1 })
    await send(file(), { clientKey }).expect(200)

    expect(await owes(nodira)).toBe(som(1_250_000))
    expect(await owes(aziz)).toBe(-som(300_000))
    const [her] = await book('Nodira')
    expect(her.balances.find((item) => item.currency === 'UZS')?.nextDue).toBe(due)
    const [supplier, ...others] = await book('Yiwu')
    expect(others).toEqual([])
    // Someone new deals in the currency their first balance is in.
    expect(supplier).toMatchObject({ name: 'Yiwu Textile', currency: 'USD', isSupplier: true, phone: null })
    expect(await owes(supplier.id, 'USD')).toBe(-usd(4500.5))
    expect(await owes(supplier.id)).toBe(som(100_000))
    // Each row is a document of its own in the account, to be taken back like any other.
    const lines = (await alpha.get(`/api/customers/${nodira}/statement`).expect(200)).body.lines
    expect(lines).toEqual([expect.objectContaining({ kind: 'opening', change: som(1_250_000) })])
  })

  it('says when an account has a balance from before the books already', async () => {
    const second = (await send([file()[0]], { dryRun: true }).expect(200)).body as Result
    expect(second.rows[0]).toMatchObject({ again: true, problem: null, balance: som(2_500_000) })
  })

  it('takes none of a file with a row it cannot take', async () => {
    await alpha.post('/api/customers').send({ name: 'Bobur' }).expect(201)
    await alpha.post('/api/customers').send({ name: 'Bobur', phone: '90 765 43 21' }).expect(201)
    const result = (
      await send([
        { row: 2, name: 'Sardor', owes: 'customer', amount: som(50_000) },
        { row: 3, name: 'Bobur', owes: 'customer', amount: som(10_000) },
        { row: 4, name: 'Aziz', currency: 'CNY', owes: 'customer', amount: 100 },
        { row: 4, name: 'Aziz', owes: 'customer', amount: 100 },
        // One of that name known by another phone is somebody else: this one would be new.
        { row: 5, name: 'Nodira', phone: '+998935550011', owes: 'customer', amount: som(5000) },
      ]).expect(200)
    ).body as Result
    expect(result.done).toBe(false)
    expect(result.rows.map((row) => [row.row, row.created, row.problem])).toEqual([
      [2, true, null],
      [3, false, '«Bobur» nomli mijoz bir nechta: telefoni bilan yozing'],
      [4, false, 'CNY: bu valyuta yoqilmagan'],
      [4, false, 'Qator ikki marta yuborilgan'],
      [5, true, null],
    ])
    expect(await book('Sardor')).toEqual([])
    expect(await owes(aziz)).toBe(-som(300_000))
  })

  it('is for those who put accounts right, and takes a sheet as the screen reads it', async () => {
    await send(file(), {}, cashier).expect(403)
    await send([]).expect(400)
    await send([{ row: 2, name: 'Aziz', owes: 'customer', amount: 0 }]).expect(400)
    await send([{ row: 2, name: 'Aziz', phone: '901234567', owes: 'customer', amount: 100 }]).expect(400)
  })
})
