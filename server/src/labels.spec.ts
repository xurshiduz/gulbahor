import { createServer, type AddressInfo, type Server } from 'node:net'

import { startAgent } from '@gulbahor/agent'
import type { Socket } from 'socket.io-client'

import { PASSWORD, startApp, type Agent, type Harness } from './testing/harness'

const EPC = /^47554C[0-9A-F]{18}$/

/** Waits until `check` stops throwing: jobs travel to the agent after the request has returned. */
async function eventually<T>(check: () => Promise<T>, timeoutMs = 5000): Promise<T> {
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

/**
 * Labels and tagged pieces: every piece gets a code of its own that it
 * keeps, a receipt's pieces follow the receipt, and a job reaches a printer
 * only through the shop's agent.
 */
describe('Labels', () => {
  let harness: Harness
  let alpha: Agent
  let beta: Agent

  let shopId: string
  let shirt: string
  let scarf: string
  let receiptId: string

  /** Everything the pretend printer was sent. */
  let printed = ''
  let printerServer: Server
  let printerPort: number
  let apiUrl: string
  const sockets: Socket[] = []

  /** The shop agent itself, the program that runs on a shop computer, pointed at this server. */
  const connectAgent = (key: string): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const socket = startAgent({ url: apiUrl, key, onRefused: (reason) => reject(new Error(reason)) })
      sockets.push(socket)
      socket.once('welcome', () => resolve(socket))
      socket.once('connect_error', reject)
    })

  /** Reads the tables directly; outside a business's transaction that needs row-level security set aside. */
  const sql = <T>(query: string, params: unknown[] = []): Promise<T> =>
    harness.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return (await em.query(query, params)) as T
    })

  const print = (body: Record<string, unknown>, agent = alpha) =>
    agent.post('/api/labels/print').send({ size: '50x30', ...body })

  const units = (
    where = '',
  ): Promise<{ epc: string; unit_no: number | null; status: string; print_count: number; batch_id: string | null }[]> =>
    sql(`SELECT epc, unit_no, status, print_count, batch_id FROM rfid_units ${where} ORDER BY variant_id, unit_no, epc`)

  beforeAll(async () => {
    harness = await startApp()
    ;({ alpha, beta } = harness)
    await harness.app.listen(0)
    apiUrl = `http://127.0.0.1:${(harness.app.getHttpServer().address() as AddressInfo).port}`

    printerServer = createServer((connection) => {
      connection.setEncoding('utf8')
      connection.on('data', (chunk: string) => (printed += chunk))
    })
    await new Promise<void>((resolve) => printerServer.listen(0, '127.0.0.1', resolve))
    printerPort = (printerServer.address() as AddressInfo).port

    shopId = (await alpha.get('/api/locations')).body.items[0].id
    const retail = ((await alpha.get('/api/price-types')).body as { id: string; kind: string }[]).find(
      (type) => type.kind === 'retail',
    )!.id
    const product = async (name: string, amount: number) =>
      (
        await alpha
          .post('/api/products')
          .send({
            name,
            axisIds: [],
            variants: [{ valueIds: [] }],
            prices: [{ priceTypeId: retail, amount, currency: 'UZS' }],
          })
          .expect(201)
      ).body.variants[0].id as string
    shirt = await product('Futbolka', 95_000_00)
    scarf = await product('Sharf', 40_000_00)

    receiptId = (
      await alpha
        .post('/api/receipts')
        .send({
          locationId: shopId,
          docDate: '2026-10-01',
          currency: 'USD',
          usdRate: 1,
          uzsRate: 12_000,
          lines: [
            { variantId: shirt, qty: 3, price: 300 },
            { variantId: scarf, qty: 2, price: 200 },
            // The same model again on a line of its own: its pieces carry on from the first line's.
            { variantId: shirt, qty: 2, price: 350 },
          ],
        })
        .expect(201)
    ).body.id
  }, 60_000)

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect())
    await new Promise((resolve) => (printerServer ? printerServer.close(resolve) : resolve(undefined)))
    await harness?.close()
  })

  describe('a plain label', () => {
    it('is a barcode and a price, repeated, and remembers no pieces', async () => {
      const result = await print({ items: [{ variantId: shirt, count: 4 }] }).expect(200)
      expect(result.body).toMatchObject({ count: 4, job: null })
      expect(result.body.file.name).toMatch(/\.zpl$/)
      const zpl: string = result.body.file.zpl
      expect(zpl).toContain('^FDFutbolka^FS')
      expect(zpl).toContain("^FD95 000 so'm^FS")
      expect(zpl).toContain('^BEN,')
      expect(zpl).toContain('^PQ4')
      expect(zpl).not.toContain('^RFW')
      expect(await units()).toHaveLength(0)
    })

    it('leaves the price off when asked to', async () => {
      const result = await print({ items: [{ variantId: shirt, count: 1 }], withPrice: false }).expect(200)
      expect(result.body.file.zpl).not.toContain("so'm")
    })

    it('is laid out the way the business set its labels', async () => {
      const usual: string = (await print({ items: [{ variantId: shirt, count: 1 }] }).expect(200)).body.file.zpl
      expect(usual).toContain('^A0N,24,24^FB368,2,0,L,0^FDFutbolka^FS')
      const org = (
        await alpha
          .put('/api/org/label')
          .send({ nameLines: 1, showSku: false, showTag: false, text: 'large' })
          .expect(200)
      ).body
      // What was not sent is as every business starts with it.
      expect(org.settings.label).toEqual({
        showName: true,
        nameLines: 1,
        showDetails: true,
        showBarcode: true,
        showSku: false,
        showTag: false,
        text: 'large',
        bigPrice: false,
      })
      const set: string = (await print({ items: [{ variantId: shirt, count: 1 }] }).expect(200)).body.file.zpl
      expect(set).toContain('^A0N,29,29^FB368,1,0,L,0^FDFutbolka^FS')
      expect(set).toContain("^A0N,36,36^FD95 000 so'm^FS")
      // Nothing in the corner: the article was the only thing set to the right.
      expect(usual).toContain(',R,0^FD')
      expect(set).not.toContain(',R,0^FD')

      // A label with nothing to know the goods by is no label.
      const refused = await alpha.put('/api/org/label').send({ showName: false, showBarcode: false, showSku: false })
      expect(refused.status).toBe(400)
      // Back as it was, for what follows.
      expect((await alpha.put('/api/org/label').send({}).expect(200)).body.settings.label).toMatchObject({
        nameLines: 2,
        showSku: true,
        text: 'normal',
      })
    })
  })

  describe('a tagged label', () => {
    it('needs the RFID module', async () => {
      const refused = await print({ receiptId, rfid: true, items: [{ variantId: shirt, count: 1 }] }).expect(403)
      expect(refused.body.error.code).toBe('MODULE_OFF')
      await alpha
        .put('/api/org/modules')
        .send({ modules: ['consignment', 'rfid'] })
        .expect(200)
    })

    it('gives each piece of a receipt a code of its own', async () => {
      const result = await print({
        receiptId,
        rfid: true,
        items: [
          { variantId: shirt, count: 2 },
          { variantId: scarf, count: 2 },
        ],
      }).expect(200)
      expect(result.body.count).toBe(4)

      const made = await units()
      expect(made).toHaveLength(4)
      expect(new Set(made.map((unit) => unit.epc)).size).toBe(4)
      for (const unit of made) {
        expect(unit.epc).toMatch(EPC)
        expect(unit).toMatchObject({ status: 'ready', print_count: 1, batch_id: null })
      }
      // One block per piece, each writing its own code to the chip.
      const zpl: string = result.body.file.zpl
      expect(zpl.match(/\^XA/g)).toHaveLength(4)
      for (const unit of made) {
        expect(zpl).toContain(`^RFW,H^FD${unit.epc}^FS`)
      }
    })

    it('does not print more pieces than the receipt has', async () => {
      const refused = await print({ receiptId, rfid: true, items: [{ variantId: shirt, count: 6 }] }).expect(400)
      expect(refused.body.error.fields['items.0.count']).toBe('Hujjatda bu tovardan 5 dona bor')
    })

    it('prints only what is new, and keeps a code when a label is printed again', async () => {
      const before = await units()
      const rest = await print({
        receiptId,
        rfid: true,
        onlyNew: true,
        items: [
          { variantId: shirt, count: 5 },
          { variantId: scarf, count: 2 },
        ],
      }).expect(200)
      expect(rest.body.count).toBe(3)

      const status = (await alpha.get(`/api/labels/receipts/${receiptId}`).expect(200)).body
      expect(status.items).toEqual(
        expect.arrayContaining([
          { variantId: shirt, units: 5, printed: 5 },
          { variantId: scarf, units: 2, printed: 2 },
        ]),
      )
      await print({ receiptId, rfid: true, onlyNew: true, items: [{ variantId: shirt, count: 5 }] }).expect(409)

      // A torn label: the same piece, the same code.
      const again = await print({ receiptId, rfid: true, items: [{ variantId: scarf, count: 2 }] }).expect(200)
      expect(again.body.count).toBe(2)
      const after = await units()
      expect(after).toHaveLength(7)
      for (const unit of before) {
        expect(after.map((row) => row.epc)).toContain(unit.epc)
      }
    })

    it('puts the pieces on hand when the receipt is posted, each with its own batch', async () => {
      await alpha.post(`/api/receipts/${receiptId}/post`).expect(201)
      const all = await units()
      expect(all.every((unit) => unit.status === 'in_stock' && unit.batch_id)).toBe(true)

      // Shirts 1-3 came on the first line, 4-5 on the third: two batches at two costs.
      const shirts: { unit_no: number; cost_usd: string }[] = await sql(
        `SELECT u.unit_no, b.cost_usd FROM rfid_units u JOIN stock_batches b ON b.id = u.batch_id
         WHERE u.variant_id = $1 ORDER BY u.unit_no`,
        [shirt],
      )
      expect(shirts.map((row) => Number(row.cost_usd))).toEqual([900, 900, 900, 700, 700])
    })

    it('finds the piece by its code however the reader spells it', async () => {
      const [unit] = await units()
      const found = (
        await alpha
          .get('/api/products/lookup')
          .query({ code: `3000${unit.epc.toLowerCase()}` })
          .expect(200)
      ).body
      expect(found).toMatchObject({ epc: unit.epc, productName: expect.any(String) })
      const stranger = await alpha.get('/api/products/lookup').query({ code: '303400000000000000000001' }).expect(404)
      expect(stranger.body.error.message).toBe('Bu RFID belgi tizimda yo‘q')
      // Another business reading our tag learns nothing.
      await beta.get('/api/products/lookup').query({ code: unit.epc }).expect(404)
    })

    it('tags goods that are already on hand, a new piece each time', async () => {
      await print({ rfid: true, items: [{ variantId: scarf, count: 2 }] }).expect(400)
      const result = await print({ rfid: true, locationId: shopId, items: [{ variantId: scarf, count: 2 }] }).expect(
        200,
      )
      expect(result.body.count).toBe(2)
      const loose = await units('WHERE receipt_id IS NULL')
      expect(loose).toHaveLength(2)
      expect(loose.every((unit) => unit.status === 'in_stock' && unit.unit_no === null)).toBe(true)
    })

    it('voids the pieces of a cancelled receipt', async () => {
      await alpha.post(`/api/receipts/${receiptId}/cancel`).expect(201)
      const mine = await units(`WHERE receipt_id = '${receiptId}'`)
      expect(mine).toHaveLength(7)
      expect(mine.every((unit) => unit.status === 'void')).toBe(true)
      await alpha.get('/api/products/lookup').query({ code: mine[0].epc }).expect(404)
      await print({ receiptId, rfid: true, items: [{ variantId: shirt, count: 1 }] }).expect(409)
    })
  })

  describe('printing through an agent', () => {
    let agentId: string
    let key: string
    let printerId: string

    it('sets up an agent, whose key is shown once, and its printer', async () => {
      const created = (
        await alpha.post('/api/devices/agents').send({ name: 'Kassa kompyuteri', locationId: shopId }).expect(201)
      ).body
      expect(created.key).toHaveLength(43)
      expect(created).toMatchObject({ online: false, printers: 0, locationName: 'Alpha shop' })
      ;({ id: agentId, key } = created)
      const [listed] = (await alpha.get('/api/devices/agents').expect(200)).body
      expect(listed.key).toBeUndefined()
      const [{ key_hash: stored }] = await sql<{ key_hash: string }[]>(`SELECT key_hash FROM agents WHERE id = $1`, [
        agentId,
      ])
      expect(stored).not.toBe(key)

      const printer = {
        name: 'CP30',
        agentId,
        host: '127.0.0.1',
        port: printerPort,
        dpi: 203,
        labelSize: '50x30',
        rfid: true,
      }
      const outside = await alpha.post('/api/devices/printers').send({ ...printer, host: 'printer.example.com' })
      expect(outside.status).toBe(400)
      expect(outside.body.error.fields.host).toBeDefined()
      printerId = (await alpha.post('/api/devices/printers').send(printer).expect(201)).body.id
      await alpha.post('/api/devices/printers').send(printer).expect(400)
    })

    it('holds a job while the agent is away and delivers it when it connects', async () => {
      const queued = await print({ printerId, items: [{ variantId: scarf, count: 3 }] }).expect(200)
      expect(queued.body).toMatchObject({ count: 3, file: null, job: { status: 'queued', agentOnline: false } })

      await connectAgent(key)
      await eventually(async () => {
        const [job] = (await alpha.get('/api/labels/jobs').expect(200)).body.items
        expect(job).toMatchObject({ id: queued.body.job.id, status: 'done', agentOnline: true, printerName: 'CP30' })
      })
      expect(printed).toContain('^FDSharf^FS')
      expect(printed).toContain('^PQ3')
      const [agent] = (await alpha.get('/api/devices/agents').expect(200)).body
      expect(agent).toMatchObject({
        online: true,
        hostname: expect.any(String),
        version: expect.any(String),
        printers: 1,
      })
    })

    it('sends a job straight away to an agent that is on the line', async () => {
      printed = ''
      const test = (await alpha.post(`/api/devices/printers/${printerId}/test`).expect(200)).body
      await eventually(async () => {
        const jobs = (await alpha.get('/api/labels/jobs').expect(200)).body.items as { id: string; status: string }[]
        expect(jobs.find((job) => job.id === test.id)?.status).toBe('done')
      })
      expect(printed).toContain('^FDSinov: CP30^FS')
    })

    it('says so when the printer does not answer, and can try again', async () => {
      await new Promise((resolve) => printerServer.close(resolve))
      const failed = (await print({ printerId, items: [{ variantId: shirt, count: 1 }] }).expect(200)).body.job
      await eventually(async () => {
        const [job] = (await alpha.get('/api/labels/jobs').query({ status: 'failed' }).expect(200)).body.items
        expect(job).toMatchObject({ id: failed.id, status: 'failed' })
        expect(job.error).toMatch(/ECONNREFUSED/)
      })
      await alpha.post(`/api/labels/jobs/${failed.id}/cancel`).expect(409)

      await new Promise<void>((resolve) => printerServer.listen(printerPort, '127.0.0.1', resolve))
      printed = ''
      await alpha.post(`/api/labels/jobs/${failed.id}/retry`).expect(200)
      await eventually(async () => {
        const [job] = (await alpha.get('/api/labels/jobs').query({ status: 'done' }).expect(200)).body.items
        expect(job.id).toBe(failed.id)
      })
      expect(printed).toContain('^FDFutbolka^FS')
    })

    it('turns away a wrong key, and the old key once a new one is issued', async () => {
      await expect(connectAgent('not-a-key')).rejects.toThrow(/Kalit/)

      const renewed = (await alpha.post(`/api/devices/agents/${agentId}/key`).expect(200)).body
      expect(renewed.key).not.toBe(key)
      await eventually(async () => {
        const [agent] = (await alpha.get('/api/devices/agents').expect(200)).body
        expect(agent.online).toBe(false)
      })
      await expect(connectAgent(key)).rejects.toThrow(/Kalit/)
      await connectAgent(renewed.key)
      key = renewed.key
    })

    it('lets a queued job be cancelled, and cancels what waits for a deleted printer', async () => {
      sockets.forEach((socket) => socket.disconnect())
      await eventually(async () => {
        const [agent] = (await alpha.get('/api/devices/agents').expect(200)).body
        expect(agent.online).toBe(false)
      })
      const first = (await print({ printerId, items: [{ variantId: shirt, count: 1 }] }).expect(200)).body.job
      const second = (await print({ printerId, items: [{ variantId: shirt, count: 2 }] }).expect(200)).body.job
      expect((await alpha.post(`/api/labels/jobs/${first.id}/cancel`).expect(200)).body.status).toBe('cancelled')

      await alpha.delete(`/api/devices/printers/${printerId}`).expect(204)
      const jobs = (await alpha.get('/api/labels/jobs').expect(200)).body.items as { id: string; status: string }[]
      expect(jobs.find((job) => job.id === second.id)?.status).toBe('cancelled')
      await alpha.post(`/api/labels/jobs/${second.id}/retry`).expect(409)
    })
  })

  describe('rights and separation', () => {
    it('keeps printing and devices to those allowed', async () => {
      const roles = (await alpha.get('/api/roles')).body as { id: string; templateKey: string }[]
      const role = (templateKey: string) => roles.find((item) => item.templateKey === templateKey)!.id
      const hire = async (login: string, templateKey: string) => {
        await alpha
          .post('/api/users')
          .send({
            fullName: login,
            login,
            password: PASSWORD,
            roleIds: [role(templateKey)],
            allLocations: true,
            locationIds: [],
          })
          .expect(201)
        return harness.signIn(login)
      }
      const cashier = await hire('kassir', 'cashier')
      await print({ items: [{ variantId: shirt, count: 1 }] }, cashier).expect(403)
      await cashier.get('/api/devices/agents').expect(403)

      const keeper = await hire('omborchi', 'warehouse')
      await print({ items: [{ variantId: shirt, count: 1 }] }, keeper).expect(200)
      await keeper.get('/api/labels/printers').expect(200)
      await keeper.post('/api/devices/agents').send({ name: 'Yana bir agent' }).expect(403)
    })

    it('shows one business nothing of another', async () => {
      const agent = (await alpha.post('/api/devices/agents').send({ name: 'Sklad' }).expect(201)).body
      const printer = (
        await alpha
          .post('/api/devices/printers')
          .send({
            name: 'Sklad CP30',
            agentId: agent.id,
            host: '192.168.1.50',
            dpi: 300,
            labelSize: '60x40',
            rfid: true,
          })
          .expect(201)
      ).body

      expect((await beta.get('/api/devices/agents').expect(200)).body).toEqual([])
      expect((await beta.get('/api/labels/printers').expect(200)).body).toEqual([])
      expect((await beta.get('/api/labels/jobs').expect(200)).body.total).toBe(0)
      await beta.put(`/api/devices/agents/${agent.id}`).send({ name: 'Mine now' }).expect(404)
      await beta.delete(`/api/devices/printers/${printer.id}`).expect(404)
      await beta
        .post('/api/devices/printers')
        .send({ ...printer, name: 'Theirs' })
        .expect(400)
      await beta.get(`/api/labels/receipts/${receiptId}`).expect(404)
      // Beta has no such variant and no such printer.
      const refused = await print({ printerId: printer.id, items: [{ variantId: shirt, count: 1 }] }, beta).expect(400)
      expect(refused.body.error.fields.printerId).toBeDefined()
    })
  })
})
