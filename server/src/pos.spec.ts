import { randomUUID } from 'node:crypto'

import { formatMoney } from '@gulbahor/core'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => amount * 100
const usd = (dollars: number) => Math.round(dollars * 100)

interface AccountRow {
  id: string
  kind: string
  name: string
  currency: string
  balance: number
}

/**
 * The till: a sale takes goods out of stock and puts money into accounts in
 * one go, a shift opens and closes on a count of the drawer, and the money
 * ledger never holds an entry that does not add up to nothing.
 */
describe('Till', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let cashier: Agent

  let shopId: string
  let registerId: string
  let cardId: string
  let terminalId: string
  let shirt: string
  let scarf: string
  let shirtReceiptId: string
  let shiftId: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  const sell = (body: Record<string, unknown>, agent = alpha) =>
    agent.post('/api/sales').send({ clientKey: randomUUID(), registerId, ...body })

  const cash = (amount: number, currency = 'UZS') => ({ method: 'cash', currency, amount })

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

    const receive = async (body: Record<string, unknown>) => {
      const draft = await alpha
        .post('/api/receipts')
        .send({ locationId: shopId, docDate: '2026-10-01', uzsRate: 12_000, ...body })
        .expect(201)
      await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)
      return draft.body.id as string
    }
    // Ten shirts at 4 dollars (48 000 so'm at the day's rate); five scarves at 20 000 so'm.
    shirtReceiptId = await receive({
      currency: 'USD',
      usdRate: 1,
      lines: [{ variantId: shirt, qty: 10, price: usd(4) }],
    })
    await receive({ currency: 'UZS', usdRate: 12_000, lines: [{ variantId: scarf, qty: 5, price: som(20_000) }] })

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

  describe('setting up', () => {
    it('gives a shop its till, and a warehouse none', async () => {
      const depot = (await alpha.post('/api/locations').send({ name: 'Depot', kind: 'warehouse' }).expect(201)).body
      const refused = await alpha.post('/api/money/registers').send({ name: 'Kassa', locationId: depot.id })
      expect(refused.status).toBe(400)
      expect(refused.body.error.fields.locationId).toBeDefined()

      const register = (
        await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201)
      ).body
      expect(register).toMatchObject({ name: 'Kassa 1', locationName: 'Alpha shop', isActive: true, shift: null })
      registerId = register.id
      await alpha.post('/api/money/registers').send({ name: 'kassa 1', locationId: shopId }).expect(400)
      await cashier.post('/api/money/registers').send({ name: 'Mine', locationId: shopId }).expect(403)
    })

    it('keeps the cards and terminals money can be paid to', async () => {
      const card = { kind: 'card', name: 'Humo', locationId: shopId, last4: '3073', bank: 'Kapitalbank' }
      cardId = (await alpha.post('/api/money/accounts').send(card).expect(201)).body.id
      terminalId = (await alpha.post('/api/money/accounts').send({ kind: 'terminal', name: 'Terminal 1' }).expect(201))
        .body.id
      expect((await alpha.post('/api/money/accounts').send({ ...card, last4: '30' })).status).toBe(400)
      const accounts = (await alpha.get('/api/money/accounts').expect(200)).body as AccountRow[]
      expect(accounts.map((account) => account.kind)).toEqual(['card', 'terminal'])
      expect(accounts[0]).toMatchObject({ name: 'Humo', balance: 0, currency: 'UZS' })
      await cashier.get('/api/money/accounts').expect(403)
    })

    it("sets the day's dollar rate, and leaves past days alone", async () => {
      const today = (await sql<{ day: string }[]>(`SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day`))[0]
        .day
      expect((await alpha.get('/api/money/rates').expect(200)).body.current).toBeNull()
      await alpha.put('/api/money/rates').send({ date: today, uzsPerUsd: 12_800 }).expect(200)
      const again = (await alpha.put('/api/money/rates').send({ date: today, uzsPerUsd: 12_850 }).expect(200)).body
      expect(again).toMatchObject({ date: today, uzsPerUsd: 12_850, setByName: 'Alpha Owner' })
      expect((await alpha.get('/api/money/rates').expect(200)).body).toMatchObject({
        current: { uzsPerUsd: 12_850 },
        history: [{ date: today }],
      })
      expect((await alpha.put('/api/money/rates').send({ date: '2026-01-01', uzsPerUsd: 12_000 })).status).toBe(400)
      await cashier.put('/api/money/rates').send({ date: today, uzsPerUsd: 1 }).expect(403)
    })
  })

  describe('a shift', () => {
    it('must be open before anything is sold', async () => {
      const refused = await sell({
        lines: [{ variantId: scarf, qty: 1 }],
        payments: [cash(som(40_000))],
        total: som(40_000),
      })
      expect(refused.status).toBe(409)
      expect(refused.body.error.code).toBe('NO_SHIFT')
    })

    it('opens on a count of the drawer', async () => {
      const shift = (
        await alpha
          .post('/api/shifts')
          .send({ registerId, cashUzs: som(200_000) })
          .expect(201)
      ).body
      expect(shift).toMatchObject({
        number: 'SM-000001',
        status: 'open',
        registerName: 'Kassa 1',
        openingUzs: som(200_000),
        openingUsd: 0,
        expectedUzs: null,
        totals: { sales: 0, total: 0 },
      })
      shiftId = shift.id
      // The drawer starts with what was counted in it; that money came from before the books began.
      expect(await balances()).toMatchObject({ cash_UZS: som(200_000), cash_USD: 0, opening: -som(200_000) })
      expect((await alpha.post('/api/shifts').send({ registerId, cashUzs: 0 })).status).toBe(409)

      const context = (await alpha.get(`/api/pos/context/${registerId}`).expect(200)).body
      expect(context).toMatchObject({
        usd: true,
        rate: { uzsPerUsd: 12_850 },
        shift: { id: shiftId },
        changeRoundStep: som(1000),
        maxDiscountPercent: 10,
        mayOverDiscount: true,
      })
      expect(context.cards.map((card: AccountRow) => card.name)).toEqual(['Humo'])
      expect(context.terminals.map((terminal: AccountRow) => terminal.name)).toEqual(['Terminal 1'])
      expect(context.sellers.map((seller: { name: string }) => seller.name)).toEqual(['Alpha Owner', 'Dilnoza Kassir'])
    })
  })

  describe('a sale', () => {
    let firstId: string

    it('finds goods the way a cashier looks for them', async () => {
      const found = (await alpha.get('/api/pos/search').query({ registerId, q: 'futb' }).expect(200)).body
      expect(found).toEqual([
        expect.objectContaining({ variantId: shirt, name: 'Futbolka', price: som(95_000), onHand: 10 }),
      ])
      const scanned = (await alpha.get('/api/pos/lookup').query({ registerId, code: found[0].sku }).expect(200)).body
      expect(scanned).toMatchObject({ variantId: shirt, epc: null })
      await alpha.get('/api/pos/lookup').query({ registerId, code: 'no-such-code' }).expect(404)
    })

    it('lists the thing whose article was typed in full before what only has it in its name', async () => {
      const retail = ((await alpha.get('/api/price-types')).body as { id: string; kind: string }[]).find(
        (type) => type.kind === 'retail',
      )!.id
      const add = async (name: string) =>
        (
          await alpha
            .post('/api/products')
            .send({
              name,
              axisIds: [],
              variants: [{ valueIds: [] }],
              prices: [{ priceTypeId: retail, amount: som(10_000), currency: 'UZS' }],
            })
            .expect(201)
        ).body.variants[0] as { id: string; sku: string }
      const belt = await add('Zzz kamar')
      // Comes before the belt by name, and has the belt's article in its own.
      const decoy = await add(`Aaa ${belt.sku}`)
      const found = (await alpha.get('/api/pos/search').query({ registerId, q: belt.sku }).expect(200)).body
      expect(found.map((item: { variantId: string }) => item.variantId).slice(0, 2)).toEqual([belt.id, decoy.id])
    })

    it('takes the goods out of stock and the money into the drawer', async () => {
      const key = randomUUID()
      const body = {
        clientKey: key,
        registerId,
        lines: [
          { variantId: shirt, qty: 2 },
          { variantId: scarf, qty: 1 },
        ],
        payments: [cash(som(250_000))],
        total: som(230_000),
      }
      const sale = (await alpha.post('/api/sales').send(body).expect(201)).body
      expect(sale).toMatchObject({
        number: 'CH-000001',
        status: 'completed',
        shiftNumber: 'SM-000001',
        cashierName: 'Alpha Owner',
        subtotal: som(230_000),
        discount: 0,
        total: som(230_000),
        changeUzs: som(20_000),
        changeUsd: 0,
        rounding: 0,
        // Two shirts at 48 000 and a scarf at 20 000.
        costUzs: som(116_000),
      })
      expect(sale.lines.map((line: { productName: string; total: number }) => [line.productName, line.total])).toEqual([
        ['Futbolka', som(190_000)],
        ['Sharf', som(40_000)],
      ])
      expect(sale.payments).toEqual([
        expect.objectContaining({ method: 'cash', currency: 'UZS', amount: som(250_000), base: som(250_000) }),
      ])
      firstId = sale.id
      expect(await onHand(shirt)).toBe(8)
      expect(await onHand(scarf)).toBe(4)
      expect(await balances()).toMatchObject({ cash_UZS: som(430_000), sales: -som(230_000) })

      // The till did not hear back and sends the same sale again: it is the same sale.
      const again = (await alpha.post('/api/sales').send(body).expect(201)).body
      expect(again.id).toBe(firstId)
      expect(await onHand(shirt)).toBe(8)
      expect(await balances()).toMatchObject({ cash_UZS: som(430_000) })
    })

    it('refuses a total the prices no longer give', async () => {
      const stale = await sell({
        lines: [{ variantId: shirt, qty: 1 }],
        payments: [cash(som(90_000))],
        total: som(90_000),
      })
      expect(stale.status).toBe(409)
      expect(stale.body.error.code).toBe('PRICE_CHANGED')

      // The till then asks for its cart again and gets today's price and what is on hand.
      const items: { variantId: string; price: number; onHand: number }[] = (
        await alpha
          .post('/api/pos/items')
          .send({ registerId, variantIds: [shirt, scarf, shirt] })
          .expect(200)
      ).body
      expect(items).toHaveLength(2)
      expect(items.find((item) => item.variantId === shirt)).toMatchObject({ price: som(95_000), onHand: 8 })
      await beta
        .post('/api/pos/items')
        .send({ registerId, variantIds: [shirt] })
        .expect(404)
    })

    it("takes dollars, a card and so'm in one sale, and keeps the dollars as dollars", async () => {
      const sale = (
        await sell({
          lines: [{ variantId: shirt, qty: 1 }],
          payments: [cash(usd(5), 'USD'), { method: 'card', accountId: cardId, amount: som(30_000) }, cash(som(1000))],
          total: som(95_000),
        }).expect(201)
      ).body
      // 5 $ = 64 250, + 30 000 + 1 000 = 95 250: 250 over, too little to hand back.
      expect(sale).toMatchObject({ uzsPerUsd: 12_850, changeUzs: 0, changeUsd: 0, rounding: som(250) })
      expect(sale.payments.map((payment: { base: number }) => payment.base)).toEqual([
        som(64_250),
        som(30_000),
        som(1000),
      ])
      expect(await balances()).toMatchObject({
        cash_UZS: som(431_000),
        cash_USD: usd(5),
        card: som(30_000),
        sales: -som(325_000),
        rounding: -som(250),
      })
      const listed = (await alpha.get('/api/sales').expect(200)).body.items[0]
      expect(listed).toMatchObject({ number: 'CH-000002', paidBy: 'Naqd $, Kartaga, Naqd', qty: 1 })
    })

    it('gives no change from a card or a terminal, and takes no less than the total', async () => {
      const line = { lines: [{ variantId: scarf, qty: 1 }], total: som(40_000) }
      const over = await sell({
        ...line,
        payments: [{ method: 'terminal', accountId: terminalId, amount: som(50_000) }],
      })
      expect(over.status).toBe(400)
      const short = await sell({ ...line, payments: [cash(som(30_000))] })
      expect(short.body.error.fields.payments).toBe(`To'lov yetarli emas: yana ${formatMoney(som(10_000))}`)
      const elsewhere = await sell({
        ...line,
        payments: [{ method: 'card', accountId: terminalId, amount: som(40_000) }],
      })
      expect(elsewhere.body.error.fields['payments.0.accountId']).toBe('Karta topilmadi')
    })

    it('does not sell what is not there', async () => {
      const refused = await sell({
        lines: [{ variantId: scarf, qty: 9 }],
        payments: [cash(som(360_000))],
        total: som(360_000),
      })
      expect(refused.status).toBe(400)
      expect(refused.body.error.fields['lines.0.qty']).toBe('«Sharf»: qoldiq yetarli emas (bor 4)')
      expect(await onHand(scarf)).toBe(4)
    })

    it('lets a cashier discount up to the limit, and more only with the right', async () => {
      const lines = (discount: number) => ({ lines: [{ variantId: shirt, qty: 1, discount }] })
      const over = await sell({ ...lines(som(19_000)), payments: [cash(som(76_000))], total: som(76_000) }, cashier)
      expect(over.status).toBe(400)
      expect(over.body.error.code).toBe('DISCOUNT_OVER_LIMIT')

      const sale = (
        await sell({ ...lines(som(9500)), payments: [cash(som(86_000))], total: som(85_500) }, cashier).expect(201)
      ).body
      // 500 over rounds to a 1 000 note back: the shop gives 500 away, and it is written down.
      expect(sale).toMatchObject({
        cashierName: 'Dilnoza Kassir',
        discount: som(9500),
        changeUzs: som(1000),
        rounding: -som(500),
      })
      expect(await balances()).toMatchObject({ cash_UZS: som(516_000), sales: -som(410_500), rounding: som(250) })
      expect(await onHand(shirt)).toBe(6)
    })

    it("takes the limit from the shop's settings, and a change that leaves a setting out keeps it", async () => {
      const save = (settings: Record<string, number>) => alpha.put('/api/org').send({ name: 'Alpha', settings })
      await save({ autoLockMinutes: 10, maxDiscountPercent: 25 }).expect(200)
      const org = (await save({ autoLockMinutes: 5 }).expect(200)).body
      expect(org.settings).toMatchObject({ autoLockMinutes: 5, maxDiscountPercent: 25, changeRoundStep: som(1000) })

      const context = (await cashier.get(`/api/pos/context/${registerId}`).expect(200)).body
      expect(context).toMatchObject({ maxDiscountPercent: 25, changeRoundStep: som(1000), mayOverDiscount: false })

      await save({ autoLockMinutes: 10, maxDiscountPercent: 10 }).expect(200)
    })

    it('is printed the way the business laid its receipts out', async () => {
      // Until the business says otherwise, the template is the one every business starts with.
      expect((await alpha.get('/api/auth/me').expect(200)).body.org.settings.receipt).toBeUndefined()
      const org = (
        await alpha
          .put('/api/org/receipt')
          .send({ width: 58, title: ' Alpha Style ', showSku: true, footer: 'Rahmat!\n14 kun ichida qaytariladi' })
          .expect(200)
      ).body
      // What was not sent is as the starting template has it.
      expect(org.settings.receipt).toEqual({
        width: 58,
        logo: null,
        logoWidth: 50,
        title: 'Alpha Style',
        showShop: true,
        showAddress: true,
        showCashier: true,
        showSeller: true,
        showCustomer: true,
        showSku: true,
        showLineDiscount: true,
        showSavings: true,
        footer: 'Rahmat!\n14 kun ichida qaytariladi',
        socials: null,
        showBarcode: true,
      })
      // A logo is the picture itself, kept with the template; the history says only that there is one.
      const logo = `data:image/png;base64,${'iVBORw0KGgo'.repeat(200)}=`
      const pictured = (
        await alpha
          .put('/api/org/receipt')
          .send({ ...org.settings.receipt, logo })
          .expect(200)
      ).body
      expect(pictured.settings.receipt).toMatchObject({ logo, width: 58, title: 'Alpha Style' })
      const [entry] = (await alpha.get('/api/audit').query({ action: 'org.receipt' }).expect(200)).body.items
      expect(entry.changes.logo).toEqual([null, 'rasm, 3 KB'])
      expect((await alpha.put('/api/org/receipt').send({ logo: 'https://example.com/logo.png' })).status).toBe(400)
      await alpha
        .put('/api/org/receipt')
        .send({ ...org.settings.receipt, logo: null })
        .expect(200)
      // The other settings are left as they were.
      expect(org.settings).toMatchObject({ maxDiscountPercent: 10, changeRoundStep: som(1000) })
      expect((await alpha.put('/api/org/receipt').send({ width: 70 })).status).toBe(400)
      await cashier.put('/api/org/receipt').send({ width: 80 }).expect(403)

      // A receipt carries where the shop is, for the template that prints it.
      await alpha
        .put(`/api/locations/${shopId}`)
        .send({ name: 'Alpha shop', kind: 'store', address: 'Chilonzor, 12-uy', phone: '71 200 00 01' })
        .expect(200)
      const [listed] = (await alpha.get('/api/sales').expect(200)).body.items
      const sale = (await alpha.get(`/api/sales/${listed.id}`).expect(200)).body
      expect(sale).toMatchObject({ locationAddress: 'Chilonzor, 12-uy', locationPhone: '+998712000001' })
    })
  })

  describe('a tagged piece', () => {
    let epc: string
    let saleId: string

    it('is sold as itself, once', async () => {
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
      epc = /\^RFW,H\^FD([0-9A-F]{24})\^FS/.exec(labels.file.zpl)![1]

      const read = (
        await alpha
          .get('/api/pos/lookup')
          .query({ registerId, code: `3000${epc.toLowerCase()}` })
          .expect(200)
      ).body
      expect(read).toMatchObject({ variantId: shirt, epc, price: som(95_000), onHand: 6 })

      const wrong = await sell({
        lines: [{ variantId: scarf, qty: 1, epc }],
        payments: [cash(som(40_000))],
        total: som(40_000),
      })
      expect(wrong.body.error.fields['lines.0.epc']).toBeDefined()

      const sale = (
        await sell({
          lines: [{ variantId: shirt, qty: 1, epc }],
          payments: [cash(som(95_000))],
          total: som(95_000),
        }).expect(201)
      ).body
      saleId = sale.id
      expect(sale.lines[0].epc).toBe(epc)
      const [unit] = await sql<{ status: string }[]>(`SELECT status FROM rfid_units WHERE epc = $1`, [epc])
      expect(unit.status).toBe('sold')

      const sold = await alpha.get('/api/pos/lookup').query({ registerId, code: epc }).expect(409)
      expect(sold.body.error).toMatchObject({ code: 'UNIT_SOLD', message: `Bu dona sotilgan (chek ${sale.number})` })
      const twice = await sell({
        lines: [{ variantId: shirt, qty: 1, epc }],
        payments: [cash(som(95_000))],
        total: som(95_000),
      })
      expect(twice.body.error.fields['lines.0.epc']).toBe('Bu dona allaqachon sotilgan')
    })

    it('comes back when the sale is voided', async () => {
      await cashier.post(`/api/sales/${saleId}/void`).send({ reason: 'Xato' }).expect(403)
      await alpha.post(`/api/sales/${saleId}/void`).send({}).expect(400)
      const voided = (
        await alpha.post(`/api/sales/${saleId}/void`).send({ reason: 'Mijoz fikridan qaytdi' }).expect(200)
      ).body
      expect(voided).toMatchObject({
        status: 'voided',
        voidedByName: 'Alpha Owner',
        voidReason: 'Mijoz fikridan qaytdi',
      })

      expect(await onHand(shirt)).toBe(6)
      expect(await balances()).toMatchObject({ cash_UZS: som(516_000), sales: -som(410_500) })
      const [unit] = await sql<{ status: string; sale_id: string | null }[]>(
        `SELECT status, sale_id FROM rfid_units WHERE epc = $1`,
        [epc],
      )
      expect(unit).toEqual({ status: 'in_stock', sale_id: null })
      await alpha.post(`/api/sales/${saleId}/void`).send({ reason: 'Yana' }).expect(409)
    })
  })

  describe('the money ledger', () => {
    it('holds no entry that does not add up to nothing, and every balance is the sum of its lines', async () => {
      const [{ unbalanced }] = await sql<{ unbalanced: string }[]>(
        `SELECT count(*) AS unbalanced FROM (
           SELECT entry_id FROM ledger_lines GROUP BY entry_id HAVING sum(base) <> 0
         ) x`,
      )
      expect(Number(unbalanced)).toBe(0)
      const drifted = await sql<unknown[]>(
        `SELECT a.id FROM accounts a
         LEFT JOIN (SELECT account_id, sum(amount) AS amount FROM ledger_lines GROUP BY account_id) l ON l.account_id = a.id
         WHERE a.balance <> coalesce(l.amount, 0)`,
      )
      expect(drifted).toEqual([])
    })

    it('is refused an unbalanced entry by the database itself', async () => {
      const [account] = await sql<{ id: string; org_id: string }[]>(`SELECT id, org_id FROM accounts LIMIT 1`)
      const lopsided = harness.dataSource.transaction(async (em) => {
        await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
        const [entry] = await em.query(
          `INSERT INTO ledger_entries (org_id, entry_date, kind) VALUES ($1, current_date, 'test') RETURNING id`,
          [account.org_id],
        )
        await em.query(
          `INSERT INTO ledger_lines (org_id, entry_id, position, account_id, amount, base) VALUES ($1, $2, 1, $3, 100, 100)`,
          [account.org_id, entry.id, account.id],
        )
      })
      await expect(lopsided).rejects.toThrow(/does not balance/)
    })
  })

  describe('closing', () => {
    it('is for the cashier who opened the shift, or someone who checks them', async () => {
      await cashier.post(`/api/shifts/${shiftId}/close`).send({ cashUzs: 0 }).expect(404)
    })

    it('takes the count as it is and writes the difference down', async () => {
      // A terminal sale and its void, to see both in the report.
      const terminal = (
        await sell({
          lines: [{ variantId: scarf, qty: 1 }],
          payments: [{ method: 'terminal', accountId: terminalId, amount: som(40_000), reference: '1234' }],
          total: som(40_000),
        }).expect(201)
      ).body
      expect(await balances()).toMatchObject({ terminal: som(40_000) })
      await alpha.post(`/api/sales/${terminal.id}/void`).send({ reason: 'Terminal chiqmadi' }).expect(200)
      expect(await balances()).toMatchObject({ terminal: 0 })

      // 516 000 should be there; the cashier counts 511 000.
      const closed = (
        await alpha
          .post(`/api/shifts/${shiftId}/close`)
          .send({ cashUzs: som(511_000), cashUsd: usd(5) })
          .expect(200)
      ).body
      expect(closed).toMatchObject({
        status: 'closed',
        closedByName: 'Alpha Owner',
        countedUzs: som(511_000),
        countedUsd: usd(5),
        expectedUzs: som(516_000),
        expectedUsd: usd(5),
        diffUzs: -som(5000),
        diffUsd: 0,
      })
      expect(closed.totals).toMatchObject({
        sales: 3,
        voided: 2,
        qty: 5,
        discount: som(9500),
        total: som(410_500),
        changeUzs: som(21_000),
        changeUsd: 0,
        rounding: -som(250),
      })
      expect(closed.totals.payments).toEqual([
        { method: 'cash', accountName: "Kassa 1 (so'm)", currency: 'UZS', amount: som(337_000), base: som(337_000) },
        { method: 'cash', accountName: 'Kassa 1 (dollar)', currency: 'USD', amount: usd(5), base: som(64_250) },
        { method: 'card', accountName: 'Humo', currency: 'UZS', amount: som(30_000), base: som(30_000) },
      ])
      // The drawer now says what was counted; the missing 5 000 is a shortage on the books.
      expect(await balances()).toMatchObject({ cash_UZS: som(511_000), cash_USD: usd(5), cash_diff: som(5000) })
    })

    it('ends selling and voiding in that shift', async () => {
      const sale = await sell({
        lines: [{ variantId: scarf, qty: 1 }],
        payments: [cash(som(40_000))],
        total: som(40_000),
      })
      expect(sale.body.error.code).toBe('NO_SHIFT')
      const first = (await alpha.get('/api/sales').query({ q: 'CH-000001' }).expect(200)).body.items[0]
      const late = await alpha.post(`/api/sales/${first.id}/void`).send({ reason: 'Kech' }).expect(409)
      expect(late.body.error.code).toBe('SHIFT_CLOSED')
      await alpha.post(`/api/shifts/${shiftId}/close`).send({ cashUzs: 0 }).expect(409)
    })

    it('is blind for the cashier: what the books expected is not shown', async () => {
      const mine = (
        await cashier
          .post('/api/shifts')
          .send({ registerId, cashUzs: som(511_000), cashUsd: usd(5) })
          .expect(201)
      ).body
      expect(mine.number).toBe('SM-000002')
      // The drawer was left as counted, so opening on the same count posts nothing.
      expect(await balances()).toMatchObject({ cash_UZS: som(511_000), cash_diff: som(5000) })
      await sell(
        { lines: [{ variantId: scarf, qty: 1 }], payments: [cash(som(40_000))], total: som(40_000) },
        cashier,
      ).expect(201)

      const closed = (
        await cashier
          .post(`/api/shifts/${mine.id}/close`)
          .send({ cashUzs: som(551_000), cashUsd: usd(5) })
          .expect(200)
      ).body
      expect(closed).toMatchObject({ status: 'closed', countedUzs: som(551_000), expectedUzs: null, diffUzs: null })
      const reviewed = (await alpha.get(`/api/shifts/${mine.id}`).expect(200)).body
      expect(reviewed).toMatchObject({
        expectedUzs: som(551_000),
        diffUzs: 0,
        totals: { sales: 1, total: som(40_000) },
      })
    })
  })

  describe('rights and separation', () => {
    it('shows a cashier their own sales and shifts only', async () => {
      const mine = (await cashier.get('/api/sales').expect(200)).body
      expect(mine.items.map((sale: { cashierName: string }) => sale.cashierName)).toEqual([
        'Dilnoza Kassir',
        'Dilnoza Kassir',
      ])
      // What the goods cost is not a cashier's to see.
      expect(mine.items[0].costUzs).toBeNull()
      expect((await alpha.get('/api/sales').expect(200)).body.total).toBe(6)
      expect(
        (await cashier.get('/api/shifts').expect(200)).body.items.map((shift: { number: string }) => shift.number),
      ).toEqual(['SM-000002'])
      expect((await alpha.get('/api/shifts').expect(200)).body.total).toBe(2)
    })

    it('shows one business nothing of another', async () => {
      expect((await beta.get('/api/money/registers').expect(200)).body).toEqual([])
      expect((await beta.get('/api/money/accounts').expect(200)).body).toEqual([])
      expect((await beta.get('/api/sales').expect(200)).body.total).toBe(0)
      expect((await beta.get('/api/shifts').expect(200)).body.total).toBe(0)
      await beta.get(`/api/pos/context/${registerId}`).expect(404)
      const foreign = await sell(
        { lines: [{ variantId: scarf, qty: 1 }], payments: [cash(som(40_000))], total: som(40_000) },
        beta,
      )
      expect(foreign.status).toBe(400)
      expect(foreign.body.error.fields.registerId).toBeDefined()
    })
  })

  describe('change in dollars', () => {
    it("is whole dollars, and what is left of it is given in so'm", async () => {
      await alpha
        .post('/api/shifts')
        .send({ registerId, cashUzs: som(551_000), cashUsd: usd(5) })
        .expect(201)
      const before = await balances()
      const sale = (
        await sell({
          lines: [{ variantId: scarf, qty: 1 }],
          payments: [cash(usd(10), 'USD')],
          changeCurrency: 'USD',
          total: som(40_000),
        }).expect(201)
      ).body
      // 10 $ = 128 500 against 40 000: 88 500 over is 6 $ (77 100) and 11 400 so'm, handed back as 11 000.
      expect(sale).toMatchObject({ changeUsd: usd(6), changeUzs: som(11_000), rounding: som(400) })

      const after = await balances()
      expect(after.cash_USD - before.cash_USD).toBe(usd(4))
      expect(after.cash_UZS - before.cash_UZS).toBe(-som(11_000))
      expect(after.sales - before.sales).toBe(-som(40_000))
      expect(after.rounding - before.rounding).toBe(-som(400))
    })
  })
})
