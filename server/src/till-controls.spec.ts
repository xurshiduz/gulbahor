import { randomUUID } from 'node:crypto'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => amount * 100

/**
 * The checks on a cashier: what they may not do alone goes through on a
 * manager's PIN typed at the till, and what the terminals took is set
 * against what was rung up on them when the shift ends.
 */
describe('Till controls', () => {
  let harness: Harness
  let alpha: Agent
  let cashier: Agent
  let manager: Agent
  let other: Agent

  let registerId: string
  let cardId: string
  let terminalId: string
  let shirt: string
  let shiftId: string
  let managerId: string
  let cashierId: string
  let otherId: string

  const PIN = '4821'

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  const cash = (amount: number) => ({ method: 'cash', currency: 'UZS', amount })
  const sell = (body: Record<string, unknown>, agent = cashier) =>
    agent.post('/api/sales').send({ clientKey: randomUUID(), registerId, ...body })
  const giveBack = (body: Record<string, unknown>, agent = cashier) =>
    agent.post('/api/returns').send({ clientKey: randomUUID(), registerId, ...body })
  const setPin = (agent: Agent, pin = PIN) => agent.post('/api/auth/pin').send({ password: PASSWORD, pin })

  const onHand = async (): Promise<number> => {
    const [row] = await sql<{ qty: string }[]>(
      `SELECT coalesce(sum(qty), 0) AS qty FROM stock_balances WHERE variant_id = $1`,
      [shirt],
    )
    return Number(row.qty)
  }

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha } = harness)
    const shopId = (await alpha.get('/api/locations')).body.items[0].id
    const retail = ((await alpha.get('/api/price-types')).body as { id: string; kind: string }[]).find(
      (type) => type.kind === 'retail',
    )!.id
    shirt = (
      await alpha
        .post('/api/products')
        .send({
          name: 'Futbolka',
          axisIds: [],
          variants: [{ valueIds: [] }],
          prices: [{ priceTypeId: retail, amount: som(100_000), currency: 'UZS' }],
        })
        .expect(201)
    ).body.variants[0].id
    const draft = await alpha
      .post('/api/receipts')
      .send({
        locationId: shopId,
        docDate: '2026-10-01',
        uzsRate: 12_000,
        currency: 'UZS',
        usdRate: 12_000,
        lines: [{ variantId: shirt, qty: 20, price: som(50_000) }],
      })
      .expect(201)
    await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)

    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    cardId = (await alpha.post('/api/money/accounts').send({ kind: 'card', name: 'Humo', last4: '3073' }).expect(201))
      .body.id
    terminalId = (await alpha.post('/api/money/accounts').send({ kind: 'terminal', name: 'Terminal 1' }).expect(201))
      .body.id

    const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
    const hire = async (fullName: string, login: string, templateKey: string) => {
      const user = await alpha
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
      return { id: user.body.id as string, agent: await harness.signIn(login) }
    }
    ;({ id: cashierId, agent: cashier } = await hire('Dilnoza Kassir', 'kassir', 'cashier'))
    ;({ id: managerId, agent: manager } = await hire('Anvar Menejer', 'menejer', 'store_manager'))
    ;({ id: otherId, agent: other } = await hire('Zarina Kassir', 'kassir2', 'cashier'))
    shiftId = (
      await cashier
        .post('/api/shifts')
        .send({ registerId, cashUzs: som(500_000) })
        .expect(201)
    ).body.id
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe("a manager's word", () => {
    // A shirt at 100 000 with 20 000 off: twice the cashier's limit of 10%.
    const discounted = (approval?: { userId: string; pin: string }) =>
      sell({
        lines: [{ variantId: shirt, qty: 1, discount: som(20_000) }],
        payments: [cash(som(80_000))],
        total: som(80_000),
        approval,
      })

    it('can be given only by those who may, and have a PIN to give it with', async () => {
      const before = (await cashier.get(`/api/pos/context/${registerId}`).expect(200)).body
      // Nobody has a PIN yet.
      expect(before.approvers).toEqual([])

      await setPin(manager).expect(204)
      await setPin(other).expect(204)
      const context = (await cashier.get(`/api/pos/context/${registerId}`).expect(200)).body
      // The other cashier has a PIN but nothing to allow; the owner may allow everything but has no PIN.
      expect(context.approvers).toEqual([
        {
          id: managerId,
          name: 'Anvar Menejer',
          discount: true,
          returns: true,
          prices: true,
          debts: true,
          partners: true,
        },
      ])
      expect(context.mayOverDiscount).toBe(false)
    })

    it('lets a discount over the limit through, and is written on the sale', async () => {
      const alone = await discounted()
      expect(alone.status).toBe(400)
      expect(alone.body.error.code).toBe('DISCOUNT_OVER_LIMIT')

      const wrong = await discounted({ userId: managerId, pin: '0000' })
      expect(wrong.status).toBe(400)
      expect(wrong.body.error.fields.approval).toBe('PIN noto‘g‘ri. Yana 4 ta urinish qoldi')
      // Somebody who may not allow it, their PIN right or not; and nobody vouches for themselves.
      const powerless = await discounted({ userId: otherId, pin: PIN })
      expect(powerless.body.error.code).toBe('DISCOUNT_OVER_LIMIT')
      expect(powerless.body.error.message).toContain('Zarina Kassir')
      expect((await discounted({ userId: cashierId, pin: PIN })).body.error.fields.approval).toBeDefined()
      expect(await onHand()).toBe(20)

      const sale = (await discounted({ userId: managerId, pin: PIN }).expect(201)).body
      expect(sale).toMatchObject({ discount: som(20_000), total: som(80_000), approvedByName: 'Anvar Menejer' })
      const [entry] = await sql<{ summary: string }[]>(
        `SELECT summary FROM audit_log WHERE action = 'sale.create' AND entity_id = $1`,
        [sale.id],
      )
      expect(entry.summary).toContain('tasdiqladi: Anvar Menejer')

      // Given where it was not needed, it is not written down.
      const plain = (
        await sell({
          lines: [{ variantId: shirt, qty: 1 }],
          payments: [cash(som(100_000))],
          total: som(100_000),
          approval: { userId: managerId, pin: PIN },
        }).expect(201)
      ).body
      expect(plain.approvedByName).toBeNull()
    })

    it('cannot be guessed: after five wrong PINs the PIN is taken away', async () => {
      for (const left of [4, 3, 2, 1]) {
        const wrong = await discounted({ userId: managerId, pin: '0000' })
        expect(wrong.body.error.fields.approval).toBe(`PIN noto‘g‘ri. Yana ${left} ta urinish qoldi`)
      }
      const last = await discounted({ userId: managerId, pin: '0000' })
      expect(last.body.error.fields.approval).toContain('yangi PIN o‘rnatishi kerak')
      // Even the right PIN is no good now.
      expect((await discounted({ userId: managerId, pin: PIN })).body.error.fields.approval).toContain(
        'PIN kod o‘rnatilmagan',
      )
      expect((await manager.get('/api/auth/me').expect(200)).body.user.hasPin).toBe(false)
      const [locked] = await sql<{ summary: string }[]>(
        `SELECT summary FROM audit_log WHERE action = 'auth.pin_locked' ORDER BY created_at DESC LIMIT 1`,
      )
      expect(locked.summary).toContain('Anvar Menejer')
      expect(await onHand()).toBe(18)

      await setPin(manager).expect(204)
      await discounted({ userId: managerId, pin: PIN }).expect(201)
    })

    it('is needed under the floor of a thing, however small the discount', async () => {
      const types = (await alpha.get('/api/price-types')).body as { id: string; kind: string }[]
      const priceOf = (kind: string, amount: number, currency = 'UZS') => ({
        priceTypeId: types.find((type) => type.kind === kind)!.id,
        amount,
        currency,
      })
      // A dress at 200 000 that is not to go under 190 000: 5% off, well inside the cashier's 10%.
      const dress = (
        await alpha
          .post('/api/products')
          .send({
            name: 'Ko‘ylak',
            axisIds: [],
            variants: [{ valueIds: [] }],
            prices: [priceOf('retail', som(200_000)), priceOf('min', som(190_000))],
          })
          .expect(201)
      ).body.variants[0].id as string
      const shopId = (await alpha.get('/api/locations')).body.items[0].id
      const draft = await alpha
        .post('/api/receipts')
        .send({
          locationId: shopId,
          docDate: '2026-10-01',
          uzsRate: 12_000,
          currency: 'UZS',
          usdRate: 12_000,
          lines: [{ variantId: dress, qty: 10, price: som(120_000) }],
        })
        .expect(201)
      await alpha.post(`/api/receipts/${draft.body.id}/post`).expect(201)

      const found = (await cashier.get('/api/pos/search').query({ registerId, q: 'ko‘ylak' }).expect(200)).body
      expect(found).toEqual([expect.objectContaining({ price: som(200_000), minPrice: som(190_000) })])
      // The shirt has no floor.
      const shirts = (await cashier.get('/api/pos/search').query({ registerId, q: 'futbolka' }).expect(200)).body
      expect(shirts[0].minPrice).toBeNull()

      const two = (discount: number, more: Record<string, unknown> = {}, agent = cashier) =>
        sell(
          {
            lines: [{ variantId: dress, qty: 2, discount }],
            payments: [cash(som(400_000) - discount)],
            total: som(400_000) - discount,
            ...more,
          },
          agent,
        )
      // Down to the floor the cashier sells alone.
      expect((await two(som(20_000)).expect(201)).body.approvedByName).toBeNull()

      const under = await two(som(20_001))
      expect(under.status).toBe(400)
      expect(under.body.error.code).toBe('BELOW_MIN_PRICE')
      expect(under.body.error.message).toContain('Ko‘ylak')
      expect(under.body.error.fields['lines.0.discount']).toContain('380')
      const powerless = await two(som(20_001), { approval: { userId: otherId, pin: PIN } })
      expect(powerless.body.error.code).toBe('BELOW_MIN_PRICE')
      expect(powerless.body.error.message).toContain('Zarina Kassir')

      const allowed = (await two(som(20_001), { approval: { userId: managerId, pin: PIN } }).expect(201)).body
      expect(allowed.approvedByName).toBe('Anvar Menejer')
      // Who may discount beyond the limit sells under the floor on their own word.
      expect((await two(som(30_000), {}, manager).expect(201)).body.approvedByName).toBeNull()

      // A share of a discount on the whole sale counts too: 30 000 off both is 20 000 off the dress.
      const shared = await sell({
        lines: [
          { variantId: dress, qty: 1 },
          { variantId: shirt, qty: 1 },
        ],
        discount: som(30_000),
        payments: [cash(som(270_000))],
        total: som(270_000),
      })
      expect(shared.body.error.code).toBe('BELOW_MIN_PRICE')
      expect(Object.keys(shared.body.error.fields)).toEqual(['lines.0.discount'])
    })

    it('takes goods back late, and hands money back otherwise than it was paid', async () => {
      const approval = { userId: managerId, pin: PIN }
      const old = (
        await sell({
          lines: [{ variantId: shirt, qty: 1 }],
          payments: [cash(som(100_000))],
          total: som(100_000),
        }).expect(201)
      ).body
      await sql(`UPDATE sales SET sold_on = sold_on - 20 WHERE id = $1`, [old.id])
      const late = {
        saleId: old.id,
        lines: [{ saleLineId: old.lines[0].id, qty: 1 }],
        total: som(100_000),
        refunds: [cash(som(100_000))],
      }
      expect((await giveBack(late)).body.error.code).toBe('RETURN_LATE')
      const refused = await giveBack({ ...late, approval: { userId: otherId, pin: PIN } })
      expect(refused.body.error.code).toBe('RETURN_LATE')
      expect(refused.body.error.message).toContain('Zarina Kassir')
      expect((await giveBack({ ...late, approval }).expect(201)).body).toMatchObject({
        late: true,
        approvedByName: 'Anvar Menejer',
      })

      const byCard = (
        await sell({
          lines: [{ variantId: shirt, qty: 2 }],
          payments: [{ method: 'card', accountId: cardId, amount: som(200_000) }],
          total: som(200_000),
        }).expect(201)
      ).body
      const one = { saleId: byCard.id, lines: [{ saleLineId: byCard.lines[0].id, qty: 1 }], total: som(100_000) }
      expect((await giveBack({ ...one, refunds: [cash(som(100_000))] })).body.error.code).toBe('REFUND_METHOD')
      const inCash = (await giveBack({ ...one, refunds: [cash(som(100_000))], approval }).expect(201)).body
      expect(inCash).toMatchObject({ late: false, approvedByName: 'Anvar Menejer' })
      // The other one goes back to the card, as it was paid: nobody's word was needed, and none is written.
      const toCard = (
        await giveBack({
          ...one,
          refunds: [{ method: 'card', accountId: cardId, amount: som(100_000) }],
          approval,
        }).expect(201)
      ).body
      expect(toCard.approvedByName).toBeNull()
      expect((await alpha.get('/api/returns').expect(200)).body.items[1].approvedByName).toBe('Anvar Menejer')
    })
  })

  describe('the terminals', () => {
    it('are set against what was rung up on them when the shift ends', async () => {
      const byTerminal = () =>
        sell({
          lines: [{ variantId: shirt, qty: 1 }],
          payments: [{ method: 'terminal', accountId: terminalId, amount: som(100_000), reference: '123456' }],
          total: som(100_000),
        })
      await byTerminal().expect(201)
      const second = (await byTerminal().expect(201)).body
      // One of them comes back, to the terminal it was paid on.
      await giveBack({
        saleId: second.id,
        lines: [{ saleLineId: second.lines[0].id, qty: 1 }],
        total: som(100_000),
        refunds: [{ method: 'terminal', accountId: terminalId, amount: som(100_000) }],
      }).expect(201)

      const unknown = await cashier
        .post(`/api/shifts/${shiftId}/close`)
        .send({ cashUzs: som(500_000), terminals: [{ accountId: cardId, amount: 0 }] })
      expect(unknown.status).toBe(400)
      expect(unknown.body.error.fields['terminals.0.accountId']).toBeDefined()

      // The terminal's slip says 95 000; the till rang up 100 000 on it.
      const closed = (
        await cashier
          .post(`/api/shifts/${shiftId}/close`)
          .send({ cashUzs: som(500_000), terminals: [{ accountId: terminalId, amount: som(95_000) }] })
          .expect(200)
      ).body
      // The cashier sees what they typed; what it should have been is for those who check.
      expect(closed.terminals).toEqual([
        { accountId: terminalId, name: 'Terminal 1', counted: som(95_000), expected: null, diff: null },
      ])
      const reviewed = (await alpha.get(`/api/shifts/${shiftId}`).expect(200)).body
      expect(reviewed.terminals).toEqual([
        { accountId: terminalId, name: 'Terminal 1', counted: som(95_000), expected: som(100_000), diff: -som(5000) },
      ])
    })
  })

  describe('dollars taken for an agreed worth', () => {
    const usd = (dollars: number) => Math.round(dollars * 100)
    const dollars = (amount: number, value?: number) => ({ method: 'cash', currency: 'USD', amount, value })
    /** What the rate's own account holds: less than nothing is the shop's gain. */
    const rateAccount = async (): Promise<number> => {
      const [row] = await sql<{ balance: string }[]>(
        `SELECT a.balance FROM accounts a JOIN organizations o ON o.id = a.org_id
         WHERE o.name = 'Alpha' AND a.system_key = 'fx'`,
      )
      return Number(row?.balance ?? 0)
    }
    const drawerUsd = async (): Promise<number> => {
      const [row] = await sql<{ balance: string }[]>(
        `SELECT a.balance FROM accounts a WHERE a.register_id = $1 AND a.currency = 'USD'`,
        [registerId],
      )
      return Number(row?.balance ?? 0)
    }

    beforeAll(async () => {
      const [{ day }] = await sql<{ day: string }[]>(`SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day`)
      await alpha.put('/api/money/rates').send({ date: day, uzsPerUsd: 12_100 }).expect(200)
      await cashier
        .post('/api/shifts')
        .send({ registerId, cashUzs: som(500_000) })
        .expect(201)
    })

    it("pay what was agreed; the drawer keeps the notes at the day's rate and the rate keeps the difference", async () => {
      expect((await cashier.get(`/api/pos/context/${registerId}`).expect(200)).body.maxRateLossPercent).toBe(2)

      // Two shirts, 200 000: 80 000 in so'm, and 10 $ (121 000 at the rate) called 120 000.
      const sale = (
        await sell({
          lines: [{ variantId: shirt, qty: 2 }],
          payments: [cash(som(80_000)), dollars(usd(10), som(120_000))],
          total: som(200_000),
        }).expect(201)
      ).body
      expect(sale).toMatchObject({ total: som(200_000), changeUzs: 0, rounding: 0, approvedByName: null })
      expect(sale.payments).toEqual([
        expect.objectContaining({ currency: 'UZS', amount: som(80_000), base: som(80_000), fx: 0 }),
        expect.objectContaining({ currency: 'USD', amount: usd(10), base: som(120_000), fx: som(1000) }),
      ])
      expect(await drawerUsd()).toBe(usd(10))
      expect(await rateAccount()).toBe(-som(1000))
      const [books] = await sql<{ base: string }[]>(
        `SELECT sum(l.base) AS base FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
         WHERE e.document_id = $1`,
        [sale.id],
      )
      expect(Number(books.base)).toBe(0)
      const [entry] = await sql<{ summary: string }[]>(
        `SELECT summary FROM audit_log WHERE action = 'sale.create' AND entity_id = $1`,
        [sale.id],
      )
      expect(entry.summary).toContain('kurs farqi +')

      // An agreed worth is for dollars: so'm are what they are.
      const wrong = await sell({
        lines: [{ variantId: shirt, qty: 1 }],
        payments: [{ ...cash(som(100_000)), value: som(90_000) }],
        total: som(100_000),
      })
      expect(wrong.status).toBe(400)
      expect(wrong.body.error.fields['payments.0.value']).toBeDefined()
    })

    it('need a word when they are taken for more than the limit over the rate', async () => {
      // 8 $ are 96 800. Called 98 000 they cost the shop 1 200, 1,2%: the cashier's own to give.
      const within = (
        await sell({
          lines: [{ variantId: shirt, qty: 1 }],
          payments: [dollars(usd(8), som(98_000)), cash(som(2000))],
          total: som(100_000),
        }).expect(201)
      ).body
      expect(within.payments[0]).toMatchObject({ base: som(98_000), fx: -som(1200) })
      expect(await rateAccount()).toBe(som(200))

      // Called 100 000 they cost 3 200, 3,3%.
      const dear = (approval?: { userId: string; pin: string }, agent = cashier) =>
        sell(
          {
            lines: [{ variantId: shirt, qty: 1 }],
            payments: [dollars(usd(8), som(100_000))],
            total: som(100_000),
            approval,
          },
          agent,
        )
      const alone = await dear()
      expect(alone.status).toBe(400)
      expect(alone.body.error.code).toBe('RATE_LOSS_OVER_LIMIT')
      expect(alone.body.error.fields.payments).toContain('2%')
      const powerless = await dear({ userId: otherId, pin: PIN })
      expect(powerless.body.error.code).toBe('RATE_LOSS_OVER_LIMIT')
      expect(powerless.body.error.message).toContain('Zarina Kassir')
      expect(await rateAccount()).toBe(som(200))

      const allowed = (await dear({ userId: managerId, pin: PIN }).expect(201)).body
      expect(allowed.approvedByName).toBe('Anvar Menejer')
      expect(await rateAccount()).toBe(som(3400))

      // Voided, the rate's account gives back what the sale put there.
      await alpha.post(`/api/sales/${allowed.id}/void`).send({ reason: 'Xato urilgan' }).expect(200)
      expect(await rateAccount()).toBe(som(200))
      expect(await drawerUsd()).toBe(usd(18))
    })

    it("take their limit from the shop's settings", async () => {
      await alpha
        .put('/api/org')
        .send({ name: 'Alpha', settings: { autoLockMinutes: 10, maxRateLossPercent: 5 } })
        .expect(200)
      const sale = (
        await sell({
          lines: [{ variantId: shirt, qty: 1 }],
          payments: [dollars(usd(8), som(100_000))],
          total: som(100_000),
        }).expect(201)
      ).body
      expect(sale.approvedByName).toBeNull()
      // The other limits stay as they were.
      const context = (await cashier.get(`/api/pos/context/${registerId}`).expect(200)).body
      expect(context).toMatchObject({ maxRateLossPercent: 5, maxDiscountPercent: 10 })
    })
  })
})
