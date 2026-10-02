import { hostname } from 'node:os'

import { io, type Socket } from 'socket.io-client'

import { isLocalHost, sendToPrinter } from './printer'

export const VERSION = '0.1.0'

export interface AgentOptions {
  /** Where the system lives: https://erp.example.uz */
  url: string
  /** The key shown once when the agent was added under "Qurilmalar". */
  key: string
  log?: (line: string) => void
  /** The server will not have this agent: the key is wrong or was replaced. */
  onRefused?: (reason: string) => void
}

interface PrintOrder {
  id: string
  host: string
  port: number
  data: string
}

type Answer = (result: { ok: true } | { ok: false; error: string }) => void

/**
 * Connects out to the server and stays on the line. The server is on the
 * internet and cannot see the shop's printers; the agent is in the shop and
 * can. So the server sends finished print jobs down this connection and the
 * agent passes each one to the printer it is addressed to.
 *
 * The connection is always opened from here, so the shop needs no fixed
 * address and no open port; a dropped line is redialled without anyone's help.
 */
export function startAgent(options: AgentOptions): Socket {
  const log = options.log ?? (() => undefined)
  const socket = io(`${options.url.replace(/\/+$/, '')}/agent`, {
    auth: { key: options.key, hostname: hostname(), version: VERSION },
    transports: ['websocket', 'polling'],
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30_000,
  })

  socket.on('welcome', ({ name }: { name: string }) => log(`Ulandi: ${name}`))
  socket.on('disconnect', (reason) => log(`Aloqa uzildi (${reason})`))
  socket.on('connect_error', (error) => log(`Ulanib bo'lmadi: ${error.message}`))

  socket.on('refused', ({ reason }: { reason: string }) => {
    log(`Server rad etdi: ${reason}`)
    // Redialling with the same key would only be refused again.
    socket.io.reconnection(false)
    options.onRefused?.(reason)
  })

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
