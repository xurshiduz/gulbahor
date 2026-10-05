import {
  formatMoney,
  searchKey,
  settledFor,
  toBase,
  type Page,
  type PaymentAccountDto,
  type PartnerOpeningInput,
  type PartnerPaymentDto,
  type PartnerPaymentInput,
  type PartnerPaymentKind,
  type PartnerPaymentListQuery,
  type PartnerStatementDto,
  type PartnerStatementLine,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import { In, type EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch } from '../../common/listing'
import { Db } from '../../database/db.service'
import { Account, Partner, PartnerPayment, PartnerPaymentLine, Shift } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { nextNumbers } from '../catalog/counters'
import { LedgerService, type Posting } from '../money/ledger.service'
import { MoneyService } from '../money/money.service'
import { mayUse } from '../money/places'
import { RealtimeService } from '../realtime/realtime.service'
import { partnerDto } from './partners.service'

const DOCUMENT = 'partner_payment'

/** Where a partner's money can go, or come from: the places the business keeps its own. */
const PLACES = ['cash', 'safe', 'bank', 'card']

const CHANGED = ['partner-payments', 'partners', 'money', 'pos', 'shifts']

/**
 * Money changing hands with partners. A payment has a line for each sum
 * that went into, or out of, one of the business's accounts; from the rate
 * the system works out how much of the partner's account each settles, to
 * the cent, and what rounding leaves over goes to the exchange-difference
 * account. A payment is never edited: a wrong one is cancelled, which puts
 * everything back and keeps both in the books.
 */
@Injectable()
export class PartnerPaymentsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly ledger: LedgerService,
    private readonly money: MoneyService,
  ) {}

  /** The accounts a payment can go through, for the form: balances only for those who may see them. */
  async accounts(actor: Actor): Promise<PaymentAccountDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const rows = await this.money.accountRows(em, can(actor, 'money.view'))
      const shifts = await em.find(Shift, { where: { status: 'open' }, select: { registerId: true } })
      const open = new Set(shifts.map((shift) => shift.registerId))
      return rows
        .filter((account) => account.isActive && PLACES.includes(account.kind) && mayUse(actor, account))
        .map((account) => ({ ...account, open: account.kind !== 'cash' || open.has(account.registerId as string) }))
    })
  }

  async create(actor: Actor, input: PartnerPaymentInput): Promise<PartnerPaymentDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const again = await em.findOneBy(PartnerPayment, { clientKey: input.clientKey })
      if (again) {
        return this.load(em, again)
      }
      const partner = await this.partner(em, input.partnerId)
      const today = await this.ledger.today(em, actor.orgId)
      const dayRate = actor.modules.includes('usd') ? ((await this.ledger.rate(em, today))?.uzsPerUsd ?? null) : null
      const setsRates = can(actor, 'money.rates')
      const sign = input.kind === 'in' ? 1 : -1

      // The accounts are held: two payments out of one account cannot both spend the same money.
      const ids = [...new Set(input.lines.map((line) => line.accountId))].sort()
      await em.query(`SELECT 1 FROM accounts WHERE id = ANY($1) ORDER BY id FOR UPDATE`, [ids])
      const accounts = await em.findBy(Account, { id: In(ids) })
      const accountOf = new Map(accounts.map((account) => [account.id, account]))

      const fields: Record<string, string> = {}
      const spent = new Map<string, number>()
      const lines: {
        account: Account
        amount: number
        rate: number | null
        shiftId: string | null
        settled: number
        cashBase: number
        partnerBase: number
        fx: number
      }[] = []
      for (const [index, line] of input.lines.entries()) {
        const account = accountOf.get(line.accountId)
        if (!account || !account.isActive || !PLACES.includes(account.kind) || !mayUse(actor, account)) {
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
        // A rate matters only where one currency is changed into the other; only some may set their own.
        const changes = account.currency !== partner.currency
        const rate = changes || account.currency === 'USD' ? (setsRates && line.rate ? line.rate : dayRate) : null
        if ((changes || account.currency === 'USD') && !rate) {
          fields[`lines.${index}.amount`] = "Dollar kursi qo'yilmagan"
          continue
        }
        if (input.kind === 'out') {
          const out = (spent.get(account.id) ?? 0) + line.amount
          spent.set(account.id, out)
          if (out > account.balance) {
            fields[`lines.${index}.amount`] = "Hisobda buncha pul yo'q"
            continue
          }
        }
        lines.push({
          account,
          amount: line.amount,
          rate: changes ? rate : null,
          shiftId,
          ...settledFor(line.amount, account.currency, partner.currency, rate),
        })
      }
      const first = Object.values(fields)[0]
      if (first) {
        throw AppError.validation(fields, first)
      }
      const settled = lines.reduce((sum, line) => sum + line.settled, 0)
      if (settled !== input.settled) {
        throw AppError.conflict('RATE_CHANGED', "Kurs o'zgargan: summani qayta tekshiring")
      }

      const payment = await this.save(em, actor, {
        clientKey: input.clientKey,
        kind: input.kind,
        partner,
        // They owe less after paying, more after being paid.
        change: -sign * settled,
        today,
        paidBy: [...new Set(lines.map((line) => line.account.name))].join(', '),
        note: input.note ?? null,
      })
      await em.insert(
        PartnerPaymentLine,
        lines.map((line, position) => ({
          orgId: actor.orgId,
          paymentId: payment.id,
          position,
          accountId: line.account.id,
          currency: line.account.currency,
          amount: line.amount,
          rate: line.rate,
          settled: line.settled,
          shiftId: line.shiftId,
        })),
      )

      const account = await this.ledger.partnerAccount(em, partner)
      const postings: Posting[] = lines.map((line) => ({
        accountId: line.account.id,
        amount: sign * line.amount,
        base: sign * line.cashBase,
      }))
      postings.push({
        accountId: account.id,
        amount: -sign * settled,
        base: -sign * lines.reduce((sum, line) => sum + line.partnerBase, 0),
      })
      const fx = lines.reduce((sum, line) => sum + line.fx, 0)
      if (fx) {
        const difference = await this.ledger.systemAccount(em, actor.orgId, 'fx')
        postings.push({ accountId: difference.id, amount: -sign * fx, base: -sign * fx })
      }
      await this.ledger.post(
        em,
        actor,
        {
          date: today,
          kind: 'partner_payment',
          documentType: DOCUMENT,
          documentId: payment.id,
          shiftId: lines.find((line) => line.shiftId)?.shiftId ?? null,
        },
        postings,
      )

      await this.audit.record(em, actor.orgId, actor, {
        action: input.kind === 'in' ? 'partner_payment.in' : 'partner_payment.out',
        entity: 'partner_payment',
        entityId: payment.id,
        summary: `${payment.number}: ${partner.name}, ${formatMoney(settled, partner.currency)} (${payment.paidBy})`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, CHANGED))
      return this.load(em, payment)
    })
  }

  /** What stood between the business and a partner before the books began. */
  async opening(actor: Actor, input: PartnerOpeningInput): Promise<PartnerPaymentDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const again = await em.findOneBy(PartnerPayment, { clientKey: input.clientKey })
      if (again) {
        return this.load(em, again)
      }
      const partner = await this.partner(em, input.partnerId)
      const today = await this.ledger.today(em, actor.orgId)
      const rate = partner.currency === 'USD' ? ((await this.ledger.rate(em, today))?.uzsPerUsd ?? null) : null
      if (partner.currency === 'USD' && !rate) {
        throw AppError.validation({ amount: "Dollar kursi qo'yilmagan" })
      }
      const change = input.owes === 'partner' ? input.amount : -input.amount
      const base = toBase(change, partner.currency, rate)
      const payment = await this.save(em, actor, {
        clientKey: input.clientKey,
        kind: 'opening',
        partner,
        change,
        today,
        paidBy: '',
        note: input.note ?? null,
      })
      const account = await this.ledger.partnerAccount(em, partner)
      const before = await this.ledger.systemAccount(em, actor.orgId, 'opening')
      await this.ledger.post(
        em,
        actor,
        { date: today, kind: 'partner_payment', documentType: DOCUMENT, documentId: payment.id },
        [
          { accountId: account.id, amount: change, base },
          { accountId: before.id, amount: -base, base: -base },
        ],
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'partner_payment.opening',
        entity: 'partner_payment',
        entityId: payment.id,
        summary: `${payment.number}: ${partner.name}, ${
          input.owes === 'partner' ? 'qarzi' : 'haqi'
        } ${formatMoney(input.amount, partner.currency)}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, CHANGED))
      return this.load(em, payment)
    })
  }

  /**
   * Takes a payment back: the money returns to where it was and the
   * partner's account to what it was. Cash that went through a drawer can be
   * taken back only while that shift is open: after it has been counted, a
   * payment the other way puts things right.
   */
  async cancel(actor: Actor, id: string, reason: string): Promise<PartnerPaymentDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await em.query(`SELECT 1 FROM partner_payments WHERE id = $1 FOR UPDATE`, [id])
      const payment = await em.findOneBy(PartnerPayment, { id })
      if (!payment) {
        throw AppError.notFound("To'lov topilmadi")
      }
      if (payment.status !== 'posted') {
        throw AppError.conflict('PAYMENT_CANCELLED', "Bu to'lov allaqachon bekor qilingan")
      }
      if (payment.kind === 'opening' && !can(actor, 'partners.adjust')) {
        throw AppError.forbidden()
      }
      const lines = await em.find(PartnerPaymentLine, { where: { paymentId: id }, order: { position: 'ASC' } })
      const shiftIds = lines.flatMap((line) => (line.shiftId ? [line.shiftId] : []))
      if (shiftIds.length && (await em.countBy(Shift, { id: In(shiftIds), status: 'closed' }))) {
        throw AppError.conflict('SHIFT_CLOSED', "Smena yopilgan: bu to'lov teskari to'lov bilan tuzatiladi")
      }
      if (payment.kind === 'in') {
        // Taking back money that came in means it leaves the accounts it went into.
        const ids = [...new Set(lines.map((line) => line.accountId))].sort()
        await em.query(`SELECT 1 FROM accounts WHERE id = ANY($1) ORDER BY id FOR UPDATE`, [ids])
        const accounts = await em.findBy(Account, { id: In(ids) })
        for (const account of accounts) {
          const out = lines.reduce((sum, line) => sum + (line.accountId === account.id ? line.amount : 0), 0)
          if (out > account.balance) {
            throw AppError.conflict('NO_MONEY', `${account.name}: hisobda bu pul qolmagan`)
          }
        }
      }
      const today = await this.ledger.today(em, actor.orgId)
      await this.ledger.reverse(
        em,
        actor,
        {
          date: today,
          kind: 'partner_payment_cancel',
          documentType: DOCUMENT,
          documentId: id,
          shiftId: shiftIds[0] ?? null,
        },
        'partner_payment',
      )
      await em.update(PartnerPayment, id, {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: actor.userId,
        cancelledByName: actor.name,
        cancelReason: reason,
      })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'partner_payment.cancel',
        entity: 'partner_payment',
        entityId: id,
        summary: `${payment.number}: ${reason}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, CHANGED))
      return this.load(em, await em.findOneByOrFail(PartnerPayment, { id }))
    })
  }

  async get(actor: Actor, id: string): Promise<PartnerPaymentDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const payment = await em.findOneBy(PartnerPayment, { id })
      if (!payment) {
        throw AppError.notFound("To'lov topilmadi")
      }
      return this.load(em, payment)
    })
  }

  async list(actor: Actor, query: PartnerPaymentListQuery): Promise<Page<PartnerPaymentDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em.createQueryBuilder(PartnerPayment, 'p')
      if (query.status !== 'all') qb.andWhere('p.status = :status', { status: query.status })
      if (query.kind) qb.andWhere('p.kind = :kind', { kind: query.kind })
      if (query.partnerId) qb.andWhere('p.partnerId = :partnerId', { partnerId: query.partnerId })
      if (query.from) qb.andWhere('p.paidOn >= :from', { from: query.from })
      if (query.to) qb.andWhere('p.paidOn <= :to', { to: query.to })
      applySearch(qb, 'p.search_key', query.q)
      const [rows, total] = await qb
        .orderBy('p.paidAt', 'DESC')
        .skip((query.page - 1) * query.size)
        .take(query.size)
        .getManyAndCount()
      const items: PartnerPaymentDto[] = []
      for (const row of rows) {
        items.push(await this.load(em, row))
      }
      return { items, total, page: query.page, size: query.size }
    })
  }

  /** A partner's account from its first entry: every change, and what was owed after each. */
  async statement(actor: Actor, partnerId: string): Promise<PartnerStatementDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const partner = await this.partner(em, partnerId, true)
      const account = await em.findOneBy(Account, { partnerId })
      const rows: {
        at: Date
        entry_kind: string
        document_type: string | null
        change: number
        document_id: string | null
        number: string | null
        kind: PartnerPaymentKind | null
        note: string | null
        cancel_reason: string | null
      }[] = account
        ? await em.query(
            `SELECT e.created_at AS at, e.kind AS entry_kind, e.document_type, l.amount::float8 AS change, e.document_id,
                    coalesce(p.number, r.number) AS number, p.kind, coalesce(p.note, r.note) AS note, p.cancel_reason
             FROM ledger_lines l
             JOIN ledger_entries e ON e.id = l.entry_id
             LEFT JOIN partner_payments p ON p.id = e.document_id AND e.document_type = '${DOCUMENT}'
             LEFT JOIN receipts r ON r.id = e.document_id AND e.document_type = 'receipt'
             WHERE l.account_id = $1
             ORDER BY e.created_at, l.position`,
            [account.id],
          )
        : []
      let balance = 0
      const lines: PartnerStatementLine[] = rows.map((row) => {
        balance += row.change
        const cancelled = row.entry_kind.endsWith('_cancel')
        const source = row.document_type === 'receipt' ? 'receipt' : 'payment'
        return {
          at: row.at.toISOString(),
          kind: cancelled ? 'cancel' : source === 'receipt' ? 'receipt' : (row.kind ?? 'opening'),
          source,
          number: row.number,
          documentId: row.document_id,
          change: row.change,
          balance,
          note: cancelled ? row.cancel_reason : row.note,
        }
      })
      return { partner: partnerDto(partner, account?.balance ?? 0), lines, balance: account?.balance ?? 0 }
    })
  }

  // ───────────────────────────── Inside ─────────────────────────────

  private async partner(em: EntityManager, id: string, evenArchived = false): Promise<Partner> {
    const partner = await em.findOneBy(Partner, { id })
    if (!partner || (!partner.isActive && !evenArchived)) {
      throw AppError.validation({ partnerId: 'Hamkor topilmadi' })
    }
    return partner
  }

  private async save(
    em: EntityManager,
    actor: Actor,
    data: {
      clientKey: string
      kind: PartnerPaymentKind
      partner: Partner
      change: number
      today: string
      paidBy: string
      note: string | null
    },
  ): Promise<PartnerPayment> {
    const number = `TL-${String(await nextNumbers(em, actor.orgId, 'partner_payment')).padStart(6, '0')}`
    return em.save(
      em.create(PartnerPayment, {
        orgId: actor.orgId,
        number,
        clientKey: data.clientKey,
        kind: data.kind,
        status: 'posted',
        partnerId: data.partner.id,
        currency: data.partner.currency,
        change: data.change,
        paidAt: new Date(),
        paidOn: data.today,
        createdBy: actor.userId,
        createdByName: actor.name,
        paidBy: data.paidBy,
        note: data.note,
        searchKey: searchKey([number, data.partner.name, actor.name, data.note ?? ''].join(' ')),
      }),
    )
  }

  private async load(em: EntityManager, payment: PartnerPayment): Promise<PartnerPaymentDto> {
    const partner = await em.findOneByOrFail(Partner, { id: payment.partnerId })
    const lines = await em
      .createQueryBuilder(PartnerPaymentLine, 'l')
      .innerJoin(Account, 'a', 'a.id = l.accountId')
      .addSelect('a.name', 'account_name')
      .where('l.paymentId = :id', { id: payment.id })
      .orderBy('l.position')
      .getRawAndEntities()
    return {
      id: payment.id,
      number: payment.number,
      kind: payment.kind,
      status: payment.status,
      partnerId: payment.partnerId,
      partnerName: partner.name,
      currency: payment.currency,
      change: payment.change,
      paidAt: payment.paidAt.toISOString(),
      createdByName: payment.createdByName,
      note: payment.note,
      cancelledAt: payment.cancelledAt ? payment.cancelledAt.toISOString() : null,
      cancelledByName: payment.cancelledByName,
      cancelReason: payment.cancelReason,
      paidBy: payment.paidBy,
      lines: lines.entities.map((line, index) => ({
        accountId: line.accountId,
        accountName: lines.raw[index].account_name,
        currency: line.currency,
        amount: line.amount,
        rate: line.rate,
        settled: line.settled,
      })),
    }
  }
}
