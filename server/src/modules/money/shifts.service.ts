import { randomUUID } from 'node:crypto'

import {
  formatMoney,
  tillWorth,
  type AnyCurrency,
  type MoneySentEvent,
  type Page,
  type PaymentMethod,
  type ShiftCashMoves,
  type ShiftCloseInput,
  type ShiftDto,
  type ShiftListQuery,
  type ShiftOpenInput,
  type ShiftTotals,
} from '@erp/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Account, Location, Register, Shift, ShiftCount, ShiftTerminalCount } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { nextNumbers } from '../catalog/counters'
import { RealtimeService } from '../realtime/realtime.service'
import { wantingRate } from './agreed'
import { tillCurrenciesOf } from './base'
import { LedgerService, type Posting } from './ledger.service'
import { bookFrom, ratesInForce } from './rate-book'
import { MoneyTransfersService } from './transfers.service'

const mayWorkAt = (actor: Actor, locationId: string) => actor.allLocations || actor.locationIds.includes(locationId)

/**
 * The cash counted in each of a till's currencies; one left out was counted as nothing. Cash in a currency the
 * till does not take is refused.
 */
function countedIn(till: AnyCurrency[], cash: ShiftOpenInput['cash']): Map<AnyCurrency, number> {
  const fields: Record<string, string> = {}
  for (const [currency, amount] of Object.entries(cash) as [AnyCurrency, number][]) {
    if (amount && !till.includes(currency)) {
      fields[`cash.${currency}`] = 'Bu valyuta bu kassada qabul qilinmaydi'
    }
  }
  if (Object.keys(fields).length) {
    throw AppError.validation(fields)
  }
  return new Map(till.map((currency) => [currency, cash[currency] ?? 0]))
}

/** Sums in words, one currency after another: what is not there is left out, but the first always says something. */
const sumsText = (sums: [AnyCurrency, number][]) =>
  sums
    .filter(([, amount], index) => amount || index === 0)
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(', ')

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
    private readonly transfers: MoneyTransfersService,
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
      const till = tillCurrenciesOf(actor, register)
      const cash = countedIn(till, input.cash)

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
        }),
      )
      await em.insert(
        ShiftCount,
        till.map((currency) => ({ orgId: actor.orgId, shiftId: shift.id, currency, opening: cash.get(currency) ?? 0 })),
      )
      // Each drawer is taken as counted. What differs from the books is a difference found at opening;
      // a drawer that never had anything posted to it simply starts with what is in it.
      await this.bringTo(em, actor, shift, register, 'shift_open', cash)

      await this.audit.record(em, actor.orgId, actor, {
        action: 'shift.open',
        entity: 'shift',
        entityId: shift.id,
        summary: `${number}: ${register.name}, ${sumsText([...cash])}`,
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
      const cash = countedIn(tillCurrenciesOf(actor, register), input.cash)

      const found = await this.bringTo(em, actor, shift, register, 'shift_close', cash)
      // What is handed over as the shift ends leaves the drawer now, while the shift is still its own;
      // it reaches the safe when whoever keeps it says so.
      const drawers = await em.findBy(Account, { registerId: register.id })
      const handed: Partial<Record<AnyCurrency, number>> = {}
      const handedOver: MoneySentEvent[] = []
      for (const [index, handover] of input.handovers.entries()) {
        const to = await em.findOneBy(Account, { id: handover.toAccountId })
        const from = drawers.find((drawer) => drawer.currency === to?.currency)
        if (!to || !from) {
          throw AppError.validation({ [`handovers.${index}.toAccountId`]: 'Hisob topilmadi' })
        }
        const sum = (handed[from.currency] ?? 0) + handover.amount
        handed[from.currency] = sum
        if (sum > (cash.get(from.currency) ?? 0)) {
          throw AppError.validation({ [`handovers.${index}.amount`]: 'Sanalgan puldan ko‘p topshirib bo‘lmaydi' })
        }
        const sent = await this.transfers.sendIn(em, actor, {
          clientKey: randomUUID(),
          fromAccountId: from.id,
          toAccountId: to.id,
          amount: handover.amount,
          note: `${shift.number} yopildi`,
        })
        handedOver.push(await this.transfers.sentNotice(em, sent))
      }
      // What each terminal's own slip says it took, against what was rung up on it in this shift.
      const rung = await this.terminalTotals(em, id)
      for (const [index, terminal] of input.terminals.entries()) {
        const account = await em.findOneBy(Account, { id: terminal.accountId, kind: 'terminal' })
        if (!account) {
          throw AppError.validation({ [`terminals.${index}.accountId`]: 'Terminal topilmadi' })
        }
        const expected = rung.get(account.id) ?? 0
        await em.insert(ShiftTerminalCount, {
          orgId: actor.orgId,
          shiftId: id,
          accountId: account.id,
          counted: terminal.amount,
          expected,
          diff: terminal.amount - expected,
        })
      }
      await em.update(Shift, id, {
        status: 'closed',
        closedBy: actor.userId,
        closedByName: actor.name,
        closedAt: new Date(),
        note: input.note ?? null,
      })
      // A drawer the till took on during the shift has no row from the opening yet.
      for (const [currency, counted] of cash) {
        const { expected, diff } = found.get(currency) as { expected: number; diff: number }
        await em.query(
          `INSERT INTO shift_counts (org_id, shift_id, currency, counted, expected, diff) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (shift_id, currency)
           DO UPDATE SET counted = EXCLUDED.counted, expected = EXCLUDED.expected, diff = EXCLUDED.diff`,
          [actor.orgId, id, currency, counted, expected, diff],
        )
      }

      const diffs = [...found].filter(([, result]) => result.diff)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'shift.close',
        entity: 'shift',
        entityId: id,
        summary: `${shift.number}: ${register.name}${
          diffs.length
            ? `, farq ${diffs.map(([currency, result]) => formatMoney(result.diff, currency)).join(', ')}`
            : ', farqsiz'
        }`,
      })
      afterCommit(() => {
        this.realtime.changed(actor.orgId, ['shifts', 'money', 'pos'])
        // Whoever keeps the safe hears that the till's cash is on its way.
        for (const notice of handedOver) {
          this.realtime.event(actor.orgId, 'money.sent', notice)
        }
      })
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
    const till = tillCurrenciesOf(actor, register)
    const rows = await em.findBy(ShiftCount, { shiftId: id })
    // The till's own currencies in its order, then any it no longer takes.
    const place = (currency: AnyCurrency) => (till.includes(currency) ? till.indexOf(currency) : till.length)
    rows.sort((a, b) => place(a.currency) - place(b.currency) || a.currency.localeCompare(b.currency))
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
      closedAt: shift.closedAt ? shift.closedAt.toISOString() : null,
      closedByName: shift.closedByName,
      counts: rows.map((row) => ({
        currency: row.currency,
        opening: row.opening,
        counted: row.counted,
        expected: reviews ? row.expected : null,
        diff: reviews ? row.diff : null,
      })),
      note: shift.note,
      totals: await this.totals(em, id, [...till, ...rows.map((row) => row.currency)]),
      terminals: await this.terminals(em, id, reviews),
    }
  }

  /** What was taken through each terminal in a shift: payments rung up on it, less what was handed back to it. */
  private async terminalTotals(em: EntityManager, shiftId: string): Promise<Map<string, number>> {
    const rows: { account_id: string; amount: number }[] = await em.query(
      `SELECT account_id, sum(amount)::float8 AS amount FROM (
         SELECT p.account_id, p.base AS amount FROM sale_payments p JOIN sales s ON s.id = p.sale_id
         WHERE s.shift_id = $1 AND s.status = 'completed' AND p.method = 'terminal'
         UNION ALL
         SELECT p.account_id, -p.base FROM sale_return_payments p JOIN sale_returns r ON r.id = p.return_id
         WHERE r.shift_id = $1 AND p.method = 'terminal'
       ) x GROUP BY account_id`,
      [shiftId],
    )
    return new Map(rows.map((row) => [row.account_id, row.amount]))
  }

  private async terminals(em: EntityManager, shiftId: string, reviews: boolean): Promise<ShiftDto['terminals']> {
    const rows: { account_id: string; name: string; counted: number; expected: number; diff: number }[] =
      await em.query(
        `SELECT c.account_id, a.name, c.counted::float8 AS counted, c.expected::float8 AS expected, c.diff::float8 AS diff
         FROM shift_terminal_counts c JOIN accounts a ON a.id = c.account_id
         WHERE c.shift_id = $1 ORDER BY a.name`,
        [shiftId],
      )
    return rows.map((row) => ({
      accountId: row.account_id,
      name: row.name,
      counted: row.counted,
      expected: reviews ? row.expected : null,
      diff: reviews ? row.diff : null,
    }))
  }

  /**
   * The Z-report: what was sold in the shift and how it was paid, and what
   * moved in and out of each drawer — `drawers` first, in their order, then
   * any other currency something moved in.
   */
  private async totals(em: EntityManager, shiftId: string, drawers: AnyCurrency[]): Promise<ShiftTotals> {
    const base = drawers[0]
    const [sales]: {
      sales: number
      voided: number
      qty: number
      discount: number
      total: number
      change_uzs: number
      rounding: number
    }[] = await em.query(
      `SELECT count(*) FILTER (WHERE status = 'completed')::int AS sales,
              count(*) FILTER (WHERE status = 'voided')::int AS voided,
              coalesce(sum(qty) FILTER (WHERE status = 'completed'), 0)::float8 AS qty,
              coalesce(sum(discount) FILTER (WHERE status = 'completed'), 0)::float8 AS discount,
              coalesce(sum(total) FILTER (WHERE status = 'completed'), 0)::float8 AS total,
              coalesce(sum(change_uzs) FILTER (WHERE status = 'completed'), 0)::float8 AS change_uzs,
              coalesce(sum(rounding) FILTER (WHERE status = 'completed'), 0)::float8 AS rounding
       FROM sales WHERE shift_id = $1`,
      [shiftId],
    )
    const change: { currency: AnyCurrency; amount: number }[] = await em.query(
      `SELECT change_currency AS currency, sum(change_other)::float8 AS amount FROM sales
       WHERE shift_id = $1 AND status = 'completed' AND change_currency IS NOT NULL AND change_other <> 0
       GROUP BY change_currency`,
      [shiftId],
    )
    const payments: {
      method: PaymentMethod
      account_name: string
      currency: AnyCurrency
      amount: number
      base: number
    }[] = await em.query(
      `SELECT p.method, a.name AS account_name, p.currency, sum(p.amount)::float8 AS amount, sum(p.base)::float8 AS base
       FROM sale_payments p
       JOIN sales s ON s.id = p.sale_id
       JOIN accounts a ON a.id = p.account_id
       WHERE s.shift_id = $1 AND s.status = 'completed'
       GROUP BY p.method, a.name, p.currency
       ORDER BY array_position(ARRAY['cash', 'card', 'terminal', 'exchange', 'debt', 'partner'], p.method), p.currency DESC, a.name`,
      [shiftId],
    )
    const moved = await this.transfers.ofShift(em, shiftId)
    const partners: { kind: 'in' | 'out'; currency: AnyCurrency; amount: number }[] = await em.query(
      `SELECT p.kind, l.currency, sum(l.amount)::float8 AS amount
       FROM partner_payment_lines l JOIN partner_payments p ON p.id = l.payment_id
       WHERE l.shift_id = $1 AND p.status = 'posted' GROUP BY p.kind, l.currency`,
      [shiftId],
    )
    const ops: { kind: 'expense' | 'income'; currency: AnyCurrency; amount: number }[] = await em.query(
      `SELECT o.kind, l.currency, sum(l.amount)::float8 AS amount
       FROM money_op_lines l JOIN money_ops o ON o.id = l.op_id
       WHERE l.shift_id = $1 AND o.status = 'posted' GROUP BY o.kind, l.currency`,
      [shiftId],
    )
    const debts: { currency: AnyCurrency; amount: number }[] = await em.query(
      `SELECT l.currency, sum(l.amount)::float8 AS amount
       FROM debt_payment_lines l JOIN debt_payments p ON p.id = l.payment_id
       WHERE l.shift_id = $1 AND p.status = 'posted' GROUP BY l.currency`,
      [shiftId],
    )
    const [returns]: { returns: number; returned: number }[] = await em.query(
      `SELECT count(*)::int AS returns, coalesce(sum(total), 0)::float8 AS returned
       FROM sale_returns WHERE shift_id = $1`,
      [shiftId],
    )
    const refunds: typeof payments = await em.query(
      `SELECT p.method, a.name AS account_name, p.currency, sum(p.amount)::float8 AS amount, sum(p.base)::float8 AS base
       FROM sale_return_payments p
       JOIN sale_returns r ON r.id = p.return_id
       JOIN accounts a ON a.id = p.account_id
       WHERE r.shift_id = $1
       GROUP BY p.method, a.name, p.currency
       ORDER BY array_position(ARRAY['cash', 'card', 'terminal', 'debt', 'partner'], p.method), p.currency DESC, a.name`,
      [shiftId],
    )
    const seen = [
      ...drawers,
      ...change.map((row) => row.currency),
      ...(Object.keys({ ...moved.out, ...moved.in }) as AnyCurrency[]),
      ...partners.map((row) => row.currency),
      ...ops.map((row) => row.currency),
      ...debts.map((row) => row.currency),
    ]
    const cash: ShiftCashMoves[] = [...new Set(seen)].map((currency) => ({
      currency,
      change: currency === base ? sales.change_uzs : (change.find((row) => row.currency === currency)?.amount ?? 0),
      out: moved.out[currency] ?? 0,
      in: moved.in[currency] ?? 0,
      partnersIn: partners.find((row) => row.kind === 'in' && row.currency === currency)?.amount ?? 0,
      partnersOut: partners.find((row) => row.kind === 'out' && row.currency === currency)?.amount ?? 0,
      expenses: ops.find((row) => row.kind === 'expense' && row.currency === currency)?.amount ?? 0,
      income: ops.find((row) => row.kind === 'income' && row.currency === currency)?.amount ?? 0,
      debts: debts.find((row) => row.currency === currency)?.amount ?? 0,
    }))
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
      rounding: sales.rounding,
      cash,
      returns: returns.returns,
      returned: returns.returned,
      refunds: refunds.map((row) => ({
        method: row.method,
        accountName: row.account_name,
        currency: row.currency,
        amount: row.amount,
        base: row.base,
      })),
    }
  }

  /**
   * Makes each drawer's account say what was counted, posting the difference
   * against the cash-difference account (or, for a drawer never used before,
   * as its opening balance). Returns what the books had said, by currency.
   */
  private async bringTo(
    em: EntityManager,
    actor: Actor,
    shift: Shift,
    register: Register,
    kind: 'shift_open' | 'shift_close',
    counted: Map<AnyCurrency, number>,
  ): Promise<Map<AnyCurrency, { expected: number; diff: number }>> {
    const today = await this.ledger.today(em, actor.orgId)
    const book = bookFrom(actor.base, await ratesInForce(em, today))
    const result = new Map<AnyCurrency, { expected: number; diff: number }>()
    const postings: Posting[] = []

    for (const [currency, amount] of counted) {
      const account = await this.ledger.cashAccount(em, register, currency)
      const diff = amount - account.balance
      result.set(currency, { expected: account.balance, diff })
      if (!diff) {
        continue
      }
      const base = tillWorth(diff, currency, book)
      if (base === null) {
        throw AppError.conflict(
          'NO_RATE',
          `${wantingRate(book, currency) ?? 'Kurs qo‘yilmagan'}. Avval kursni kiriting`,
        )
      }
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
