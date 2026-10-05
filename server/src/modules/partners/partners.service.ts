import { searchKey, type Page, type PartnerDto, type PartnerInput, type PartnerListQuery } from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import { In, type EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch, applySort } from '../../common/listing'
import { Db } from '../../database/db.service'
import { Account, Partner } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'

const SORTABLE = { name: 'p.name', createdAt: 'p.createdAt' }

const AUDITED: (keyof Partner & string)[] = ['name', 'phone', 'isSupplier', 'isBuyer', 'currency', 'note', 'isActive']

/**
 * The people and firms the business trades with. Each has an account in the
 * money ledger, in so'm or in dollars: its balance is what they owe the
 * business, and is shown only to those who may see debts.
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
      if (query.debt && can(actor, 'partners.debts')) {
        qb.andWhere(
          `EXISTS (SELECT 1 FROM accounts a WHERE a.partner_id = p.id AND a.balance ${query.debt === 'owes' ? '>' : '<'} 0)`,
        )
      }
      applySearch(qb, 'p.search_key', query.q)
      applySort(qb, SORTABLE, query.sort, query.order, 'name')

      const [rows, total] = await qb
        .skip((query.page - 1) * query.size)
        .take(query.size)
        .getManyAndCount()
      const owed = await this.owed(
        em,
        actor,
        rows.map((row) => row.id),
      )
      return {
        items: rows.map((row) => partnerDto(row, owed(row.id))),
        total,
        page: query.page,
        size: query.size,
      }
    })
  }

  async get(actor: Actor, id: string): Promise<PartnerDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => this.dto(em, actor, await this.find(em, id)))
  }

  /** What each of some partners owes, for a person who may see debts; nothing for one who may not. */
  private async owed(em: EntityManager, actor: Actor, ids: string[]): Promise<(id: string) => number | null> {
    if (!can(actor, 'partners.debts')) {
      return () => null
    }
    const accounts = ids.length ? await em.findBy(Account, { partnerId: In(ids) }) : []
    const balances = new Map(accounts.map((account) => [account.partnerId, account.balance]))
    return (id) => balances.get(id) ?? 0
  }

  private async dto(em: EntityManager, actor: Actor, partner: Partner): Promise<PartnerDto> {
    return partnerDto(partner, (await this.owed(em, actor, [partner.id]))(partner.id))
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
      return this.dto(em, actor, saved)
    })
  }

  async update(actor: Actor, id: string, input: PartnerInput): Promise<PartnerDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      await this.assertNameFree(em, input.name, id)
      // Once anything has been owed either way, the account stays in the currency it was kept in.
      const account = await em.findOneBy(Account, { partnerId: id })
      if (before.currency !== input.currency && account) {
        const [used] = await em.query(`SELECT 1 FROM ledger_lines WHERE account_id = $1 LIMIT 1`, [account.id])
        if (used) {
          throw AppError.validation({ currency: 'Hisob-kitob boshlangan hamkorning valyutasi o‘zgartirilmaydi' })
        }
        await em.update(Account, account.id, { currency: input.currency })
      }
      if (account && before.name !== input.name) {
        await em.update(Account, account.id, { name: input.name })
      }
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
      return this.dto(em, actor, after)
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
      return this.dto(em, actor, await this.find(em, id))
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

export function partnerDto(partner: Partner, balance: number | null): PartnerDto {
  return {
    id: partner.id,
    name: partner.name,
    phone: partner.phone,
    isSupplier: partner.isSupplier,
    isBuyer: partner.isBuyer,
    currency: partner.currency,
    balance,
    note: partner.note,
    isActive: partner.isActive,
    createdAt: partner.createdAt.toISOString(),
  }
}
