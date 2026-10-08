import { randomUUID } from 'node:crypto'
import { createServer, type AddressInfo, type Server, type Socket as NetSocket } from 'node:net'

import { startAgent } from '@erp/agent'
import type { Socket } from 'socket.io-client'

import { RealtimeService } from './modules/realtime/realtime.service'
import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const som = (amount: number) => amount * 100

/** Waits until `check` stops throwing: readers, agents and the server talk after the request has returned. */
async function eventually<T>(check: () => Promise<T> | T, timeoutMs = 8000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      return await check()
    } catch (error) {
      if (Date.now() > deadline) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A pretend reader on the shop's network: it sends what it "reads" and remembers what it was told. */
class FakeReader {
  private readonly server: Server
  private lines: NetSocket[] = []
  port = 0
  heard = ''

  constructor() {
    this.server = createServer((connection) => {
      this.lines.push(connection)
      connection.setEncoding('utf8')
      connection.on('data', (chunk: string) => (this.heard += chunk))
      connection.on('close', () => (this.lines = this.lines.filter((line) => line !== connection)))
    })
  }

  async start() {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve))
    this.port = (this.server.address() as AddressInfo).port
  }

  read(epc: string) {
    this.lines.forEach((line) => line.write(`${epc}\n`))
  }

  async stop() {
    this.lines.forEach((line) => line.destroy())
    await new Promise((resolve) => this.server.close(resolve))
  }
}

/**
 * Readers that stay in one place. The server sets them up and keeps the
 * gate's log; the shop's agent listens to them, decides at the door by
 * itself, and tells the till what was laid on its reader. Here the real
 * agent runs against this server, with pretend readers on its network.
 */
describe('Readers', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent
  let cashier: Agent
  let keeper: Agent

  let apiUrl: string
  let shopId: string
  let registerId: string
  let shirt: string
  let agentId: string
  let agentKey: string
  let gateId: string
  let deskId: string
  let epcs: string[]
  let saleId: string

  const gate = new FakeReader()
  const desk = new FakeReader()
  const sockets: Socket[] = []
  /** What was sent to every open screen of a business. */
  let events: jest.SpyInstance

  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  const sent = (name: string) => events.mock.calls.filter((call) => call[1] === name).map((call) => call[2])

  const logged = async (agent = alpha) =>
    (await agent.get('/api/gate-events').expect(200)).body.items as { epc: string; title: string; readerName: string }[]

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    await harness.app.listen(0)
    apiUrl = `http://127.0.0.1:${(harness.app.getHttpServer().address() as AddressInfo).port}`
    events = jest.spyOn(harness.app.get(RealtimeService), 'event')
    await gate.start()
    await desk.start()

    await alpha
      .put('/api/org/modules')
      .send({ modules: ['consignment', 'rfid'] })
      .expect(200)
    shopId = (await alpha.get('/api/locations')).body.items[0].id
    registerId = (await alpha.post('/api/money/registers').send({ name: 'Kassa 1', locationId: shopId }).expect(201))
      .body.id
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
          prices: [{ priceTypeId: retail, amount: som(95_000), currency: 'UZS' }],
        })
        .expect(201)
    ).body.variants[0].id
    const receiptId = (
      await alpha
        .post('/api/receipts')
        .send({
          locationId: shopId,
          docDate: '2026-10-01',
          currency: 'UZS',
          lines: [{ variantId: shirt, qty: 3, price: som(48_000) }],
        })
        .expect(201)
    ).body.id
    const labels = (
      await alpha
        .post('/api/labels/print')
        .send({ receiptId, rfid: true, size: '50x30', items: [{ variantId: shirt, count: 3 }] })
        .expect(200)
    ).body
    epcs = [...(labels.file.zpl as string).matchAll(/\^RFW,H\^FD([0-9A-F]{24})\^FS/g)].map((match) => match[1])
    await alpha.post(`/api/receipts/${receiptId}/post`).expect(201)
    await alpha.post('/api/shifts').send({ registerId, cashUzs: 0, cashUsd: 0 }).expect(201)

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
    keeper = await hire('Sobir Omborchi', 'omborchi', 'warehouse')
  }, 60_000)

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect())
    // The server notes when each agent was last seen; let it, before the database is closed under it.
    await pause(300)
    await gate.stop()
    await desk.stop()
    await harness?.close()
  })

  describe('setting up', () => {
    it('puts a reader on a till or at a door, reached through an agent on the shop network', async () => {
      const agent = (await alpha.post('/api/devices/agents').send({ name: 'Kassa kompyuteri', locationId: shopId }))
        .body
      agentId = agent.id
      agentKey = agent.key
      const reader = { name: 'Darvoza', kind: 'gate', agentId, locationId: shopId, host: '127.0.0.1', port: gate.port }

      // A gate stands at a shop's door, a desk reader on a till; neither is reached over the internet.
      const noShop = await alpha.post('/api/devices/readers').send({ ...reader, locationId: null })
      expect(noShop.body.error.fields.locationId).toBeDefined()
      const noTill = await alpha.post('/api/devices/readers').send({ ...reader, name: 'Stol', kind: 'desk' })
      expect(noTill.body.error.fields.registerId).toBeDefined()
      const outside = await alpha.post('/api/devices/readers').send({ ...reader, host: 'example.com' })
      expect(outside.body.error.fields.host).toBeDefined()

      const made = (await alpha.post('/api/devices/readers').send(reader).expect(201)).body
      gateId = made.id
      // The agent is not on the line yet: nobody knows whether the reader is.
      expect(made).toMatchObject({ kind: 'gate', locationId: shopId, online: false, connected: null })
      deskId = (
        await alpha
          .post('/api/devices/readers')
          .send({ name: 'Kassa 1 stoli', kind: 'desk', agentId, registerId, host: '127.0.0.1', port: desk.port })
          .expect(201)
      ).body.id

      const second = await alpha
        .post('/api/devices/readers')
        .send({ name: 'Yana bir stol', kind: 'desk', agentId, registerId, host: '127.0.0.1', port: 9 })
      expect(second.body.error.fields.registerId).toContain('Kassa 1 stoli')
      const sameName = await alpha.post('/api/devices/readers').send({ ...reader, port: 9 })
      expect(sameName.body.error.fields.name).toBeDefined()
    })

    it('is taken up by the agent as soon as it connects', async () => {
      const socket = startAgent({ url: apiUrl, key: agentKey })
      sockets.push(socket)
      await eventually(async () => {
        const readers = (await alpha.get('/api/devices/readers').expect(200)).body as {
          id: string
          online: boolean
          connected: boolean | null
        }[]
        expect(readers.map((reader) => [reader.id, reader.online, reader.connected])).toEqual(
          expect.arrayContaining([
            [gateId, true, true],
            [deskId, true, true],
          ]),
        )
      })
    })
  })

  describe("a till's reader", () => {
    it("tells the till's screen of a piece laid on it, once", async () => {
      desk.read(epcs[0])
      desk.read(epcs[0])
      await eventually(() => expect(sent('reader.tag')).toEqual([{ registerId, epc: epcs[0] }]))
      await pause(150)
      expect(sent('reader.tag')).toHaveLength(1)
      // The till then looks the code up as if it had been scanned by hand.
      const item = (await alpha.get('/api/pos/lookup').query({ registerId, code: epcs[0] }).expect(200)).body
      expect(item).toMatchObject({ variantId: shirt, epc: epcs[0] })
    })
  })

  describe('a gate', () => {
    it('goes off for a piece nobody paid for, and the log says which', async () => {
      // The agent fetched its list when it took the gate up; give it a moment to have it.
      await eventually(async () => {
        gate.read(epcs[0])
        await pause(100)
        expect(await logged()).toHaveLength(1)
      })
      expect(gate.heard).toContain('ALARM\n')
      expect((await logged())[0]).toMatchObject({ epc: epcs[0], title: 'Futbolka', readerName: 'Darvoza' })
      expect(sent('gate.alarm')[0]).toMatchObject({ title: 'Futbolka', readerName: 'Darvoza' })
      // A tag that is not ours passes in silence.
      gate.read('E28011700000020F12345678')
      await pause(200)
      expect(await logged()).toHaveLength(1)
    })

    it('lets a piece through as soon as it is sold', async () => {
      const sale = (
        await alpha
          .post('/api/sales')
          .send({
            clientKey: randomUUID(),
            registerId,
            lines: [{ variantId: shirt, qty: 1, epc: epcs[1] }],
            payments: [{ method: 'cash', currency: 'UZS', amount: som(95_000) }],
            total: som(95_000),
          })
          .expect(201)
      ).body
      saleId = sale.id
      // The agent hears that something changed and asks what; a moment is all it takes.
      await pause(700)
      gate.heard = ''
      gate.read(epcs[1])
      await pause(300)
      expect(await logged()).toHaveLength(1)
      expect(gate.heard).toBe('')
    })

    it('watches it again when the sale is taken back', async () => {
      const voided = await alpha.post(`/api/sales/${saleId}/void`).send({ reason: 'Xato urilgan' })
      expect(voided.status).toBeLessThan(300)
      await eventually(async () => {
        gate.read(epcs[1])
        await pause(100)
        expect((await logged()).map((event) => event.epc)).toEqual([epcs[1], epcs[0]])
      })
      expect(gate.heard).toContain('ALARM\n')
    })
  })

  describe('rights and separation', () => {
    it('shows the log to those in the shop, and the setting up to those who manage devices', async () => {
      expect(await logged(cashier)).toHaveLength(2)
      await cashier.get('/api/devices/readers').expect(403)
      await keeper.get('/api/gate-events').expect(403)
      const found = (await alpha.get('/api/gate-events').query({ q: 'futbolka' }).expect(200)).body
      expect(found.total).toBe(2)
      expect((await alpha.get('/api/gate-events').query({ q: 'shim' }).expect(200)).body.total).toBe(0)
    })

    it('shows one business nothing of another', async () => {
      expect(await logged(beta)).toHaveLength(0)
      expect((await beta.get('/api/devices/readers').expect(200)).body).toEqual([])
      await beta.delete(`/api/devices/readers/${gateId}`).expect(404)
      const foreign = await beta
        .post('/api/devices/readers')
        .send({ name: 'Begona', kind: 'gate', agentId, locationId: shopId, host: '127.0.0.1', port: 9 })
      expect(foreign.status).toBe(400)
    })

    it('stops listening to a reader that is taken away', async () => {
      await alpha.delete(`/api/devices/readers/${deskId}`).expect(204)
      const before = sent('reader.tag').length
      await pause(300)
      desk.read(epcs[2])
      await pause(300)
      expect(sent('reader.tag')).toHaveLength(before)
    })
  })

  // Said by hand over a line of its own. The same key on a second line replaces the first, as it would
  // for the real program, so the agent above is gone from here on.
  describe('what an agent is told and believed', () => {
    let line: Socket

    it('is told every piece that may not leave, then only what changed', async () => {
      line = startAgentSocket()
      const whole = await line.timeout(5000).emitWithAck('units', {})
      expect(whole).toMatchObject({ released: [], more: false })
      expect([...whole.guarded].sort()).toEqual([...epcs].sort())

      await sql(`UPDATE rfid_units SET status = 'sold' WHERE epc = $1`, [epcs[0]])
      const changed = await line.timeout(5000).emitWithAck('units', { since: whole.cursor })
      expect(changed.released).toContain(epcs[0])
      expect(changed.guarded).not.toContain(epcs[0])
      // A question that makes no sense is answered too, with no list.
      expect(await line.timeout(5000).emitWithAck('units', { since: 'yesterday' })).toEqual({ failed: true })
    })

    it('is not believed about a piece the server knows to be sold', async () => {
      // An agent a moment behind: it still thinks the piece is on the shelf, and has rung for it.
      const answer = await line.timeout(5000).emitWithAck('alarm', {
        readerId: gateId,
        epc: epcs[0],
        at: new Date().toISOString(),
      })
      expect(answer).toEqual({ ok: false })
      expect(await logged()).toHaveLength(2)
      // Nor about a reader that is not its own.
      const foreign = await line.timeout(5000).emitWithAck('alarm', {
        readerId: randomUUID(),
        epc: epcs[2],
        at: new Date().toISOString(),
      })
      expect(foreign).toEqual({ ok: false })
      expect(await logged()).toHaveLength(2)
    })
  })

  /** A bare connection with the agent's key: what an agent would say, said by hand. */
  function startAgentSocket(): Socket {
    const socket = startAgent({ url: apiUrl, key: agentKey, openReader: () => ({ alarm() {}, close() {} }) })
    sockets.push(socket)
    return socket
  }
})
