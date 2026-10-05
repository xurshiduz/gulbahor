import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import { createServer, type AddressInfo, type Server, type Socket as NetSocket } from 'node:net'

import { Server as IoServer, type Socket as ServerSocket } from 'socket.io'
import type { Socket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startAgent } from './agent'
import { Guard, openLineReader, Presence } from './readers'

const UNSOLD = '47554C000000000000000001'
const SOLD = '47554C000000000000000002'
const NEW = '47554C000000000000000003'

const until = async (check: () => boolean, what: string, ms = 5000) => {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > ms) {
      throw new Error(`Timed out waiting for ${what}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/** A pretend reader: it sends what it "reads" to whoever is connected and remembers what it was told. */
class FakeReader {
  server: Server
  port = 0
  heard = ''
  private lines: NetSocket[] = []

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

  get connected() {
    return this.lines.length > 0
  }

  read(text: string) {
    this.lines.forEach((line) => line.write(text))
  }

  async stop() {
    this.lines.forEach((line) => line.destroy())
    await new Promise((resolve) => this.server.close(resolve))
  }
}

describe('the guard at the door', () => {
  it('stays silent until it has been told which pieces may not leave', () => {
    const guard = new Guard()
    expect(guard.ready).toBe(false)
    expect(guard.alarms(UNSOLD)).toBe(false)
    // What changed means nothing without the list it changed.
    guard.apply([UNSOLD], [])
    expect(guard.alarms(UNSOLD)).toBe(false)
  })

  it('rings for a piece that has not been sold, once while it stands in the doorway', () => {
    let now = 0
    const guard = new Guard(10_000, () => now)
    guard.replace([UNSOLD])
    expect(guard.alarms(UNSOLD)).toBe(true)
    now = 4000
    expect(guard.alarms(UNSOLD)).toBe(false)
    now = 10_000
    expect(guard.alarms(UNSOLD)).toBe(true)
    // A piece that was paid for, and one that is not ours, pass.
    expect(guard.alarms(SOLD)).toBe(false)
  })

  it('follows what is sold and what comes back', () => {
    const guard = new Guard()
    guard.replace([UNSOLD, SOLD])
    guard.apply([NEW], [SOLD])
    expect(guard.size).toBe(2)
    expect(guard.alarms(SOLD)).toBe(false)
    expect(guard.alarms(NEW)).toBe(true)
    // Brought back and on the shelf again: watched again, at once.
    guard.apply([SOLD], [])
    expect(guard.alarms(SOLD)).toBe(true)
  })
})

describe("what lies on a till's reader", () => {
  it('is told of once, however often it is read, until it is lifted and laid down again', () => {
    let now = 0
    const presence = new Presence(3000, () => now)
    expect(presence.arrived(UNSOLD)).toBe(true)
    for (now = 100; now < 6000; now += 100) {
      expect(presence.arrived(UNSOLD)).toBe(false)
    }
    // Another piece beside it is its own arrival.
    expect(presence.arrived(NEW)).toBe(true)
    now += 3001
    expect(presence.arrived(UNSOLD)).toBe(true)
  })
})

describe('a reader heard as lines of text', () => {
  it("gives the codes it reads, whatever follows them, and nothing that is not a tag's code", async () => {
    const reader = new FakeReader()
    await reader.start()
    const tags: string[] = []
    const states: boolean[] = []
    const link = openLineReader(
      { id: 'r', kind: 'gate', host: '127.0.0.1', port: reader.port },
      { onTag: (epc) => tags.push(epc), onState: (connected) => states.push(connected) },
    )
    await until(() => reader.connected, 'the link')
    // Lower case, with an antenna and a signal after it; split across two packets; and rubbish.
    reader.read(`${UNSOLD.toLowerCase()},1,-52\r\nhello\n4755`)
    reader.read(`${SOLD.slice(4)} 2\n123\n`)
    await until(() => tags.length === 2, 'two tags')
    expect(tags).toEqual([UNSOLD, SOLD])

    link.alarm()
    await until(() => reader.heard === 'ALARM\n', 'the alarm')

    link.close()
    await until(() => states.length === 2, 'the link to close')
    expect(states).toEqual([true, false])
    await reader.stop()
  })

  it('reaches no further than the shop network', async () => {
    const states: boolean[] = []
    const link = openLineReader(
      { id: 'r', kind: 'gate', host: 'example.com', port: 80 },
      { onTag: () => undefined, onState: (connected) => states.push(connected) },
    )
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(states).toEqual([])
    link.close()
  })
})

/** The agent between a pretend server and pretend readers. */
describe('the agent and its readers', () => {
  let http: HttpServer
  let server: IoServer
  let url: string
  let agent: Socket
  let line: ServerSocket
  const gate = new FakeReader()
  const desk = new FakeReader()
  const alarms: { readerId: string; epc: string; at: string }[] = []
  const tags: { readerId: string; epc: string }[] = []
  const states: { readerId: string; connected: boolean }[] = []
  const asked: { since?: string | null; after?: string | null }[] = []
  /** What the server says may not leave, and what it says changed. */
  let guarded = [UNSOLD, SOLD]
  let changes: { guarded: string[]; released: string[] } = { guarded: [], released: [] }

  beforeAll(async () => {
    await gate.start()
    await desk.start()
    http = createHttpServer()
    server = new IoServer(http)
    server.of('/agent').on('connection', (socket) => {
      line = socket
      socket.on('alarm', (alarm) => alarms.push(alarm))
      socket.on('tag', (tag) => tags.push(tag))
      socket.on('reader', (state) => states.push(state))
      socket.on('units', (request: { since?: string | null; after?: string | null }, answer) => {
        asked.push(request)
        if (request.since) {
          answer({ ...changes, cursor: '2026-10-02T10:00:01.000Z', more: false })
        } else if (!request.after) {
          // The whole list comes a page at a time.
          answer({ guarded: guarded.slice(0, 1), released: [], cursor: '2026-10-02T10:00:00.000Z', more: true })
        } else {
          answer({ guarded: guarded.slice(1), released: [], cursor: '2026-10-02T10:00:00.500Z', more: false })
        }
      })
      socket.emit('welcome', { name: 'Test' })
      socket.emit('readers', [
        { id: 'gate-1', kind: 'gate', host: '127.0.0.1', port: gate.port },
        { id: 'desk-1', kind: 'desk', host: '127.0.0.1', port: desk.port },
      ])
    })
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
    agent = startAgent({ url, key: 'key' })
    await until(() => gate.connected && desk.connected, 'both readers')
    await until(() => asked.length >= 2, 'the list of pieces')
  })

  afterAll(async () => {
    agent.disconnect()
    await server.close()
    await gate.stop()
    await desk.stop()
  })

  it('says which readers it has on the line and fetches the whole list, page by page', async () => {
    await until(() => states.length === 2, 'both states')
    expect(states).toEqual(
      expect.arrayContaining([
        { readerId: 'gate-1', connected: true },
        { readerId: 'desk-1', connected: true },
      ]),
    )
    expect(asked.slice(0, 2)).toEqual([{ after: null }, { after: UNSOLD }])
  })

  it('sounds the gate for an unsold piece by itself, and tells the server afterwards', async () => {
    gate.read(`${UNSOLD}\n${UNSOLD}\n${UNSOLD}\n`)
    await until(() => alarms.length === 1, 'the alarm')
    await until(() => gate.heard === 'ALARM\n', 'the siren')
    expect(alarms[0]).toMatchObject({ readerId: 'gate-1', epc: UNSOLD })
    expect(Number.isNaN(Date.parse(alarms[0].at))).toBe(false)
    // Read three times in the doorway, rung once; a tag nobody knows passes.
    gate.read(`${NEW}\n`)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(alarms).toHaveLength(1)
  })

  it('lets a piece through once it hears it was sold, from where it last asked', async () => {
    changes = { guarded: [NEW], released: [SOLD] }
    line.emit('units.changed', {})
    await until(() => asked.some((request) => request.since), 'the question')
    expect(asked.at(-1)).toEqual({ since: '2026-10-02T10:00:00.000Z' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    gate.read(`${SOLD}\n`)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(alarms).toHaveLength(1)
    gate.read(`${NEW}\n`)
    await until(() => alarms.length === 2, 'the second alarm')
    expect(alarms[1].epc).toBe(NEW)
  })

  it('tells the till once of a piece laid on its reader, and never sounds anything for it', async () => {
    desk.read(`${UNSOLD}\n${UNSOLD}\n${SOLD}\n${UNSOLD}\n`)
    await until(() => tags.length === 2, 'two tags')
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(tags).toEqual([
      { readerId: 'desk-1', epc: UNSOLD },
      { readerId: 'desk-1', epc: SOLD },
    ])
    expect(desk.heard).toBe('')
  })

  it('leaves the readers alone when the same ones are named again, and takes up new ones', async () => {
    const before = states.length
    guarded = [UNSOLD]
    line.emit('readers', [
      { id: 'gate-1', kind: 'gate', host: '127.0.0.1', port: gate.port },
      { id: 'desk-1', kind: 'desk', host: '127.0.0.1', port: desk.port },
    ])
    // The server is told again which are on the line; nothing is redialled.
    await until(() => states.length === before + 2, 'the states again')
    expect(states.slice(before).every((state) => state.connected)).toBe(true)

    line.emit('readers', [{ id: 'gate-1', kind: 'gate', host: '127.0.0.1', port: gate.port }])
    await until(() => !desk.connected, 'the desk reader to be dropped')
    expect(gate.connected).toBe(true)
  })
})
