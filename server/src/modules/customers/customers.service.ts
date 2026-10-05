import {
  searchKey,
  type CustomerBrief,
  type CustomerDto,
  type CustomerInput,
  type CustomerListQuery,
  type CustomerSummary,
  type Page,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch, applySort } from '../../common/listing'
import { Db } from '../../database/db.service'
import { Customer } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'

const SORTABLE = { name: 'c.name', createdAt: 'c.createdAt' }

const AUDITED: (keyof Customer & string)[] = ['name', 'phone', 'birthday', 'gender', 'note', 'isActive']

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

  /** Who the till finds by a few digits of a phone or a few letters of a name: those still on the books. */
  async search(actor: Actor, q: string): Promise<CustomerBrief[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em.createQueryBuilder(Customer, 'c').where('c.isActive')
      applySearch(qb, 'c.search_key', q)
      const rows = await qb.orderBy('c.name').limit(10).getMany()
      return rows.map(brief)
    })
  }

  async create(actor: Actor, input: CustomerInput, locationId: string | null = null): Promise<CustomerDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.assertPhoneFree(em, input.phone)
      const saved = await em.save(
        em.create(Customer, { orgId: actor.orgId, ...input, locationId, isActive: true, searchKey: keyOf(input) }),
      )
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
      await em.update(Customer, id, { ...input, searchKey: keyOf(input) })
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
    return customers.map((customer) => {
      const row = boughtBy.get(customer.id)
      return {
        ...brief(customer),
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

const brief = (customer: Customer): CustomerBrief => ({ id: customer.id, name: customer.name, phone: customer.phone })

function keyOf(customer: { name: string; phone: string; note: string | null }): string {
  // The number is looked for as it is said: with the country code, or from the operator's two digits on.
  const digits = customer.phone.replace(/\D/g, '')
  return searchKey(`${customer.name} ${digits} ${digits.slice(3)} ${customer.note ?? ''}`)
}
