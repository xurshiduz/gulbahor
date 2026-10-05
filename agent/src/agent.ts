import { hostname } from 'node:os'

import { io, type Socket } from 'socket.io-client'

import { isLocalHost, sendToPrinter } from './printer'
import { Guard, openLineReader, Presence, type OpenReader, type ReaderConfig, type ReaderLink } from './readers'

export const VERSION = '0.2.0'

export interface AgentOptions {
  /** Where the system lives: https://erp.example.uz */
  url: string
  /** The key shown once when the agent was added under "Qurilmalar". */
  key: string
  log?: (line: string) => void
  /** The server will not have this agent: the key is wrong or was replaced. */
  onRefused?: (reason: string) => void
  /** How a reader is listened to; the tests put a pretend one here. */
  openReader?: OpenReader
}

interface PrintOrder {
  id: string
  host: string
  port: number
  data: string
}

type Answer = (result: { ok: true } | { ok: false; error: string }) => void

interface UnitsReply {
  guarded: string[]
  released: string[]
  cursor: string
  more: boolean
}

/** The whole list of pieces that may not leave is fetched afresh this often, in case a change was missed. */
const FULL_SYNC_MS = 10 * 60_000

/**
 * Connects out to the server and stays on the line. The server is on the
 * internet and cannot see the shop's printers and readers; the agent is in
 * the shop and can. So the server sends finished print jobs down this
 * connection and the agent passes each one to the printer it is addressed
 * to; and the agent listens to the shop's readers and says what they saw.
 *
 * The gate does not wait for the server: the agent keeps the list of
 * pieces that may not leave and sounds the alarm by itself. The server is
 * told afterwards.
 *
 * The connection is always opened from here, so the shop needs no fixed
 * address and no open port; a dropped line is redialled without anyone's help.
 */
export function startAgent(options: AgentOptions): Socket {
  const log = options.log ?? (() => undefined)
  const openReader = options.openReader ?? openLineReader
  const socket = io(`${options.url.replace(/\/+$/, '')}/agent`, {
    auth: { key: options.key, hostname: hostname(), version: VERSION },
    transports: ['websocket', 'polling'],
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30_000,
  })

  // ── Readers ──
  const guard = new Guard()
  const links = new Map<string, { config: ReaderConfig; link: ReaderLink; connected: boolean }>()
  let configured = ''
  let cursor: string | null = null
  let syncing = false
  let wanted: 'none' | 'changes' | 'all' = 'none'

  const hasGate = () => [...links.values()].some((reader) => reader.config.kind === 'gate')

  const ask = (request: { since?: string | null; after?: string | null }): Promise<UnitsReply | null> =>
    socket.connected
      ? (socket.timeout(20_000).emitWithAck('units', request) as Promise<Partial<UnitsReply> | null>).then(
          // Anything that is not a list is the server saying it could not answer.
          (reply) => (reply && Array.isArray(reply.guarded) ? (reply as UnitsReply) : null),
          () => null,
        )
      : Promise.resolve(null)

  /** Brings the list of pieces that may not leave up to date; `all` fetches it whole. */
  const sync = async (all = false) => {
    if (syncing) {
      wanted = all || wanted === 'all' ? 'all' : 'changes'
      return
    }
    if (!hasGate()) {
      return
    }
    syncing = true
    try {
      if (all || !cursor) {
        const epcs: string[] = []
        let first: string | null = null
        let after: string | null = null
        for (;;) {
          const reply = await ask({ after })
          if (!reply) {
            // The old list is better than none: it stays until the server answers.
            return
          }
          first ??= reply.cursor
          epcs.push(...reply.guarded)
          if (!reply.more || !reply.guarded.length) {
            break
          }
          after = reply.guarded[reply.guarded.length - 1]
        }
        guard.replace(epcs)
        cursor = first
        log(`Darvoza ro'yxati yangilandi: ${guard.size} ta sotilmagan dona`)
      } else {
        const reply = await ask({ since: cursor })
        if (reply) {
          guard.apply(reply.guarded, reply.released)
          cursor = reply.cursor
        }
      }
    } finally {
      syncing = false
      const next = wanted
      wanted = 'none'
      if (next !== 'none') {
        void sync(next === 'all')
      }
    }
  }

  const closeReaders = () => {
    for (const reader of links.values()) {
      reader.link.close()
    }
    links.clear()
    configured = ''
  }

  const setReaders = (configs: ReaderConfig[]) => {
    const next = JSON.stringify(configs)
    if (next === configured) {
      // The same readers after a redial: the server has forgotten which are on the line.
      for (const reader of links.values()) {
        socket.emit('reader', { readerId: reader.config.id, connected: reader.connected })
      }
      // And what was sold while the line was down has not been heard of.
      void sync(true)
      return
    }
    closeReaders()
    configured = next
    for (const config of configs) {
      if (!isLocalHost(config.host)) {
        log(`O'quvchi rad etildi: ${config.host} lokal tarmoq manzili emas`)
        continue
      }
      const presence = new Presence()
      const entry = { config, connected: false, link: undefined as unknown as ReaderLink }
      entry.link = openReader(config, {
        onState: (connected) => {
          entry.connected = connected
          log(`O'quvchi ${config.host}:${config.port} ${connected ? 'ulandi' : 'uzildi'}`)
          socket.emit('reader', { readerId: config.id, connected })
        },
        onTag: (epc) => {
          if (config.kind === 'desk') {
            if (presence.arrived(epc)) {
              socket.emit('tag', { readerId: config.id, epc })
            }
          } else if (guard.alarms(epc)) {
            entry.link.alarm()
            log(`DARVOZA: sotilmagan dona ${epc}`)
            // Kept and sent when the line is back, if it is down now: the log must not lose it.
            socket.emit('alarm', { readerId: config.id, epc, at: new Date().toISOString() })
          }
        },
      })
      links.set(config.id, entry)
    }
    void sync(true)
  }

  const refresh = setInterval(() => void sync(true), FULL_SYNC_MS)
  refresh.unref()

  socket.on('readers', (configs: ReaderConfig[]) => setReaders(Array.isArray(configs) ? configs : []))
  socket.on('units.changed', () => void sync())

  // ── The line ──
  socket.on('welcome', ({ name }: { name: string }) => log(`Ulandi: ${name}`))
  socket.on('disconnect', (reason) => {
    log(`Aloqa uzildi (${reason})`)
    // Closed from here: the program is stopping. A line that merely dropped leaves the gate working.
    if (reason === 'io client disconnect') {
      clearInterval(refresh)
      closeReaders()
    }
  })
  socket.on('connect_error', (error) => log(`Ulanib bo'lmadi: ${error.message}`))

  socket.on('refused', ({ reason }: { reason: string }) => {
    log(`Server rad etdi: ${reason}`)
    // Redialling with the same key would only be refused again.
    socket.io.reconnection(false)
    clearInterval(refresh)
    closeReaders()
    options.onRefused?.(reason)
  })

  // ── Printers ──
  socket.on('print', (order: PrintOrder, answer: Answer) => {
    if (!isLocalHost(order.host)) {
      log(`Rad etildi: ${order.host} lokal tarmoq manzili emas`)
      answer({ ok: false, error: `${order.host} lokal tarmoq manzili emas` })
      return
    }
    sendToPrinter(order.host, order.port, order.data).then(
      () => {
        log(`Chop etildi: ${order.host}:${order.port}`)
        answer({ ok: true })
      },
      (error: Error) => {
        log(`Printerga yuborilmadi (${order.host}:${order.port}): ${error.message}`)
        answer({ ok: false, error: `Printerga ulanib bo'lmadi (${order.host}:${order.port}): ${error.message}` })
      },
    )
  })

  return socket
}
