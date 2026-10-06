import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => amount * 100
const usd = (dollars: number) => Math.round(dollars * 100)

interface Line {
  id: string
  variantId: string
  qty: number
  total: number
  returnedQty: number
}

interface SaleBody {
  id: string
  number: string
  total: number
  returnedTotal: number
  lines: Line[]
}

/**
 * Returns and exchanges: goods come back only against the receipt that sold
 * them and for what was paid for them, the money goes back the way it came,
 * and an exchange is one deed: it happens whole or not at all.
 */
describe('Returns', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let cashier: Agent
  let seller: Agent

  let shopId: string
  let registerId: string
  let cardId: string
  let terminalId: string
  let shirt: string
  let scarf: string
  let jacket: string
  let shirtReceiptId: string
  let shiftId: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  const cash = (amount: number, currency = 'UZS') => ({ method: 'cash', currency, amount })
  const card = (amount: number) => ({ method: 'card', accountId: cardId, amount })

  const sell = async (body: Record<string, unknown>, agent = alpha): Promise<SaleBody> =>
    (
      await agent
        .post('/api/sales')
        .send({ clientKey: randomUUID(), registerId, ...body })
        .expect(201)
    ).body

  const giveBack = (body: Record<string, unknown>, agent = alpha) =>
    agent.post('/api/returns').send({ clientKey: randomUUID(), registerId, ...body })

  /** Balances by account: a till's drawers by currency, the rest by kind or by the ledger's own name for it. */
  const balances = async (): Promise<Record<string, number>> => {
    const rows = await sql<{ kind: string; system_key: string | null; currency: string; balance: string }[]>(
      `SELECT a.kind, a.system_key, a.currency, a.balance FROM accounts a
       JOIN organizations o ON o.id = a.org_id WHERE o.name = 'Alpha'`,
    )
    return Object.fromEntries(
      rows.map((row) => [
        row.system_key ?? (row.kind === 'cash' ? `cash_${row.currency}` : row.kind),
        Number(row.balance),
      ]),
    )
  }

  /** How much each account moved between two readings. */
  const moved = (before: Record<string, number>, after: Record<string, number>) =>
    Object.fromEntries(
      Object.keys(after)
        .map((key) => [key, after[key] - (before[key] ?? 0)] as const)
        .filter(([, delta]) => delta !== 0),
    )

  const onHand = async (variantId: string): Promise<number> => {
    const [row] = await sql<{ qty: string }[]>(
      `SELECT coalesce(sum(qty), 0) AS qty FROM stock_balances WHERE variant_id = $1`,
      [variantId],
    )
    return Number(row.qty)
  }

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    shopId = (await alpha.get('/api/locations')).body.items[0].id

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
    shirt = await product('Futbolka', som(95_000))
    scarf = await product('Sharf', som(40_000))
    jacket = await product('Kurtka', som(300_000))

    const receive = async (body: Record<string, unknown>) => {
      const draft = await alpha
        .post('/api/receipts')
        .send({ locationId: shopId, docDate: '2026-10-01', uzsRate: 12_000, ...body })
        .expect(201)
      await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)
      return draft.body.id as string
    }
    // Ten shirts at 4 dollars (48 000 so'm at the day's rate); scarves at 20 000 and jackets at 150 000 so'm.
    shirtReceiptId = await receive({
      currency: 'USD',
      usdRate: 1,
      lines: [{ variantId: shirt, qty: 10, price: usd(4) }],
    })
    await receive({
      currency: 'UZS',
      usdRate: 12_000,
      lines: [
        { variantId: scarf, qty: 5, price: som(20_000) },
        { variantId: jacket, qty: 4, price: som(150_000) },
      ],
    })

    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    cardId = (await alpha.post('/api/money/accounts').send({ kind: 'card', name: 'Humo', last4: '3073' }).expect(201))
      .body.id
    terminalId = (await alpha.post('/api/money/accounts').send({ kind: 'terminal', name: 'Terminal 1' }).expect(201))
      .body.id
    const [{ day }] = await sql<{ day: string }[]>(`SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day`)
    await alpha.put('/api/money/rates').send({ date: day, uzsPerUsd: 12_850 }).expect(200)
    shiftId = (
      await alpha
        .post('/api/shifts')
        .send({ registerId, cashUzs: som(1_000_000) })
        .expect(201)
    ).body.id

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
    seller = await hire('Sardor Sotuvchi', 'sotuvchi', 'seller')
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe('against a receipt', () => {
    let sale: SaleBody
    let returnId: string

    it('finds it by its number, and says what may still go back and how', async () => {
      // Two shirts and a scarf, 10% off the lot: the shirts come to 171 000, the scarf to 36 000.
      sale = await sell({
        lines: [
          { variantId: shirt, qty: 2 },
          { variantId: scarf, qty: 1 },
        ],
        discount: som(23_000),
        payments: [cash(som(207_000))],
        total: som(207_000),
      })
      expect(sale.lines.map((line) => line.total)).toEqual([som(171_000), som(36_000)])

      const found = (await alpha.get('/api/returns/lookup').query({ code: '1' }).expect(200)).body
      expect(found).toMatchObject({
        sale: { id: sale.id, number: 'CH-000001', returnedTotal: 0 },
        lineId: null,
        late: false,
        returnDays: 14,
        free: true,
        caps: { cash: som(207_000), accounts: [] },
      })
      const forCashier = (await cashier.get('/api/returns/lookup').query({ code: 'ch-000001' }).expect(200)).body
      expect(forCashier).toMatchObject({ sale: { id: sale.id }, free: false })
      await alpha.get('/api/returns/lookup').query({ code: '999' }).expect(404)
    })

    it('takes one of two back for what was paid for it, into stock at what it cost', async () => {
      const one = { saleId: sale.id, lines: [{ saleLineId: sale.lines[0].id, qty: 1 }] }
      const stale = await giveBack({ ...one, total: som(95_000), refunds: [cash(som(95_000))] }, cashier)
      expect(stale.status).toBe(409)
      expect(stale.body.error.code).toBe('RETURN_CHANGED')
      const unpaid = await giveBack({ ...one, total: som(85_500) }, cashier)
      expect(unpaid.status).toBe(400)
      expect(unpaid.body.error.fields.refunds).toBeDefined()
      const over = await giveBack({ ...one, total: som(85_500), refunds: [cash(som(90_000))] }, cashier)
      expect(over.status).toBe(400)
      expect(await onHand(shirt)).toBe(8)

      const before = await balances()
      const key = randomUUID()
      const body = {
        clientKey: key,
        registerId,
        ...one,
        total: som(85_500),
        refunds: [cash(som(85_500))],
        reason: 'Kichik keldi',
      }
      const made = (await cashier.post('/api/returns').send(body).expect(201)).body
      expect(made).toMatchObject({
        number: 'QT-000001',
        saleNumber: 'CH-000001',
        cashierName: 'Dilnoza Kassir',
        qty: 1,
        total: som(85_500),
        exchangeTotal: 0,
        exchangeSaleId: null,
        rounding: 0,
        late: false,
        reason: 'Kichik keldi',
        lines: [{ productName: 'Futbolka', qty: 1, total: som(85_500) }],
        refunds: [{ method: 'cash', currency: 'UZS', amount: som(85_500) }],
      })
      returnId = made.id
      expect(await onHand(shirt)).toBe(9)
      expect(moved(before, await balances())).toEqual({ cash_UZS: -som(85_500), sales: som(85_500) })
      const movements = await sql<{ kind: string; qty: number; cost_uzs: number }[]>(
        `SELECT kind, qty::float8 AS qty, cost_uzs::float8 AS cost_uzs FROM stock_movements WHERE document_id = $1`,
        [returnId],
      )
      expect(movements).toEqual([{ kind: 'sale_return', qty: 1, cost_uzs: som(48_000) }])

      // The till did not hear back and sends the same return again: it is the same return.
      expect((await cashier.post('/api/returns').send(body).expect(201)).body.id).toBe(returnId)
      expect(await onHand(shirt)).toBe(9)

      const after = (await alpha.get(`/api/sales/${sale.id}`).expect(200)).body
      expect(after).toMatchObject({ returnedTotal: som(85_500), returns: [{ id: returnId, number: 'QT-000001' }] })
      expect(after.lines.map((line: Line) => line.returnedQty)).toEqual([1, 0])
      expect((await alpha.get('/api/sales').expect(200)).body.items[0].returnedTotal).toBe(som(85_500))
    })

    it('takes no more of a line than it sold, and rounds cash handed back as change is', async () => {
      const both = await giveBack({
        saleId: sale.id,
        lines: [{ saleLineId: sale.lines[0].id, qty: 2 }],
        total: som(171_000),
        refunds: [cash(som(171_000))],
      })
      expect(both.status).toBe(400)
      expect(both.body.error.fields['lines.0.qty']).toBe('Ko‘pi bilan 1 ta qaytariladi')

      const before = await balances()
      const made = (
        await giveBack({
          saleId: sale.id,
          lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
          total: som(85_500),
          refunds: [cash(som(86_000))],
        }).expect(201)
      ).body
      // 85 500 owed, 86 000 handed over: the shop gives 500 away, and it is written down.
      expect(made).toMatchObject({ number: 'QT-000002', rounding: -som(500) })
      expect(moved(before, await balances())).toEqual({
        cash_UZS: -som(86_000),
        sales: som(85_500),
        rounding: som(500),
      })

      const gone = await giveBack({
        saleId: sale.id,
        lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
        total: 0,
      })
      expect(gone.body.error.fields['lines.0.qty']).toBe('Bu tovar allaqachon qaytarilgan')
      // A sale goods have come back from is put right by returns, not by a void.
      const voided = await alpha.post(`/api/sales/${sale.id}/void`).send({ reason: 'Xato' }).expect(409)
      expect(voided.body.error.code).toBe('SALE_RETURNED')
    })
  })

  describe('the money', () => {
    it('goes back the way it was paid', async () => {
      const sale = await sell({
        lines: [{ variantId: jacket, qty: 1 }],
        payments: [card(som(200_000)), cash(som(100_000))],
        total: som(300_000),
      })
      const found = (await cashier.get('/api/returns/lookup').query({ code: sale.number }).expect(200)).body
      expect(found.caps).toEqual({
        cash: som(100_000),
        accounts: [{ accountId: cardId, method: 'card', name: 'Humo', last4: '3073', left: som(200_000) }],
        debt: 0,
        partner: 0,
      })

      const back = { saleId: sale.id, lines: [{ saleLineId: sale.lines[0].id, qty: 1 }], total: som(300_000) }
      const allCash = await giveBack({ ...back, refunds: [cash(som(300_000))] }, cashier)
      expect(allCash.status).toBe(400)
      expect(allCash.body.error.code).toBe('REFUND_METHOD')
      const elsewhere = await giveBack(
        { ...back, refunds: [{ method: 'terminal', accountId: terminalId, amount: som(200_000) }, cash(som(100_000))] },
        cashier,
      )
      expect(elsewhere.body.error.fields['refunds.0.accountId']).toBeDefined()
      expect(await onHand(jacket)).toBe(3)

      const before = await balances()
      const made = (await giveBack({ ...back, refunds: [card(som(200_000)), cash(som(100_000))] }, cashier).expect(201))
        .body
      expect(made.refunds.map((refund: { method: string; amount: number }) => [refund.method, refund.amount])).toEqual([
        ['card', som(200_000)],
        ['cash', som(100_000)],
      ])
      expect(moved(before, await balances())).toEqual({
        card: -som(200_000),
        cash_UZS: -som(100_000),
        sales: som(300_000),
      })
      expect(await onHand(jacket)).toBe(4)
    })

    it('may go back otherwise only with the right to', async () => {
      const sale = await sell({
        lines: [{ variantId: shirt, qty: 1 }],
        payments: [card(som(95_000))],
        total: som(95_000),
      })
      const back = {
        saleId: sale.id,
        lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
        total: som(95_000),
        refunds: [cash(som(95_000))],
      }
      expect((await giveBack(back, cashier)).body.error.code).toBe('REFUND_METHOD')
      await giveBack(back, alpha).expect(201)
    })

    it("goes back in dollars at the day's rate, the rest in so'm", async () => {
      const sale = await sell({
        lines: [{ variantId: scarf, qty: 1 }],
        payments: [cash(som(40_000))],
        total: som(40_000),
      })
      const before = await balances()
      // 2 $ = 25 700; 14 300 is left, handed back as 14 000.
      const made = (
        await giveBack({
          saleId: sale.id,
          lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
          total: som(40_000),
          refunds: [cash(usd(2), 'USD'), cash(som(14_000))],
        }).expect(201)
      ).body
      expect(made).toMatchObject({ uzsPerUsd: 12_850, rounding: som(300) })
      expect(moved(before, await balances())).toEqual({
        cash_USD: -usd(2),
        cash_UZS: -som(14_000),
        sales: som(40_000),
        rounding: -som(300),
      })
    })
  })

  describe('an exchange', () => {
    it('takes goods instead, and the customer pays only the difference', async () => {
      const sale = await sell({
        lines: [{ variantId: shirt, qty: 1 }],
        payments: [cash(som(95_000))],
        total: som(95_000),
      })
      const swap = (payments: unknown[]) => ({
        saleId: sale.id,
        lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
        total: som(95_000),
        exchange: { lines: [{ variantId: jacket, qty: 1 }], total: som(300_000), payments },
      })
      const stock = [await onHand(shirt), await onHand(jacket)]
      const before = await balances()

      // Not enough for the difference: nothing happens at all, the shirt is not taken back either.
      const short = await giveBack(swap([cash(som(100_000))]), cashier)
      expect(short.status).toBe(400)
      expect([await onHand(shirt), await onHand(jacket)]).toEqual(stock)
      expect(moved(before, await balances())).toEqual({})

      const made = (await giveBack(swap([cash(som(210_000))]), cashier).expect(201)).body
      expect(made).toMatchObject({ total: som(95_000), exchangeTotal: som(95_000), refunds: [] })
      expect([await onHand(shirt), await onHand(jacket)]).toEqual([stock[0] + 1, stock[1] - 1])

      const taken = (await alpha.get(`/api/sales/${made.exchangeSaleId}`).expect(200)).body
      expect(taken).toMatchObject({ number: made.exchangeSaleNumber, total: som(300_000), changeUzs: som(5000) })
      expect(
        taken.payments.map((payment: { method: string; amount: number }) => [payment.method, payment.amount]),
      ).toEqual([
        ['exchange', som(95_000)],
        ['cash', som(210_000)],
      ])
      expect((await alpha.get('/api/sales').expect(200)).body.items[0].paidBy).toBe('Almashtirish, Naqd')
      // 205 000 came into the drawer; the shirt's 95 000 passed through the exchange account and left nothing in it.
      expect(moved(before, await balances())).toEqual({ cash_UZS: som(205_000), sales: -som(205_000) })

      const voided = await alpha.post(`/api/sales/${made.exchangeSaleId}/void`).send({ reason: 'Xato' }).expect(409)
      expect(voided.body.error.code).toBe('SALE_EXCHANGED')
    })

    it('for something cheaper hands the difference back', async () => {
      const sale = await sell({
        lines: [{ variantId: jacket, qty: 1 }],
        payments: [cash(som(300_000))],
        total: som(300_000),
      })
      const swap = (extra: Record<string, unknown>, payments: unknown[] = []) => ({
        saleId: sale.id,
        lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
        total: som(300_000),
        exchange: { lines: [{ variantId: shirt, qty: 1 }], total: som(95_000), payments },
        ...extra,
      })
      // The jacket covers the shirt: the customer is owed money and pays none.
      expect((await giveBack(swap({ refunds: [cash(som(205_000))] }, [cash(som(10_000))]))).status).toBe(400)
      expect((await giveBack(swap({}))).body.error.fields.refunds).toBeDefined()

      const before = await balances()
      const made = (await giveBack(swap({ refunds: [cash(som(205_000))] })).expect(201)).body
      expect(made).toMatchObject({
        total: som(300_000),
        exchangeTotal: som(95_000),
        refunds: [{ method: 'cash', amount: som(205_000) }],
      })
      expect(moved(before, await balances())).toEqual({ cash_UZS: -som(205_000), sales: som(205_000) })
    })
  })

  describe('a tagged piece', () => {
    it('is found by its tag, comes back as itself, and can be sold again', async () => {
      await alpha
        .put('/api/org/modules')
        .send({ modules: ['consignment', 'usd', 'rfid'] })
        .expect(200)
      const labels = (
        await alpha
          .post('/api/labels/print')
          .send({ receiptId: shirtReceiptId, rfid: true, size: '50x30', items: [{ variantId: shirt, count: 1 }] })
          .expect(200)
      ).body
      const epc = /\^RFW,H\^FD([0-9A-F]{24})\^FS/.exec(labels.file.zpl)![1]
      // Not sold yet: there is no receipt to bring it back on.
      const unsold = await alpha.get('/api/returns/lookup').query({ code: epc }).expect(409)
      expect(unsold.body.error.code).toBe('UNIT_NOT_SOLD')

      const sale = await sell({
        lines: [{ variantId: shirt, qty: 1, epc }],
        payments: [cash(som(95_000))],
        total: som(95_000),
      })
      const found = (await cashier.get('/api/returns/lookup').query({ code: epc }).expect(200)).body
      expect(found).toMatchObject({ sale: { id: sale.id }, lineId: sale.lines[0].id })

      const made = (
        await giveBack(
          {
            saleId: sale.id,
            lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
            total: som(95_000),
            refunds: [cash(som(95_000))],
          },
          cashier,
        ).expect(201)
      ).body
      expect(made.lines[0].epc).toBe(epc)
      const [unit] = await sql<{ status: string; sale_id: string | null }[]>(
        `SELECT status, sale_id FROM rfid_units WHERE epc = $1`,
        [epc],
      )
      expect(unit).toEqual({ status: 'in_stock', sale_id: null })
      await alpha.get('/api/returns/lookup').query({ code: epc }).expect(409)
      const again = (await alpha.get('/api/pos/lookup').query({ registerId, code: epc }).expect(200)).body
      expect(again).toMatchObject({ variantId: shirt, epc })
    })
  })

  describe('rules', () => {
    it('take goods back late only from someone allowed to', async () => {
      const sale = await sell({
        lines: [{ variantId: scarf, qty: 1 }],
        payments: [cash(som(40_000))],
        total: som(40_000),
      })
      await sql(`UPDATE sales SET sold_on = sold_on - 20 WHERE id = $1`, [sale.id])
      const back = {
        saleId: sale.id,
        lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
        total: som(40_000),
        refunds: [cash(som(40_000))],
      }
      expect((await cashier.get('/api/returns/lookup').query({ code: sale.number }).expect(200)).body.late).toBe(true)
      const refused = await giveBack(back, cashier)
      expect(refused.status).toBe(409)
      expect(refused.body.error.code).toBe('RETURN_LATE')
      expect((await giveBack(back, alpha).expect(201)).body.late).toBe(true)

      // The shop may set no limit at all.
      await alpha
        .put('/api/org')
        .send({ name: 'Alpha', settings: { autoLockMinutes: 10, returnDays: 0 } })
        .expect(200)
      const old = await sell({
        lines: [{ variantId: scarf, qty: 1 }],
        payments: [cash(som(40_000))],
        total: som(40_000),
      })
      await sql(`UPDATE sales SET sold_on = sold_on - 400 WHERE id = $1`, [old.id])
      const late = { ...back, saleId: old.id, lines: [{ saleLineId: old.lines[0].id, qty: 1 }] }
      expect((await giveBack(late, cashier).expect(201)).body.late).toBe(false)
    })

    it('do not take back what a void has already undone', async () => {
      const sale = await sell({
        lines: [{ variantId: scarf, qty: 1 }],
        payments: [cash(som(40_000))],
        total: som(40_000),
      })
      await alpha.post(`/api/sales/${sale.id}/void`).send({ reason: 'Xato' }).expect(200)
      await alpha.get('/api/returns/lookup').query({ code: sale.number }).expect(409)
      const refused = await giveBack({
        saleId: sale.id,
        lines: [{ saleLineId: sale.lines[0].id, qty: 1 }],
        total: som(40_000),
        refunds: [cash(som(40_000))],
      })
      expect(refused.body.error.code).toBe('SALE_VOIDED')
    })

    it('show in the shift what came back and what was handed out for it', async () => {
      const shift = (await alpha.get(`/api/shifts/${shiftId}`).expect(200)).body
      const returns = (await alpha.get('/api/returns').expect(200)).body
      expect(shift.totals.returns).toBe(returns.total)
      expect(shift.totals.returned).toBe(
        returns.items.reduce((sum: number, item: { total: number }) => sum + item.total, 0),
      )
      expect(
        shift.totals.refunds.map(
          (refund: { method: string; currency: string }) => `${refund.method} ${refund.currency}`,
        ),
      ).toEqual(['cash UZS', 'cash USD', 'card UZS'])
      // What is in the drawer by the books is what a count would find: the ledger holds every entry in balance.
      const [{ off }] = await sql<{ off: string }[]>(
        `SELECT count(*) AS off FROM (SELECT entry_id FROM ledger_lines GROUP BY entry_id HAVING sum(base) <> 0) x`,
      )
      expect(Number(off)).toBe(0)
      expect((await balances()).exchange).toBe(0)
    })

    it('are for those who work the till, each seeing their own', async () => {
      await seller.get('/api/returns/lookup').query({ code: '1' }).expect(403)
      await seller.post('/api/returns').send({}).expect(403)
      await seller.get('/api/returns').expect(403)

      const mine = (await cashier.get('/api/returns').expect(200)).body
      const all = (await alpha.get('/api/returns').expect(200)).body
      expect(mine.total).toBeLessThan(all.total)
      expect(new Set(mine.items.map((item: { cashierName: string }) => item.cashierName))).toEqual(
        new Set(['Dilnoza Kassir']),
      )
      // Found by the receipt's number as well as its own: the first two were both made against CH-000001.
      const bySale = (await alpha.get('/api/returns').query({ q: 'CH-000001' }).expect(200)).body
      expect(bySale.items.map((item: { number: string }) => item.number)).toEqual(['QT-000002', 'QT-000001'])
      await cashier
        .get(`/api/returns/${all.items[0].id}`)
        .expect(all.items[0].cashierName === 'Dilnoza Kassir' ? 200 : 404)
    })

    it('show one business nothing of another', async () => {
      expect((await beta.get('/api/returns').expect(200)).body.total).toBe(0)
      await beta.get('/api/returns/lookup').query({ code: '1' }).expect(404)
    })
  })
})
