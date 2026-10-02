import {
  formatMoney,
  toBase,
  type CurrencyCode,
  type Page,
  type PaymentMethod,
  type ShiftCloseInput,
  type ShiftDto,
  type ShiftListQuery,
  type ShiftOpenInput,
  type ShiftTotals,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Location, Register, Shift } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { nextNumbers } from '../catalog/counters'
import { RealtimeService } from '../realtime/realtime.service'
import { LedgerService, type Posting } from './ledger.service'

const mayWorkAt = (actor: Actor, locationId: string) => actor.allLocations || actor.locationIds.includes(locationId)

/**
 * A shift is one cashier's time at one till. It opens with a count of the
 * drawer and closes with another; what the count finds against what the
 * books say is written down as a difference, never smoothed over. The
 * closing count is blind: the cashier says what is there before anyone is
 * told what should be.
 */
@Injectable()
export class ShiftsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly ledger: LedgerService,
  ) {}

  async open(actor: Actor, input: ShiftOpenInput): Promise<ShiftDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      // Two people opening the same till at once: the second waits here and then finds it open.
      await em.query(`SELECT 1 FROM registers WHERE id = $1 FOR UPDATE`, [input.registerId])
      const register = await em.findOneBy(Register, { id: input.registerId })
      if (!register || !register.isActive || !mayWorkAt(actor, register.locationId)) {
        throw AppError.validation({ registerId: 'Kassa topilmadi' })
      }
      if (await em.findOneBy(Shift, { registerId: register.id, status: 'open' })) {
        throw AppError.conflict('SHIFT_OPEN', 'Bu kassada smena allaqachon ochiq')
      }
      const usd = actor.modules.includes('usd')
      if (input.cashUsd && !usd) {
        throw AppError.validation({ cashUsd: 'Dollar bilan ishlash yoqilmagan' })
      }

      const number = `SM-${String(await nextNumbers(em, actor.orgId, 'shift')).padStart(6, '0')}`
      const shift = await em.save(
        em.create(Shift, {
          orgId: actor.orgId,
          number,
          registerId: register.id,
          locationId: register.locationId,
          status: 'open',
          openedBy: actor.userId,
          openedByName: actor.name,
          openedAt: new Date(),
          openingUzs: input.cashUzs,
          openingUsd: input.cashUsd,
        }),
      )
      // The drawer is taken as counted. What differs from the books is a difference found at opening;
      // a drawer that never had anything posted to it simply starts with what is in it.
      await this.bringTo(em, actor, shift, register, 'shift_open', {
        UZS: input.cashUzs,
        USD: usd ? input.cashUsd : null,
      })

      await this.audit.record(em, actor.orgId, actor, {
        action: 'shift.open',
        entity: 'shift',
        entityId: shift.id,
        summary: `${number}: ${register.name}, ${formatMoney(input.cashUzs)}${
          input.cashUsd ? `, ${formatMoney(input.cashUsd, 'USD')}` : ''
        }`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['shifts', 'money', 'pos']))
      return this.load(em, actor, shift.id)
    })
  }

  async close(actor: Actor, id: string, input: ShiftCloseInput): Promise<ShiftDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await em.query(`SELECT 1 FROM shifts WHERE id = $1 FOR UPDATE`, [id])
      const shift = await this.find(em, actor, id)
      if (shift.status !== 'open') {
        throw AppError.conflict('SHIFT_CLOSED', 'Smena allaqachon yopilgan')
      }
      if (shift.openedBy !== actor.userId && !can(actor, 'sales.shifts')) {
        throw AppError.forbidden('Smenani uni ochgan kassir yoki rahbar yopadi')
      }
      const register = await em.findOneByOrFail(Register, { id: shift.registerId })
      const usd = actor.modules.includes('usd')
      if (input.cashUsd && !usd) {
        throw AppError.validation({ cashUsd: 'Dollar bilan ishlash yoqilmagan' })
      }

      const found = await this.bringTo(em, actor, shift, register, 'shift_close', {
        UZS: input.cashUzs,
        USD: usd ? input.cashUsd : null,
      })
      await em.update(Shift, id, {
        status: 'closed',
        closedBy: actor.userId,
        closedByName: actor.name,
        closedAt: new Date(),
        countedUzs: input.cashUzs,
        countedUsd: input.cashUsd,
        expectedUzs: found.UZS.expected,
        expectedUsd: found.USD.expected,
        diffUzs: found.UZS.diff,
        diffUsd: found.USD.diff,
        note: input.note ?? null,
      })

      const differs = found.UZS.diff || found.USD.diff
      await this.audit.record(em, actor.orgId, actor, {
        action: 'shift.close',
        entity: 'shift',
        entityId: id,
        summary: `${shift.number}: ${register.name}${
          differs
            ? `, farq ${[
                found.UZS.diff ? formatMoney(found.UZS.diff) : null,
                found.USD.diff ? formatMoney(found.USD.diff, 'USD') : null,
              ]
                .filter(Boolean)
                .join(', ')}`
            : ', farqsiz'
        }`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['shifts', 'money', 'pos']))
      return this.load(em, actor, id)
    })
  }

  async get(actor: Actor, id: string): Promise<ShiftDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      await this.find(em, actor, id)
      return this.load(em, actor, id)
    })
  }

  async list(actor: Actor, query: ShiftListQuery): Promise<Page<ShiftDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em.createQueryBuilder(Shift, 's')
      if (!actor.allLocations) {
        qb.andWhere('s.locationId IN (:...mine)', { mine: actor.locationIds.length ? actor.locationIds : [null] })
      }
      if (!can(actor, 'sales.shifts')) qb.andWhere('s.openedBy = :me', { me: actor.userId })
      if (query.status !== 'all') qb.andWhere('s.status = :status', { status: query.status })
      if (query.locationId) qb.andWhere('s.locationId = :locationId', { locationId: query.locationId })
      if (query.q) qb.andWhere('s.number ILIKE :q', { q: `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%` })
      if (query.from || query.to) {
        const [{ timezone }] = await em.query(`SELECT timezone FROM organizations WHERE id = $1`, [actor.orgId])
        if (query.from) {
          qb.andWhere(`s.openedAt >= (:from::date::timestamp AT TIME ZONE :tz)`, { from: query.from, tz: timezone })
        }
        if (query.to) {
          qb.andWhere(`s.openedAt < ((:to::date + 1)::timestamp AT TIME ZONE :tz)`, { to: query.to, tz: timezone })
        }
      }
      const [rows, total] = await qb
        .orderBy('s.openedAt', 'DESC')
        .skip((query.page - 1) * query.size)
        .take(query.size)
        .getManyAndCount()
      const items: ShiftDto[] = []
      for (const row of rows) {
        items.push(await this.load(em, actor, row.id))
      }
      return { items, total, page: query.page, size: query.size }
    })
  }

  /** A shift as a person is allowed to see it. Used by the till as well, inside its own transaction. */
  async load(em: EntityManager, actor: Actor, id: string): Promise<ShiftDto> {
    const shift = await em.findOneByOrFail(Shift, { id })
    const register = await em.findOneByOrFail(Register, { id: shift.registerId })
    const location = await em.findOneByOrFail(Location, { id: shift.locationId })
    // What the books expected is for those who check the cashier, and only once the count is in.
    const reviews = can(actor, 'sales.shifts') && shift.status === 'closed'
    return {
      id: shift.id,
      number: shift.number,
      status: shift.status,
      registerId: shift.registerId,
      registerName: register.name,
      locationId: shift.locationId,
      locationName: location.name,
      openedAt: shift.openedAt.toISOString(),
      openedByName: shift.openedByName,
      openingUzs: shift.openingUzs,
      openingUsd: shift.openingUsd,
      closedAt: shift.closedAt ? shift.closedAt.toISOString() : null,
      closedByName: shift.closedByName,
      countedUzs: shift.countedUzs,
      countedUsd: shift.countedUsd,
      expectedUzs: reviews ? shift.expectedUzs : null,
      expectedUsd: reviews ? shift.expectedUsd : null,
      diffUzs: reviews ? shift.diffUzs : null,
      diffUsd: reviews ? shift.diffUsd : null,
      note: shift.note,
      totals: await this.totals(em, id),
    }
  }

  /** The Z-report: what was sold in the shift and how it was paid. */
  private async totals(em: EntityManager, shiftId: string): Promise<ShiftTotals> {
    const [sales]: {
      sales: number
      voided: number
      qty: number
      discount: number
      total: number
      change_uzs: number
      change_usd: number
      rounding: number
    }[] = await em.query(
      `SELECT count(*) FILTER (WHERE status = 'completed')::int AS sales,
              count(*) FILTER (WHERE status = 'voided')::int AS voided,
              coalesce(sum(qty) FILTER (WHERE status = 'completed'), 0)::float8 AS qty,
              coalesce(sum(discount) FILTER (WHERE status = 'completed'), 0)::float8 AS discount,
              coalesce(sum(total) FILTER (WHERE status = 'completed'), 0)::float8 AS total,
              coalesce(sum(change_uzs) FILTER (WHERE status = 'completed'), 0)::float8 AS change_uzs,
              coalesce(sum(change_usd) FILTER (WHERE status = 'completed'), 0)::float8 AS change_usd,
              coalesce(sum(rounding) FILTER (WHERE status = 'completed'), 0)::float8 AS rounding
       FROM sales WHERE shift_id = $1`,
      [shiftId],
    )
    const payments: {
      method: PaymentMethod
      account_name: string
      currency: CurrencyCode
      amount: number
      base: number
    }[] = await em.query(
      `SELECT p.method, a.name AS account_name, p.currency, sum(p.amount)::float8 AS amount, sum(p.base)::float8 AS base
       FROM sale_payments p
       JOIN sales s ON s.id = p.sale_id
       JOIN accounts a ON a.id = p.account_id
       WHERE s.shift_id = $1 AND s.status = 'completed'
       GROUP BY p.method, a.name, p.currency
       ORDER BY array_position(ARRAY['cash', 'card', 'terminal'], p.method), p.currency DESC, a.name`,
      [shiftId],
    )
    return {
      sales: sales.sales,
      voided: sales.voided,
      qty: sales.qty,
      discount: sales.discount,
      total: sales.total,
      payments: payments.map((row) => ({
        method: row.method,
        accountName: row.account_name,
        currency: row.currency,
        amount: row.amount,
        base: row.base,
      })),
      changeUzs: sales.change_uzs,
      changeUsd: sales.change_usd,
      rounding: sales.rounding,
    }
  }

  /**
   * Makes the drawer's accounts say what was counted, posting the difference
   * against the cash-difference account (or, for a drawer never used before,
   * as its opening balance). Returns what the books had said.
   */
  private async bringTo(
    em: EntityManager,
    actor: Actor,
    shift: Shift,
    register: Register,
    kind: 'shift_open' | 'shift_close',
    counted: Record<CurrencyCode, number | null>,
  ): Promise<Record<CurrencyCode, { expected: number; diff: number }>> {
    const today = await this.ledger.today(em, actor.orgId)
    const rate = await this.ledger.rate(em, today)
    const result = { UZS: { expected: 0, diff: 0 }, USD: { expected: 0, diff: 0 } }
    const postings: Posting[] = []

    for (const currency of ['UZS', 'USD'] as const) {
      const amount = counted[currency]
      if (amount === null) {
        continue
      }
      const account = await this.ledger.cashAccount(em, register, currency)
      const diff = amount - account.balance
      result[currency] = { expected: account.balance, diff }
      if (!diff) {
        continue
      }
      if (currency === 'USD' && !rate) {
        throw AppError.conflict('NO_RATE', "Dollar kursi qo'yilmagan. Avval kursni kiriting")
      }
      const base = toBase(diff, currency, rate?.uzsPerUsd ?? null)
      const fresh = kind === 'shift_open' && !(await this.ledger.isUsed(em, account.id))
      const other = await this.ledger.systemAccount(em, actor.orgId, fresh ? 'opening' : 'cash_diff')
      postings.push({ accountId: account.id, amount: diff, base }, { accountId: other.id, amount: -base, base: -base })
    }

    await this.ledger.post(
      em,
      actor,
      { date: today, kind, documentType: 'shift', documentId: shift.id, shiftId: shift.id },
      postings,
    )
    return result
  }

  private async find(em: EntityManager, actor: Actor, id: string): Promise<Shift> {
    const shift = await em.findOneBy(Shift, { id })
    if (!shift || !mayWorkAt(actor, shift.locationId)) {
      throw AppError.notFound('Smena topilmadi')
    }
    if (shift.openedBy !== actor.userId && !can(actor, 'sales.shifts')) {
      throw AppError.notFound('Smena topilmadi')
    }
    return shift
  }
}
