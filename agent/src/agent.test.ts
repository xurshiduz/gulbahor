import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import { createServer, type AddressInfo, type Server } from 'node:net'

import { Server as IoServer, type Socket as ServerSocket } from 'socket.io'
import type { Socket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startAgent } from './agent'
import { isLocalHost, sendToPrinter } from './printer'

const KEY = 'the-right-key'

/**
 * The agent between a pretend server and a pretend printer: a job sent down
 * the line must come out of the printer's port, byte for byte.
 */
describe('agent', () => {
  let http: HttpServer
  let server: IoServer
  let url: string
  let printer: Server
  let printerPort: number
  let printed = ''
  const agents: Socket[] = []

  /** Starts an agent and gives back the server's end of its connection. */
  const connect = (key = KEY) =>
    new Promise<{ line: ServerSocket; refused: Promise<string> }>((resolve) => {
      let refuse: (reason: string) => void
      const refused = new Promise<string>((done) => (refuse = done))
      server.of('/agent').once('connection', (line) => resolve({ line, refused }))
      agents.push(startAgent({ url, key, onRefused: (reason) => refuse(reason) }))
    })

  const order = (line: ServerSocket, job: Record<string, unknown>) =>
    line.timeout(10_000).emitWithAck('print', { id: '1', host: '127.0.0.1', port: printerPort, data: '', ...job })

  beforeAll(async () => {
    http = createHttpServer()
    server = new IoServer(http)
    server.of('/agent').on('connection', (line) => {
      if (line.handshake.auth.key === KEY) {
        line.emit('welcome', { name: 'Test' })
      } else {
        line.emit('refused', { reason: "Kalit noto'g'ri" })
        line.disconnect(true)
      }
    })
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/`

    printer = createServer((connection) => {
      connection.setEncoding('utf8')
      connection.on('data', (chunk: string) => (printed += chunk))
    })
    await new Promise<void>((resolve) => printer.listen(0, '127.0.0.1', resolve))
    printerPort = (printer.address() as AddressInfo).port
  })

  afterAll(async () => {
    agents.forEach((agent) => agent.disconnect())
    await server.close()
    await new Promise((resolve) => printer.close(resolve))
  })

  it('says who it is and passes a job to the printer', async () => {
    const { line } = await connect()
    expect(line.handshake.auth).toMatchObject({ key: KEY, version: expect.any(String), hostname: expect.any(String) })

    const zpl = "^XA^CI28^FDKo'ylak · Қора^FS^XZ"
    expect(await order(line, { data: zpl })).toEqual({ ok: true })
    expect(printed).toBe(zpl)
  })

  it('reports a printer that does not answer', async () => {
    const { line } = await connect()
    const closed = await new Promise<number>((resolve) => {
      const spare = createServer().listen(0, '127.0.0.1', () => {
        const { port } = spare.address() as AddressInfo
        spare.close(() => resolve(port))
      })
    })
    const answer = await order(line, { port: closed, data: '^XA^XZ' })
    expect(answer.ok).toBe(false)
    expect(answer.error).toMatch(/ECONNREFUSED/)
  })

  it('sends nothing outside the shop network, whatever the server says', async () => {
    const { line } = await connect()
    printed = ''
    const answer = await order(line, { host: 'example.com', port: 80, data: 'GET / HTTP/1.0\r\n\r\n' })
    expect(answer).toEqual({ ok: false, error: 'example.com lokal tarmoq manzili emas' })
    expect(printed).toBe('')
  })

  it('stops calling when its key is refused', async () => {
    const { refused } = await connect('a-wrong-key')
    expect(await refused).toMatch(/Kalit/)
    const agent = agents[agents.length - 1]
    expect(agent.io.reconnection()).toBe(false)
  })
})

describe('printer', () => {
  it('knows a local address from one on the internet', () => {
    for (const host of ['192.168.1.50', '10.0.0.7', '172.20.1.1', '127.0.0.1', 'printer', 'cp30.local']) {
      expect(isLocalHost(host), host).toBe(true)
    }
    for (const host of ['8.8.8.8', '172.32.0.1', 'example.com', '256.1.1.1', '']) {
      expect(isLocalHost(host), host).toBe(false)
    }
  })

  it('gives up on an address nothing answers at', async () => {
    await expect(sendToPrinter('10.255.255.1', 9100, 'x', 300)).rejects.toThrow()
  })
})
