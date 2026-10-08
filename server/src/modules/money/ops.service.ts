import {
  formatMoney,
  MONEY_OP_KIND_LABELS,
  searchKey,
  STARTER_MONEY_CATEGORIES,
  type MoneyCategoryDto,
  type MoneyCategoryInput,
  type MoneyOpDto,
  type MoneyOpInput,
  type MoneyOpListQuery,
  type MoneyOpSums,
  type Page,
  type PaymentAccountDto,
  type SystemAccount,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import { In, type EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch } from '../../common/listing'
import { Db } from '../../database/db.service'
import { Account, MoneyCategory, MoneyOp, MoneyOpLine, Shift } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { nextNumbers } from '../catalog/counters'
import { RealtimeService } from '../realtime/realtime.service'
import { rateLimit, valueLine, wantingRate } from './agreed'
import { CurrenciesService } from './currencies.service'
import { LedgerService, type Posting } from './ledger.service'
import { MoneyService } from './money.service'
import { mayUse } from './places'

const DOCUMENT = 'money_op'

/** Where the business keeps its own money: what an expense is paid out of, and other income is put into. */
const PLACES = ['cash', 'safe', 'bank', 'card']

const CHANGED = ['money-ops', 'money', 'pos', 'shifts']

/** Every business starts with the same kinds of expense and income; all of them can be renamed or archived. */
export async function createMoneyCategories(em: EntityManager, orgId: string): Promise<void> {
  await em.insert(
    MoneyCategory,
    STARTER_MONEY_CATEGORIES.map((category, index) => ({
      orgId,
      kind: category.kind,
      name: category.name,
      inProfit: category.inProfit,
      isActive: true,
      sortOrder: index + 1,
    })),
  )
}

const categoryDto = (category: MoneyCategory): MoneyCategoryDto => ({
  id: category.id,
  kind: category.kind,
  name: category.name,
  inProfit: category.inProfit,
  isActive: category.isActive,
})

/**
 * Expenses and other money in and out. Each has a kind that says what the
 * money was for, and a line for every sum that left, or came into, one of
 * the business's accounts. The other side of it in the books is what was
 * spent, what was earned on the side, or, for money the owner takes or
 * brings, the owner's own account. Nothing is edited: a wrong one is
 * cancelled, which puts everything back and keeps both in the books.
 */
@Injectable()
export class MoneyOpsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly ledger: LedgerService,
    private readonly money: MoneyService,
    private readonly currencies: CurrenciesService,
  ) {}

  // ───────────────────────────── What the money was for ─────────────────────────────

  async categories(actor: Actor): Promise<MoneyCategoryDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const rows = await em.find(MoneyCategory, { order: { kind: 'ASC', sortOrder: 'ASC', name: 'ASC' } })
      return rows.map(categoryDto)
    })
  }

  async createCategory(actor: Actor, input: MoneyCategoryInput): Promise<MoneyCategoryDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.nameIsFree(em, input, null)
      const [{ last }]: { last: number }[] = await em.query(
        `SELECT coalesce(max(sort_order), 0)::int AS last FROM money_categories WHERE kind = $1`,
        [input.kind],
      )
      const category = await em.save(
        em.create(MoneyCategory, { orgId: actor.orgId, ...input, isActive: true, sortOrder: last + 1 }),
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'money_category.create',
        entity: 'money_category',
        entityId: category.id,
        summary: `${MONEY_OP_KIND_LABELS[category.kind]} turi: ${category.name}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['money-categories']))
      return categoryDto(category)
    })
  }

  async updateCategory(actor: Actor, id: string, input: MoneyCategoryInput): Promise<MoneyCategoryDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const category = await em.findOneBy(MoneyCategory, { id })
      if (!category) {
        throw AppError.notFound('Tur topilmadi')
      }
      // What was already written under it stays what it was: an expense does not turn into income.
      if (input.kind !== category.kind || input.inProfit !== category.inProfit) {
        if (await em.countBy(MoneyOp, { categoryId: id })) {
          throw AppError.validation({
            [input.kind !== category.kind ? 'kind' : 'inProfit']:
              'Bu tur bilan yozuvlar bor: o‘zgartirib bo‘lmaydi. Yangi tur oching, buni arxivlang',
          })
        }
      }
      await this.nameIsFree(em, input, id)
      await em.update(MoneyCategory, id, { kind: input.kind, name: input.name, inProfit: input.inProfit })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'money_category.update',
        entity: 'money_category',
        entityId: id,
        summary: `${MONEY_OP_KIND_LABELS[input.kind]} turi: ${input.name}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['money-categories']))
      return categoryDto(await em.findOneByOrFail(MoneyCategory, { id }))
    })
  }

  async setCategoryActive(actor: Actor, id: string, isActive: boolean): Promise<MoneyCategoryDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const category = await em.findOneBy(MoneyCategory, { id })
      if (!category) {
        throw AppError.notFound('Tur topilmadi')
      }
      await em.update(MoneyCategory, id, { isActive })
      await this.audit.record(em, actor.orgId, actor, {
        action: isActive ? 'money_category.restore' : 'money_category.archive',
        entity: 'money_category',
        entityId: id,
        summary: `${MONEY_OP_KIND_LABELS[category.kind]} turi: ${category.name}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['money-categories']))
      return categoryDto({ ...category, isActive })
    })
  }

  private async nameIsFree(em: EntityManager, input: MoneyCategoryInput, exceptId: string | null): Promise<void> {
    const [taken]: { id: string }[] = await em.query(
      `SELECT id FROM money_categories WHERE kind = $1 AND lower(name) = lower($2) AND ($3::uuid IS NULL OR id <> $3)`,
      [input.kind, input.name, exceptId],
    )
    if (taken) {
      throw AppError.validation({ name: 'Bunday tur bor' })
    }
  }

  // ───────────────────────────── The documents ─────────────────────────────

  /** The accounts money can leave from or come into, for the form: balances only for those who may see them. */
  async accounts(actor: Actor): Promise<PaymentAccountDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      return this.money.paymentAccounts(em, actor, PLACES)
    })
  }

  async create(actor: Actor, input: MoneyOpInput): Promise<MoneyOpDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const again = await em.findOneBy(MoneyOp, { clientKey: input.clientKey })
      if (again) {
        return this.load(em, again)
      }
      const category = await em.findOneBy(MoneyCategory, { id: input.categoryId })
      if (!category || !category.isActive || category.kind !== input.kind) {
        throw AppError.validation({ categoryId: 'Tur topilmadi' })
      }
      const today = await this.ledger.today(em, actor.orgId)
      const book = await this.currencies.book(em, actor, today)
      const limit = await rateLimit(em, actor)
      // Money in adds to an account; an expense takes from it.
      const sign = input.kind === 'income' ? 1 : -1

      // The accounts are held: two expenses out of one account cannot both spend the same money.
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
        /** What the line counts as in so'm, and what its money is worth at the day's rate. */
        base: number
        cashBase: number
        shiftId: string | null
      }[] = []
      for (const [index, line] of input.lines.entries()) {
        const account = accountOf.get(line.accountId)
        if (!account || !account.isActive || !PLACES.includes(account.kind) || !mayUse(actor, account)) {
          fields[`lines.${index}.accountId`] = 'Hisob topilmadi'
          continue
        }
        let shiftId: string | null = null
        if (account.kind === 'cash') {
          // Money taken out of a drawer between shifts would be missed by nobody's count.
          const open = await em.findOneBy(Shift, { registerId: account.registerId as string, status: 'open' })
          if (!open) {
            fields[`lines.${index}.accountId`] = `${account.name}: smena ochilmagan`
            continue
          }
          shiftId = open.id
        }
        const wanting = wantingRate(book, account.currency)
        if (wanting) {
          fields[`lines.${index}.amount`] = wanting
          continue
        }
        if (input.kind === 'expense') {
          const out = (spent.get(account.id) ?? 0) + line.amount
          spent.set(account.id, out)
          if (out > account.balance) {
            fields[`lines.${index}.amount`] = 'Hisobda buncha pul yo‘q'
            continue
          }
        }
        // Money of another currency may be counted as an agreed sum of the base, within what this person may agree to.
        const worth = valueLine(line.amount, account.currency, book.base, book, line.settled, limit)
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

      const prefix = input.kind === 'expense' ? 'XR' : 'KR'
      const number = `${prefix}-${String(await nextNumbers(em, actor.orgId, `money_${input.kind}`)).padStart(6, '0')}`
      const paidBy = [...new Set(lines.map((line) => line.account.name))].join(', ')
      const op = await em.save(
        em.create(MoneyOp, {
          orgId: actor.orgId,
          number,
          clientKey: input.clientKey,
          kind: input.kind,
          status: 'posted',
          categoryId: category.id,
          total,
          doneAt: new Date(),
          doneOn: today,
          createdBy: actor.userId,
          createdByName: actor.name,
          paidBy,
          note: input.note ?? null,
          searchKey: searchKey([number, category.name, actor.name, input.note ?? ''].join(' ')),
        }),
      )
      await em.insert(
        MoneyOpLine,
        lines.map((line, position) => ({
          orgId: actor.orgId,
          opId: op.id,
          position,
          accountId: line.account.id,
          currency: line.account.currency,
          amount: line.amount,
          rate: line.rate,
          base: line.base,
          fx: sign * (line.cashBase - line.base),
          shiftId: line.shiftId,
        })),
      )

      const other = await this.ledger.systemAccount(em, actor.orgId, otherSide(category))
      // The money moves at what the day's rate makes it; the expense is what it was counted as.
      const postings: Posting[] = lines.map((line) => ({
        accountId: line.account.id,
        amount: sign * line.amount,
        base: sign * line.cashBase,
      }))
      postings.push({ accountId: other.id, amount: -sign * total, base: -sign * total })
      // What lies between the two is the rate's, and is written down as such.
      const fx = lines.reduce((sum, line) => sum + line.cashBase - line.base, 0)
      if (fx) {
        const difference = await this.ledger.systemAccount(em, actor.orgId, 'fx')
        postings.push({ accountId: difference.id, amount: -sign * fx, base: -sign * fx })
      }
      await this.ledger.post(
        em,
        actor,
        {
          date: today,
          kind: DOCUMENT,
          documentType: DOCUMENT,
          documentId: op.id,
          shiftId: lines.find((line) => line.shiftId)?.shiftId ?? null,
        },
        postings,
      )

      await this.audit.record(em, actor.orgId, actor, {
        action: `money_op.${input.kind}`,
        entity: 'money_op',
        entityId: op.id,
        summary: `${number}: ${category.name}, ${formatMoney(total, actor.base)} (${paidBy})${input.note ? ` — ${input.note}` : ''}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, CHANGED))
      return this.load(em, op)
    })
  }

  /**
   * Takes one back: the money returns to where it was. What went through a
   * drawer can be taken back only while that shift is open: after it has
   * been counted, one the other way puts things right. Those who do not see
   * the books take back only what they wrote themselves.
   */
  async cancel(actor: Actor, id: string, reason: string): Promise<MoneyOpDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await em.query(`SELECT 1 FROM money_ops WHERE id = $1 FOR UPDATE`, [id])
      const op = await em.findOneBy(MoneyOp, { id })
      if (!op || !this.sees(actor, op)) {
        throw AppError.notFound('Yozuv topilmadi')
      }
      if (op.status !== 'posted') {
        throw AppError.conflict('OP_CANCELLED', 'Bu yozuv allaqachon bekor qilingan')
      }
      const lines = await em.find(MoneyOpLine, { where: { opId: id }, order: { position: 'ASC' } })
      const shiftIds = lines.flatMap((line) => (line.shiftId ? [line.shiftId] : []))
      if (shiftIds.length && (await em.countBy(Shift, { id: In(shiftIds), status: 'closed' }))) {
        throw AppError.conflict('SHIFT_CLOSED', 'Smena yopilgan: bu yozuv teskari yozuv bilan tuzatiladi')
      }
      if (op.kind === 'income') {
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
          kind: `${DOCUMENT}_cancel`,
          documentType: DOCUMENT,
          documentId: id,
          shiftId: shiftIds[0] ?? null,
        },
        DOCUMENT,
      )
      await em.update(MoneyOp, id, {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: actor.userId,
        cancelledByName: actor.name,
        cancelReason: reason,
      })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'money_op.cancel',
        entity: 'money_op',
        entityId: id,
        summary: `${op.number}: ${reason}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, CHANGED))
      return this.load(em, await em.findOneByOrFail(MoneyOp, { id }))
    })
  }

  async get(actor: Actor, id: string): Promise<MoneyOpDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const op = await em.findOneBy(MoneyOp, { id })
      if (!op || !this.sees(actor, op)) {
        throw AppError.notFound('Yozuv topilmadi')
      }
      return this.load(em, op)
    })
  }

  async list(actor: Actor, query: MoneyOpListQuery): Promise<Page<MoneyOpDto> & { sums: MoneyOpSums }> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em.createQueryBuilder(MoneyOp, 'o')
      // Who does not see the books sees what they wrote themselves.
      if (!can(actor, 'money.view')) qb.andWhere('o.createdBy = :me', { me: actor.userId })
      if (query.status !== 'all') qb.andWhere('o.status = :status', { status: query.status })
      if (query.kind) qb.andWhere('o.kind = :kind', { kind: query.kind })
      if (query.categoryId) qb.andWhere('o.categoryId = :categoryId', { categoryId: query.categoryId })
      if (query.from) qb.andWhere('o.doneOn >= :from', { from: query.from })
      if (query.to) qb.andWhere('o.doneOn <= :to', { to: query.to })
      applySearch(qb, 'o.search_key', query.q)

      const sums: { kind: 'expense' | 'income'; total: number }[] = await qb
        .clone()
        .andWhere(`o.status = 'posted'`)
        .select('o.kind', 'kind')
        .addSelect('sum(o.total)::float8', 'total')
        .groupBy('o.kind')
        .getRawMany()
      const [rows, total] = await qb
        .orderBy('o.doneAt', 'DESC')
        .skip((query.page - 1) * query.size)
        .take(query.size)
        .getManyAndCount()
      const items: MoneyOpDto[] = []
      for (const row of rows) {
        items.push(await this.load(em, row))
      }
      return {
        items,
        total,
        page: query.page,
        size: query.size,
        sums: {
          expense: sums.find((row) => row.kind === 'expense')?.total ?? 0,
          income: sums.find((row) => row.kind === 'income')?.total ?? 0,
        },
      }
    })
  }

  // ───────────────────────────── Inside ─────────────────────────────

  private sees(actor: Actor, op: MoneyOp): boolean {
    return can(actor, 'money.view') || op.createdBy === actor.userId
  }

  private async load(em: EntityManager, op: MoneyOp): Promise<MoneyOpDto> {
    const category = await em.findOneByOrFail(MoneyCategory, { id: op.categoryId })
    const lines = await em
      .createQueryBuilder(MoneyOpLine, 'l')
      .innerJoin(Account, 'a', 'a.id = l.accountId')
      .addSelect('a.name', 'account_name')
      .where('l.opId = :id', { id: op.id })
      .orderBy('l.position')
      .getRawAndEntities()
    return {
      id: op.id,
      number: op.number,
      kind: op.kind,
      status: op.status,
      categoryId: op.categoryId,
      categoryName: category.name,
      inProfit: category.inProfit,
      total: op.total,
      doneAt: op.doneAt.toISOString(),
      createdByName: op.createdByName,
      note: op.note,
      cancelledAt: op.cancelledAt ? op.cancelledAt.toISOString() : null,
      cancelledByName: op.cancelledByName,
      cancelReason: op.cancelReason,
      paidBy: op.paidBy,
      lines: lines.entities.map((line, index) => ({
        accountId: line.accountId,
        accountName: lines.raw[index].account_name,
        currency: line.currency,
        amount: line.amount,
        rate: line.rate,
        base: line.base,
        fx: line.fx,
      })),
    }
  }
}

/** The other side of the entry: what was spent, what was earned, or the owner's own account. */
function otherSide(category: MoneyCategory): SystemAccount {
  if (!category.inProfit) {
    return 'owner'
  }
  return category.kind === 'expense' ? 'expenses' : 'other_income'
}
