import { randomUUID } from 'node:crypto'

import { soundKey } from '@erp/core'

import { SOUND } from './common/listing'
import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)
const usd = (amount: number) => Math.round(amount * 100)
const PIN = '4821'

interface Sale {
  id: string
  number: string
  total: number
  customerId: string | null
  customerName: string | null
  lines: { id: string }[]
  payments: { method: string; currency: string; amount: number; base: number; fx: number }[]
}

/**
 * A sale on a customer's account at the till: what of it is not paid there
 * goes on one of their accounts — their main currency's unless another is
 * said — at the day's rate, or at a sum agreed, after any discount. Goods
 * brought back take off the share the sale wrote there, not what today's
 * rate would make of it.
 */
describe('Sales on account', () => {
  let harness: Harness
  let alpha: Agent
  let cashier: Agent
  let alphaUserId: string

  let registerId: string
  let shiftId: string
  let coat: string
  let elaris: string
  let somBuyer: string
  let customer: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  /** Coats at 1 265 000 so'm: 100 $ each at the day's 12 650. */
  const sell = (body: Record<string, unknown>, agent = alpha, coats = 1) =>
    agent.post('/api/sales').send({
      clientKey: randomUUID(),
      registerId,
      lines: [{ variantId: coat, qty: coats }],
      total: som(1_265_000) * coats,
      payments: [],
      ...body,
    })
  const owes = async (customerId: string, currency?: string) =>
    (
      await alpha
        .get(`/api/customers/${customerId}/statement`)
        .query(currency ? { currency } : {})
        .expect(200)
    ).body as {
      balance: number
      lines: { kind: string; source: string; number: string; change: number }[]
    }
  const ret = (sale: Sale, total: number) =>
    alpha.post('/api/returns').send({
      clientKey: randomUUID(),
      registerId,
      saleId: sale.id,
      lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
      refunds: [],
      total,
    })

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    alphaUserId = (await alpha.get('/api/auth/me').expect(200)).body.user.id
    await alpha.put('/api/currencies/USD/rate').send({ value: 12_650 }).expect(200)
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    const retail = ((await alpha.get('/api/price-types')).body as { id: string; kind: string }[]).find(
      (type) => type.kind === 'retail',
    )!.id
    coat = (
      await alpha
        .post('/api/products')
        .send({
          name: 'Palto',
          axisIds: [],
          variants: [{ valueIds: [] }],
          prices: [{ priceTypeId: retail, amount: som(1_265_000), currency: 'UZS' }],
        })
        .expect(201)
    ).body.variants[0].id
    const receipt = await alpha
      .post('/api/receipts')
      .send({
        locationId: shopId,
        docDate: '2026-10-01',
        currency: 'UZS',
        lines: [{ variantId: coat, qty: 40, price: som(600_000) }],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${receipt.body.id}/post`).expect(201)
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    shiftId = (await alpha.post('/api/shifts').send({ registerId, cash: {} }).expect(201)).body.id

    elaris = (await alpha.post('/api/customers').send({ name: 'Elaris', currency: 'USD' }).expect(201)).body.id
    somBuyer = (await alpha.post('/api/customers').send({ name: 'Bozor Savdo', currency: 'UZS' }).expect(201)).body.id
    customer = (await alpha.post('/api/customers').send({ name: 'Nodira', phone: '90 123 45 67' }).expect(201)).body.id

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

  describe('finding the customer at the till', () => {
    it('shows who they are and their main currency, never what they owe', async () => {
      const found = (await cashier.get('/api/pos/customers').query({ q: 'ela' }).expect(200)).body
      expect(found).toEqual([
        expect.objectContaining({ id: elaris, name: 'Elaris', phone: null, currency: 'USD', priceType: null }),
      ])
      const context = (await cashier.get(`/api/pos/context/${registerId}`).expect(200)).body
      expect(context.mayLend).toBe(false)
      expect(context.approvers).toEqual([expect.objectContaining({ id: alphaUserId, debts: true })])
    })

    it('finds a name however it was spelt, the one typed first', async () => {
      for (const name of ['Мухаммадали Юсупов', 'Mukhammadali Karimov', 'Muhamadali Tursunov', 'Muhammad Rizo']) {
        await alpha.post('/api/customers').send({ name }).expect(201)
      }
      await alpha.post('/api/customers').send({ name: 'Muhammadali Ergashev' }).expect(201)
      const names = async (q: string) =>
        ((await cashier.get('/api/pos/customers').query({ q }).expect(200)).body as { name: string }[]).map(
          (customer) => customer.name,
        )
      expect(await names('muhammadali')).toEqual([
        'Muhammadali Ergashev',
        'Muhamadali Tursunov',
        'Mukhammadali Karimov',
        'Мухаммадали Юсупов',
      ])
      expect(await names('мухаммадали')).toHaveLength(4)
      expect(await names('kodir')).toEqual([])
    })

    it('folds a stored key in the database as the screens fold a query', async () => {
      const keys = ['muxammadali', 'mukhammadali', 'qodirov', 'djamshid', 'dzhamshid', 'aliyev', 'ghulom', 'sattorov']
      for (const key of keys) {
        const [row] = await harness.dataSource.query(`SELECT ${SOUND('$1::text')} AS folded`, [key])
        expect(row.folded).toBe(soundKey(key))
      }
    })
  })

  describe('a sale on the account', () => {
    it('is a customer’s on the books', async () => {
      const nobody = await sell({ onAccount: { amount: som(1_265_000) } })
      expect(nobody.status).toBe(400)
      expect(nobody.body.error.fields.customerId).toBeDefined()
    })

    it('takes a manager’s word from a cashier who may not sell on account alone', async () => {
      const alone = await sell({ customerId: elaris, onAccount: { amount: som(1_265_000) } }, cashier)
      expect(alone.status).toBe(400)
      // Elaris has no phone, and the business lends nothing without a word anyway.
      expect(alone.body.error.code).toBe('NO_PHONE')
      const before = (await owes(elaris)).balance
      const sale = (
        await sell(
          {
            customerId: elaris,
            onAccount: { amount: som(1_265_000) },
            approval: { userId: alphaUserId, pin: PIN },
          },
          cashier,
        ).expect(201)
      ).body as Sale
      expect(sale).toMatchObject({ customerId: elaris, customerName: 'Elaris' })
      // A coat of 1 265 000 so'm is 100 $ on a dollar account.
      expect(sale.payments).toEqual([
        expect.objectContaining({ method: 'account', currency: 'USD', amount: usd(100), base: som(1_265_000), fx: 0 }),
      ])
      expect((await owes(elaris)).balance).toBe(before + usd(100))
    })

    it('goes at the day’s rate where part is paid there and then, the rounding to the exchange difference', async () => {
      const before = (await owes(elaris)).balance
      const sale = (
        await sell({
          customerId: elaris,
          payments: [{ method: 'cash', currency: 'UZS', amount: som(265_000) }],
          onAccount: { amount: som(1_000_000) },
        }).expect(201)
      ).body as Sale
      // 1 000 000 so'm are 79,05 $, worth 999 982,50 so'm: 17,50 short of a cent, nobody's agreement.
      expect(sale.payments.find((payment) => payment.method === 'account')).toMatchObject({
        amount: usd(79.05),
        base: som(1_000_000),
        fx: -som(17.5),
      })
      expect((await owes(elaris)).balance).toBe(before + usd(79.05))
    })

    it('stands at an agreed sum, within the limit or by someone who may give more', async () => {
      // "Put it down as 101 dollars": 0,99% from the day's rate, and the business gains 12 650 so'm.
      const sale = (
        await sell({ customerId: elaris, onAccount: { amount: som(1_265_000), settled: usd(101) } }).expect(201)
      ).body as Sale
      expect(sale.payments[0]).toMatchObject({ amount: usd(101), fx: som(12_650) })
      // 110 $ is 8,7% off: a cashier needs a word for it as for a discount — the word for the account is not enough.
      const far = await sell(
        {
          customerId: elaris,
          onAccount: { amount: som(1_265_000), settled: usd(110) },
          approval: { userId: alphaUserId, pin: PIN },
        },
        cashier,
      )
      expect(far.status).toBe(201)
    })

    it('puts down what is left after the discount; the discount stays on the receipt', async () => {
      const before = (await owes(somBuyer)).balance
      const sale = (
        await sell({
          customerId: somBuyer,
          discount: som(65_000),
          total: som(1_200_000),
          onAccount: { amount: som(1_200_000) },
        }).expect(201)
      ).body as Sale
      expect(sale.total).toBe(som(1_200_000))
      expect((await owes(somBuyer)).balance).toBe(before + som(1_200_000))
      // More than the receipt is not put on anyone's account.
      const over = await sell({ customerId: somBuyer, onAccount: { amount: som(1_300_000) } })
      expect(over.body.error.fields.onAccount).toBeDefined()
    })

    it('goes on another of their accounts when it is said which, and only in a currency the business keeps', async () => {
      // Nodira deals in so'm; this one coat she takes on her dollar account.
      const sale = (
        await sell({ customerId: customer, onAccount: { currency: 'USD', amount: som(1_265_000) } }).expect(201)
      ).body as Sale
      expect(sale.payments[0]).toMatchObject({ method: 'account', currency: 'USD', amount: usd(100) })
      expect((await owes(customer)).balance).toBe(0)
      expect((await owes(customer, 'USD')).balance).toBe(usd(100))
      const euro = await sell({ customerId: customer, onAccount: { currency: 'EUR', amount: som(1_265_000) } })
      expect(euro.body.error.fields.onAccount).toBe('Bu valyuta yoqilmagan: Pul → Kurslar')
    })
  })

  describe('goods brought back', () => {
    it('take off the share the sale wrote, at the sale’s rate, not today’s', async () => {
      const before = (await owes(elaris)).balance
      const sale = (await sell({ customerId: elaris, onAccount: { amount: som(2_530_000) } }, alpha, 2).expect(201))
        .body as Sale
      expect((await owes(elaris)).balance).toBe(before + usd(200))

      const found = (await alpha.get('/api/returns/lookup').query({ code: sale.number }).expect(200)).body
      expect(found.caps).toMatchObject({ cash: 0, account: som(2_530_000) })
      await ret(sale, som(1_265_000)).expect(201)
      expect((await owes(elaris)).balance).toBe(before + usd(100))

      // The dollar is dearer today: the second coat still takes off what the sale wrote.
      await alpha.put('/api/currencies/USD/rate').send({ value: 13_000 }).expect(200)
      await ret(sale, som(1_265_000)).expect(201)
      expect((await owes(elaris)).balance).toBe(before)
      await alpha.put('/api/currencies/USD/rate').send({ value: 12_650 }).expect(200)

      const statement = await owes(elaris)
      expect(statement.lines.slice(-3).map((line) => [line.kind, line.change])).toEqual([
        ['sale', usd(200)],
        ['sale_return', -usd(100)],
        ['sale_return', -usd(100)],
      ])
      expect(statement.lines.at(-3)?.number).toBe(sale.number)
    })

    it('give back the exchange difference with the last of them', async () => {
      // 101 $ agreed for a coat: the gain of 12 650 so'm goes back when the coat does.
      const sale = (
        await sell({ customerId: elaris, onAccount: { amount: som(1_265_000), settled: usd(101) } }).expect(201)
      ).body as Sale
      const [{ fx: before }] = await sql<{ fx: string }[]>(
        `SELECT a.balance AS fx FROM accounts a JOIN organizations o ON o.id = a.org_id
         WHERE o.name = 'Alpha' AND a.system_key = 'fx'`,
      )
      await ret(sale, som(1_265_000)).expect(201)
      const [{ fx: after }] = await sql<{ fx: string }[]>(
        `SELECT a.balance AS fx FROM accounts a JOIN organizations o ON o.id = a.org_id
         WHERE o.name = 'Alpha' AND a.system_key = 'fx'`,
      )
      expect(Number(after) - Number(before)).toBe(som(12_650))
    })
  })

  describe('a void', () => {
    it('takes it off the account again', async () => {
      const before = (await owes(somBuyer)).balance
      const sale = (await sell({ customerId: somBuyer, onAccount: { amount: som(1_265_000) } }).expect(201))
        .body as Sale
      await alpha.post(`/api/sales/${sale.id}/void`).send({ reason: 'Xato' }).expect(200)
      const statement = await owes(somBuyer)
      expect(statement.balance).toBe(before)
      expect(statement.lines.at(-1)).toMatchObject({ kind: 'cancel', change: -som(1_265_000) })
    })
  })

  describe('a customer’s own price', () => {
    it('is what the till sells at once they are picked, without anyone’s word', async () => {
      const types = (await alpha.get('/api/price-types').expect(200)).body as {
        id: string
        kind: string
        name: string
      }[]
      const wholesale = types.find((type) => type.name === 'Ulgurji')!
      const floor = types.find((type) => type.kind === 'min')!
      // The floor is no price to buy at.
      const refused = await alpha
        .post('/api/customers')
        .send({ name: 'Pol', currency: 'UZS', priceTypeId: floor.id })
        .expect(400)
      expect(refused.body.error.fields.priceTypeId).toBeDefined()
      const bulk = (
        await alpha
          .post('/api/customers')
          .send({ name: 'Ulgurji Bozor', currency: 'UZS', priceTypeId: wholesale.id })
          .expect(201)
      ).body
      expect(bulk).toMatchObject({ priceType: { id: wholesale.id, name: wholesale.name } })
      const found = (await cashier.get('/api/pos/customers').query({ q: 'ulgurji' }).expect(200)).body
      expect(found[0].priceType).toEqual({ id: wholesale.id, name: wholesale.name })

      const retail = types.find((type) => type.kind === 'retail')!
      const shopId = (await alpha.get('/api/locations')).body.items[0].id
      const trousers = (
        await alpha
          .post('/api/products')
          .send({
            name: 'Shim',
            axisIds: [],
            variants: [{ valueIds: [] }],
            prices: [
              { priceTypeId: retail.id, amount: som(300_000), currency: 'UZS' },
              { priceTypeId: wholesale.id, amount: som(250_000), currency: 'UZS' },
            ],
          })
          .expect(201)
      ).body.variants[0].id
      const receipt = await alpha
        .post('/api/receipts')
        .send({
          locationId: shopId,
          docDate: '2026-10-01',
          currency: 'UZS',
          lines: [{ variantId: trousers, qty: 5, price: som(150_000) }],
        })
        .expect(201)
      await alpha.post(`/api/receipts/${receipt.body.id}/post`).expect(201)

      const atWholesale = (customerId: string | null) =>
        cashier.post('/api/sales').send({
          clientKey: randomUUID(),
          registerId,
          customerId,
          priceTypeId: wholesale.id,
          lines: [{ variantId: trousers, qty: 1 }],
          total: som(250_000),
          payments: [{ method: 'cash', currency: 'UZS', amount: som(250_000) }],
        })
      // The cashier may not pick the wholesale price; with the customer whose price it is, nobody picked it.
      expect((await atWholesale(null)).status).toBe(400)
      const sold = (await atWholesale(bulk.id).expect(201)).body
      expect(sold).toMatchObject({ total: som(250_000), priceTypeName: wholesale.name, customerName: 'Ulgurji Bozor' })
    })
  })

  describe('the shift and the books', () => {
    it('show what went on accounts as a line of its own, apart from the cash counted', async () => {
      const shift = (await alpha.get(`/api/shifts/${shiftId}`).expect(200)).body
      // By currency, never by whose account it was.
      const onAccount = shift.totals.payments.filter((payment: { method: string }) => payment.method === 'account')
      expect(
        onAccount
          .map((payment: { currency: string; accountName: string }) => `${payment.currency}:${payment.accountName}`)
          .sort(),
      ).toEqual(['USD:', 'UZS:'])
      expect(shift.totals.payments.find((payment: { method: string }) => payment.method === 'cash')).toMatchObject({
        amount: som(265_000) + som(250_000),
      })
    })

    it('leave every entry in balance', async () => {
      const [{ off }] = await sql<{ off: string }[]>(
        `SELECT count(*) AS off FROM (SELECT entry_id FROM ledger_lines GROUP BY entry_id HAVING sum(base) <> 0) x`,
      )
      expect(Number(off)).toBe(0)
    })
  })

  describe('in several currencies at once', () => {
    let omadillo: string
    let nodir: string
    const balances = async (customerId: string) =>
      Object.fromEntries(
        (
          await sql<{ currency: string; balance: string }[]>(
            `SELECT currency, balance FROM accounts WHERE customer_id = $1 ORDER BY currency`,
            [customerId],
          )
        ).map((row) => [row.currency, Number(row.balance)]),
      )

    beforeAll(async () => {
      omadillo = (await alpha.post('/api/customers').send({ name: 'Omadillo', phone: '90 555 11 22' }).expect(201)).body
        .id
      nodir = (await alpha.post('/api/customers').send({ name: 'Nodir', phone: '90 555 33 44' }).expect(201)).body.id
      // 10 $ of theirs, left from before.
      await alpha
        .post('/api/customer-payments/opening')
        .send({ clientKey: randomUUID(), customerId: omadillo, currency: 'USD', owes: 'us', amount: usd(10) })
        .expect(201)
    })

    it('spends what is theirs in one currency and lends the rest in another, in one sale', async () => {
      const twice = await sell({
        customerId: omadillo,
        onAccount: [
          { currency: 'USD', amount: som(126_500) },
          { currency: 'USD', amount: som(1_138_500) },
        ],
      })
      expect(twice.status).toBe(400)
      expect(twice.body.error.fields.onAccount).toBe('Har valyuta balansga bitta qator bilan yoziladi')

      const sale = (
        await sell(
          {
            customerId: omadillo,
            onAccount: [
              { currency: 'USD', amount: som(126_500) },
              { currency: 'UZS', amount: som(2_403_500) },
            ],
          },
          alpha,
          2,
        ).expect(201)
      ).body as Sale & { owes: { currency: string; balance: number }[] }
      expect(
        sale.payments.filter((payment) => payment.method === 'account').map((p) => [p.currency, p.amount, p.base]),
      ).toEqual([
        ['USD', usd(10), som(126_500)],
        ['UZS', som(2_403_500), som(2_403_500)],
      ])
      // The 10 $ were theirs: spent, not lent.
      const rows = await sql<{ currency: string; prepaid: string }[]>(
        `SELECT currency, prepaid FROM sale_payments WHERE sale_id = $1 AND method = 'account' ORDER BY position`,
        [sale.id],
      )
      expect(rows.map((row) => [row.currency, Number(row.prepaid)])).toEqual([
        ['USD', usd(10)],
        ['UZS', 0],
      ])
      expect(sale.owes).toEqual([{ currency: 'UZS', balance: som(2_403_500) }])
      expect(await balances(omadillo)).toEqual({ USD: 0, UZS: som(2_403_500) })

      // One coat of the two back: half of what went on each account comes off it.
      await ret(sale, som(1_265_000)).expect(201)
      expect(await balances(omadillo)).toEqual({ USD: -usd(5), UZS: som(1_201_750) })
    })

    it('moves every currency of it when the receipt is given to someone else', async () => {
      const sale = (
        await sell({
          customerId: omadillo,
          onAccount: [
            { currency: 'USD', amount: som(63_250) },
            { currency: 'UZS', amount: som(1_201_750) },
          ],
        }).expect(201)
      ).body as Sale
      expect(await balances(omadillo)).toEqual({ USD: 0, UZS: som(2_403_500) })
      await alpha.post(`/api/sales/${sale.id}/customer`).send({ customerId: nodir }).expect(200)
      // The 5 $ of theirs this sale spent are theirs again; the other owes for the goods, in both currencies.
      expect(await balances(omadillo)).toEqual({ USD: -usd(5), UZS: som(1_201_750) })
      expect(await balances(nodir)).toEqual({ USD: usd(5), UZS: som(1_201_750) })
    })
  })
})
