import {
  searchKey,
  type CustomerDto,
  type CustomerGroupDto,
  type CustomerGroupInput,
  type CustomerInput,
  type CustomerListQuery,
  type CustomerSummary,
  type LoyaltyInput,
  type LoyaltyTier,
  type Page,
  type PosCustomerDto,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import { In, type EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch, applySort } from '../../common/listing'
import { Db } from '../../database/db.service'
import { Customer, CustomerGroup, CustomerGroupMember, LoyaltyTierRow, PriceType } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'
import { loyaltyTiers, rulesOf } from './groups'

const SORTABLE = { name: 'c.name', createdAt: 'c.createdAt' }

const AUDITED: (keyof Customer & string)[] = ['name', 'phone', 'birthday', 'gender', 'note', 'tags', 'isActive']

interface Bought {
  customer_id: string
  sales: number
  purchases: number
  last_at: Date | null
}

/**
 * The people who buy in the shops: who they are, and, from their receipts,
 * what they have bought. A customer is known by their phone number, one to a
 * business. They are written down by whoever keeps the base, or at the till
 * the first time they buy.
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(actor: Actor, query: CustomerListQuery): Promise<Page<CustomerDto> & { summary: CustomerSummary }> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em.createQueryBuilder(Customer, 'c')
      if (query.status !== 'all') qb.andWhere('c.isActive = :active', { active: query.status === 'active' })
      if (query.birthdayIn !== undefined) {
        qb.andWhere(`${DAYS_TO_BIRTHDAY} <= :within`, { within: query.birthdayIn })
      }
      if (query.groupId) {
        qb.andWhere(
          `EXISTS (SELECT 1 FROM customer_group_members m WHERE m.customer_id = c.id AND m.group_id = :groupId)`,
          { groupId: query.groupId },
        )
      }
      if (query.tag) qb.andWhere(':tag = ANY(c.tags)', { tag: query.tag })
      applySearch(qb, 'c.search_key', query.q)
      applySort(qb, SORTABLE, query.sort, query.order, 'name')
      const [rows, total] = await qb
        .skip((query.page - 1) * query.size)
        .take(query.size)
        .getManyAndCount()
      return {
        items: await this.dtos(em, rows),
        total,
        page: query.page,
        size: query.size,
        summary: await this.summary(em),
      }
    })
  }

  async get(actor: Actor, id: string): Promise<CustomerDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => (await this.dtos(em, [await this.find(em, id)]))[0])
  }

  /**
   * Who the till finds by a few digits of a phone or a few letters of a name: those still on the books,
   * each with the rules their groups give.
   */
  async search(actor: Actor, q: string): Promise<PosCustomerDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em.createQueryBuilder(Customer, 'c').where('c.isActive')
      applySearch(qb, 'c.search_key', q)
      const rows = await qb.orderBy('c.name').limit(10).getMany()
      const rules = await rulesOf(em, rows)
      return rows.map((row) => rules.get(row.id) as PosCustomerDto)
    })
  }

  /** One customer as the till knows them. */
  async forTill(actor: Actor, id: string): Promise<PosCustomerDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const customer = await this.find(em, id)
      return (await rulesOf(em, [customer])).get(id) as PosCustomerDto
    })
  }

  async create(actor: Actor, input: CustomerInput, locationId: string | null = null): Promise<CustomerDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.assertPhoneFree(em, input.phone)
      const { groupIds, ...fields } = input
      const saved = await em.save(
        em.create(Customer, { orgId: actor.orgId, ...fields, locationId, isActive: true, searchKey: keyOf(input) }),
      )
      await this.setGroups(em, actor.orgId, saved.id, groupIds)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'customer.create',
        entity: 'customer',
        entityId: saved.id,
        summary: `${saved.name}, ${saved.phone}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['customers']))
      return (await this.dtos(em, [saved]))[0]
    })
  }

  async update(actor: Actor, id: string, input: CustomerInput): Promise<CustomerDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      await this.assertPhoneFree(em, input.phone, id)
      const { groupIds, ...fields } = input
      await em.update(Customer, id, { ...fields, searchKey: keyOf(input) })
      await this.setGroups(em, actor.orgId, id, groupIds)
      const after = await this.find(em, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'customer.update',
        entity: 'customer',
        entityId: id,
        summary: after.name,
        changes: diff(before, after, AUDITED),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['customers']))
      return (await this.dtos(em, [after]))[0]
    })
  }

  async setActive(actor: Actor, id: string, active: boolean): Promise<CustomerDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      if (before.isActive !== active) {
        await em.update(Customer, id, { isActive: active })
        await this.audit.record(em, actor.orgId, actor, {
          action: active ? 'customer.restore' : 'customer.archive',
          entity: 'customer',
          entityId: id,
          summary: before.name,
          changes: { isActive: [before.isActive, active] },
        })
        afterCommit(() => this.realtime.changed(actor.orgId, ['customers']))
      }
      return (await this.dtos(em, [await this.find(em, id)]))[0]
    })
  }

  // ───────────────────────────── Loyalty ─────────────────────────────

  async loyalty(actor: Actor): Promise<LoyaltyTier[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => loyaltyTiers(em))
  }

  /** The steps of the programme, all at once: what is not sent is no longer a step. */
  async setLoyalty(actor: Actor, input: LoyaltyInput): Promise<LoyaltyTier[]> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await loyaltyTiers(em)
      await em.createQueryBuilder().delete().from(LoyaltyTierRow).execute()
      if (input.tiers.length) {
        await em.insert(
          LoyaltyTierRow,
          input.tiers.map((tier) => ({ orgId: actor.orgId, fromAmount: tier.from, percent: tier.percent })),
        )
      }
      const after = await loyaltyTiers(em)
      const words = (tiers: LoyaltyTier[]) =>
        tiers.map((tier) => `${tier.from / 100} dan ${tier.percent}%`).join('; ') || "yo'q"
      await this.audit.record(em, actor.orgId, actor, {
        action: 'loyalty.update',
        entity: 'loyalty',
        entityId: actor.orgId,
        summary: 'Sodiqlik dasturi',
        changes: { tiers: [words(before), words(after)] },
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['customers']))
      return after
    })
  }

  // ───────────────────────────── Groups ─────────────────────────────

  async groups(actor: Actor): Promise<CustomerGroupDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => this.groupDtos(em))
  }

  async createGroup(actor: Actor, input: CustomerGroupInput): Promise<CustomerGroupDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.assertGroup(em, input)
      const [{ last }]: { last: number }[] = await em.query(
        `SELECT coalesce(max(sort_order), 0)::int AS last FROM customer_groups`,
      )
      const saved = await em.save(
        em.create(CustomerGroup, { orgId: actor.orgId, ...input, isActive: true, sortOrder: last + 1 }),
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'customer_group.create',
        entity: 'customer_group',
        entityId: saved.id,
        summary: saved.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['customers']))
      return (await this.groupDtos(em, saved.id))[0]
    })
  }

  async updateGroup(actor: Actor, id: string, input: CustomerGroupInput): Promise<CustomerGroupDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.findGroup(em, id)
      await this.assertGroup(em, input, id)
      await em.update(CustomerGroup, id, input)
      const after = await this.findGroup(em, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'customer_group.update',
        entity: 'customer_group',
        entityId: id,
        summary: after.name,
        changes: diff(before, after, [
          'name',
          'discountPercent',
          'priceTypeId',
          'reminder',
          'noDebt',
          'noLayaway',
          'noExchange',
        ]),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['customers']))
      return (await this.groupDtos(em, id))[0]
    })
  }

  async setGroupActive(actor: Actor, id: string, active: boolean): Promise<CustomerGroupDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.findGroup(em, id)
      if (before.isActive !== active) {
        await em.update(CustomerGroup, id, { isActive: active })
        await this.audit.record(em, actor.orgId, actor, {
          action: active ? 'customer_group.restore' : 'customer_group.archive',
          entity: 'customer_group',
          entityId: id,
          summary: before.name,
        })
        afterCommit(() => this.realtime.changed(actor.orgId, ['customers']))
      }
      return (await this.groupDtos(em, id))[0]
    })
  }

  private async groupDtos(em: EntityManager, id?: string): Promise<CustomerGroupDto[]> {
    const rows: {
      id: string
      name: string
      discount_percent: number
      price_type_id: string | null
      price_type_name: string | null
      reminder: string | null
      no_debt: boolean
      no_layaway: boolean
      no_exchange: boolean
      is_active: boolean
      members: number
    }[] = await em.query(
      `SELECT g.id, g.name, g.discount_percent::float8 AS discount_percent, g.price_type_id,
              t.name AS price_type_name, g.reminder, g.no_debt, g.no_layaway,
              g.no_exchange, g.is_active,
              (SELECT count(*)::int FROM customer_group_members m JOIN customers c ON c.id = m.customer_id
               WHERE m.group_id = g.id AND c.is_active) AS members
       FROM customer_groups g LEFT JOIN price_types t ON t.id = g.price_type_id
       WHERE $1::uuid IS NULL OR g.id = $1
       ORDER BY g.sort_order, g.name`,
      [id ?? null],
    )
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      discountPercent: row.discount_percent,
      priceTypeId: row.price_type_id,
      priceTypeName: row.price_type_name,
      reminder: row.reminder,
      noDebt: row.no_debt,
      noLayaway: row.no_layaway,
      noExchange: row.no_exchange,
      isActive: row.is_active,
      members: row.members,
    }))
  }

  private async findGroup(em: EntityManager, id: string): Promise<CustomerGroup> {
    const group = await em.findOneBy(CustomerGroup, { id })
    if (!group) {
      throw AppError.notFound('Guruh topilmadi')
    }
    return group
  }

  private async assertGroup(em: EntityManager, input: CustomerGroupInput, exceptId?: string) {
    const [taken] = await em.query(
      `SELECT 1 FROM customer_groups WHERE lower(name) = lower($1) AND id IS DISTINCT FROM $2`,
      [input.name, exceptId ?? null],
    )
    if (taken) {
      throw AppError.validation({ name: 'Bunday guruh bor' })
    }
    if (input.priceTypeId) {
      // A group's members buy at a price; the floor is not one.
      const type = await em.findOneBy(PriceType, { id: input.priceTypeId, isActive: true })
      if (!type || type.kind === 'min') {
        throw AppError.validation({ priceTypeId: 'Narx turi topilmadi' })
      }
    }
  }

  /** Puts a customer in exactly these groups. */
  private async setGroups(em: EntityManager, orgId: string, customerId: string, groupIds: string[]) {
    const ids = [...new Set(groupIds)]
    if (ids.length && (await em.countBy(CustomerGroup, { id: In(ids) })) !== ids.length) {
      throw AppError.validation({ groupIds: 'Guruh topilmadi' })
    }
    await em.delete(CustomerGroupMember, { customerId })
    if (ids.length) {
      await em.insert(
        CustomerGroupMember,
        ids.map((groupId) => ({ orgId, customerId, groupId })),
      )
    }
  }

  // ───────────────────────────── Inside ─────────────────────────────

  private async find(em: EntityManager, id: string): Promise<Customer> {
    const customer = await em.findOneBy(Customer, { id })
    if (!customer) {
      throw AppError.notFound('Mijoz topilmadi')
    }
    return customer
  }

  private async assertPhoneFree(em: EntityManager, phone: string, exceptId?: string) {
    const taken = await em
      .createQueryBuilder(Customer, 'c')
      .where('c.phone = :phone', { phone })
      .andWhere(exceptId ? 'c.id <> :exceptId' : '1 = 1', { exceptId })
      .getOne()
    if (taken) {
      throw AppError.validation({ phone: `Bu raqam bilan mijoz bor: ${taken.name}` })
    }
  }

  /** Each with what their receipts say they have bought. */
  private async dtos(em: EntityManager, customers: Customer[]): Promise<CustomerDto[]> {
    if (!customers.length) {
      return []
    }
    const ids = customers.map((customer) => customer.id)
    const bought: Bought[] = await em.query(
      `SELECT customer_id, count(*)::int AS sales, sum(total - returned_total)::float8 AS purchases,
              max(sold_at) AS last_at
       FROM sales WHERE customer_id = ANY($1) AND status = 'completed' GROUP BY customer_id`,
      [ids],
    )
    const boughtBy = new Map(bought.map((row) => [row.customer_id, row]))
    const places: { id: string; name: string }[] = await em.query(`SELECT id, name FROM locations WHERE id = ANY($1)`, [
      customers.flatMap((customer) => customer.locationId ?? []),
    ])
    const placeOf = new Map(places.map((place) => [place.id, place.name]))
    const memberships: { customer_id: string; id: string; name: string }[] = await em.query(
      `SELECT m.customer_id, g.id, g.name FROM customer_group_members m JOIN customer_groups g ON g.id = m.group_id
       WHERE m.customer_id = ANY($1) ORDER BY g.sort_order, g.name`,
      [ids],
    )
    const rules = await rulesOf(em, customers)
    return customers.map((customer) => {
      const row = boughtBy.get(customer.id)
      return {
        discountPercent: rules.get(customer.id)?.discountPercent ?? 0,
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        groups: memberships
          .filter((member) => member.customer_id === customer.id)
          .map((member) => ({ id: member.id, name: member.name })),
        tags: customer.tags,
        birthday: customer.birthday,
        gender: customer.gender,
        note: customer.note,
        locationId: customer.locationId,
        locationName: customer.locationId ? (placeOf.get(customer.locationId) ?? null) : null,
        isActive: customer.isActive,
        createdAt: customer.createdAt.toISOString(),
        salesCount: row?.sales ?? 0,
        purchases: row?.purchases ?? 0,
        lastSaleAt: row?.last_at ? row.last_at.toISOString() : null,
        debt: rules.get(customer.id)?.debt.owed ?? 0,
        overdue: rules.get(customer.id)?.debt.overdue ?? 0,
      }
    })
  }

  private async summary(em: EntityManager): Promise<CustomerSummary> {
    const [row]: { total: number; fresh: number; lapsed: number; birthdays: number }[] = await em.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE c.created_at >= now() - interval '7 days')::int AS fresh,
              count(*) FILTER (WHERE b.last_at < now() - interval '90 days')::int AS lapsed,
              count(*) FILTER (WHERE ${DAYS_TO_BIRTHDAY} <= 7)::int AS birthdays
       FROM customers c
       LEFT JOIN (
         SELECT customer_id, max(sold_at) AS last_at FROM sales
         WHERE customer_id IS NOT NULL AND status = 'completed' GROUP BY customer_id
       ) b ON b.customer_id = c.id
       WHERE c.is_active`,
    )
    return { total: row.total, newThisWeek: row.fresh, lapsed: row.lapsed, birthdaysSoon: row.birthdays }
  }
}

/**
 * Days until a customer's birthday next comes round, 0 on the day; null
 * without a birthday. "Today" is the business's own day, by its time zone.
 * Someone born on 29 February is counted on 1 March in a year without one.
 */
const TODAY = `(now() AT TIME ZONE (SELECT o.timezone FROM organizations o WHERE o.id = c.org_id))::date`
const DAYS_TO_BIRTHDAY = `(
  SELECT min(x.d) FROM (
    SELECT (make_date(y, extract(month FROM c.birthday)::int, 1) + (extract(day FROM c.birthday)::int - 1)) - ${TODAY} AS d
    FROM generate_series(extract(year FROM ${TODAY})::int, extract(year FROM ${TODAY})::int + 1) AS y
  ) x WHERE x.d >= 0
)`

function keyOf(customer: { name: string; phone: string; note: string | null; tags: string[] }): string {
  // The number is looked for as it is said: with the country code, or from the operator's two digits on.
  const digits = customer.phone.replace(/\D/g, '')
  return searchKey(`${customer.name} ${digits} ${digits.slice(3)} ${customer.note ?? ''} ${customer.tags.join(' ')}`)
}
