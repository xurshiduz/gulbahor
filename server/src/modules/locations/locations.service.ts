import {
  LOCATION_KIND_LABELS,
  searchKey,
  type LocationDto,
  type LocationInput,
  type LocationKind,
  type LocationListQuery,
  type Page,
} from '@erp/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch, applySort } from '../../common/listing'
import { Db } from '../../database/db.service'
import { Location } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'

const CODE_PREFIX: Record<LocationKind, string> = { store: 'D', mixed: 'D', warehouse: 'S', zone: 'Z' }

const SORTABLE = { name: 'l.name', code: 'l.code', kind: 'l.kind', createdAt: 'l.createdAt' }

/** Leaves out the place goods are in while on the way between two others: it is the ledger's, not the user's. */
const REAL_PLACE = `l.kind <> 'transit'`

const AUDITED: (keyof Location & string)[] = ['name', 'code', 'kind', 'parentId', 'address', 'phone', 'isActive']

type Row = Location & { parentName?: string | null }

@Injectable()
export class LocationsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(actor: Actor, query: LocationListQuery): Promise<Page<LocationDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = this.baseQuery(em)
      if (query.kind) qb.andWhere('l.kind = :kind', { kind: query.kind })
      if (query.status !== 'all') qb.andWhere('l.isActive = :active', { active: query.status === 'active' })
      applySearch(qb, 'l.search_key', query.q)
      applySort(qb, SORTABLE, query.sort, query.order, 'name')

      const total = await qb.getCount()
      const { entities, raw } = await qb
        .offset((query.page - 1) * query.size)
        .limit(query.size)
        .getRawAndEntities()

      return {
        items: entities.map((entity, index) => toDto({ ...entity, parentName: raw[index].parent_name })),
        total,
        page: query.page,
        size: query.size,
      }
    })
  }

  /** Active places this person may work in; feeds pickers and the place switcher. */
  async options(actor: Actor): Promise<Pick<LocationDto, 'id' | 'name' | 'code' | 'kind' | 'parentId'>[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em.createQueryBuilder(Location, 'l').where(`l.isActive AND ${REAL_PLACE}`)
      if (!actor.allLocations) {
        qb.andWhere('l.id IN (:...ids)', { ids: actor.locationIds.length ? actor.locationIds : [null] })
      }
      const rows = await qb.orderBy('l.name').getMany()
      return rows.map(({ id, name, code, kind, parentId }) => ({ id, name, code, kind, parentId }))
    })
  }

  async get(actor: Actor, id: string): Promise<LocationDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => toDto(await this.find(em, id)))
  }

  async create(actor: Actor, input: LocationInput): Promise<LocationDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const code = input.code ?? (await this.nextCode(em, input.kind))
      await this.assertUnique(em, input.name, code)
      await this.assertParent(em, input)

      const saved = await em.save(
        em.create(Location, {
          orgId: actor.orgId,
          name: input.name,
          code,
          kind: input.kind,
          parentId: input.parentId,
          address: input.address,
          phone: input.phone,
          isActive: true,
          searchKey: keyOf({ name: input.name, code, address: input.address }),
        }),
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'location.create',
        entity: 'location',
        entityId: saved.id,
        summary: `${LOCATION_KIND_LABELS[saved.kind]}: ${saved.name}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['locations']))
      return toDto(await this.find(em, saved.id))
    })
  }

  async update(actor: Actor, id: string, input: LocationInput): Promise<LocationDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      const code = input.code ?? before.code
      await this.assertUnique(em, input.name, code, id)
      await this.assertParent(em, input, id)

      if (before.kind !== input.kind && (before.kind === 'zone' || input.kind === 'zone')) {
        throw AppError.validation({ kind: 'Do‘kon ichidagi joyni boshqa turga o‘zgartirib bo‘lmaydi' })
      }

      const patch = {
        name: input.name,
        code,
        kind: input.kind,
        parentId: input.parentId,
        address: input.address,
        phone: input.phone,
        searchKey: keyOf({ name: input.name, code, address: input.address }),
      }
      await em.update(Location, id, patch)
      const after = await this.find(em, id)

      await this.audit.record(em, actor.orgId, actor, {
        action: 'location.update',
        entity: 'location',
        entityId: id,
        summary: after.name,
        changes: diff(before, after, AUDITED),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['locations']))
      return toDto(after)
    })
  }

  async setActive(actor: Actor, id: string, active: boolean): Promise<LocationDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      if (before.isActive === active) {
        return toDto(before)
      }

      if (!active) {
        const children = await em.countBy(Location, { parentId: id, isActive: true })
        if (children) {
          throw AppError.conflict('HAS_CHILDREN', 'Avval shu do‘kon ichidagi joylarni arxivlang')
        }
      } else if (before.parentId) {
        const parent = await em.findOneBy(Location, { id: before.parentId })
        if (!parent?.isActive) {
          throw AppError.conflict('PARENT_ARCHIVED', 'Avval u joylashgan do‘konni arxivdan chiqaring')
        }
      }

      await em.update(Location, id, { isActive: active })
      await this.audit.record(em, actor.orgId, actor, {
        action: active ? 'location.restore' : 'location.archive',
        entity: 'location',
        entityId: id,
        summary: before.name,
        changes: { isActive: [before.isActive, active] },
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['locations']))
      return toDto(await this.find(em, id))
    })
  }

  /** "D1", "D2" for stores, "S1" for warehouses, "Z1" for zones: the next free number. */
  async nextCode(em: EntityManager, kind: LocationKind): Promise<string> {
    const prefix = CODE_PREFIX[kind]
    const [{ next }] = await em.query(
      `SELECT coalesce(max(substring(code FROM '[0-9]+$')::int), 0) + 1 AS next FROM locations WHERE code ~ $1`,
      [`^${prefix}[0-9]+$`],
    )
    return `${prefix}${next}`
  }

  private baseQuery(em: EntityManager) {
    return em
      .createQueryBuilder(Location, 'l')
      .leftJoin(Location, 'p', 'p.id = l.parentId')
      .addSelect('p.name', 'parent_name')
      .where(REAL_PLACE)
  }

  private async find(em: EntityManager, id: string): Promise<Row> {
    const { entities, raw } = await this.baseQuery(em).andWhere('l.id = :id', { id }).getRawAndEntities()
    if (!entities[0]) {
      throw AppError.notFound('Do‘kon yoki sklad topilmadi')
    }
    return { ...entities[0], parentName: raw[0].parent_name }
  }

  private async assertUnique(em: EntityManager, name: string, code: string, exceptId?: string) {
    const clash = await em
      .createQueryBuilder(Location, 'l')
      .where('(lower(l.name) = lower(:name) OR l.code = :code)', { name, code })
      .andWhere(exceptId ? 'l.id <> :exceptId' : '1 = 1', { exceptId })
      .getMany()
    const fields: Record<string, string> = {}
    for (const other of clash) {
      if (other.name.toLowerCase() === name.toLowerCase()) fields.name = 'Bu nom band'
      if (other.code === code) fields.code = `Bu kod band: ${other.name}`
    }
    if (Object.keys(fields).length) {
      throw AppError.validation(fields)
    }
  }

  private async assertParent(em: EntityManager, input: LocationInput, selfId?: string) {
    if (!input.parentId) {
      return
    }
    const parent = await em.findOneBy(Location, { id: input.parentId })
    if (!parent || parent.id === selfId || !parent.isActive || (parent.kind !== 'store' && parent.kind !== 'mixed')) {
      throw AppError.validation({ parentId: 'Faol do‘konni tanlang' })
    }
  }
}

function keyOf(location: { name: string; code: string; address: string | null }): string {
  return searchKey(`${location.name} ${location.code} ${location.address ?? ''}`)
}

function toDto(row: Row): LocationDto {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    kind: row.kind,
    parentId: row.parentId,
    parentName: row.parentName ?? null,
    address: row.address,
    phone: row.phone,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  }
}
