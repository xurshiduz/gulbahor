import type { AuditDto, AuditListQuery, Page } from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AuditLog } from '../../database/entities'
import { Db } from '../../database/db.service'
import type { Actor } from '../auth/actor'

export interface AuditEntry {
  action: string
  entity?: string
  entityId?: string
  /** One line a person can read: "Kassir: Dilnoza qo'shildi". */
  summary?: string
  changes?: Record<string, [unknown, unknown]> | null
}

type Who = Pick<Actor, 'userId' | 'name' | 'ip'> | null

/** Fields that never appear in history, even as "changed". */
const SECRET_FIELDS = new Set(['passwordHash', 'pinHash', 'refreshHash'])

@Injectable()
export class AuditService {
  constructor(private readonly db: Db) {}

  /** Writes history in the same transaction as the change it describes. */
  async record(em: EntityManager, orgId: string, who: Who, entry: AuditEntry): Promise<void> {
    if (entry.changes && !Object.keys(entry.changes).length) {
      return
    }
    await em.insert(AuditLog, {
      orgId,
      actorId: who?.userId ?? null,
      actorName: who?.name ?? null,
      action: entry.action,
      entity: entry.entity ?? null,
      entityId: entry.entityId ?? null,
      summary: entry.summary ?? null,
      changes: entry.changes ?? null,
      ip: who?.ip ?? null,
    })
  }

  async list(actor: Actor, query: AuditListQuery): Promise<Page<AuditDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em.createQueryBuilder(AuditLog, 'a')
      if (query.actorId) qb.andWhere('a.actorId = :actorId', { actorId: query.actorId })
      if (query.entity) qb.andWhere('a.entity = :entity', { entity: query.entity })
      if (query.action) qb.andWhere('a.action = :action', { action: query.action })
      if (query.from || query.to) {
        // Days are the business's days, not UTC days.
        const [{ timezone }] = await em.query(`SELECT timezone FROM organizations WHERE id = $1`, [actor.orgId])
        if (query.from) {
          qb.andWhere(`a.createdAt >= (:from::date::timestamp AT TIME ZONE :tz)`, { from: query.from, tz: timezone })
        }
        if (query.to) {
          qb.andWhere(`a.createdAt < ((:to::date + 1)::timestamp AT TIME ZONE :tz)`, { to: query.to, tz: timezone })
        }
      }

      const [rows, total] = await qb
        .orderBy('a.id', 'DESC')
        .skip((query.page - 1) * query.size)
        .take(query.size)
        .getManyAndCount()

      return {
        items: rows.map((row) => ({
          id: row.id,
          at: row.createdAt.toISOString(),
          actorId: row.actorId,
          actorName: row.actorName,
          action: row.action,
          entity: row.entity,
          entityId: row.entityId,
          summary: row.summary,
          changes: row.changes as AuditDto['changes'],
          ip: row.ip,
        })),
        total,
        page: query.page,
        size: query.size,
      }
    })
  }
}

/**
 * What changed between two versions of a row, limited to `fields`:
 * `{ name: ['Chilonzor', 'Chilonzor 2'] }`. Secrets are reported as changed
 * without their values.
 */
export function diff<T extends object>(before: T, after: T, fields: (keyof T & string)[]): Record<string, [unknown, unknown]> {
  const changes: Record<string, [unknown, unknown]> = {}
  for (const field of fields) {
    const previous = normalize(before[field])
    const next = normalize(after[field])
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      changes[field] = SECRET_FIELDS.has(field) ? ['***', '***'] : [previous, next]
    }
  }
  return changes
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return [...value].sort()
  }
  return value ?? null
}
