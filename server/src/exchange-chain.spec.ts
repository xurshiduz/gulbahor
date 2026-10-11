import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => Math.round(amount * 100)

interface Sale {
  id: string
  number: string
  customerId: string | null
  lines: { id: string }[]
  payments: { method: string; base: number }[]
}
interface Made {
  id: string
  exchangeSaleId: string
  refunds: { method: string; base: number }[]
}

/**
 * Goods taken in exchange, brought back (KEYINGI-REJA, 16.5, case 31).
 * What was still owed for the first goods went on with the ones taken
 * instead — the same debt, on the receipt that has the goods — so it comes
 * off again when those come back. And where the first receipt was paid in
 * cash, cash is what goes back for goods it was exchanged into, with no
 * manager's word, as far as that receipt has cash to go back.
 */
describe('Goods taken in exchange, brought back', () => {
  let harness: Harness
  let alpha: Agent
  let cashier: Agent

  let registerId: string
  let scarf: string
  let shawl: string
  let coat: string
  let cardId: string
  let nodira: string

  /** Scarves at 75 000 so'm, paid in cash exactly unless said otherwise. */
  const sell = async (body: Record<string, unknown> = {}, scarves = 1): Promise<Sale> =>
    (
      await alpha
        .post('/api/sales')
        .send({
          clientKey: randomUUID(),
          registerId,
          lines: [{ variantId: scarf, qty: scarves }],
          total: som(75_000) * scarves,
          payments: [{ method: 'cash', amount: som(75_000) * scarves }],
          ...body,
        })
        .expect(201)
    ).body
  /** One of the first line of a receipt comes back; `more` says what is taken instead, or how money goes back. */
  const bringBack = (sale: Sale, total: number, more: Record<string, unknown>, agent = cashier) =>
    agent.post('/api/returns').send({
      clientKey: randomUUID(),
      registerId,
      saleId: sale.id,
      lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
      total,
      refunds: [],
      ...more,
    })
  const taking = (variantId: string, total: number, more: Record<string, unknown> = {}) => ({
    exchange: { lines: [{ variantId, qty: 1 }], total, payments: [], ...more },
  })
  const receipt = async (id: string) => (await alpha.get(`/api/sales/${id}`).expect(200)).body as Sale
  const paidWith = (sale: Sale) => sale.payments.map((payment) => [payment.method, payment.base])
  const caps = async (sale: Sale, agent = cashier) =>
    (await agent.get('/api/returns/lookup').query({ code: sale.number }).expect(200)).body.caps as {
      cash: number
      account: number
    }
  const account = async (customerId: string) =>
    (
      (await alpha.get(`/api/customers/${customerId}`).expect(200)).body.balances as {
        currency: string
        balance: number
        nextDue: string | null
      }[]
    ).find((item) => item.currency === 'UZS') ?? { currency: 'UZS', balance: 0, nextDue: null }

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    const retail = ((await alpha.get('/api/price-types')).body as { id: string; kind: string }[]).find(
      (type) => type.kind === 'retail',
    )!.id
    const product = async (name: string, price: number) =>
      (
        await alpha
          .post('/api/products')
          .send({
            name,
            axisIds: [],
            variants: [{ valueIds: [] }],
            prices: [{ priceTypeId: retail, amount: price, currency: 'UZS' }],
          })
          .expect(201)
      ).body.variants[0].id as string
    scarf = await product('Sharf', som(75_000))
    shawl = await product('Ro‘mol', som(40_000))
    coat = await product('Palto', som(200_000))
    const goods = await alpha
      .post('/api/receipts')
      .send({
        locationId: shopId,
        docDate: '2026-10-01',
        currency: 'UZS',
        lines: [
          { variantId: scarf, qty: 60, price: som(30_000) },
          { variantId: shawl, qty: 20, price: som(15_000) },
          { variantId: coat, qty: 10, price: som(90_000) },
        ],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${goods.body.id}/post`).expect(201)
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    cardId = (
      await alpha
        .post('/api/money/accounts')
        .send({ kind: 'card', name: 'Humo', locationId: shopId, last4: '3073' })
        .expect(201)
    ).body.id
    await alpha.post('/api/shifts').send({ registerId, cash: {} }).expect(201)
    nodira = (await alpha.post('/api/customers').send({ name: 'Nodira', phone: '90 123 45 67' }).expect(201)).body.id

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

  describe('where the first receipt was paid in cash', () => {
    it('cash goes back for them, with nobody’s word', async () => {
      const first = await sell()
      const swap = (await bringBack(first, som(75_000), taking(scarf, som(75_000))).expect(201)).body as Made
      const taken = await receipt(swap.exchangeSaleId)
      expect(paidWith(taken)).toEqual([['exchange', som(75_000)]])
      // No money of its own was paid on it — and yet cash is what the customer gave for these goods.
      expect(await caps(taken)).toMatchObject({ cash: som(75_000) })
      await bringBack(taken, som(75_000), { refunds: [{ method: 'cash', amount: som(75_000) }] }).expect(201)
    })

    it('as far as that receipt has cash to go back, whichever of its exchanges asks', async () => {
      // Two scarves for 150 000; each is exchanged for another, on a receipt of its own.
      const first = await sell({}, 2)
      const one = await receipt(
        ((await bringBack(first, som(75_000), taking(scarf, som(75_000))).expect(201)).body as Made).exchangeSaleId,
      )
      const two = await receipt(
        ((await bringBack(first, som(75_000), taking(scarf, som(75_000))).expect(201)).body as Made).exchangeSaleId,
      )
      expect([(await caps(one)).cash, (await caps(two)).cash]).toEqual([som(75_000), som(75_000)])
      await bringBack(one, som(75_000), { refunds: [{ method: 'cash', amount: som(75_000) }] }).expect(201)
      // What went back through the one is not there for the other twice over: 150 000 was paid, 75 000 is left.
      expect((await caps(two)).cash).toBe(som(75_000))
      await bringBack(two, som(75_000), { refunds: [{ method: 'cash', amount: som(75_000) }] }).expect(201)
    })

    it('not where it was paid by card: that still takes someone’s word', async () => {
      const first = await sell({ payments: [{ method: 'card', accountId: cardId, amount: som(75_000) }] })
      const swap = (await bringBack(first, som(75_000), taking(scarf, som(75_000))).expect(201)).body as Made
      const taken = await receipt(swap.exchangeSaleId)
      expect((await caps(taken)).cash).toBe(0)
      const refused = await bringBack(taken, som(75_000), { refunds: [{ method: 'cash', amount: som(75_000) }] })
      expect(refused.status).toBe(400)
      expect(refused.body.error.code).toBe('REFUND_METHOD')
    })
  })

  describe('where the first goods were taken on account', () => {
    it('the debt goes on with the goods taken instead, with its day, and comes off when they come back', async () => {
      const first = await sell({
        customerId: nodira,
        payments: [],
        onAccount: { amount: som(75_000), dueDate: '2026-12-01' },
      })
      expect(await account(nodira)).toMatchObject({ balance: som(75_000), nextDue: '2026-12-01' })

      // A cashier's to do: nothing is lent that was not lent already.
      const swap = (await bringBack(first, som(75_000), taking(scarf, som(75_000))).expect(201)).body as Made
      expect(swap.refunds).toEqual([expect.objectContaining({ method: 'account', base: som(75_000) })])
      const taken = await receipt(swap.exchangeSaleId)
      // Whose debt it is, whoever stood at the counter.
      expect(taken.customerId).toBe(nodira)
      expect(paidWith(taken)).toEqual([['account', som(75_000)]])
      expect(await account(nodira)).toMatchObject({ balance: som(75_000), nextDue: '2026-12-01' })
      expect(await caps(taken)).toMatchObject({ cash: 0, account: som(75_000) })

      await bringBack(taken, som(75_000), {}).expect(201)
      expect((await account(nodira)).balance).toBe(0)
    })

    it('is less by the difference when what is taken instead is worth less', async () => {
      const first = await sell({ customerId: nodira, payments: [], onAccount: { amount: som(75_000) } })
      const before = (await account(nodira)).balance
      // A shawl at 40 000 for the scarf at 75 000: 35 000 less is owed, and no money changes hands.
      const swap = (await bringBack(first, som(75_000), taking(shawl, som(40_000))).expect(201)).body as Made
      expect(swap.refunds).toEqual([expect.objectContaining({ method: 'account', base: som(75_000) })])
      expect(paidWith(await receipt(swap.exchangeSaleId))).toEqual([['account', som(40_000)]])
      expect((await account(nodira)).balance - before).toBe(-som(35_000))
    })

    it('goes on beside the money, each back where it came from', async () => {
      const before = (await account(nodira)).balance
      // 50 000 in cash and 25 000 on account for a scarf; a coat at 200 000 instead, the difference in cash.
      const first = await sell({
        customerId: nodira,
        payments: [{ method: 'cash', amount: som(50_000) }],
        onAccount: { amount: som(25_000) },
      })
      const swap = (
        await bringBack(
          first,
          som(75_000),
          taking(coat, som(200_000), { customerId: nodira, payments: [{ method: 'cash', amount: som(125_000) }] }),
        ).expect(201)
      ).body as Made
      const taken = await receipt(swap.exchangeSaleId)
      expect(paidWith(taken)).toEqual([
        ['exchange', som(50_000)],
        ['cash', som(125_000)],
        ['account', som(25_000)],
      ])
      expect((await account(nodira)).balance - before).toBe(som(25_000))
      // The coat comes back: 25 000 off the account, and cash for the rest — its own 125 000 and the first 50 000.
      expect(await caps(taken)).toMatchObject({ cash: som(175_000), account: som(25_000) })
      await bringBack(taken, som(200_000), { refunds: [{ method: 'cash', amount: som(175_000) }] }).expect(201)
      expect((await account(nodira)).balance).toBe(before)
    })
  })

  it('leaves every entry of the ledger in balance', async () => {
    const [unbalanced] = await harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(
        `SELECT count(*) AS entries FROM (
           SELECT l.entry_id FROM ledger_lines l GROUP BY l.entry_id HAVING sum(l.base) <> 0
         ) x`,
      )) as { entries: string }[]
    })
    expect(Number(unbalanced.entries)).toBe(0)
  })
})
