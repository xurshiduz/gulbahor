import {
  debtState,
  formatMoney,
  queryKeys,
  spreadOverDebts,
  type CustomerDebtDto,
  type DebtListQuery,
  type DebtPaymentDto,
  type DebtPaymentInput,
  type DebtPaymentListQuery,
  type DebtSummary,
  type Page,
  type PaymentAccountDto,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import { In, type EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Account, Customer, DebtPayment, DebtPaymentLine, DebtPaymentPart, Shift } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { nextNumbers } from '../catalog/counters'
import { rateLimit, valueLine } from '../money/agreed'
import { LedgerService, type Posting } from '../money/ledger.service'
import { MoneyService } from '../money/money.service'
import { mayUse } from '../money/places'
import { RealtimeService } from '../realtime/realtime.service'
import { DEBT_LEFT, DEBT_OWED, DEBT_TODAY } from './debts'

const DOCUMENT = 'debt_payment'

/** Where a debt may be paid into by someone who keeps the debts; a cashier takes it at the till, in cash or to a card. */
const PLACES = ['cash', 'safe', 'bank', 'card']
const TILL_PLACES = ['cash', 'card']

const CHANGED = ['customer-debts', 'customers', 'money', 'pos', 'shifts']

const placesFor = (actor: Actor) => (can(actor, 'customers.debts') ? PLACES : TILL_PLACES)

interface DebtRow {
  id: string
  customer_id: string
  customer_name: string
  customer_phone: string
  sale_id: string
  sale_number: string
  sold_at: Date
  location_name: string
  amount: number
  paid: number
  returned: number
  due_date: string
  cancelled: boolean
  today: string
  customer_owed: number
}

function debtDto(row: DebtRow): CustomerDebtDto {
  const left = row.cancelled ? 0 : row.amount - row.paid - row.returned
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    saleId: row.sale_id,
    saleNumber: row.sale_number,
    soldAt: new Date(row.sold_at).toISOString(),
    locationName: row.location_name,
    amount: row.amount,
    paid: row.paid,
    returned: row.returned,
    left,
    dueDate: row.due_date,
    state: debtState({ left, dueDate: row.due_date, cancelled: row.cancelled }, row.today),
    customerOwed: row.customer_owed,
  }
}

/**
 * What customers owe, and the money they bring against it. A payment is
 * shared out over the customer's debts, the one due first paid first; taken
 * back, it comes off the same debts again.
 */
@Injectable()
export class CustomerDebtsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly ledger: LedgerService,
    private readonly money: MoneyService,
  ) {}

  /** The places a debt can be paid into, for the form. */
  async accounts(actor: Actor): Promise<PaymentAccountDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => this.money.paymentAccounts(em, actor, placesFor(actor)))
  }

  async list(actor: Actor, query: DebtListQuery): Promise<Page<CustomerDebtDto> & { summary: DebtSummary }> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const where: string[] = []
      const params: unknown[] = []
      const param = (value: unknown) => `$${params.push(value)}`
      if (query.state === 'owed') where.push(DEBT_OWED)
      if (query.state === 'overdue') where.push(`${DEBT_OWED} AND d.due_date < ${DEBT_TODAY}`)
      if (query.state === 'closed') where.push(`NOT d.cancelled AND d.paid + d.returned >= d.amount`)
      if (query.customerId) where.push(`d.customer_id = ${param(query.customerId)}`)
      if (query.locationId) where.push(`d.location_id = ${param(query.locationId)}`)
      // A name, a phone or a receipt's number; typed in either layout.
      const keys = queryKeys(query.q ?? '')
      if (keys.length) {
        const any = keys.map((key) => {
          const words = key.split(' ').map((word) => `c.search_key LIKE ${param(`%${word}%`)}`)
          return `(${words.join(' AND ')})`
        })
        where.push(
          `(${any.join(' OR ')} OR lower(s.number) LIKE ${param(`%${(query.q ?? '').trim().toLowerCase()}%`)})`,
        )
      }
      const filter = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const from = `FROM customer_debts d
        JOIN customers c ON c.id = d.customer_id
        JOIN sales s ON s.id = d.sale_id
        JOIN locations l ON l.id = d.location_id`

      const [{ total }]: { total: number }[] = await em.query(`SELECT count(*)::int AS total ${from} ${filter}`, params)
      const rows: DebtRow[] = await em.query(
        `SELECT d.id, d.customer_id, c.name AS customer_name, c.phone AS customer_phone, d.sale_id,
                s.number AS sale_number, s.sold_at, l.name AS location_name,
                d.amount::float8 AS amount, d.paid::float8 AS paid, d.returned::float8 AS returned,
                d.due_date::text AS due_date, d.cancelled, ${DEBT_TODAY}::text AS today,
                (SELECT coalesce(sum(x.amount - x.paid - x.returned), 0)::float8 FROM customer_debts x
                 WHERE x.customer_id = d.customer_id AND NOT x.cancelled) AS customer_owed
         ${from} ${filter}
         ORDER BY (${DEBT_OWED}) DESC, d.due_date, d.created_at
         LIMIT ${param(query.size)} OFFSET ${param((query.page - 1) * query.size)}`,
        params,
      )
      const [summary]: { owed: number; debtors: number; overdue: number; overdue_debtors: number }[] = await em.query(
        `SELECT coalesce(sum(${DEBT_LEFT}), 0)::float8 AS owed, count(DISTINCT d.customer_id)::int AS debtors,
                coalesce(sum(${DEBT_LEFT}) FILTER (WHERE d.due_date < ${DEBT_TODAY}), 0)::float8 AS overdue,
                count(DISTINCT d.customer_id) FILTER (WHERE d.due_date < ${DEBT_TODAY})::int AS overdue_debtors
         FROM customer_debts d WHERE ${DEBT_OWED}`,
      )
      return {
        items: rows.map(debtDto),
        total,
        page: query.page,
        size: query.size,
        summary: {
          owed: summary.owed,
          debtors: summary.debtors,
          overdue: summary.overdue,
          overdueDebtors: summary.overdue_debtors,
        },
      }
    })
  }

  /** Takes money against what a customer owes: into the accounts it was brought to, off the debts due first. */
  async pay(actor: Actor, input: DebtPaymentInput): Promise<DebtPaymentDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const again = await em.findOneBy(DebtPayment, { clientKey: input.clientKey })
      if (again) {
        return this.load(em, again)
      }
      const customer = await em.findOneBy(Customer, { id: input.customerId })
      if (!customer) {
        throw AppError.validation({ customerId: 'Mijoz topilmadi' })
      }
      // Their debts are held: two payments cannot both pay the same one off.
      const debts: { id: string; left: number }[] = await em.query(
        `SELECT d.id, ${DEBT_LEFT}::float8 AS left FROM customer_debts d
         WHERE d.customer_id = $1 AND ${DEBT_OWED} ORDER BY d.due_date, d.created_at FOR UPDATE`,
        [customer.id],
      )
      const owed = debts.reduce((sum, debt) => sum + debt.left, 0)
      if (!owed) {
        throw AppError.conflict('NO_DEBT_LEFT', `${customer.name}: qarzi yo‘q`)
      }

      const today = await this.ledger.today(em, actor.orgId)
      const dayRate = actor.modules.includes('usd') ? ((await this.ledger.rate(em, today))?.uzsPerUsd ?? null) : null
      const limit = await rateLimit(em, actor)
      const places = placesFor(actor)
      const ids = [...new Set(input.lines.map((line) => line.accountId))].sort()
      await em.query(`SELECT 1 FROM accounts WHERE id = ANY($1) ORDER BY id FOR UPDATE`, [ids])
      const accounts = await em.findBy(Account, { id: In(ids) })
      const accountOf = new Map(accounts.map((account) => [account.id, account]))

      const fields: Record<string, string> = {}
      const lines: {
        account: Account
        amount: number
        rate: number | null
        /** What the line pays off in so'm, and what its money is worth at the day's rate. */
        base: number
        cashBase: number
        shiftId: string | null
      }[] = []
      for (const [index, line] of input.lines.entries()) {
        const account = accountOf.get(line.accountId)
        if (!account || !account.isActive || !places.includes(account.kind) || !mayUse(actor, account)) {
          fields[`lines.${index}.accountId`] = 'Hisob topilmadi'
          continue
        }
        let shiftId: string | null = null
        if (account.kind === 'cash') {
          // Money put into a drawer between shifts would be found by nobody's count.
          const open = await em.findOneBy(Shift, { registerId: account.registerId as string, status: 'open' })
          if (!open) {
            fields[`lines.${index}.accountId`] = `${account.name}: smena ochilmagan`
            continue
          }
          shiftId = open.id
        }
        if (account.currency === 'USD' && !dayRate) {
          fields[`lines.${index}.amount`] = 'Dollar kursi qo‘yilmagan'
          continue
        }
        // Dollars may be taken for an agreed sum of so'm, within what this person may agree to.
        const worth = valueLine(line.amount, account.currency, 'UZS', dayRate, line.settled, limit)
        if (typeof worth === 'string') {
          fields[`lines.${index}.settled`] = worth
          continue
        }
        lines.push({
          account,
          amount: line.amount,
          rate: worth.rate,
          base: worth.settled,
          cashBase: worth.cashBase,
          shiftId,
        })
      }
      const first = Object.values(fields)[0]
      if (first) {
        throw AppError.validation(fields, first)
      }
      const total = lines.reduce((sum, line) => sum + line.base, 0)
      if (total !== input.total) {
        throw AppError.conflict('RATE_CHANGED', 'Kurs o‘zgargan: summani qayta tekshiring')
      }
      const { parts, rest } = spreadOverDebts(debts, total)
      if (rest > 0) {
        throw AppError.validation(
          { total: `Qarzi ${formatMoney(owed)}` },
          `${customer.name}ning qarzi ${formatMoney(owed)}: undan ko‘p olinmaydi`,
        )
      }

      // QZ: «qarz». QT is taken by returns.
      const number = `QZ-${String(await nextNumbers(em, actor.orgId, DOCUMENT)).padStart(6, '0')}`
      const paidBy = [...new Set(lines.map((line) => line.account.name))].join(', ')
      const payment = await em.save(
        em.create(DebtPayment, {
          orgId: actor.orgId,
          number,
          clientKey: input.clientKey,
          status: 'posted',
          customerId: customer.id,
          total,
          paidAt: new Date(),
          paidOn: today,
          paidBy,
          createdBy: actor.userId,
          createdByName: actor.name,
          note: input.note ?? null,
        }),
      )
      await em.insert(
        DebtPaymentLine,
        lines.map((line, position) => ({
          orgId: actor.orgId,
          paymentId: payment.id,
          position,
          accountId: line.account.id,
          currency: line.account.currency,
          amount: line.amount,
          rate: line.rate,
          base: line.base,
          fx: line.cashBase - line.base,
          shiftId: line.shiftId,
        })),
      )
      await em.insert(
        DebtPaymentPart,
        parts.map((part) => ({ orgId: actor.orgId, paymentId: payment.id, debtId: part.debtId, amount: part.amount })),
      )
      for (const part of parts) {
        await em.query(`UPDATE customer_debts SET paid = paid + $2 WHERE id = $1`, [part.debtId, part.amount])
      }

      // The money is in the accounts; that much less is owed.
      const receivables = await this.ledger.systemAccount(em, actor.orgId, 'receivables')
      // The money comes in at what the day's rate makes it; the debt goes down by what it was taken for.
      const postings: Posting[] = lines.map((line) => ({
        accountId: line.account.id,
        amount: line.amount,
        base: line.cashBase,
      }))
      postings.push({ accountId: receivables.id, amount: -total, base: -total })
      // What lies between the two is the rate's.
      const fx = lines.reduce((sum, line) => sum + line.cashBase - line.base, 0)
      if (fx) {
        const difference = await this.ledger.systemAccount(em, actor.orgId, 'fx')
        postings.push({ accountId: difference.id, amount: -fx, base: -fx })
      }
      await this.ledger.post(
        em,
        actor,
        {
          date: today,
          kind: DOCUMENT,
          documentType: DOCUMENT,
          documentId: payment.id,
          shiftId: lines.find((line) => line.shiftId)?.shiftId ?? null,
        },
        postings,
      )

      await this.audit.record(em, actor.orgId, actor, {
        action: 'debt.pay',
        entity: 'customer',
        entityId: customer.id,
        summary: `${number}: ${customer.name}, ${formatMoney(total)} (${paidBy})${input.note ? ` — ${input.note}` : ''}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, CHANGED))
      return this.load(em, payment)
    })
  }

  /**
   * Takes a payment back: the money leaves the accounts it went into and is
   * owed again. What went into a drawer can be taken back only while that
   * shift is open.
   */
  async cancel(actor: Actor, id: string, reason: string | null): Promise<DebtPaymentDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await em.query(`SELECT 1 FROM debt_payments WHERE id = $1 FOR UPDATE`, [id])
      const payment = await em.findOneBy(DebtPayment, { id })
      if (!payment) {
        throw AppError.notFound('To‘lov topilmadi')
      }
      if (payment.status !== 'posted') {
        throw AppError.conflict('PAYMENT_CANCELLED', 'Bu to‘lov allaqachon bekor qilingan')
      }
      const lines = await em.find(DebtPaymentLine, { where: { paymentId: id }, order: { position: 'ASC' } })
      const shiftIds = lines.flatMap((line) => (line.shiftId ? [line.shiftId] : []))
      if (shiftIds.length && (await em.countBy(Shift, { id: In(shiftIds), status: 'closed' }))) {
        throw AppError.conflict('SHIFT_CLOSED', 'Smena yopilgan: bu to‘lov endi bekor qilinmaydi')
      }
      const ids = [...new Set(lines.map((line) => line.accountId))].sort()
      await em.query(`SELECT 1 FROM accounts WHERE id = ANY($1) ORDER BY id FOR UPDATE`, [ids])
      const accounts = await em.findBy(Account, { id: In(ids) })
      for (const account of accounts) {
        const out = lines.reduce((sum, line) => sum + (line.accountId === account.id ? line.amount : 0), 0)
        if (out > account.balance) {
          throw AppError.conflict('NO_MONEY', `${account.name}: hisobda bu pul qolmagan`)
        }
      }
      const parts = await em.findBy(DebtPaymentPart, { paymentId: id })
      await em.query(`SELECT 1 FROM customer_debts WHERE id = ANY($1) ORDER BY id FOR UPDATE`, [
        parts.map((part) => part.debtId),
      ])
      for (const part of parts) {
        await em.query(`UPDATE customer_debts SET paid = paid - $2 WHERE id = $1`, [part.debtId, part.amount])
      }

      const today = await this.ledger.today(em, actor.orgId)
      await this.ledger.reverse(
        em,
        actor,
        {
          date: today,
          kind: `${DOCUMENT}_cancel`,
          documentType: DOCUMENT,
          documentId: id,
          shiftId: shiftIds[0] ?? null,
        },
        DOCUMENT,
      )
      await em.update(DebtPayment, id, {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: actor.userId,
        cancelledByName: actor.name,
        cancelReason: reason,
      })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'debt.pay_cancel',
        entity: 'customer',
        entityId: payment.customerId,
        summary: `${payment.number}: ${formatMoney(payment.total)}${reason ? ` — ${reason}` : ''}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, CHANGED))
      return this.load(em, await em.findOneByOrFail(DebtPayment, { id }))
    })
  }

  async payments(actor: Actor, query: DebtPaymentListQuery): Promise<Page<DebtPaymentDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em.createQueryBuilder(DebtPayment, 'p')
      if (query.status !== 'all') qb.andWhere('p.status = :status', { status: query.status })
      if (query.customerId) qb.andWhere('p.customerId = :customerId', { customerId: query.customerId })
      const [rows, total] = await qb
        .orderBy('p.paidAt', 'DESC')
        .skip((query.page - 1) * query.size)
        .take(query.size)
        .getManyAndCount()
      const items: DebtPaymentDto[] = []
      for (const row of rows) {
        items.push(await this.load(em, row))
      }
      return { items, total, page: query.page, size: query.size }
    })
  }

  private async load(em: EntityManager, payment: DebtPayment): Promise<DebtPaymentDto> {
    const customer = await em.findOneByOrFail(Customer, { id: payment.customerId })
    const lines: {
      account_name: string
      currency: 'UZS' | 'USD'
      amount: number
      base: number
      fx: number
    }[] = await em.query(
      `SELECT a.name AS account_name, l.currency, l.amount::float8 AS amount, l.base::float8 AS base,
              l.fx::float8 AS fx
       FROM debt_payment_lines l JOIN accounts a ON a.id = l.account_id
       WHERE l.payment_id = $1 ORDER BY l.position`,
      [payment.id],
    )
    const parts: { sale_number: string; amount: number }[] = await em.query(
      `SELECT s.number AS sale_number, p.amount::float8 AS amount
       FROM debt_payment_parts p JOIN customer_debts d ON d.id = p.debt_id JOIN sales s ON s.id = d.sale_id
       WHERE p.payment_id = $1 ORDER BY d.due_date, d.created_at`,
      [payment.id],
    )
    return {
      id: payment.id,
      number: payment.number,
      status: payment.status,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      total: payment.total,
      paidAt: payment.paidAt.toISOString(),
      paidBy: payment.paidBy,
      createdByName: payment.createdByName,
      note: payment.note,
      lines: lines.map((line) => ({
        accountName: line.account_name,
        currency: line.currency,
        amount: line.amount,
        base: line.base,
        fx: line.fx,
      })),
      parts: parts.map((part) => ({ saleNumber: part.sale_number, amount: part.amount })),
      cancelledAt: payment.cancelledAt?.toISOString() ?? null,
      cancelledByName: payment.cancelledByName,
      cancelReason: payment.cancelReason,
    }
  }
}
