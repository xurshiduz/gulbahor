import {
  CURRENCIES,
  formatMoney,
  searchKey,
  worthInBase,
  type CurrencyCode,
  type MoneySentEvent,
  type MoneyTransferDto,
  type MoneyTransferInput,
  type MoneyTransferListQuery,
  type Page,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import { In, type EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch } from '../../common/listing'
import { Db } from '../../database/db.service'
import { Account, MoneyTransfer, Register, Shift } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { nextNumbers } from '../catalog/counters'
import { RealtimeService } from '../realtime/realtime.service'
import { wantingRate } from './agreed'
import { CurrenciesService } from './currencies.service'
import { LedgerService } from './ledger.service'
import { mayUse } from './places'

const DOCUMENT = 'money_transfer'

/** Money moves between the places it is kept; a terminal's money goes to the bank by itself, and the ledger's own accounts are not places. */
const MOVABLE = ['cash', 'safe', 'bank', 'card']

/** With no account to ask about (it is gone), nothing stands in the way here. */
const mayWorkAt = (actor: Actor, account: Account | null | undefined) => !account || mayUse(actor, account)

/** Those who take cash from the tills and bring it to them. */
const collects = (actor: Actor) => can(actor, 'money.collect') || can(actor, 'money.manage')

/**
 * Moving money from one account to another. Sending takes it out of the
 * account it was in and puts it on its way; it enters the other account
 * only when someone there says it arrived. One person cannot do both, unless
 * they run the business's money. Nothing is edited: a transfer not yet
 * confirmed can be taken back or refused, and then the money returns.
 */
@Injectable()
export class MoneyTransfersService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly ledger: LedgerService,
    private readonly currencies: CurrenciesService,
  ) {}

  async send(actor: Actor, input: MoneyTransferInput): Promise<MoneyTransferDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const again = await em.findOneBy(MoneyTransfer, { clientKey: input.clientKey })
      if (again) {
        return (await this.rows(em, actor, [again]))[0]
      }
      const sent = await this.sendIn(em, actor, input)
      const notice = await this.sentNotice(em, sent)
      afterCommit(() => {
        this.realtime.changed(actor.orgId, ['money', 'pos', 'shifts'])
        this.realtime.event(actor.orgId, 'money.sent', notice)
      })
      return (await this.rows(em, actor, [sent]))[0]
    })
  }

  /** What the screens are told when money is sent: where from and where to, never how much. */
  async sentNotice(em: EntityManager, transfer: MoneyTransfer): Promise<MoneySentEvent> {
    const from = await em.findOneByOrFail(Account, { id: transfer.fromAccountId })
    const to = await em.findOneByOrFail(Account, { id: transfer.toAccountId })
    return {
      id: transfer.id,
      number: transfer.number,
      fromName: from.name,
      toName: to.name,
      toKind: to.kind,
      toLocationId: to.locationId,
      toRegisterId: to.registerId,
      sentBy: transfer.sentBy,
    }
  }

  /** Sends money inside a transaction that is already open: the end of a shift hands its cash over this way. */
  async sendIn(em: EntityManager, actor: Actor, input: MoneyTransferInput): Promise<MoneyTransfer> {
    // The account the money leaves is held, so two transfers cannot both take the same money.
    await em.query(`SELECT 1 FROM accounts WHERE id = $1 FOR UPDATE`, [input.fromAccountId])
    const from = await em.findOneBy(Account, { id: input.fromAccountId })
    const to = await em.findOneBy(Account, { id: input.toAccountId })
    const fields: Record<string, string> = {}
    if (!from || !from.isActive || !MOVABLE.includes(from.kind)) {
      fields.fromAccountId = 'Hisob topilmadi'
    }
    if (!to || !to.isActive || !MOVABLE.includes(to.kind)) {
      fields.toAccountId = 'Hisob topilmadi'
    }
    if (from && to && !fields.fromAccountId && !fields.toAccountId && from.currency !== to.currency) {
      // One currency does not become another by being carried: that is an exchange, and has its own document.
      fields.toAccountId = `Bu hisob boshqa valyutada: ${CURRENCIES[to.currency].name}`
    }
    const first = Object.values(fields)[0]
    if (!from || !to || first) {
      throw AppError.validation(fields, first)
    }

    const fromShift = await this.mayGive(em, actor, from)
    if (!mayWorkAt(actor, to)) {
      throw AppError.validation({ toAccountId: 'Hisob topilmadi' })
    }
    // Said without the sum: a cashier is not told what the books hold.
    if (input.amount > from.balance) {
      throw AppError.validation({ amount: 'Hisobda buncha pul yo‘q' })
    }
    const today = await this.ledger.today(em, actor.orgId)
    // What is on its way is worth what the day's rates make of it; money nobody can value does not move.
    const book = await this.currencies.book(em, actor, today)
    const wanting = wantingRate(book, from.currency)
    if (wanting) {
      throw AppError.validation({ amount: wanting })
    }
    const base = worthInBase(input.amount, from.currency, book) as number

    const number = `PO-${String(await nextNumbers(em, actor.orgId, 'money_transfer')).padStart(6, '0')}`
    const transfer = await em.save(
      em.create(MoneyTransfer, {
        orgId: actor.orgId,
        number,
        clientKey: input.clientKey,
        status: 'sent',
        fromAccountId: from.id,
        toAccountId: to.id,
        currency: from.currency,
        amount: input.amount,
        base,
        fromShiftId: fromShift,
        toShiftId: null,
        sentAt: new Date(),
        sentOn: today,
        sentBy: actor.userId,
        sentByName: actor.name,
        note: input.note ?? null,
        searchKey: searchKey([number, from.name, to.name, actor.name].join(' ')),
      }),
    )
    const transit = await this.ledger.systemAccount(em, actor.orgId, 'transit')
    await this.ledger.post(
      em,
      actor,
      { date: today, kind: 'money_transfer', documentType: DOCUMENT, documentId: transfer.id, shiftId: fromShift },
      [
        { accountId: from.id, amount: -input.amount, base: -base },
        { accountId: transit.id, amount: base, base },
      ],
    )
    await this.audit.record(em, actor.orgId, actor, {
      action: 'money_transfer.send',
      entity: 'money_transfer',
      entityId: transfer.id,
      summary: `${number}: ${from.name} → ${to.name}, ${formatMoney(input.amount, from.currency)}`,
    })
    return transfer
  }

  /** Says the money arrived: it enters the account it was sent to. */
  async receive(actor: Actor, id: string): Promise<MoneyTransferDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const transfer = await this.waiting(em, id)
      const to = await em.findOneByOrFail(Account, { id: transfer.toAccountId })
      const toShift = await this.mayTake(em, actor, transfer, to)
      const today = await this.ledger.today(em, actor.orgId)
      const transit = await this.ledger.systemAccount(em, actor.orgId, 'transit')
      // It arrives worth what it was sent at: the account for money on its way is left with nothing of it.
      await this.ledger.post(
        em,
        actor,
        { date: today, kind: 'money_transfer_receive', documentType: DOCUMENT, documentId: id, shiftId: toShift },
        [
          { accountId: transit.id, amount: -transfer.base, base: -transfer.base },
          { accountId: to.id, amount: transfer.amount, base: transfer.base },
        ],
      )
      await em.update(MoneyTransfer, id, {
        status: 'received',
        toShiftId: toShift,
        decidedAt: new Date(),
        decidedBy: actor.userId,
        decidedByName: actor.name,
      })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'money_transfer.receive',
        entity: 'money_transfer',
        entityId: id,
        summary: `${transfer.number}: ${to.name}, ${formatMoney(transfer.amount, transfer.currency)}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['money', 'pos', 'shifts']))
      return (await this.rows(em, actor, [await em.findOneByOrFail(MoneyTransfer, { id })]))[0]
    })
  }

  /** Refuses money that did not arrive as sent: it goes back to the account it left. */
  async reject(actor: Actor, id: string, reason: string): Promise<MoneyTransferDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const transfer = await this.waiting(em, id)
      await this.mayTake(em, actor, transfer, await em.findOneByOrFail(Account, { id: transfer.toAccountId }))
      await this.back(em, actor, transfer, 'rejected', reason)
      afterCommit(() => this.realtime.changed(actor.orgId, ['money', 'pos', 'shifts']))
      return (await this.rows(em, actor, [await em.findOneByOrFail(MoneyTransfer, { id })]))[0]
    })
  }

  /** Takes back money nobody has confirmed yet. */
  async cancel(actor: Actor, id: string): Promise<MoneyTransferDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const transfer = await this.waiting(em, id)
      if (transfer.sentBy !== actor.userId && !can(actor, 'money.manage')) {
        throw AppError.forbidden('O‘tkazmani uni yuborgan odam qaytarib oladi')
      }
      await this.back(em, actor, transfer, 'cancelled', null)
      afterCommit(() => this.realtime.changed(actor.orgId, ['money', 'pos', 'shifts']))
      return (await this.rows(em, actor, [await em.findOneByOrFail(MoneyTransfer, { id })]))[0]
    })
  }

  async list(actor: Actor, query: MoneyTransferListQuery): Promise<Page<MoneyTransferDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em.createQueryBuilder(MoneyTransfer, 't')
      if (query.status !== 'all') qb.andWhere('t.status = :status', { status: query.status })
      if (query.accountId) {
        qb.andWhere('(t.fromAccountId = :account OR t.toAccountId = :account)', { account: query.accountId })
      }
      if (query.from) qb.andWhere('t.sentOn >= :from', { from: query.from })
      if (query.to) qb.andWhere('t.sentOn <= :to', { to: query.to })
      applySearch(qb, 't.search_key', query.q)
      const [rows, total] = await qb
        .orderBy('t.sentAt', 'DESC')
        .skip((query.page - 1) * query.size)
        .take(query.size)
        .getManyAndCount()
      return { items: await this.rows(em, actor, rows), total, page: query.page, size: query.size }
    })
  }

  /** What is on its way from a till's drawers or to them: the till shows these to be confirmed or taken back. */
  async waitingAt(em: EntityManager, actor: Actor, registerId: string): Promise<MoneyTransferDto[]> {
    const drawers = await em.findBy(Account, { registerId })
    if (!drawers.length) {
      return []
    }
    const ids = drawers.map((account) => account.id)
    const rows = await em
      .createQueryBuilder(MoneyTransfer, 't')
      .where(`t.status = 'sent'`)
      .andWhere('(t.fromAccountId IN (:...ids) OR t.toAccountId IN (:...ids))', { ids })
      .orderBy('t.sentAt')
      .getMany()
    return this.rows(em, actor, rows)
  }

  /** What a shift's drawers gave out and took in, by currency: transfers refused or taken back moved nothing. */
  async ofShift(em: EntityManager, shiftId: string): Promise<Record<'out' | 'in', Record<CurrencyCode, number>>> {
    const rows: { side: 'out' | 'in'; currency: CurrencyCode; amount: number }[] = await em.query(
      `SELECT 'out' AS side, currency, sum(amount)::float8 AS amount FROM money_transfers
       WHERE from_shift_id = $1 AND status IN ('sent', 'received') GROUP BY currency
       UNION ALL
       SELECT 'in', currency, sum(amount)::float8 FROM money_transfers
       WHERE to_shift_id = $1 AND status = 'received' GROUP BY currency`,
      [shiftId],
    )
    const totals = { out: { UZS: 0, USD: 0 }, in: { UZS: 0, USD: 0 } }
    for (const row of rows) {
      totals[row.side][row.currency] = row.amount
    }
    return totals
  }

  // ───────────────────────────── Who may ─────────────────────────────

  /**
   * Whether this person may take money out of an account. A till's cash is
   * handed over by whoever works its open shift, or taken by those who
   * collect; other accounts only by those who collect. Returns the till's
   * open shift, whose drawer the money leaves.
   */
  private async mayGive(em: EntityManager, actor: Actor, from: Account): Promise<string | null> {
    if (!mayWorkAt(actor, from)) {
      throw AppError.validation({ fromAccountId: 'Hisob topilmadi' })
    }
    if (from.kind !== 'cash') {
      if (!collects(actor)) {
        throw AppError.forbidden()
      }
      return null
    }
    const open = await em.findOneBy(Shift, { registerId: from.registerId as string, status: 'open' })
    if (collects(actor)) {
      return open?.id ?? null
    }
    if (!can(actor, 'pos.sell')) {
      throw AppError.forbidden()
    }
    if (!open) {
      throw AppError.conflict('NO_SHIFT', 'Smena ochilmagan. Avval smenani oching')
    }
    return open.id
  }

  /**
   * Whether this person may say money arrived in an account, or refuse it:
   * at a till, whoever works its open shift; elsewhere, those who collect.
   * Not the person who sent it, unless they run the business's money.
   */
  private async mayTake(em: EntityManager, actor: Actor, transfer: MoneyTransfer, to: Account): Promise<string | null> {
    if (transfer.sentBy === actor.userId && !can(actor, 'money.manage')) {
      throw AppError.forbidden('O‘zingiz yuborgan pulni o‘zingiz qabul qila olmaysiz: uni qabul qiluvchi tasdiqlaydi')
    }
    if (!mayWorkAt(actor, to)) {
      throw AppError.forbidden()
    }
    if (to.kind !== 'cash') {
      if (!collects(actor)) {
        throw AppError.forbidden()
      }
      return null
    }
    const open = await em.findOneBy(Shift, { registerId: to.registerId as string, status: 'open' })
    if (!open) {
      // Money put into a drawer between shifts would be found by nobody's count.
      throw AppError.conflict('NO_SHIFT', 'Bu kassada smena ochilmagan: pul smena ochilganda qabul qilinadi')
    }
    if (!collects(actor) && !can(actor, 'pos.sell')) {
      throw AppError.forbidden()
    }
    return open.id
  }

  // ───────────────────────────── Inside ─────────────────────────────

  /** A transfer still on its way, held so that two people cannot decide it at once. */
  private async waiting(em: EntityManager, id: string): Promise<MoneyTransfer> {
    await em.query(`SELECT 1 FROM money_transfers WHERE id = $1 FOR UPDATE`, [id])
    const transfer = await em.findOneBy(MoneyTransfer, { id })
    if (!transfer) {
      throw AppError.notFound('O‘tkazma topilmadi')
    }
    if (transfer.status !== 'sent') {
      throw AppError.conflict('TRANSFER_DECIDED', 'Bu o‘tkazma allaqachon yakunlangan')
    }
    return transfer
  }

  /** Puts the money back into the account it left. */
  private async back(
    em: EntityManager,
    actor: Actor,
    transfer: MoneyTransfer,
    status: 'rejected' | 'cancelled',
    reason: string | null,
  ) {
    const today = await this.ledger.today(em, actor.orgId)
    await this.ledger.reverse(
      em,
      actor,
      {
        date: today,
        kind: 'money_transfer_return',
        documentType: DOCUMENT,
        documentId: transfer.id,
        shiftId: transfer.fromShiftId,
      },
      'money_transfer',
    )
    await em.update(MoneyTransfer, transfer.id, {
      status,
      reason,
      decidedAt: new Date(),
      decidedBy: actor.userId,
      decidedByName: actor.name,
    })
    await this.audit.record(em, actor.orgId, actor, {
      action: status === 'rejected' ? 'money_transfer.reject' : 'money_transfer.cancel',
      entity: 'money_transfer',
      entityId: transfer.id,
      summary: `${transfer.number}: ${formatMoney(transfer.amount, transfer.currency)}${reason ? `. ${reason}` : ''}`,
    })
  }

  private async rows(em: EntityManager, actor: Actor, transfers: MoneyTransfer[]): Promise<MoneyTransferDto[]> {
    if (!transfers.length) {
      return []
    }
    const accounts = await em.findBy(Account, {
      id: In(transfers.flatMap((transfer) => [transfer.fromAccountId, transfer.toAccountId])),
    })
    const accountOf = new Map(accounts.map((account) => [account.id, account]))
    const registers = await em.findBy(Register, {
      id: In(accounts.flatMap((account) => (account.registerId ? [account.registerId] : []))),
    })
    const manages = can(actor, 'money.manage')
    return transfers.map((transfer) => {
      const to = accountOf.get(transfer.toAccountId)
      const waiting = transfer.status === 'sent'
      const atTill = to?.kind === 'cash' && registers.some((register) => register.id === to.registerId)
      return {
        id: transfer.id,
        number: transfer.number,
        status: transfer.status,
        currency: transfer.currency,
        amount: transfer.amount,
        fromAccountId: transfer.fromAccountId,
        fromAccountName: accountOf.get(transfer.fromAccountId)?.name ?? '',
        toAccountId: transfer.toAccountId,
        toAccountName: to?.name ?? '',
        sentAt: transfer.sentAt.toISOString(),
        sentByName: transfer.sentByName,
        decidedAt: transfer.decidedAt ? transfer.decidedAt.toISOString() : null,
        decidedByName: transfer.decidedByName,
        note: transfer.note,
        reason: transfer.reason,
        mayReceive:
          waiting &&
          (transfer.sentBy !== actor.userId || manages) &&
          mayWorkAt(actor, to) &&
          (collects(actor) || (atTill && can(actor, 'pos.sell'))),
        mayCancel: waiting && (transfer.sentBy === actor.userId || manages),
      }
    })
  }
}
