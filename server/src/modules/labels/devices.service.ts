import {
  buildTestLabelZpl,
  type AgentDto,
  type AgentInput,
  type AgentKeyDto,
  type PrinterDto,
  type PrinterInput,
  type PrintJobDto,
} from '@erp/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Location, Printer, StoreAgent } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { hashToken, newToken } from '../auth/crypto'
import { RealtimeService } from '../realtime/realtime.service'
import { AgentHub } from './agent.hub'
import { PrintQueueService } from './print-queue.service'

const AGENT_AUDITED: (keyof StoreAgent & string)[] = ['name', 'locationId']
const PRINTER_AUDITED: (keyof Printer & string)[] = [
  'name',
  'locationId',
  'agentId',
  'host',
  'port',
  'dpi',
  'labelSize',
  'rfid',
]

type AgentRow = StoreAgent & { locationName: string | null; printers: number }
type PrinterRow = Printer & { locationName: string | null; agentName: string }

/** An agent as the gateway knows it once its key has been accepted. */
export interface KnownAgent {
  id: string
  orgId: string
  name: string
}

/**
 * The shop's equipment: agents (the program on a shop computer that reaches
 * the devices on its network) and the printers each of them serves.
 */
@Injectable()
export class DevicesService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly hub: AgentHub,
    private readonly queue: PrintQueueService,
  ) {}

  // ───────────────────────────── Agents ─────────────────────────────

  async agents(actor: Actor): Promise<AgentDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => (await this.agentRows(em)).map((row) => this.agentDto(row)))
  }

  /** The key is returned here and never again: only its hash is kept. */
  async createAgent(actor: Actor, input: AgentInput): Promise<AgentKeyDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.assertAgentName(em, input.name)
      await this.assertPlace(em, input.locationId)
      const key = newToken()
      const saved = await em.save(
        em.create(StoreAgent, {
          orgId: actor.orgId,
          name: input.name,
          locationId: input.locationId,
          keyHash: hashToken(key),
          createdBy: actor.userId,
        }),
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'agent.create',
        entity: 'agent',
        entityId: saved.id,
        summary: saved.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['devices']))
      return { ...this.agentDto(await this.agentRow(em, saved.id)), key }
    })
  }

  async updateAgent(actor: Actor, id: string, input: AgentInput): Promise<AgentDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.agentRow(em, id)
      await this.assertAgentName(em, input.name, id)
      await this.assertPlace(em, input.locationId)
      await em.update(StoreAgent, id, { name: input.name, locationId: input.locationId })
      const after = await this.agentRow(em, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'agent.update',
        entity: 'agent',
        entityId: id,
        summary: after.name,
        changes: diff(before, after, AGENT_AUDITED),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['devices']))
      return this.agentDto(after)
    })
  }

  /** A new key for a lost or leaked one. The program using the old key is cut off at once. */
  async renewAgentKey(actor: Actor, id: string): Promise<AgentKeyDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const agent = await this.agentRow(em, id)
      const key = newToken()
      await em.update(StoreAgent, id, { keyHash: hashToken(key) })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'agent.key',
        entity: 'agent',
        entityId: id,
        summary: agent.name,
      })
      afterCommit(() => {
        this.hub.drop(id)
        this.realtime.changed(actor.orgId, ['devices'])
      })
      return { ...this.agentDto(agent), online: false, key }
    })
  }

  /** Its printers go with it; what was waiting for them will never be printed. */
  async removeAgent(actor: Actor, id: string): Promise<void> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const agent = await this.agentRow(em, id)
      await this.cancelWaiting(em, 'agent_id', id)
      await em.delete(StoreAgent, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'agent.delete',
        entity: 'agent',
        entityId: id,
        summary: agent.name,
      })
      afterCommit(() => {
        this.hub.drop(id)
        this.realtime.changed(actor.orgId, ['devices', 'printjobs'])
      })
    })
  }

  /**
   * Who a connecting program is, by its key. This is the one place that
   * looks across businesses: the key is all the program has.
   */
  async agentByKey(
    key: string,
    about: { hostname: string | null; version: string | null },
  ): Promise<KnownAgent | null> {
    return this.db.system(async (em) => {
      const result: unknown = await em.query(
        `UPDATE agents SET last_seen_at = now(), hostname = $2, version = $3 WHERE key_hash = $1
         RETURNING id, org_id, name`,
        [hashToken(key), about.hostname, about.version],
      )
      // An UPDATE ... RETURNING comes back as [rows, count].
      const rows = (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result) as {
        id: string
        org_id: string
        name: string
      }[]
      const row = rows[0]
      return row ? { id: row.id, orgId: row.org_id, name: row.name } : null
    })
  }

  async agentSeen(agent: KnownAgent): Promise<void> {
    await this.db.tenant(agent.orgId, ({ em }) => em.update(StoreAgent, agent.id, { lastSeenAt: new Date() }))
  }

  // ───────────────────────────── Printers ─────────────────────────────

  async printers(actor: Actor): Promise<PrinterDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) =>
      (await this.printerRows(em)).map((row) => this.printerDto(row)),
    )
  }

  async createPrinter(actor: Actor, input: PrinterInput): Promise<PrinterDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.assertPrinter(em, input)
      const saved = await em.save(em.create(Printer, { orgId: actor.orgId, ...input }))
      await this.audit.record(em, actor.orgId, actor, {
        action: 'printer.create',
        entity: 'printer',
        entityId: saved.id,
        summary: `${saved.name} (${saved.host}:${saved.port})`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['devices']))
      return this.printerDto(await this.printerRow(em, saved.id))
    })
  }

  async updatePrinter(actor: Actor, id: string, input: PrinterInput): Promise<PrinterDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.printerRow(em, id)
      await this.assertPrinter(em, input, id)
      await em.update(Printer, id, input)
      // What is waiting follows the printer to its new agent.
      await em.query(`UPDATE print_jobs SET agent_id = $2 WHERE printer_id = $1 AND status = 'queued'`, [
        id,
        input.agentId,
      ])
      const after = await this.printerRow(em, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'printer.update',
        entity: 'printer',
        entityId: id,
        summary: after.name,
        changes: diff(before, after, PRINTER_AUDITED),
      })
      afterCommit(() => {
        this.realtime.changed(actor.orgId, ['devices'])
        void this.queue.dispatch(actor.orgId, input.agentId)
      })
      return this.printerDto(after)
    })
  }

  async removePrinter(actor: Actor, id: string): Promise<void> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const printer = await this.printerRow(em, id)
      await this.cancelWaiting(em, 'printer_id', id)
      await em.delete(Printer, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'printer.delete',
        entity: 'printer',
        entityId: id,
        summary: printer.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['devices', 'printjobs']))
    })
  }

  /** One label that says which printer it came out of; no chip is written. */
  async testPrinter(actor: Actor, id: string): Promise<PrintJobDto> {
    const { job, agentId } = await this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const printer = await this.printerRow(em, id)
      const queued = await this.queue.enqueueIn(em, actor, printer, {
        title: `Sinov: ${printer.name}`,
        labels: 1,
        payload: buildTestLabelZpl(printer.name, { size: printer.labelSize, dpi: printer.dpi }),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['printjobs']))
      return { job: queued, agentId: printer.agentId }
    })
    void this.queue.dispatch(actor.orgId, agentId)
    return job
  }

  // ───────────────────────────── Reading ─────────────────────────────

  private agentQuery(em: EntityManager) {
    return em
      .createQueryBuilder(StoreAgent, 'a')
      .leftJoin(Location, 'l', 'l.id = a.locationId')
      .addSelect('l.name', 'location_name')
      .addSelect('(SELECT count(*)::int FROM printers p WHERE p.agent_id = a.id)', 'printers')
  }

  private async agentRows(em: EntityManager, id?: string): Promise<AgentRow[]> {
    const qb = this.agentQuery(em).orderBy('a.name')
    if (id) qb.where('a.id = :id', { id })
    const { entities, raw } = await qb.getRawAndEntities()
    return entities.map((entity, index) => ({
      ...entity,
      locationName: raw[index].location_name,
      printers: raw[index].printers,
    }))
  }

  private async agentRow(em: EntityManager, id: string): Promise<AgentRow> {
    const [row] = await this.agentRows(em, id)
    if (!row) {
      throw AppError.notFound('Agent topilmadi')
    }
    return row
  }

  private async printerRows(em: EntityManager, id?: string): Promise<PrinterRow[]> {
    const qb = em
      .createQueryBuilder(Printer, 'p')
      .innerJoin(StoreAgent, 'a', 'a.id = p.agentId')
      .leftJoin(Location, 'l', 'l.id = p.locationId')
      .addSelect('l.name', 'location_name')
      .addSelect('a.name', 'agent_name')
      .orderBy('p.name')
    if (id) qb.where('p.id = :id', { id })
    const { entities, raw } = await qb.getRawAndEntities()
    return entities.map((entity, index) => ({
      ...entity,
      locationName: raw[index].location_name,
      agentName: raw[index].agent_name,
    }))
  }

  private async printerRow(em: EntityManager, id: string): Promise<PrinterRow> {
    const [row] = await this.printerRows(em, id)
    if (!row) {
      throw AppError.notFound('Printer topilmadi')
    }
    return row
  }

  private async assertAgentName(em: EntityManager, name: string, exceptId?: string) {
    const [taken] = await em.query(`SELECT 1 FROM agents WHERE lower(name) = lower($1) AND id IS DISTINCT FROM $2`, [
      name,
      exceptId ?? null,
    ])
    if (taken) {
      throw AppError.validation({ name: 'Bu nomli agent bor' })
    }
  }

  private async assertPrinter(em: EntityManager, input: PrinterInput, exceptId?: string) {
    const [taken] = await em.query(`SELECT 1 FROM printers WHERE lower(name) = lower($1) AND id IS DISTINCT FROM $2`, [
      input.name,
      exceptId ?? null,
    ])
    if (taken) {
      throw AppError.validation({ name: 'Bu nomli printer bor' })
    }
    if (!(await em.findOneBy(StoreAgent, { id: input.agentId }))) {
      throw AppError.validation({ agentId: 'Agent topilmadi' })
    }
    await this.assertPlace(em, input.locationId)
  }

  private async assertPlace(em: EntityManager, locationId: string | null) {
    if (!locationId) {
      return
    }
    const [place] = await em.query(`SELECT 1 FROM locations WHERE id = $1 AND kind <> 'transit'`, [locationId])
    if (!place) {
      throw AppError.validation({ locationId: 'Joy topilmadi' })
    }
  }

  private async cancelWaiting(em: EntityManager, column: 'agent_id' | 'printer_id', id: string) {
    await em.query(
      `UPDATE print_jobs SET status = 'cancelled', done_at = now(), error = $2 WHERE ${column} = $1 AND status = 'queued'`,
      [id, 'Printer yoki agent o‘chirildi'],
    )
  }

  private agentDto(row: AgentRow): AgentDto {
    return {
      id: row.id,
      name: row.name,
      locationId: row.locationId,
      locationName: row.locationName,
      online: this.hub.isOnline(row.id),
      lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
      hostname: row.hostname,
      version: row.version,
      printers: row.printers,
      createdAt: row.createdAt.toISOString(),
    }
  }

  private printerDto(row: PrinterRow): PrinterDto {
    return {
      id: row.id,
      name: row.name,
      locationId: row.locationId,
      locationName: row.locationName,
      agentId: row.agentId,
      agentName: row.agentName,
      online: this.hub.isOnline(row.agentId),
      host: row.host,
      port: row.port,
      dpi: row.dpi,
      labelSize: row.labelSize,
      rfid: row.rfid,
    }
  }
}
