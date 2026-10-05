import { z } from 'zod'

import { isLocalHost } from './labels'
import { idSchema, listQuerySchema, requiredText } from './schemas'

/**
 * RFID readers that stay in one place, and what they are for.
 *
 * A reader is reached the way a printer is: through the agent, the program
 * on a shop computer. The server never hears a reader itself.
 *
 *  - `desk`: on a till's counter (Chainway R3). A piece laid on it goes
 *    into that till's receipt, as if its tag had been scanned by hand.
 *  - `gate`: at a shop's door (Chainway UR4 with its antennas). A piece
 *    that has not been sold sets it off. The agent decides by itself, from
 *    the list of unsold pieces it keeps in memory, so the alarm does not
 *    wait for the internet; the server is told afterwards and keeps the log.
 */
export const READER_KINDS = ['desk', 'gate'] as const
export type ReaderKind = (typeof READER_KINDS)[number]

export const READER_KIND_LABELS: Record<ReaderKind, string> = {
  desk: "Kassa o'quvchisi",
  gate: 'Darvoza',
}

/** The port a Chainway UR4 listens on as it comes out of its box. */
export const DEFAULT_READER_PORT = 8888

export const readerInputSchema = z
  .object({
    name: requiredText(60),
    kind: z.enum(READER_KINDS),
    /** The agent on the same network as the reader. */
    agentId: idSchema,
    /** A desk reader: the till whose receipt its pieces go into. */
    registerId: idSchema.nullish().transform((value) => value ?? null),
    /** A gate: the shop whose door it stands at. */
    locationId: idSchema.nullish().transform((value) => value ?? null),
    host: z
      .string()
      .trim()
      .min(1, 'Manzilni kiriting')
      .max(120)
      .refine(isLocalHost, "Faqat do'kon tarmog'idagi manzil bo'lishi mumkin"),
    port: z.number().int().min(1).max(65535).default(DEFAULT_READER_PORT),
  })
  .superRefine((reader, context) => {
    if (reader.kind === 'desk' && !reader.registerId) {
      context.addIssue({ code: 'custom', path: ['registerId'], message: 'Kassani tanlang' })
    }
    if (reader.kind === 'gate' && !reader.locationId) {
      context.addIssue({ code: 'custom', path: ['locationId'], message: "Do'konni tanlang" })
    }
  })
export type ReaderInput = z.infer<typeof readerInputSchema>

export interface ReaderDto {
  id: string
  name: string
  kind: ReaderKind
  agentId: string
  agentName: string
  /** Whether the agent is connected to the server right now. */
  online: boolean
  /** Whether the agent has the reader on the line; null while the agent is away and nobody knows. */
  connected: boolean | null
  registerId: string | null
  registerName: string | null
  locationId: string | null
  locationName: string | null
  host: string
  port: number
}

// ───────────────────────────── The gate's log ─────────────────────────────

/** A piece that went through a gate without having been sold. */
export interface GateEventDto {
  id: string
  at: string
  readerName: string
  locationId: string | null
  locationName: string | null
  epc: string
  /** "Futbolka Polo · Oq, S", as it was then. */
  title: string
  sku: string | null
}

export const gateEventListQuerySchema = listQuerySchema.extend({
  locationId: idSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})
export type GateEventListQuery = z.infer<typeof gateEventListQuerySchema>

// ───────────────────────────── Between server and agent ─────────────────────────────

/** A piece that may not leave: its label is made or it is on hand, and nobody has paid for it. */
export const GUARDED_UNIT_STATUSES = ['ready', 'in_stock'] as const

/** What an agent is told about each reader it serves. */
export interface AgentReader {
  id: string
  kind: ReaderKind
  host: string
  port: number
}

/** A desk reader saw a piece laid on it. */
export const agentTagSchema = z.object({ readerId: idSchema, epc: z.string().regex(/^[0-9A-F]{24}$/) })
export type AgentTag = z.infer<typeof agentTagSchema>

/** A gate went off. */
export const agentAlarmSchema = z.object({
  readerId: idSchema,
  epc: z.string().regex(/^[0-9A-F]{24}$/),
  /** When the gate read it, by the agent's clock. */
  at: z.iso.datetime(),
})
export type AgentAlarm = z.infer<typeof agentAlarmSchema>

/** Which readers the agent has on the line. */
export const agentReaderStateSchema = z.object({ readerId: idSchema, connected: z.boolean() })

/**
 * The agent asking which pieces may not leave. Without `since` it wants the
 * whole list, a page at a time (`after` is the last code of the page before);
 * with it, only what changed since then.
 */
export const agentUnitsRequestSchema = z.object({
  since: z.iso.datetime().nullish(),
  after: z
    .string()
    .regex(/^[0-9A-F]{24}$/)
    .nullish(),
})
export type AgentUnitsRequest = z.infer<typeof agentUnitsRequestSchema>

export interface AgentUnitsReply {
  /** Codes that may not leave. */
  guarded: string[]
  /** Codes that may: sold, or no longer ours to watch. Only in an answer to `since`. */
  released: string[]
  /** What to send as `since` next time. */
  cursor: string
  /** There is another page: ask again with the last code of this one as `after`. */
  more: boolean
}

/** Shown on every screen of the business when a gate goes off. */
export interface GateAlarmEvent {
  id: string
  title: string
  readerName: string
  /** The shop whose door it was: a screen in another shop need not be told. */
  locationId: string | null
  locationName: string | null
  at: string
}

/** A piece laid on a till's reader, for that till's screen. */
export interface ReaderTagEvent {
  registerId: string
  epc: string
}
