import { Socket } from 'node:net'

import { isLocalHost } from './printer'

/** A reader the server has told this agent to listen to. */
export interface ReaderConfig {
  id: string
  /** `desk`: on a till's counter. `gate`: at the shop's door. */
  kind: 'desk' | 'gate'
  host: string
  port: number
}

export interface ReaderHandlers {
  /** A tag was read. The same tag comes again and again for as long as it is in the field. */
  onTag: (epc: string) => void
  /** The reader came on the line, or dropped off it. */
  onState: (connected: boolean) => void
}

export interface ReaderLink {
  /** Sounds the gate's light and siren. */
  alarm(): void
  close(): void
}

export type OpenReader = (config: ReaderConfig, handlers: ReaderHandlers) => ReaderLink

/** The codes our own labels carry: 96 bits, written as 24 hex digits. */
const EPC = /^[0-9A-F]{24}$/

const RETRY_MS = 3000

/**
 * A reader heard as lines of text over TCP: every line is the code of a
 * tag it has just read (anything after a comma, a semicolon or a space is
 * ignored: antenna, signal strength). Writing `ALARM` and a new line to
 * the same connection sounds the gate.
 *
 * This is what a reader's own program is expected to speak once it is set
 * to send what it reads to a network port; where a reader only talks
 * through its maker's library, a few lines written with that library turn
 * it into this. The connection is redialled for as long as the link is
 * open, so a reader that is switched on later is picked up by itself.
 */
export const openLineReader: OpenReader = (config, handlers) => {
  let socket: Socket | null = null
  let timer: NodeJS.Timeout | undefined
  let closed = false
  let connected = false

  const setState = (next: boolean) => {
    if (connected !== next) {
      connected = next
      handlers.onState(next)
    }
  }

  const dial = () => {
    if (closed) {
      return
    }
    let rest = ''
    const line = new Socket()
    socket = line
    line.setEncoding('utf8')
    line.setKeepAlive(true, 10_000)
    line.on('connect', () => setState(true))
    line.on('data', (chunk: string) => {
      const lines = (rest + chunk).split(/\r?\n/)
      rest = lines.pop() ?? ''
      // A reader gone mad must not fill the memory with a line that never ends.
      if (rest.length > 4096) {
        rest = ''
      }
      for (const text of lines) {
        const code = text
          .trim()
          .split(/[\s,;]/)[0]
          .toUpperCase()
        if (EPC.test(code)) {
          handlers.onTag(code)
        }
      }
    })
    line.on('error', () => undefined)
    line.on('close', () => {
      setState(false)
      if (!closed) {
        timer = setTimeout(dial, RETRY_MS)
      }
    })
    line.connect(config.port, config.host)
  }

  if (isLocalHost(config.host)) {
    dial()
  }

  return {
    alarm() {
      if (connected) {
        socket?.write('ALARM\n')
      }
    },
    close() {
      closed = true
      clearTimeout(timer)
      socket?.destroy()
    },
  }
}

/**
 * What stands at the door. It knows which pieces may not leave and says,
 * for each tag the gate reads, whether to sound the alarm.
 *
 * Until the first list has come from the server nothing is known, and the
 * gate stays silent rather than ring for everything.
 */
export class Guard {
  private guarded: Set<string> | null = null
  private readonly rang = new Map<string, number>()

  constructor(
    /** A piece standing in the doorway is read many times a second; the gate goes off for it once in this long. */
    private readonly holdMs = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  get ready(): boolean {
    return this.guarded !== null
  }

  get size(): number {
    return this.guarded?.size ?? 0
  }

  /** The whole list, as the server has it now. */
  replace(epcs: Iterable<string>) {
    this.guarded = new Set(epcs)
  }

  /** What changed since the list was last brought up to date. */
  apply(guarded: string[], released: string[]) {
    if (!this.guarded) {
      return
    }
    for (const epc of guarded) {
      this.guarded.add(epc)
    }
    for (const epc of released) {
      this.guarded.delete(epc)
      this.rang.delete(epc)
    }
  }

  /** True when the piece may not leave and the gate has not just gone off for it. */
  alarms(epc: string): boolean {
    if (!this.guarded?.has(epc)) {
      return false
    }
    const now = this.now()
    const last = this.rang.get(epc)
    if (last !== undefined && now - last < this.holdMs) {
      return false
    }
    if (this.rang.size > 1000) {
      for (const [code, at] of this.rang) {
        if (now - at >= this.holdMs) {
          this.rang.delete(code)
        }
      }
    }
    this.rang.set(epc, now)
    return true
  }
}

/**
 * What lies on a till's reader. A piece is read over and over while it is
 * there; the till is told once, when it is laid down. Lifted and put back
 * after a moment, it counts as laid down again.
 */
export class Presence {
  private readonly seen = new Map<string, number>()

  constructor(
    private readonly awayMs = 3000,
    private readonly now: () => number = Date.now,
  ) {}

  /** True when the piece was not on the reader a moment ago. */
  arrived(epc: string): boolean {
    const now = this.now()
    const last = this.seen.get(epc)
    if (this.seen.size > 1000) {
      for (const [code, at] of this.seen) {
        if (now - at > this.awayMs) {
          this.seen.delete(code)
        }
      }
    }
    this.seen.set(epc, now)
    return last === undefined || now - last > this.awayMs
  }
}
