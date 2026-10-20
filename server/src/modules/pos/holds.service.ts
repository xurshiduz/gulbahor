import {
  searchKey,
  type HoldDto,
  type HoldDueInput,
  type HoldInput,
  type HoldLineDto,
  type HoldListQuery,
  type HoldSummary,
  type Page,
} from '@erp/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch } from '../../common/listing'
import { Db } from '../../database/db.service'
import { Customer, Hold, HoldLine, Register, Sale } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { nextNumbers } from '../catalog/counters'
import { rulesOf } from '../customers/groups'
import { businessToday } from '../money/rate-book'
import { RealtimeService } from '../realtime/realtime.service'
import { StockService } from '../stock/stock.service'
import { sellables } from './items'

const mayWorkAt = (actor: Actor, locationId: string) => actor.allLocations || actor.locationIds.includes(locationId)

/** A count as it is said: "2", "1,5". */
const formatNumber = (qty: number) => String(qty).replace('.', ',')

/** What changes when a hold is made, taken or let go: its own list, what the till may sell, and what stock shows. */
const TOUCHED = ['holds', 'pos', 'stock']

/**
 * Goods set aside for a customer ("Band qilish"; YOL-XARITA, K1).
 *
 * A hold is a promise, not a movement: the goods stay in the shop and in its count, and while the hold stands
 * its lines are taken off what the shop has to sell, send or write off (`StockService.pick`, the till's
 * `sellables`). It stands until a day; nothing lets it go by itself — a hold past its day is shown as such and
 * a person decides, since the goods are still behind the counter whatever the calendar says. Taken, it becomes
 * an ordinary sale (`takeIn`, called by the sale); what money the customer left towards it is on their balance,
 * put there by an ordinary payment.
 */
@Injectable()
export class HoldsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly stock: StockService,
  ) {}

  async list(actor: Actor, query: HoldListQuery): Promise<Page<HoldDto> & { summary: HoldSummary }> {
    sees(actor)
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const today = await businessToday(em)
      const scope = () => {
        const qb = em.createQueryBuilder(Hold, 'h')
        if (!actor.allLocations) {
          qb.andWhere('h.locationId = ANY(:mine)', { mine: actor.locationIds })
        }
        return qb
      }
      const qb = scope()
      if (query.state === 'active') qb.andWhere(`h.status = 'active'`)
      if (query.state === 'overdue') qb.andWhere(`h.status = 'active' AND h.dueDate < :today`, { today })
      if (query.state === 'taken' || query.state === 'released') {
        qb.andWhere('h.status = :status', { status: query.state })
      }
      if (query.locationId) qb.andWhere('h.locationId = :locationId', { locationId: query.locationId })
      if (query.customerId) qb.andWhere('h.customerId = :customerId', { customerId: query.customerId })
      applySearch(qb, 'h.search_key', query.q, { names: true })
      // What stands is looked at by its day, the nearest first; what is over, by when it was made.
      if (query.state === 'active' || query.state === 'overdue') {
        qb.orderBy('h.dueDate', 'ASC').addOrderBy('h.createdAt', 'ASC')
      } else {
        qb.orderBy('h.createdAt', 'DESC')
      }
      const total = await qb.getCount()
      const holds = await qb
        .offset((query.page - 1) * query.size)
        .limit(query.size)
        .getMany()
      const [counts] = await scope()
        .select(`count(*) FILTER (WHERE h.status = 'active')::int`, 'active')
        .addSelect(`count(*) FILTER (WHERE h.status = 'active' AND h.due_date < :today)::int`, 'overdue')
        .setParameter('today', today)
        .getRawMany<HoldSummary>()
      return {
        items: await this.load(em, holds, today),
        total,
        page: query.page,
        size: query.size,
        summary: { active: counts?.active ?? 0, overdue: counts?.overdue ?? 0 },
      }
    })
  }

  async get(actor: Actor, id: string): Promise<HoldDto> {
    sees(actor)
    return this.db.tenant(actor.orgId, async ({ em }) => this.one(em, await this.find(em, actor, id)))
  }

  /**
   * Sets a cart's goods aside for a customer until a day. They must be there to be promised: what the shop has
   * of each, less what is promised already. A customer whose group is not to have goods held is refused — but
   * for someone trusted to lend (`pos.debt`), whose word a hold is.
   */
  async create(actor: Actor, input: HoldInput): Promise<HoldDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      // The till sends it again when it did not hear back: the hold it made the first time is the answer.
      const again = await em.findOneBy(Hold, { clientKey: input.clientKey })
      if (again) {
        return this.one(em, again)
      }
      const register = await em.findOneBy(Register, { id: input.registerId })
      if (!register || !register.isActive || !mayWorkAt(actor, register.locationId)) {
        throw AppError.validation({ registerId: 'Kassa topilmadi' })
      }
      const customer = await em.findOneBy(Customer, { id: input.customerId })
      if (!customer || !customer.isActive) {
        throw AppError.validation({ customerId: 'Mijoz topilmadi' })
      }
      const rules = (await rulesOf(em, [customer])).get(customer.id)
      if (rules?.noLayaway && !can(actor, 'pos.debt')) {
        throw AppError.forbidden(
          `«${customer.name}» uchun tovar band qilinmaydi: guruhida shunday belgilangan`,
          'NO_HOLD',
        )
      }
      const today = await businessToday(em)
      if (input.dueDate < today) {
        throw AppError.validation({ dueDate: 'Muddat o‘tgan kun bo‘lmaydi' })
      }

      // The same thing twice in a cart is one line of the hold.
      const wants: { variantId: string; qty: number }[] = []
      for (const line of input.lines) {
        const same = wants.find((want) => want.variantId === line.variantId)
        if (same) {
          same.qty = Math.round((same.qty + line.qty) * 1000) / 1000
        } else {
          wants.push({ ...line })
        }
      }
      const items = await sellables(
        em,
        { ids: wants.map((want) => want.variantId) },
        register.locationId,
        input.priceTypeId,
      )
      const itemOf = new Map(items.map((item) => [item.variantId, item]))
      const fields: Record<string, string> = {}
      // Taking nothing: only asking, with the balances held, whether the goods are there and nobody else's.
      const picked = await this.stock.pick(em, register.locationId, wants)
      wants.forEach((want, index) => {
        const item = itemOf.get(want.variantId)
        const at = input.lines.findIndex((line) => line.variantId === want.variantId)
        if (!item) {
          fields[`lines.${at}.variantId`] = 'Tovar topilmadi'
        } else if (picked[index].missing) {
          const free = Math.round((want.qty - picked[index].missing) * 1000) / 1000
          fields[`lines.${at}.qty`] =
            `«${item.name}${item.label ? `, ${item.label}` : ''}»: qoldiq yetarli emas (bor ${formatNumber(free)}${
              picked[index].promised ? `, band qilingan ${formatNumber(picked[index].promised)}` : ''
            })`
        }
      })
      if (Object.keys(fields).length) {
        throw AppError.validation(fields, Object.values(fields)[0])
      }

      const number = `BQ-${String(await nextNumbers(em, actor.orgId, 'hold')).padStart(6, '0')}`
      const qty = wants.reduce((sum, want) => sum + Math.round(want.qty * 1000), 0) / 1000
      const hold = await em.save(
        em.create(Hold, {
          orgId: actor.orgId,
          number,
          clientKey: input.clientKey,
          status: 'active',
          locationId: register.locationId,
          customerId: customer.id,
          customerName: customer.name,
          priceTypeId: input.priceTypeId,
          dueDate: input.dueDate,
          note: input.note ?? null,
          total: wants.reduce((sum, want) => sum + Math.round((itemOf.get(want.variantId)?.price ?? 0) * want.qty), 0),
          totalQty: qty,
          searchKey: searchKey([number, customer.name, customer.phone ?? ''].join(' ')),
          createdBy: actor.userId,
          createdByName: actor.name,
        }),
      )
      await em.insert(
        HoldLine,
        wants.map((want, position) => ({
          orgId: actor.orgId,
          holdId: hold.id,
          position,
          variantId: want.variantId,
          qty: want.qty,
          price: itemOf.get(want.variantId)?.price ?? 0,
        })),
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'hold.create',
        entity: 'hold',
        entityId: hold.id,
        summary: `${number}: ${customer.name}, ${formatNumber(qty)} dona, ${input.dueDate} gacha`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, TOUCHED))
      return this.one(em, hold)
    })
  }

  /** Lets the goods go: the customer is not coming, or changed their mind. They are anyone's again at once. */
  async release(actor: Actor, id: string): Promise<HoldDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const hold = await this.standing(em, actor, id)
      await em.update(Hold, id, {
        status: 'released',
        closedBy: actor.userId,
        closedByName: actor.name,
        closedAt: new Date(),
      })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'hold.release',
        entity: 'hold',
        entityId: id,
        summary: `${hold.number}: ${hold.customerName}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, TOUCHED))
      return this.one(em, await this.find(em, actor, id))
    })
  }

  /** Moves the day the goods are held until: the customer asked for longer, or is coming sooner. */
  async extend(actor: Actor, id: string, input: HoldDueInput): Promise<HoldDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const hold = await this.standing(em, actor, id)
      if (input.dueDate < (await businessToday(em))) {
        throw AppError.validation({ dueDate: 'Muddat o‘tgan kun bo‘lmaydi' })
      }
      await em.update(Hold, id, { dueDate: input.dueDate })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'hold.due',
        entity: 'hold',
        entityId: id,
        summary: hold.number,
        changes: diff({ dueDate: hold.dueDate }, { dueDate: input.dueDate }, ['dueDate']),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['holds']))
      return this.one(em, await this.find(em, actor, id))
    })
  }

  /**
   * The customer has come: the hold is over and the sale being made is what it became. Called by that sale,
   * in its own transaction and before it takes its goods — the hold's are free to it from here on, and whatever
   * of them is not on the receipt is anyone's again. The sale is to the customer the goods were held for, in
   * the shop they were held in.
   */
  async takeIn(em: EntityManager, actor: Actor, id: string, sale: Sale): Promise<void> {
    const [row]: { id: string }[] = await em.query(`SELECT id FROM holds WHERE id = $1 FOR UPDATE`, [id])
    const hold = row ? await em.findOneBy(Hold, { id }) : null
    if (!hold || hold.status !== 'active') {
      throw AppError.validation({ holdId: 'Band qilingan tovar topilmadi yoki band allaqachon yopilgan' })
    }
    if (hold.locationId !== sale.locationId) {
      throw AppError.validation({ holdId: `${hold.number} boshqa do‘konda band qilingan` })
    }
    if (hold.customerId !== sale.customerId) {
      throw AppError.validation({ holdId: `${hold.number} boshqa mijoz uchun band qilingan: ${hold.customerName}` })
    }
    await em.update(Hold, id, {
      status: 'taken',
      saleId: sale.id,
      closedBy: actor.userId,
      closedByName: actor.name,
      closedAt: new Date(),
    })
    await this.audit.record(em, actor.orgId, actor, {
      action: 'hold.take',
      entity: 'hold',
      entityId: id,
      summary: `${hold.number} → ${sale.number}`,
    })
  }

  // ───────────────────────────── Inside ─────────────────────────────

  private async find(em: EntityManager, actor: Actor, id: string): Promise<Hold> {
    const hold = await em.findOneBy(Hold, { id })
    if (!hold || !mayWorkAt(actor, hold.locationId)) {
      throw AppError.notFound('Band hujjati topilmadi')
    }
    return hold
  }

  /** A hold that still stands, kept from anyone else until this is done with it. */
  private async standing(em: EntityManager, actor: Actor, id: string): Promise<Hold> {
    if (!can(actor, 'pos.sell')) {
      throw AppError.forbidden()
    }
    await em.query(`SELECT id FROM holds WHERE id = $1 FOR UPDATE`, [id])
    const hold = await this.find(em, actor, id)
    if (hold.status !== 'active') {
      throw AppError.conflict('HOLD_CLOSED', `${hold.number} allaqachon yopilgan`)
    }
    return hold
  }

  private async one(em: EntityManager, hold: Hold): Promise<HoldDto> {
    return (await this.load(em, [hold], await businessToday(em)))[0]
  }

  private async load(em: EntityManager, holds: Hold[], today: string): Promise<HoldDto[]> {
    if (!holds.length) {
      return []
    }
    const ids = holds.map((hold) => hold.id)
    const lines: (Omit<HoldLineDto, 'productId' | 'variantId'> & {
      hold_id: string
      variant_id: string
      product_id: string
    })[] = await em.query(
      `SELECT l.id, l.hold_id, l.variant_id, v.product_id, p.name, v.sku, l.qty::float8 AS qty,
              l.price::float8 AS price, concat_ws(', ', a1.name, a2.name, a3.name) AS label
       FROM hold_lines l
       JOIN product_variants v ON v.id = l.variant_id
       JOIN products p ON p.id = v.product_id
       LEFT JOIN attribute_values a1 ON a1.id = v.value1_id
       LEFT JOIN attribute_values a2 ON a2.id = v.value2_id
       LEFT JOIN attribute_values a3 ON a3.id = v.value3_id
       WHERE l.hold_id = ANY($1)
       ORDER BY l.hold_id, l.position`,
      [ids],
    )
    const about: { id: string; location: string; phone: string | null; sale: string | null }[] = await em.query(
      `SELECT h.id, l.name AS location, c.phone, s.number AS sale
       FROM holds h
       JOIN locations l ON l.id = h.location_id
       JOIN customers c ON c.id = h.customer_id
       LEFT JOIN sales s ON s.id = h.sale_id
       WHERE h.id = ANY($1)`,
      [ids],
    )
    const more = new Map(about.map((row) => [row.id, row]))
    return holds.map((hold) => ({
      id: hold.id,
      number: hold.number,
      status: hold.status,
      locationId: hold.locationId,
      locationName: more.get(hold.id)?.location ?? '',
      customerId: hold.customerId,
      customerName: hold.customerName,
      customerPhone: more.get(hold.id)?.phone ?? null,
      dueDate: hold.dueDate,
      overdue: hold.status === 'active' && hold.dueDate < today,
      note: hold.note,
      priceTypeId: hold.priceTypeId,
      total: hold.total,
      qty: hold.totalQty,
      lines: lines
        .filter((line) => line.hold_id === hold.id)
        .map((line) => ({
          id: line.id,
          variantId: line.variant_id,
          productId: line.product_id,
          name: line.name,
          label: line.label ?? '',
          sku: line.sku,
          qty: line.qty,
          price: line.price,
        })),
      saleId: hold.saleId,
      saleNumber: more.get(hold.id)?.sale ?? null,
      createdByName: hold.createdByName,
      createdAt: hold.createdAt.toISOString(),
      closedByName: hold.closedByName,
      closedAt: hold.closedAt?.toISOString() ?? null,
    }))
  }
}

/** Holds are seen by those who sell, and by those who may see what is sold. */
function sees(actor: Actor) {
  if (!can(actor, 'pos.sell') && !can(actor, 'sales.view')) {
    throw AppError.forbidden()
  }
}
