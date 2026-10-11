import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => amount * 100
const usd = (dollars: number) => Math.round(dollars * 100)

interface Transfer {
  id: string
  number: string
  status: string
  amount: number
  toAmount: number
  fee: number
  feeNumber: string | null
}
interface Op {
  id: string
  number: string
  status: string
  categoryName: string
  total: number
  note: string | null
  paidBy: string
  cancelReason: string | null
}

/**
 * What a bank keeps for moving money (KEYINGI-REJA, 17.4). A transfer may
 * cost something on top of what it moves: that much more leaves the account
 * and is written as an expense of its own, tied to the transfer. The expense
 * goes back with the transfer when the transfer is refused or taken back,
 * and cannot be taken back alone.
 */
describe('What a transfer costs', () => {
  let harness: Harness
  let alpha: Agent
  let manager: Agent

  let shopId: string
  let terminalId: string
  let bankId: string
  let cardId: string
  let dollarSafeId: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })
  const held = async (where: string, params: unknown[] = []): Promise<number> => {
    const [row] = await sql<{ balance: string }[]>(
      `SELECT coalesce(sum(a.balance), 0) AS balance FROM accounts a JOIN organizations o ON o.id = a.org_id
       WHERE o.name = 'Alpha' AND ${where}`,
      params,
    )
    return Number(row.balance)
  }
  const of = (id: string) => held(`a.id = $1`, [id])
  const expenses = () => held(`a.system_key = 'expenses'`)
  const send = (body: Record<string, unknown>) =>
    alpha
      .post('/api/money/transfers')
      .send({ clientKey: randomUUID(), fromAccountId: bankId, toAccountId: cardId, ...body })
  const ops = async () => (await alpha.get('/api/money/ops').expect(200)).body.items as Op[]
  const opOf = async (number: string | null) => (await ops()).find((op) => op.number === number) as Op

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    await alpha.put('/api/currencies/USD/rate').send({ value: 12_850 }).expect(200)
    shopId = (await alpha.get('/api/locations')).body.items[0].id
    bankId = (await alpha.post('/api/money/accounts').send({ kind: 'bank', name: 'Hisob raqam' }).expect(201)).body.id
    cardId = (
      await alpha
        .post('/api/money/accounts')
        .send({ kind: 'card', name: 'Humo', locationId: shopId, last4: '3073' })
        .expect(201)
    ).body.id
    dollarSafeId = (
      await alpha.post('/api/money/accounts').send({ kind: 'safe', name: 'Seyf $', currency: 'USD' }).expect(201)
    ).body.id
    // Three million in the bank to move about.
    const income = ((await alpha.get('/api/money/categories').expect(200)).body as { id: string; kind: string }[]).find(
      (category) => category.kind === 'income',
    )!
    await alpha
      .post('/api/money/ops')
      .send({
        clientKey: randomUUID(),
        kind: 'income',
        categoryId: income.id,
        lines: [{ accountId: bankId, amount: som(3_000_000) }],
        total: som(3_000_000),
      })
      .expect(201)
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  it('leaves the account beside the sum, and is written as an expense of its own', async () => {
    const before = { bank: await of(bankId), spent: await expenses() }
    // 100 000 to the card; the bank keeps 1 000 for it.
    const sent = (await send({ amount: som(100_000), fee: som(1000) }).expect(201)).body as Transfer
    expect(sent).toMatchObject({ status: 'sent', amount: som(100_000), toAmount: som(100_000), fee: som(1000) })
    expect(sent.feeNumber).toMatch(/^XR-\d{6}$/)
    expect((await of(bankId)) - before.bank).toBe(-som(101_000))
    expect((await expenses()) - before.spent).toBe(som(1000))

    const op = await opOf(sent.feeNumber)
    expect(op).toMatchObject({
      status: 'posted',
      categoryName: 'Bank komissiyasi',
      total: som(1000),
      paidBy: 'Hisob raqam',
      note: `${sent.number}: o‘tkazma komissiyasi`,
    })

    // Arrived, the card holds the sum itself; the fee stays spent.
    const card = await of(cardId)
    await alpha.post(`/api/money/transfers/${sent.id}/receive`).expect(200)
    expect((await of(cardId)) - card).toBe(som(100_000))
    expect((await opOf(sent.feeNumber)).status).toBe('posted')
  })

  it('goes back with the transfer when that is taken back, or refused', async () => {
    const before = { bank: await of(bankId), spent: await expenses() }
    const back = (await send({ amount: som(200_000), fee: som(2000) }).expect(201)).body as Transfer
    await alpha.post(`/api/money/transfers/${back.id}/cancel`).expect(200)
    expect(await of(bankId)).toBe(before.bank)
    expect(await expenses()).toBe(before.spent)
    expect(await opOf(back.feeNumber)).toMatchObject({
      status: 'cancelled',
      cancelReason: `${back.number}: o‘tkazma qaytarib olindi`,
    })

    const refused = (await send({ amount: som(200_000), fee: som(2000) }).expect(201)).body as Transfer
    await alpha.post(`/api/money/transfers/${refused.id}/reject`).send({ reason: 'Kartaga tushmadi' }).expect(200)
    expect(await of(bankId)).toBe(before.bank)
    expect(await expenses()).toBe(before.spent)
    expect((await opOf(refused.feeNumber)).status).toBe('cancelled')
  })

  it('is not taken back on its own: it is part of the transfer', async () => {
    const sent = (await send({ amount: som(50_000), fee: som(500) }).expect(201)).body as Transfer
    const op = await opOf(sent.feeNumber)
    const alone = await alpha.post(`/api/money/ops/${op.id}/cancel`).send({ reason: 'Xato' })
    expect(alone.status).toBe(409)
    expect(alone.body.error.code).toBe('OP_OF_TRANSFER')
    await alpha.post(`/api/money/transfers/${sent.id}/cancel`).expect(200)
  })

  it('must be there to pay, and is no more than what is moved', async () => {
    const bank = await of(bankId)
    // The sum alone would do; with the fee the account is short.
    const short = await send({ amount: bank, fee: som(1000) })
    expect(short.status).toBe(400)
    expect(short.body.error.fields.amount).toBe('Hisobda buncha pul yo‘q')
    const silly = await send({ amount: som(1000), fee: som(2000) })
    expect(silly.status).toBe(400)
    expect(silly.body.error.fields.fee).toBeDefined()
    // None is none: nothing is written for it.
    const free = (await send({ amount: som(10_000), fee: 0 }).expect(201)).body as Transfer
    expect(free).toMatchObject({ fee: 0, feeNumber: null })
    await alpha.post(`/api/money/transfers/${free.id}/cancel`).expect(200)
  })

  it('is written under the business’s own kind for it, whatever that is called now', async () => {
    const kinds = (await alpha.get('/api/money/categories').expect(200)).body as { id: string; name: string }[]
    const kind = kinds.find((item) => item.name === 'Bank komissiyasi')!
    await alpha
      .put(`/api/money/categories/${kind.id}`)
      .send({ kind: 'expense', name: 'Bank xizmati', inProfit: true })
      .expect(200)
    const sent = (await send({ amount: som(30_000), fee: som(300) }).expect(201)).body as Transfer
    expect((await opOf(sent.feeNumber)).categoryName).toBe('Bank xizmati')
    await alpha.post(`/api/money/transfers/${sent.id}/cancel`).expect(200)
  })

  it('is apart from what an exchange makes or costs', async () => {
    const before = { bank: await of(bankId), safe: await of(dollarSafeId), spent: await expenses() }
    // 1 285 000 so'm for 100 $ at the day's rate, and 5 000 to the bank for doing it.
    const sent = (await send({ toAccountId: dollarSafeId, amount: som(1_285_000), fee: som(5000) }).expect(201))
      .body as Transfer
    expect(sent).toMatchObject({ amount: som(1_285_000), toAmount: usd(100), fee: som(5000) })
    await alpha.post(`/api/money/transfers/${sent.id}/receive`).expect(200)
    expect((await of(bankId)) - before.bank).toBe(-som(1_290_000))
    expect((await of(dollarSafeId)) - before.safe).toBe(usd(100))
    expect((await expenses()) - before.spent).toBe(som(5000))
  })

  describe('what a terminal took, reaching the bank', () => {
    /** A scarf sold through the terminal: so much stands on the terminal's account. */
    const takeByTerminal = async (amount: number) => {
      const retail = ((await alpha.get('/api/price-types')).body as { id: string; kind: string }[]).find(
        (type) => type.kind === 'retail',
      )!.id
      const scarf = (
        await alpha
          .post('/api/products')
          .send({
            name: `Sharf ${amount}`,
            axisIds: [],
            variants: [{ valueIds: [] }],
            prices: [{ priceTypeId: retail, amount, currency: 'UZS' }],
          })
          .expect(201)
      ).body.variants[0].id
      const receipt = await alpha
        .post('/api/receipts')
        .send({
          locationId: shopId,
          docDate: '2026-10-01',
          currency: 'UZS',
          lines: [{ variantId: scarf, qty: 5, price: som(10_000) }],
        })
        .expect(201)
      await alpha.post(`/api/receipts/${receipt.body.id}/post`).expect(201)
      const registers = (await alpha.get('/api/money/registers').expect(200)).body as { id: string }[]
      const registerId =
        registers[0]?.id ??
        (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201)).body.id
      if (!registers.length) {
        await alpha.post('/api/shifts').send({ registerId, cash: {} }).expect(201)
      }
      await alpha
        .post('/api/sales')
        .send({
          clientKey: randomUUID(),
          registerId,
          lines: [{ variantId: scarf, qty: 1 }],
          total: amount,
          payments: [{ method: 'terminal', accountId: terminalId, amount }],
        })
        .expect(201)
    }

    it('keeps the bank’s share on the terminal’s account, in percent', async () => {
      const made = (
        await alpha
          .post('/api/money/accounts')
          .send({ kind: 'terminal', name: 'Ipak terminal', locationId: shopId, feePercent: 1 })
          .expect(201)
      ).body
      terminalId = made.id
      expect(made).toMatchObject({ kind: 'terminal', feePercent: 1 })
      // The share is a terminal's: on anything else it is not kept.
      const card = (
        await alpha
          .post('/api/money/accounts')
          .send({ kind: 'card', name: 'Uzcard', locationId: shopId, last4: '8841', feePercent: 2 })
          .expect(201)
      ).body
      expect(card.feePercent).toBeNull()
      const over = await alpha.post('/api/money/accounts').send({ kind: 'terminal', name: 'T2', feePercent: 70 })
      expect(over.status).toBe(400)
    })

    it('goes to a bank account and nowhere else, and nothing goes into a terminal', async () => {
      await takeByTerminal(som(500_000))
      expect(await of(terminalId)).toBe(som(500_000))
      const toCard = await send({ fromAccountId: terminalId, toAccountId: cardId, amount: som(100_000) })
      expect(toCard.status).toBe(400)
      expect(toCard.body.error.fields.toAccountId).toBe('Terminal tushumi shu valyutadagi bank hisobiga o‘tadi')
      const toSafe = await send({ fromAccountId: terminalId, toAccountId: dollarSafeId, amount: som(100_000) })
      expect(toSafe.status).toBe(400)
      const into = await send({ fromAccountId: bankId, toAccountId: terminalId, amount: som(100_000) })
      expect(into.body.error.fields.toAccountId).toBe('Hisob topilmadi')
    })

    it('is written in one go by whoever runs the money: it left, it came, and the bank kept its share', async () => {
      const before = { bank: await of(bankId), spent: await expenses() }
      // Of the 500 000 the bank keeps 1%: 495 000 comes.
      const settled = (
        await send({ fromAccountId: terminalId, toAccountId: bankId, amount: som(495_000), fee: som(5000) }).expect(201)
      ).body as Transfer
      expect(settled).toMatchObject({ status: 'received', amount: som(495_000), fee: som(5000) })
      expect(await of(terminalId)).toBe(0)
      expect((await of(bankId)) - before.bank).toBe(som(495_000))
      expect((await expenses()) - before.spent).toBe(som(5000))
      expect(await opOf(settled.feeNumber)).toMatchObject({ paidBy: 'Ipak terminal', total: som(5000) })
    })

    it('waits for them when someone who only collects money writes it', async () => {
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
      manager = await harness.signIn('menejer')
      await takeByTerminal(som(200_000))
      const bank = await of(bankId)
      const sent = (
        await manager
          .post('/api/money/transfers')
          .send({
            clientKey: randomUUID(),
            fromAccountId: terminalId,
            toAccountId: bankId,
            amount: som(198_000),
            fee: som(2000),
          })
          .expect(201)
      ).body as Transfer
      expect(sent.status).toBe('sent')
      expect(await of(bankId)).toBe(bank)
      await alpha.post(`/api/money/transfers/${sent.id}/receive`).expect(200)
      expect((await of(bankId)) - bank).toBe(som(198_000))
      expect(await of(terminalId)).toBe(0)
    })
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
