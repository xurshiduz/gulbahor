import { randomUUID } from 'node:crypto'

import { RealtimeService } from './modules/realtime/realtime.service'
import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => amount * 100
const usd = (dollars: number) => Math.round(dollars * 100)

interface AccountRow {
  id: string
  kind: string
  name: string
  currency: string
  balance: number | null
}

/**
 * Moving money between accounts: a till's cash handed over to the safe,
 * change money brought to a till. One person sends it, another says it
 * arrived; in between it is in neither place, and refused it goes back.
 */
describe('Money transfers', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let cashier: Agent
  let manager: Agent
  let seller: Agent
  let events: jest.SpyInstance

  /** What every screen of the business was told under this name. */
  const told = (name: string) => events.mock.calls.filter((call) => call[1] === name).map((call) => call[2])

  let shopId: string
  let registerId: string
  let safeId: string
  let dollarSafeId: string
  let drawerId: string
  let dollarDrawerId: string
  let shiftId: string

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  /** Balances by account: drawers and safes by currency, the ledger's own by their name. */
  const balances = async (): Promise<Record<string, number>> => {
    const rows = await sql<{ kind: string; system_key: string | null; currency: string; balance: string }[]>(
      `SELECT a.kind, a.system_key, a.currency, a.balance FROM accounts a
       JOIN organizations o ON o.id = a.org_id WHERE o.name = 'Alpha'`,
    )
    return Object.fromEntries(rows.map((row) => [row.system_key ?? `${row.kind}_${row.currency}`, Number(row.balance)]))
  }

  const send = (body: Record<string, unknown>, agent = cashier) =>
    agent.post('/api/money/transfers').send({ clientKey: randomUUID(), ...body })

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    events = jest.spyOn(harness.app.get(RealtimeService), 'event')
    shopId = (await alpha.get('/api/locations')).body.items[0].id
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
    await alpha.put('/api/currencies/USD/rate').send({ value: 12_850 }).expect(200)

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
    manager = await hire('Anvar Menejer', 'menejer', 'store_manager')
    seller = await hire('Sardor Sotuvchi', 'sotuvchi', 'seller')
  }, 60_000)

  afterAll(async () => {
    await harness.close()
  })

  describe('accounts', () => {
    it("hold so'm or dollars; a terminal only so'm", async () => {
      safeId = (await alpha.post('/api/money/accounts').send({ kind: 'safe', name: 'Seyf' }).expect(201)).body.id
      const dollars = (
        await alpha.post('/api/money/accounts').send({ kind: 'safe', name: 'Seyf $', currency: 'USD' }).expect(201)
      ).body
      expect(dollars).toMatchObject({ kind: 'safe', currency: 'USD', balance: 0 })
      dollarSafeId = dollars.id
      const refused = await alpha
        .post('/api/money/accounts')
        .send({ kind: 'terminal', name: 'Terminal $', currency: 'USD' })
      expect(refused.status).toBe(400)
      expect(refused.body.error.fields.currency).toBeDefined()
    })

    it('are shown to the till as places to hand cash over to, without what is in them', async () => {
      shiftId = (
        await cashier
          .post('/api/shifts')
          .send({ registerId, cashUzs: som(500_000), cashUsd: usd(50) })
          .expect(201)
      ).body.id
      const context = (await cashier.get(`/api/pos/context/${registerId}`).expect(200)).body
      expect(context.safes.map((safe: AccountRow) => [safe.name, safe.currency, safe.balance])).toEqual([
        ['Seyf', 'UZS', null],
        ['Seyf $', 'USD', null],
      ])
      expect(context.transfers).toEqual([])

      const accounts = (await alpha.get('/api/money/accounts').expect(200)).body as AccountRow[]
      drawerId = accounts.find((account) => account.kind === 'cash' && account.currency === 'UZS')!.id
      dollarDrawerId = accounts.find((account) => account.kind === 'cash' && account.currency === 'USD')!.id
    })
  })

  describe('a handover', () => {
    let transferId: string

    it('takes the cash out of the drawer at once, and puts it nowhere yet', async () => {
      const key = randomUUID()
      const body = {
        clientKey: key,
        fromAccountId: drawerId,
        toAccountId: safeId,
        amount: som(300_000),
        note: 'Tushlik',
      }
      const sent = (await cashier.post('/api/money/transfers').send(body).expect(201)).body
      expect(sent).toMatchObject({
        number: 'PO-000001',
        status: 'sent',
        currency: 'UZS',
        amount: som(300_000),
        fromAccountName: 'Kassa 1 (so‘m)',
        toAccountName: 'Seyf',
        sentByName: 'Dilnoza Kassir',
        note: 'Tushlik',
        mayReceive: false,
        mayCancel: true,
      })
      transferId = sent.id
      expect(await balances()).toMatchObject({ cash_UZS: som(200_000), transit: som(300_000), safe_UZS: 0 })
      // Whoever keeps the safe is told at once that money is on its way, but not how much.
      expect(told('money.sent')).toEqual([
        {
          id: transferId,
          number: 'PO-000001',
          fromName: 'Kassa 1 (so‘m)',
          toName: 'Seyf',
          toKind: 'safe',
          toLocationId: null,
          toRegisterId: null,
          sentBy: expect.any(String),
        },
      ])
      // Sent again by a screen that did not hear back: it is the same transfer.
      expect((await cashier.post('/api/money/transfers').send(body).expect(201)).body.id).toBe(transferId)
      expect((await balances()).cash_UZS).toBe(som(200_000))
      expect(told('money.sent')).toHaveLength(1)

      const context = (await cashier.get(`/api/pos/context/${registerId}`).expect(200)).body
      expect(context.transfers.map((item: { id: string }) => item.id)).toEqual([transferId])
    })

    it('reaches the safe only when whoever keeps it says it arrived', async () => {
      // The one who sent it cannot vouch for it.
      await cashier.post(`/api/money/transfers/${transferId}/receive`).expect(403)
      const waiting = (await manager.get('/api/money/transfers').query({ status: 'sent' }).expect(200)).body
      expect(waiting.items).toEqual([expect.objectContaining({ id: transferId, mayReceive: true, mayCancel: false })])

      const received = (await manager.post(`/api/money/transfers/${transferId}/receive`).expect(200)).body
      expect(received).toMatchObject({ status: 'received', decidedByName: 'Anvar Menejer', mayReceive: false })
      expect(await balances()).toMatchObject({ cash_UZS: som(200_000), transit: 0, safe_UZS: som(300_000) })
      const again = await manager.post(`/api/money/transfers/${transferId}/receive`).expect(409)
      expect(again.body.error.code).toBe('TRANSFER_DECIDED')
    })

    it("cannot take more than the drawer holds, nor out of an account that is not the cashier's", async () => {
      const tooMuch = await send({ fromAccountId: drawerId, toAccountId: safeId, amount: som(900_000) })
      expect(tooMuch.status).toBe(400)
      // The sum the books hold is not told.
      expect(tooMuch.body.error.fields.amount).toBe('Hisobda buncha pul yo‘q')
      await send({ fromAccountId: safeId, toAccountId: drawerId, amount: som(10_000) }).expect(403)
      const same = await send({ fromAccountId: drawerId, toAccountId: drawerId, amount: som(10_000) })
      expect(same.status).toBe(400)
    })

    it('refused, or taken back, returns to the drawer', async () => {
      const first = (await send({ fromAccountId: drawerId, toAccountId: safeId, amount: som(100_000) }).expect(201))
        .body
      expect((await balances()).cash_UZS).toBe(som(100_000))
      await manager.post(`/api/money/transfers/${first.id}/reject`).send({}).expect(400)
      const rejected = (
        await manager.post(`/api/money/transfers/${first.id}/reject`).send({ reason: '10 000 kam chiqdi' }).expect(200)
      ).body
      expect(rejected).toMatchObject({ status: 'rejected', reason: '10 000 kam chiqdi' })
      expect(await balances()).toMatchObject({ cash_UZS: som(200_000), transit: 0, safe_UZS: som(300_000) })

      const second = (await send({ fromAccountId: drawerId, toAccountId: safeId, amount: som(50_000) }).expect(201))
        .body
      // Only the sender takes it back; the one it was sent to can only accept or refuse.
      await manager.post(`/api/money/transfers/${second.id}/cancel`).expect(403)
      expect((await cashier.post(`/api/money/transfers/${second.id}/cancel`).expect(200)).body.status).toBe('cancelled')
      expect(await balances()).toMatchObject({ cash_UZS: som(200_000), transit: 0 })
      await manager.post(`/api/money/transfers/${second.id}/receive`).expect(409)
    })

    it('moves dollars as dollars, between accounts that hold them', async () => {
      // To a safe of so'm they would be changed on the way (an exchange): taken back, nothing moved.
      const changed = (await send({ fromAccountId: dollarDrawerId, toAccountId: safeId, amount: usd(20) }).expect(201))
        .body
      expect(changed).toMatchObject({ currency: 'USD', toCurrency: 'UZS', toAmount: som(257_000) })
      await cashier.post(`/api/money/transfers/${changed.id}/cancel`).expect(200)

      const sent = (
        await send({ fromAccountId: dollarDrawerId, toAccountId: dollarSafeId, amount: usd(20) }).expect(201)
      ).body
      expect(sent).toMatchObject({ currency: 'USD', amount: usd(20) })
      // On its way it is carried at the day's rate: 20 $ = 257 000 so'm.
      expect(await balances()).toMatchObject({ cash_USD: usd(30), transit: som(257_000), safe_USD: 0 })
      await alpha.post(`/api/money/transfers/${sent.id}/receive`).expect(200)
      expect(await balances()).toMatchObject({ cash_USD: usd(30), transit: 0, safe_USD: usd(20) })
    })
  })

  describe('money brought to a till', () => {
    it('waits for the cashier to say it arrived', async () => {
      const sent = (
        await send({ fromAccountId: safeId, toAccountId: drawerId, amount: som(200_000) }, manager).expect(201)
      ).body
      expect(await balances()).toMatchObject({ safe_UZS: som(100_000), cash_UZS: som(200_000) })
      await manager.post(`/api/money/transfers/${sent.id}/receive`).expect(403)

      const context = (await cashier.get(`/api/pos/context/${registerId}`).expect(200)).body
      expect(context.transfers).toEqual([
        expect.objectContaining({ id: sent.id, toAccountName: 'Kassa 1 (so‘m)', mayReceive: true, mayCancel: false }),
      ])
      await cashier.post(`/api/money/transfers/${sent.id}/receive`).expect(200)
      expect(await balances()).toMatchObject({ safe_UZS: som(100_000), cash_UZS: som(400_000), transit: 0 })
    })

    it('shows in the shift what left the drawer and what came into it', async () => {
      const shift = (await alpha.get(`/api/shifts/${shiftId}`).expect(200)).body
      // What was refused or taken back moved nothing.
      expect(shift.totals).toMatchObject({ outUzs: som(300_000), outUsd: usd(20), inUzs: som(200_000), inUsd: 0 })
    })
  })

  describe('the end of a shift', () => {
    it('hands over what was counted, and the next shift finds what was left', async () => {
      const over = await cashier
        .post(`/api/shifts/${shiftId}/close`)
        .send({ cashUzs: som(400_000), cashUsd: usd(30), handovers: [{ toAccountId: safeId, amount: som(450_000) }] })
      expect(over.status).toBe(400)
      expect(over.body.error.fields['handovers.0.amount']).toBeDefined()

      await cashier
        .post(`/api/shifts/${shiftId}/close`)
        .send({
          cashUzs: som(400_000),
          cashUsd: usd(30),
          handovers: [
            { toAccountId: safeId, amount: som(350_000) },
            { toAccountId: dollarSafeId, amount: usd(30) },
          ],
        })
        .expect(200)
      // Both handovers are announced, once the shift is closed for good.
      expect(told('money.sent').slice(-2)).toMatchObject([
        { fromName: 'Kassa 1 (so‘m)', toName: 'Seyf' },
        { fromName: 'Kassa 1 (dollar)', toKind: 'safe' },
      ])
      const closed = (await alpha.get(`/api/shifts/${shiftId}`).expect(200)).body
      expect(closed).toMatchObject({
        status: 'closed',
        expectedUzs: som(400_000),
        diffUzs: 0,
        diffUsd: 0,
        totals: { outUzs: som(650_000), outUsd: usd(50) },
      })
      expect(await balances()).toMatchObject({
        cash_UZS: som(50_000),
        cash_USD: 0,
        transit: som(350_000) + som(385_500),
      })

      const waiting = (await manager.get('/api/money/transfers').query({ status: 'sent' }).expect(200)).body.items
      expect(waiting.map((item: { amount: number }) => item.amount).sort()).toEqual([usd(30), som(350_000)])
      for (const item of waiting as { id: string }[]) {
        await manager.post(`/api/money/transfers/${item.id}/receive`).expect(200)
      }
      expect(await balances()).toMatchObject({ safe_UZS: som(450_000), safe_USD: usd(50), transit: 0 })

      // The drawer holds what was not handed over: opening on that count finds no difference.
      await cashier
        .post('/api/shifts')
        .send({ registerId, cashUzs: som(50_000), cashUsd: 0 })
        .expect(201)
      expect((await balances()).cash_diff ?? 0).toBe(0)
    })
  })

  describe('rights and separation', () => {
    it('are for those who work a till or keep the money', async () => {
      await send({ fromAccountId: drawerId, toAccountId: safeId, amount: som(10_000) }, seller).expect(403)
      await cashier.get('/api/money/transfers').expect(403)
      await seller.get('/api/money/transfers').expect(403)
      const all = (await manager.get('/api/money/transfers').expect(200)).body
      expect(all.total).toBe(8)
      const found = (await alpha.get('/api/money/transfers').query({ accountId: dollarSafeId }).expect(200)).body
      expect(found.items.map((item: { currency: string }) => item.currency)).toEqual(['USD', 'USD'])
    })

    it('show one business nothing of another', async () => {
      expect((await beta.get('/api/money/transfers').expect(200)).body.total).toBe(0)
      const foreign = await send({ fromAccountId: drawerId, toAccountId: safeId, amount: som(10_000) }, beta)
      expect(foreign.status).toBe(400)
      const mine = (await manager.get('/api/money/transfers').expect(200)).body.items[0]
      await beta.post(`/api/money/transfers/${mine.id}/receive`).expect(404)
    })

    it('leave every entry of the ledger in balance', async () => {
      const [{ off }] = await sql<{ off: string }[]>(
        `SELECT count(*) AS off FROM (SELECT entry_id FROM ledger_lines GROUP BY entry_id HAVING sum(base) <> 0) x`,
      )
      expect(Number(off)).toBe(0)
    })
  })
})
