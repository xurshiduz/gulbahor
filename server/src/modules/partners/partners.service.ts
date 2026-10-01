import { searchKey, type Page, type PartnerDto, type PartnerInput, type PartnerListQuery } from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch, applySort } from '../../common/listing'
import { Db } from '../../database/db.service'
import { Partner } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'

const SORTABLE = { name: 'p.name', createdAt: 'p.createdAt' }

const AUDITED: (keyof Partner & string)[] = ['name', 'phone', 'isSupplier', 'isBuyer', 'note', 'isActive']

/**
 * The people and firms the business trades with. For now they are named on
 * receipts as suppliers; what each owes or is owed comes with the money
 * ledger.
 */
@Injectable()
export class PartnersService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(actor: Actor, query: PartnerListQuery): Promise<Page<PartnerDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em.createQueryBuilder(Partner, 'p')
      if (query.status !== 'all') qb.andWhere('p.isActive = :active', { active: query.status === 'active' })
      if (query.role === 'supplier') qb.andWhere('p.isSupplier')
      if (query.role === 'buyer') qb.andWhere('p.isBuyer')
      applySearch(qb, 'p.search_key', query.q)
      applySort(qb, SORTABLE, query.sort, query.order, 'name')

      const [rows, total] = await qb
        .skip((query.page - 1) * query.size)
        .take(query.size)
        .getManyAndCount()
      return { items: rows.map(toDto), total, page: query.page, size: query.size }
    })
  }

  async get(actor: Actor, id: string): Promise<PartnerDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => toDto(await this.find(em, id)))
  }

  async create(actor: Actor, input: PartnerInput): Promise<PartnerDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.assertNameFree(em, input.name)
      const saved = await em.save(
        em.create(Partner, { orgId: actor.orgId, ...input, isActive: true, searchKey: keyOf(input) }),
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'partner.create',
        entity: 'partner',
        entityId: saved.id,
        summary: saved.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['partners']))
      return toDto(saved)
    })
  }

  async update(actor: Actor, id: string, input: PartnerInput): Promise<PartnerDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      await this.assertNameFree(em, input.name, id)
      await em.update(Partner, id, { ...input, searchKey: keyOf(input) })
      const after = await this.find(em, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'partner.update',
        entity: 'partner',
        entityId: id,
        summary: after.name,
        changes: diff(before, after, AUDITED),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['partners', 'receipts']))
      return toDto(after)
    })
  }

  async setActive(actor: Actor, id: string, active: boolean): Promise<PartnerDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      if (before.isActive !== active) {
        await em.update(Partner, id, { isActive: active })
        await this.audit.record(em, actor.orgId, actor, {
          action: active ? 'partner.restore' : 'partner.archive',
          entity: 'partner',
          entityId: id,
          summary: before.name,
          changes: { isActive: [before.isActive, active] },
        })
        afterCommit(() => this.realtime.changed(actor.orgId, ['partners']))
      }
      return toDto(await this.find(em, id))
    })
  }

  private async find(em: EntityManager, id: string): Promise<Partner> {
    const partner = await em.findOneBy(Partner, { id })
    if (!partner) {
      throw AppError.notFound('Hamkor topilmadi')
    }
    return partner
  }

  private async assertNameFree(em: EntityManager, name: string, exceptId?: string) {
    const taken = await em
      .createQueryBuilder(Partner, 'p')
      .where('lower(p.name) = lower(:name)', { name })
      .andWhere(exceptId ? 'p.id <> :exceptId' : '1 = 1', { exceptId })
      .getCount()
    if (taken) {
      throw AppError.validation({ name: 'Bunday nomli hamkor bor' })
    }
  }
}

function keyOf(partner: { name: string; phone: string | null; note: string | null }): string {
  return searchKey(`${partner.name} ${partner.phone ?? ''} ${partner.note ?? ''}`)
}

function toDto(partner: Partner): PartnerDto {
  return {
    id: partner.id,
    name: partner.name,
    phone: partner.phone,
    isSupplier: partner.isSupplier,
    isBuyer: partner.isBuyer,
    note: partner.note,
    isActive: partner.isActive,
    createdAt: partner.createdAt.toISOString(),
  }
}
