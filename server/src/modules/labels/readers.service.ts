import {
  GUARDED_UNIT_STATUSES,
  READER_KIND_LABELS,
  searchKey,
  type AgentAlarm,
  type AgentReader,
  type AgentTag,
  type AgentUnitsReply,
  type AgentUnitsRequest,
  type GateAlarmEvent,
  type GateEventDto,
  type GateEventListQuery,
  type Page,
  type ReaderDto,
  type ReaderInput,
  type ReaderTagEvent,
} from '@erp/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch } from '../../common/listing'
import { Db } from '../../database/db.service'
import { GateEvent, Location, Reader, Register, StoreAgent } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'
import { AgentHub } from './agent.hub'
import type { KnownAgent } from './devices.service'

const AUDITED: (keyof Reader & string)[] = ['name', 'kind', 'agentId', 'registerId', 'locationId', 'host', 'port']

/** Changes land together; agents are told once, a moment later. */
const POKE_DELAY_MS = 150
/** An agent asking "what changed since" is answered from a little earlier: a change is stamped before it is committed. */
const OVERLAP = `interval '10 seconds'`
const PAGE = 20_000

type ReaderRow = Reader & {
  agentName: string
  registerName: string | null
  locationName: string | null
}

/**
 * Readers that stay in one place: the one on a till's counter and the gate
 * at a shop's door. The server sets them up and keeps the gate's log; it is
 * the agent that listens to them.
 */
@Injectable()
export class ReadersService {
  /** Which readers their agents have on the line, as each agent last said. */
  private readonly linked = new Map<string, { agentId: string; connected: boolean }>()
  private readonly pokes = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly hub: AgentHub,
  ) {
    // A sale, a return, a receipt: anything may have changed which pieces may leave.
    // The agents are only told to ask; what changed they read themselves.
    this.realtime.onChanged((orgId) => this.poke(orgId))
  }

  // ───────────────────────────── Setting up ─────────────────────────────

  async list(actor: Actor): Promise<ReaderDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => (await this.rows(em)).map((row) => this.dto(row)))
  }

  async create(actor: Actor, input: ReaderInput): Promise<ReaderDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const place = await this.assertValid(em, input)
      const saved = await em.save(em.create(Reader, { orgId: actor.orgId, ...input, ...place }))
      await this.audit.record(em, actor.orgId, actor, {
        action: 'reader.create',
        entity: 'reader',
        entityId: saved.id,
        summary: `${saved.name} (${READER_KIND_LABELS[saved.kind]}, ${saved.host}:${saved.port})`,
      })
      afterCommit(() => this.told(actor.orgId, [saved.agentId]))
      return this.dto(await this.row(em, saved.id))
    })
  }

  async update(actor: Actor, id: string, input: ReaderInput): Promise<ReaderDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.row(em, id)
      const place = await this.assertValid(em, input, id)
      await em.update(Reader, id, { ...input, ...place })
      const after = await this.row(em, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'reader.update',
        entity: 'reader',
        entityId: id,
        summary: after.name,
        changes: diff(before, after, AUDITED),
      })
      afterCommit(() => {
        this.linked.delete(id)
        this.told(actor.orgId, [before.agentId, after.agentId])
      })
      return this.dto(after)
    })
  }

  async remove(actor: Actor, id: string): Promise<void> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const reader = await this.row(em, id)
      await em.delete(Reader, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'reader.delete',
        entity: 'reader',
        entityId: id,
        summary: reader.name,
      })
      afterCommit(() => {
        this.linked.delete(id)
        this.told(actor.orgId, [reader.agentId])
      })
    })
  }

  // ───────────────────────────── The agent's side ─────────────────────────────

  /** The readers an agent serves: sent when it connects and whenever they change. */
  async forAgent(agent: KnownAgent): Promise<AgentReader[]> {
    return this.db.tenant(agent.orgId, async ({ em }) => {
      const readers = await em.find(Reader, { where: { agentId: agent.id }, order: { name: 'ASC' } })
      return readers.map((reader) => ({ id: reader.id, kind: reader.kind, host: reader.host, port: reader.port }))
    })
  }

  /** The agent has a reader on the line, or has lost it. */
  linkChanged(agent: KnownAgent, readerId: string, connected: boolean) {
    this.linked.set(readerId, { agentId: agent.id, connected })
    this.realtime.changed(agent.orgId, ['devices'])
  }

  /** An agent that is gone says nothing about its readers any more. */
  agentGone(agentId: string) {
    for (const [readerId, link] of this.linked) {
      if (link.agentId === agentId) {
        this.linked.delete(readerId)
      }
    }
  }

  /** A piece was laid on a till's reader: the till's screen is told, and looks it up as if it had been scanned. */
  async tag(agent: KnownAgent, tag: AgentTag): Promise<void> {
    const registerId = await this.db.tenant(agent.orgId, async ({ em }) => {
      const reader = await em.findOneBy(Reader, { id: tag.readerId, agentId: agent.id, kind: 'desk' })
      return reader?.registerId ?? null
    })
    if (registerId) {
      this.realtime.event<ReaderTagEvent>(agent.orgId, 'reader.tag', { registerId, epc: tag.epc })
    }
  }

  /**
   * A gate went off. The agent has already sounded it; this is the record.
   * If the piece turns out to have been sold by now, the agent's list was a
   * moment behind: nothing is written and it is told to catch up.
   */
  async alarm(agent: KnownAgent, alarm: AgentAlarm): Promise<{ ok: boolean }> {
    return this.db.tenant(agent.orgId, async ({ em, afterCommit }) => {
      const reader = await em.findOneBy(Reader, { id: alarm.readerId, agentId: agent.id, kind: 'gate' })
      if (!reader) {
        return { ok: false }
      }
      const [unit]: {
        id: string
        status: string
        variant_id: string
        sku: string | null
        name: string
        value_names: string[]
      }[] = await em.query(
        `SELECT u.id, u.status, u.variant_id, v.sku, p.name,
                array_remove(ARRAY[a1.name, a2.name, a3.name], NULL) AS value_names
         FROM rfid_units u
         JOIN product_variants v ON v.id = u.variant_id
         JOIN products p ON p.id = v.product_id
         LEFT JOIN attribute_values a1 ON a1.id = v.value1_id
         LEFT JOIN attribute_values a2 ON a2.id = v.value2_id
         LEFT JOIN attribute_values a3 ON a3.id = v.value3_id
         WHERE u.epc = $1`,
        [alarm.epc],
      )
      if (!unit || !(GUARDED_UNIT_STATUSES as readonly string[]).includes(unit.status)) {
        afterCommit(() => this.hub.emit(agent.id, 'units.changed', {}))
        return { ok: false }
      }
      const location = reader.locationId ? await em.findOneBy(Location, { id: reader.locationId }) : null
      const title = [unit.name, unit.value_names.join(', ')].filter(Boolean).join(' · ')
      const saved = await em.save(
        em.create(GateEvent, {
          orgId: agent.orgId,
          readerId: reader.id,
          readerName: reader.name,
          locationId: reader.locationId,
          epc: alarm.epc,
          unitId: unit.id,
          variantId: unit.variant_id,
          title,
          sku: unit.sku,
          searchKey: searchKey([title, unit.sku ?? '', alarm.epc, reader.name].join(' ')),
          readAt: new Date(alarm.at),
        }),
      )
      afterCommit(() => {
        this.realtime.event<GateAlarmEvent>(agent.orgId, 'gate.alarm', {
          id: saved.id,
          title,
          readerName: reader.name,
          locationId: reader.locationId,
          locationName: location?.name ?? null,
          at: saved.readAt.toISOString(),
        })
        this.realtime.changed(agent.orgId, ['gate-events'])
      })
      return { ok: true }
    })
  }

  /** Which pieces may not leave: the whole list page by page, or what changed since the agent last asked. */
  async units(agent: KnownAgent, request: AgentUnitsRequest): Promise<AgentUnitsReply> {
    return this.db.tenant(agent.orgId, async ({ em }) => {
      // Taken before reading: whatever changes while the answer is on its way is asked for next time.
      const [{ now }]: { now: Date }[] = await em.query(`SELECT clock_timestamp() AS now`)
      const cursor = now.toISOString()
      const statuses = [...GUARDED_UNIT_STATUSES]

      if (!request.since) {
        const rows: { epc: string }[] = await em.query(
          `SELECT epc FROM rfid_units WHERE status = ANY($1) AND epc > $2 ORDER BY epc LIMIT $3`,
          [statuses, request.after ?? '', PAGE + 1],
        )
        return {
          guarded: rows.slice(0, PAGE).map((row) => row.epc),
          released: [],
          cursor,
          more: rows.length > PAGE,
        }
      }
      const rows: { epc: string; guarded: boolean }[] = await em.query(
        `SELECT epc, status = ANY($1) AS guarded FROM rfid_units WHERE updated_at > $2::timestamptz - ${OVERLAP}`,
        [statuses, request.since],
      )
      return {
        guarded: rows.filter((row) => row.guarded).map((row) => row.epc),
        released: rows.filter((row) => !row.guarded).map((row) => row.epc),
        cursor,
        more: false,
      }
    })
  }

  // ───────────────────────────── The gate's log ─────────────────────────────

  async events(actor: Actor, query: GateEventListQuery): Promise<Page<GateEventDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em
        .createQueryBuilder(GateEvent, 'g')
        .leftJoin(Location, 'l', 'l.id = g.locationId')
        .addSelect('l.name', 'location_name')
      if (!actor.allLocations) {
        qb.andWhere('g.locationId = ANY(:mine)', { mine: actor.locationIds })
      }
      if (query.locationId) qb.andWhere('g.locationId = :locationId', { locationId: query.locationId })
      if (query.from) qb.andWhere('g.readAt >= CAST(:from AS date)', { from: query.from })
      if (query.to) qb.andWhere('g.readAt < CAST(:to AS date) + 1', { to: query.to })
      applySearch(qb, 'g.search_key', query.q)
      qb.orderBy('g.readAt', 'DESC')
        .offset((query.page - 1) * query.size)
        .limit(query.size)
      const total = await qb.getCount()
      const { entities, raw } = await qb.getRawAndEntities()
      return {
        items: entities.map((event, index) => ({
          id: event.id,
          at: event.readAt.toISOString(),
          readerName: event.readerName,
          locationId: event.locationId,
          locationName: (raw[index] as { location_name: string | null }).location_name,
          epc: event.epc,
          title: event.title,
          sku: event.sku,
        })),
        total,
        page: query.page,
        size: query.size,
      }
    })
  }

  // ───────────────────────────── Inside ─────────────────────────────

  private poke(orgId: string) {
    if (this.pokes.has(orgId)) {
      return
    }
    this.pokes.set(
      orgId,
      setTimeout(() => {
        this.pokes.delete(orgId)
        this.hub.broadcast(orgId, 'units.changed', {})
      }, POKE_DELAY_MS),
    )
  }

  /** The screens and the agents concerned hear that the readers changed. */
  private told(orgId: string, agentIds: string[]) {
    this.realtime.changed(orgId, ['devices'])
    for (const agentId of new Set(agentIds)) {
      const agent = this.hub.agent(agentId)
      if (agent) {
        void this.forAgent(agent).then((readers) => this.hub.emit(agentId, 'readers', readers))
      }
    }
  }

  private async rows(em: EntityManager, id?: string): Promise<ReaderRow[]> {
    const qb = em
      .createQueryBuilder(Reader, 'r')
      .innerJoin(StoreAgent, 'a', 'a.id = r.agentId')
      .leftJoin(Register, 'k', 'k.id = r.registerId')
      .leftJoin(Location, 'l', 'l.id = COALESCE(r.locationId, k.locationId)')
      .addSelect('a.name', 'agent_name')
      .addSelect('k.name', 'register_name')
      .addSelect('l.name', 'location_name')
      .orderBy('r.name')
    if (id) qb.where('r.id = :id', { id })
    const { entities, raw } = await qb.getRawAndEntities()
    return entities.map((entity, index) => {
      const extra = raw[index] as { agent_name: string; register_name: string | null; location_name: string | null }
      return {
        ...entity,
        agentName: extra.agent_name,
        registerName: extra.register_name,
        locationName: extra.location_name,
      }
    })
  }

  private async row(em: EntityManager, id: string): Promise<ReaderRow> {
    const [row] = await this.rows(em, id)
    if (!row) {
      throw AppError.notFound('O‘quvchi topilmadi')
    }
    return row
  }

  /** Checks the reader and returns where it belongs: a till for a desk reader, a shop for a gate, never both. */
  private async assertValid(
    em: EntityManager,
    input: ReaderInput,
    exceptId?: string,
  ): Promise<{ registerId: string | null; locationId: string | null }> {
    const [taken] = await em.query(`SELECT 1 FROM readers WHERE lower(name) = lower($1) AND id IS DISTINCT FROM $2`, [
      input.name,
      exceptId ?? null,
    ])
    if (taken) {
      throw AppError.validation({ name: 'Bu nomli o‘quvchi bor' })
    }
    if (!(await em.findOneBy(StoreAgent, { id: input.agentId }))) {
      throw AppError.validation({ agentId: 'Agent topilmadi' })
    }
    if (input.kind === 'desk') {
      const register = input.registerId ? await em.findOneBy(Register, { id: input.registerId }) : null
      if (!register) {
        throw AppError.validation({ registerId: 'Kassa topilmadi' })
      }
      const [other] = await em.query(
        `SELECT name FROM readers WHERE register_id = $1 AND kind = 'desk' AND id IS DISTINCT FROM $2`,
        [register.id, exceptId ?? null],
      )
      if (other) {
        throw AppError.validation({ registerId: `Bu kassaning o‘quvchisi bor: ${(other as { name: string }).name}` })
      }
      return { registerId: register.id, locationId: null }
    }
    const [place] = await em.query(`SELECT 1 FROM locations WHERE id = $1 AND kind <> 'transit'`, [input.locationId])
    if (!place) {
      throw AppError.validation({ locationId: 'Do‘kon topilmadi' })
    }
    return { registerId: null, locationId: input.locationId }
  }

  private dto(row: ReaderRow): ReaderDto {
    const online = this.hub.isOnline(row.agentId)
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      agentId: row.agentId,
      agentName: row.agentName,
      online,
      connected: online ? (this.linked.get(row.id)?.connected ?? false) : null,
      registerId: row.registerId,
      registerName: row.registerName,
      locationId: row.locationId,
      locationName: row.locationName,
      host: row.host,
      port: row.port,
    }
  }
}
