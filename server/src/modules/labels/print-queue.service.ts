import type { Page, PrintJobDto, PrintJobListQuery } from '@erp/core'
import { Injectable, Logger } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySort } from '../../common/listing'
import { Db } from '../../database/db.service'
import { Printer, PrintJob } from '../../database/entities'
import type { Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'
import { AgentHub } from './agent.hub'

const SORTABLE = { createdAt: 'j.createdAt' }

/**
 * What waits to be printed. A job is the finished commands for one printer;
 * it stays `queued` until that printer's agent is on the line, is `sent`
 * while the agent has it, and ends `done` or `failed` by the agent's answer.
 * "Done" means the printer took the commands, which is all anyone but the
 * person standing at it can know.
 */
@Injectable()
export class PrintQueueService {
  private readonly logger = new Logger(PrintQueueService.name)
  /** One agent is given one job at a time, in the order they were made. */
  private readonly draining = new Map<string, Promise<void>>()

  constructor(
    private readonly db: Db,
    private readonly hub: AgentHub,
    private readonly realtime: RealtimeService,
  ) {}

  async printer(em: EntityManager, id: string): Promise<Printer> {
    const printer = await em.findOneBy(Printer, { id })
    if (!printer) {
      throw AppError.validation({ printerId: 'Printer topilmadi' })
    }
    return printer
  }

  /** Adds a job inside the caller's transaction; `dispatch` after it commits sends it on. */
  async enqueueIn(
    em: EntityManager,
    actor: Actor,
    printer: Printer,
    job: { title: string; labels: number; payload: string },
  ): Promise<PrintJobDto> {
    const saved = await em.save(
      em.create(PrintJob, {
        orgId: actor.orgId,
        printerId: printer.id,
        agentId: printer.agentId,
        printerName: printer.name,
        title: job.title,
        labels: job.labels,
        payload: job.payload,
        status: 'queued',
        attempts: 0,
        createdBy: actor.userId,
        createdByName: actor.name,
      }),
    )
    return this.toDto(saved)
  }

  /** Hands the agent whatever is waiting for it. Safe to call at any time and more than once. */
  dispatch(orgId: string, agentId: string): Promise<void> {
    const next = (this.draining.get(agentId) ?? Promise.resolve())
      .then(() => this.drain(orgId, agentId))
      .catch((error: unknown) => this.logger.error(error instanceof Error ? error.stack : String(error)))
      .finally(() => {
        if (this.draining.get(agentId) === next) {
          this.draining.delete(agentId)
        }
      })
    this.draining.set(agentId, next)
    return next
  }

  private async drain(orgId: string, agentId: string): Promise<void> {
    while (this.hub.isOnline(agentId)) {
      const order = await this.db.tenant(orgId, async ({ em }) => {
        const [row]: { id: string; payload: string; host: string; port: number }[] = await em.query(
          `SELECT j.id, j.payload, p.host, p.port
           FROM print_jobs j JOIN printers p ON p.id = j.printer_id
           WHERE j.agent_id = $1 AND j.status = 'queued'
           ORDER BY j.created_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED`,
          [agentId],
        )
        if (!row) {
          return null
        }
        await em.query(
          `UPDATE print_jobs SET status = 'sent', attempts = attempts + 1, sent_at = now(), error = NULL WHERE id = $1`,
          [row.id],
        )
        return { id: row.id, host: row.host, port: row.port, data: row.payload }
      })
      if (!order) {
        return
      }
      this.realtime.changed(orgId, ['printjobs'])

      const answer = await this.hub.send(agentId, order)
      await this.db.tenant(orgId, ({ em }) =>
        em.query(`UPDATE print_jobs SET status = $2, error = $3, done_at = now() WHERE id = $1 AND status = 'sent'`, [
          order.id,
          answer.ok ? 'done' : 'failed',
          answer.ok ? null : answer.error.slice(0, 300),
        ]),
      )
      this.realtime.changed(orgId, ['printjobs'])
    }
  }

  /**
   * An agent has just connected. Jobs still marked as with it were caught by
   * a restart or a dropped line: nobody is waiting for their answer any more.
   */
  async recover(orgId: string, agentId: string): Promise<void> {
    await this.db.tenant(orgId, ({ em }) =>
      em.query(
        `UPDATE print_jobs SET status = 'failed', error = $2, done_at = now()
         WHERE agent_id = $1 AND status = 'sent' AND sent_at < now() - interval '1 minute'`,
        [agentId, 'Javob kelmadi: aloqa uzilgan. Etiketka chiqmagan bo‘lsa, qayta yuboring'],
      ),
    )
  }

  async list(actor: Actor, query: PrintJobListQuery): Promise<Page<PrintJobDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em.createQueryBuilder(PrintJob, 'j')
      if (query.status !== 'all') qb.andWhere('j.status = :status', { status: query.status })
      if (query.q) qb.andWhere('j.title ILIKE :q', { q: `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%` })
      applySort(qb, SORTABLE, undefined, 'desc', 'createdAt')
      const [rows, total] = await qb
        .skip((query.page - 1) * query.size)
        .take(query.size)
        .getManyAndCount()
      return { items: rows.map((row) => this.toDto(row)), total, page: query.page, size: query.size }
    })
  }

  /** Sends a failed or cancelled job again, exactly as it was. */
  async retry(actor: Actor, id: string): Promise<PrintJobDto> {
    const job = await this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const found = await this.lock(em, id)
      if (found.status !== 'failed' && found.status !== 'cancelled') {
        throw AppError.conflict('JOB_NOT_FAILED', 'Faqat xato bilan tugagan yoki bekor qilingan ish qayta yuboriladi')
      }
      // The printer may have moved to another agent since, or be gone.
      const printer = found.printerId ? await em.findOneBy(Printer, { id: found.printerId }) : null
      if (!printer) {
        throw AppError.conflict('PRINTER_GONE', 'Bu printer o‘chirilgan. Etiketkani qaytadan chop eting')
      }
      await em.update(PrintJob, id, { status: 'queued', error: null, agentId: printer.agentId, doneAt: null })
      afterCommit(() => this.realtime.changed(actor.orgId, ['printjobs']))
      return { ...found, status: 'queued' as const, error: null, agentId: printer.agentId, doneAt: null }
    })
    void this.dispatch(actor.orgId, job.agentId as string)
    return this.toDto(job)
  }

  /** Takes a job out of the queue before the agent has it. */
  async cancel(actor: Actor, id: string): Promise<PrintJobDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const found = await this.lock(em, id)
      if (found.status !== 'queued') {
        throw AppError.conflict('JOB_NOT_QUEUED', 'Faqat navbatda turgan ish bekor qilinadi')
      }
      await em.update(PrintJob, id, { status: 'cancelled', doneAt: new Date() })
      afterCommit(() => this.realtime.changed(actor.orgId, ['printjobs']))
      return this.toDto({ ...found, status: 'cancelled', doneAt: new Date() })
    })
  }

  private async lock(em: EntityManager, id: string): Promise<PrintJob> {
    await em.query(`SELECT 1 FROM print_jobs WHERE id = $1 FOR UPDATE`, [id])
    const job = await em.findOneBy(PrintJob, { id })
    if (!job) {
      throw AppError.notFound('Chop etish ishi topilmadi')
    }
    return job
  }

  toDto(job: PrintJob): PrintJobDto {
    return {
      id: job.id,
      title: job.title,
      labels: job.labels,
      status: job.status,
      error: job.error ?? null,
      printerId: job.printerId,
      printerName: job.printerName,
      agentOnline: this.hub.isOnline(job.agentId),
      createdByName: job.createdByName,
      createdAt: job.createdAt.toISOString(),
      doneAt: job.doneAt ? job.doneAt.toISOString() : null,
    }
  }
}
