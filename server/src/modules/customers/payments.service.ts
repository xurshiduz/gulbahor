import {
  DEFAULT_ORG_SETTINGS,
  formatMoney,
  searchKey,
  worthInBase,
  type Page,
  type AnyCurrency,
  type CustomerAdjustInput,
  type CustomerExchangeInput,
  type CustomerOpeningInput,
  type CustomerPaymentDto,
  type CustomerPaymentInput,
  type CustomerPaymentKind,
  type CustomerPaymentListQuery,
  type CustomerStatementDto,
  type CustomerStatementLine,
  type PaymentAccountDto,
} from '@erp/core'
import { Injectable } from '@nestjs/common'
import { In, type EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch } from '../../common/listing'
import { Db } from '../../database/db.service'
import {
  Account,
  Customer,
  CustomerDue,
  CustomerPayment,
  CustomerPaymentLine,
  MoneyCategory,
  Organization,
  Register,
  Shift,
} from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { nextNumbers } from '../catalog/counters'
import { rateLimit, valueLine, wantingRate } from '../money/agreed'
import { CurrenciesService } from '../money/currencies.service'
import { LedgerService, type Posting } from '../money/ledger.service'
import { MoneyService } from '../money/money.service'
import { otherSide } from '../money/ops.service'
import { mayUse, servesShop } from '../money/places'
import { allows, ApprovalsService } from '../pos/approvals.service'
import { RealtimeService } from '../realtime/realtime.service'
import { CustomersService } from './customers.service'

const DOCUMENT = 'customer_payment'
/** The counter TL- numbers were first kept under: renamed, the numbers would start again and collide. */
const COUNTER = 'partner_payment'

/** Where a customer's money can go, or come from: the places the business keeps its own. */
const PLACES = ['cash', 'safe', 'bank', 'card']
/** Where a cashier takes it at the till: into a drawer, or onto a card. A terminal is asked for apart. */
const TILL_PLACES = ['cash', 'card']
/** Where a customer's own money is handed back by someone with no right to pay out: a drawer. */
const DRAWERS = ['cash']

const CHANGED = ['customer-payments', 'customers', 'money', 'pos', 'shifts']

/** Who may make a payment of a kind, and take it back. */
const MAY: Record<CustomerPaymentKind, string> = {
  in: 'customers.receive',
  out: 'customers.pay_out',
  opening: 'customers.adjust',
  adjust: 'customers.adjust',
  exchange: 'customers.adjust',
}

/**
 * A cashier with no say over customers' money still takes what a customer brings to the till — into a drawer or
 * onto a card, from anyone but a supplier — and nothing else.
 */
const atTill = (actor: Actor, kind: CustomerPaymentKind) =>
  kind === 'in' && !can(actor, MAY.in) && can(actor, 'pos.sell')

/**
 * Money changing hands with customers (TL-). A payment settles one of the
 * customer's accounts — one currency of theirs — and has a line for each sum
 * that went into, or out of, one of the business's accounts; from the rate
 * the system works out how much of the customer's account each settles, to
 * the cent, and what rounding leaves over goes to the exchange-difference
 * account. A payment is never edited: a wrong one is cancelled, which puts
 * everything back and keeps both in the books. A customer put away may
 * still pay and be paid.
 */
@Injectable()
export class CustomerPaymentsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly ledger: LedgerService,
    private readonly money: MoneyService,
    private readonly currencies: CurrenciesService,
    private readonly customers: CustomersService,
    private readonly approvals: ApprovalsService,
  ) {}

  /**
   * The accounts a payment can go through, for the form: balances only for those who may see them. Asked from a
   * till with its shift open, the shop's terminals are among them: a terminal takes money only there.
   */
  async accounts(actor: Actor, registerId?: string): Promise<PaymentAccountDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const till = !can(actor, MAY.in) && !can(actor, MAY.out)
      const places = await this.money.paymentAccounts(em, actor, till ? TILL_PLACES : PLACES)
      const here = registerId ? await this.tillOf(em, registerId) : null
      if (!here?.shiftId) {
        return places
      }
      const terminals = await this.money.paymentAccounts(em, actor, ['terminal'])
      return [...places, ...terminals.filter((terminal) => servesShop(terminal, here.locationId))]
    })
  }

  async create(actor: Actor, input: CustomerPaymentInput): Promise<CustomerPaymentDto> {
    const till = atTill(actor, input.kind)
    // Paying out without the right to: a customer's own money, out of a drawer — by someone who takes
    // payments, or by a cashier on such a person's word.
    const handingBack = input.kind === 'out' && !can(actor, MAY.out)
    const byWord = handingBack && !can(actor, MAY.in)
    if (!can(actor, MAY[input.kind]) && !till && !(handingBack && (can(actor, MAY.in) || can(actor, 'pos.sell')))) {
      throw AppError.forbidden()
    }
    // The PIN is checked on its own and before the deed: a wrong one is counted though nothing then happens.
    const approver =
      byWord && input.registerId ? await this.approvals.verify(actor, input.approval ?? null, input.registerId) : null
    if (byWord && !allows(approver, MAY.in) && !allows(approver, MAY.out)) {
      throw AppError.badRequest(
        'PAYOUT_NEEDS_WORD',
        approver
          ? `${approver.name} mijozga pul berishni tasdiqlay olmaydi`
          : 'Mijozga kassadan pul berish uchun rahbar tasdig‘i kerak',
      )
    }
    const places = till ? TILL_PLACES : handingBack ? DRAWERS : PLACES
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const again = await em.findOneBy(CustomerPayment, { clientKey: input.clientKey })
      if (again) {
        return this.load(em, again)
      }
      const customer = await this.customer(em, input.customerId)
      if (till && customer.isSupplier) {
        throw AppError.forbidden('Yetkazib beruvchidan to‘lovni hisob-kitob ruxsati bor xodim oladi')
      }
      if (handingBack && customer.isSupplier) {
        throw AppError.forbidden('Yetkazib beruvchiga pulni pul berish ruxsati bor xodim beradi')
      }
      // The till it is made at: a terminal takes money only there, while its shift is open.
      const here = input.registerId ? await this.tillOf(em, input.registerId) : null
      const org = await em.findOneByOrFail(Organization, { id: actor.orgId })
      const settings = { ...DEFAULT_ORG_SETTINGS, ...org.settings }
      const currency = this.currencyOf(actor, customer, input.currency)
      const today = await this.ledger.today(em, actor.orgId)
      const book = await this.currencies.book(em, actor, today)
      const limit = await rateLimit(em, actor)
      const sign = input.kind === 'in' ? 1 : -1
      // Two payments, or a payment and a sale on account, never weigh one customer's account at once.
      await em.query(`SELECT 1 FROM customers WHERE id = $1 FOR UPDATE`, [customer.id])

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
        const terminal = account?.kind === 'terminal'
        if (!account || !account.isActive || !mayUse(actor, account) || !(terminal || places.includes(account.kind))) {
          fields[`lines.${index}.accountId`] = 'Hisob topilmadi'
          continue
        }
        if (terminal && (input.kind !== 'in' || !here?.shiftId || !servesShop(account, here.locationId))) {
          fields[`lines.${index}.accountId`] =
            input.kind === 'in'
              ? `${account.name}: terminal faqat kassada, smena ochiq bo‘lganda ishlatiladi`
              : `${account.name}: terminal orqali pul berilmaydi`
          continue
        }
        if (byWord && account.registerId !== input.registerId) {
          fields[`lines.${index}.accountId`] = 'Faqat shu kassaning tortmasidan beriladi'
          continue
        }
        // What is taken at a till onto a card or through a terminal is that shift's too: its report says so,
        // and a terminal's own slip is checked against it.
        let shiftId: string | null = account.kind === 'card' || terminal ? (here?.shiftId ?? null) : null
        if (account.kind === 'cash') {
          // Money put into a drawer between shifts would be found by nobody's count.
          const open = await em.findOneBy(Shift, { registerId: account.registerId as string, status: 'open' })
          if (!open) {
            fields[`lines.${index}.accountId`] = `${account.name}: smena ochilmagan`
            continue
          }
          shiftId = open.id
        }
        // Money is valued at the day's rate, whatever is agreed: without one there is nothing to value it by.
        const changes = account.currency !== currency
        const wanting = wantingRate(book, account.currency, currency)
        if (wanting) {
          fields[`lines.${index}.amount`] = wanting
          continue
        }
        if (input.kind === 'out') {
          const out = (spent.get(account.id) ?? 0) + line.amount
          spent.set(account.id, out)
          if (out > account.balance) {
            fields[`lines.${index}.amount`] = 'Hisobda buncha pul yo‘q'
            continue
          }
        }
        // What the two sides agreed the money settles stands as agreed, within what this person may agree to.
        const worth = valueLine(line.amount, account.currency, currency, book, changes ? line.settled : null, limit)
        if (typeof worth === 'string') {
          fields[`lines.${index}.settled`] = worth
          continue
        }
        lines.push({
          account,
          amount: line.amount,
          rate: worth.rate,
          shiftId,
          settled: worth.settled,
          cashBase: worth.cashBase,
          partnerBase: worth.partnerBase,
          fx: worth.fx,
        })
      }
      const first = Object.values(fields)[0]
      if (first) {
        throw AppError.validation(fields, first)
      }
      const settled = lines.reduce((sum, line) => sum + line.settled, 0)
      if (settled !== input.settled) {
        throw AppError.conflict('RATE_CHANGED', 'Kurs o‘zgargan: summani qayta tekshiring')
      }
      const account = await this.ledger.customerAccount(em, customer, currency)

      // A drawer's money is the day's takings: out of it goes only what the customer is owed — an advance
      // handed back, a debt of the business paid. Money ahead of that is paid from a safe, a bank or a card.
      if (input.kind === 'out') {
        const theirs = Math.max(0, -account.balance)
        const fromDrawers = lines.reduce((sum, line) => sum + (line.account.kind === 'cash' ? line.settled : 0), 0)
        if (fromDrawers > theirs) {
          throw AppError.conflict(
            'ADVANCE_EXCEEDED',
            `Kassa tortmasidan faqat mijozning haqi beriladi: ${formatMoney(theirs, currency)}. ` +
              'Oldindan to‘lov seyf, bank yoki kartadan beriladi',
          )
        }
      }

      // A small remainder let go as the money is taken: no more than change is rounded by, and no more than is left.
      const forgive = input.forgive ?? 0
      const forgiveBase = forgive ? (worthInBase(forgive, currency, book) as number) : 0
      if (forgive) {
        if (input.kind !== 'in') {
          throw AppError.validation({ forgive: 'Qoldiq to‘lov olishda kechiladi' })
        }
        if (forgive > account.balance - settled) {
          throw AppError.validation({ forgive: 'Qolgan qarzdan ko‘p kechib bo‘lmaydi' })
        }
        if (forgiveBase > settings.changeRoundStep) {
          throw AppError.validation({
            forgive: `Ko‘pi bilan ${formatMoney(settings.changeRoundStep, actor.base)} kechiladi; kattasi — hisob tuzatish bilan`,
          })
        }
      }

      const payment = await this.save(em, actor, {
        clientKey: input.clientKey,
        kind: input.kind,
        customer,
        currency,
        // They owe less after paying, more after being paid.
        change: -sign * settled - forgive,
        today,
        paidBy: [...new Set(lines.map((line) => line.account.name))].join(', '),
        note: input.note ?? null,
        forgiven: forgive,
        approvedBy: byWord ? (approver?.id ?? null) : null,
        approvedByName: byWord ? (approver?.name ?? null) : null,
      })
      await em.insert(
        CustomerPaymentLine,
        lines.map((line, position) => ({
          orgId: actor.orgId,
          paymentId: payment.id,
          position,
          accountId: line.account.id,
          currency: line.account.currency,
          amount: line.amount,
          rate: line.rate,
          settled: line.settled,
          // Money in that is worth more than it settled is the business's gain; money out, the other way round.
          fx: sign * line.fx,
          shiftId: line.shiftId,
        })),
      )

      const postings: Posting[] = lines.map((line) => ({
        accountId: line.account.id,
        amount: sign * line.amount,
        base: sign * line.cashBase,
      }))
      postings.push({
        accountId: account.id,
        amount: -sign * settled - forgive,
        base: -sign * lines.reduce((sum, line) => sum + line.partnerBase, 0) - forgiveBase,
      })
      if (forgiveBase) {
        const rounding = await this.ledger.systemAccount(em, actor.orgId, 'rounding')
        postings.push({ accountId: rounding.id, amount: forgiveBase, base: forgiveBase })
      }
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
          kind: DOCUMENT,
          documentType: DOCUMENT,
          documentId: payment.id,
          shiftId: lines.find((line) => line.shiftId)?.shiftId ?? null,
        },
        postings,
      )

      await this.audit.record(em, actor.orgId, actor, {
        action: input.kind === 'in' ? 'customer_payment.in' : 'customer_payment.out',
        entity: 'customer_payment',
        entityId: payment.id,
        summary:
          `${payment.number}: ${customer.name}, ${formatMoney(settled, currency)} (${payment.paidBy})` +
          (forgive ? `; kechildi ${formatMoney(forgive, currency)}` : '') +
          (payment.approvedByName ? `; tasdiqladi ${payment.approvedByName}` : ''),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, CHANGED))
      return this.load(em, payment)
    })
  }

  /** What stood between the business and a customer before the books began, in one of their currencies. */
  async opening(actor: Actor, input: CustomerOpeningInput): Promise<CustomerPaymentDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const again = await em.findOneBy(CustomerPayment, { clientKey: input.clientKey })
      if (again) {
        return this.load(em, again)
      }
      const customer = await this.customer(em, input.customerId)
      const currency = this.currencyOf(actor, customer, input.currency)
      const today = await this.ledger.today(em, actor.orgId)
      // What stood before is worth in the books what the day's rates make of it, along the chain where it must.
      const book = await this.currencies.book(em, actor, today)
      const wanting = wantingRate(book, currency)
      if (wanting) {
        throw AppError.validation({ amount: wanting })
      }
      if (input.dueDate && input.owes !== 'customer') {
        throw AppError.validation({ dueDate: 'Muddat mijoz qarziga qo‘yiladi' })
      }
      const change = input.owes === 'customer' ? input.amount : -input.amount
      const base = worthInBase(change, currency, book) as number
      const payment = await this.save(em, actor, {
        clientKey: input.clientKey,
        kind: 'opening',
        customer,
        currency,
        change,
        today,
        paidBy: '',
        note: input.note ?? null,
      })
      if (input.dueDate) {
        // A debt from before the books falls due like any other.
        await em.insert(CustomerDue, {
          orgId: actor.orgId,
          customerId: customer.id,
          paymentId: payment.id,
          dueDate: input.dueDate,
        })
      }
      const account = await this.ledger.customerAccount(em, customer, currency)
      const before = await this.ledger.systemAccount(em, actor.orgId, 'opening')
      await this.ledger.post(
        em,
        actor,
        { date: today, kind: DOCUMENT, documentType: DOCUMENT, documentId: payment.id },
        [
          { accountId: account.id, amount: change, base },
          { accountId: before.id, amount: -base, base: -base },
        ],
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'customer_payment.opening',
        entity: 'customer_payment',
        entityId: payment.id,
        summary: `${payment.number}: ${customer.name}, ${
          input.owes === 'customer' ? 'qarzi' : 'haqi'
        } ${formatMoney(input.amount, currency)}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, CHANGED))
      return this.load(em, payment)
    })
  }

  /**
   * Puts an account right with no money moving, against a kind of expense or income. An expense is the
   * business's loss — a debt given up — and the customer owes less by it; an income is its gain — a supplier's
   * bonus — and the business owes less by it.
   */
  async adjust(actor: Actor, input: CustomerAdjustInput): Promise<CustomerPaymentDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const again = await em.findOneBy(CustomerPayment, { clientKey: input.clientKey })
      if (again) {
        return this.load(em, again)
      }
      const customer = await this.customer(em, input.customerId)
      const currency = this.currencyOf(actor, customer, input.currency)
      const category = await em.findOneBy(MoneyCategory, { id: input.categoryId, isActive: true })
      if (!category) {
        throw AppError.validation({ categoryId: 'Tur topilmadi' })
      }
      const today = await this.ledger.today(em, actor.orgId)
      const book = await this.currencies.book(em, actor, today)
      const wanting = wantingRate(book, currency)
      if (wanting) {
        throw AppError.validation({ amount: wanting })
      }
      await em.query(`SELECT 1 FROM customers WHERE id = $1 FOR UPDATE`, [customer.id])
      const change = category.kind === 'expense' ? -input.amount : input.amount
      const base = worthInBase(change, currency, book) as number
      const payment = await this.save(em, actor, {
        clientKey: input.clientKey,
        kind: 'adjust',
        customer,
        currency,
        change,
        today,
        paidBy: category.name,
        note: input.note,
        categoryId: category.id,
      })
      const account = await this.ledger.customerAccount(em, customer, currency)
      const other = await this.ledger.systemAccount(em, actor.orgId, otherSide(category))
      await this.ledger.post(
        em,
        actor,
        { date: today, kind: DOCUMENT, documentType: DOCUMENT, documentId: payment.id },
        [
          { accountId: account.id, amount: change, base },
          { accountId: other.id, amount: -base, base: -base },
        ],
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'customer_payment.adjust',
        entity: 'customer_payment',
        entityId: payment.id,
        summary: `${payment.number}: ${customer.name}, ${category.name} ${formatMoney(input.amount, currency)} — ${input.note}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, CHANGED))
      return this.load(em, payment)
    })
  }

  /**
   * Carries what stands to a customer's good in one of their currencies into another of theirs — or, read the
   * other way, a debt from the second into the first: the first account owes more by what left it, the second
   * less by what entered. At the day's rate or a sum agreed; what lies between is the rate's.
   */
  async exchange(actor: Actor, input: CustomerExchangeInput): Promise<CustomerPaymentDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const again = await em.findOneBy(CustomerPayment, { clientKey: input.clientKey })
      if (again) {
        return this.load(em, again)
      }
      const customer = await this.customer(em, input.customerId)
      const from = this.currencyOf(actor, customer, input.from)
      const to = this.currencyOf(actor, customer, input.to)
      const today = await this.ledger.today(em, actor.orgId)
      const book = await this.currencies.book(em, actor, today)
      const wanting = wantingRate(book, from, to)
      if (wanting) {
        throw AppError.validation({ amount: wanting })
      }
      const worth = valueLine(input.amount, from, to, book, input.received, await rateLimit(em, actor))
      if (typeof worth === 'string') {
        throw AppError.validation({ received: worth })
      }
      if (worth.settled !== input.settled) {
        throw AppError.conflict('RATE_CHANGED', 'Kurs o‘zgargan: summani qayta tekshiring')
      }
      await em.query(`SELECT 1 FROM customers WHERE id = $1 FOR UPDATE`, [customer.id])
      const payment = await this.save(em, actor, {
        clientKey: input.clientKey,
        kind: 'exchange',
        customer,
        currency: from,
        change: input.amount,
        today,
        paidBy: '',
        note: input.note ?? null,
        toCurrency: to,
        toAmount: worth.settled,
        fx: worth.fx,
      })
      const left = await this.ledger.customerAccount(em, customer, from)
      const entered = await this.ledger.customerAccount(em, customer, to)
      const postings: Posting[] = [
        { accountId: left.id, amount: input.amount, base: worth.cashBase },
        { accountId: entered.id, amount: -worth.settled, base: -worth.partnerBase },
      ]
      if (worth.fx) {
        const difference = await this.ledger.systemAccount(em, actor.orgId, 'fx')
        postings.push({ accountId: difference.id, amount: -worth.fx, base: -worth.fx })
      }
      await this.ledger.post(
        em,
        actor,
        { date: today, kind: DOCUMENT, documentType: DOCUMENT, documentId: payment.id },
        postings,
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'customer_payment.exchange',
        entity: 'customer_payment',
        entityId: payment.id,
        summary: `${payment.number}: ${customer.name}, ${formatMoney(input.amount, from)} → ${formatMoney(worth.settled, to)}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, CHANGED))
      return this.load(em, payment)
    })
  }

  /**
   * Takes a payment back: the money returns to where it was and the
   * customer's account to what it was. Cash that went through a drawer can be
   * taken back only while that shift is open: after it has been counted, a
   * payment the other way puts things right.
   */
  async cancel(actor: Actor, id: string, reason: string): Promise<CustomerPaymentDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await em.query(`SELECT 1 FROM customer_payments WHERE id = $1 FOR UPDATE`, [id])
      const payment = await em.findOneBy(CustomerPayment, { id })
      if (!payment) {
        throw AppError.notFound('To‘lov topilmadi')
      }
      if (payment.status !== 'posted') {
        throw AppError.conflict('PAYMENT_CANCELLED', 'Bu to‘lov allaqachon bekor qilingan')
      }
      if (!can(actor, MAY[payment.kind])) {
        throw AppError.forbidden()
      }
      const lines = await em.find(CustomerPaymentLine, { where: { paymentId: id }, order: { position: 'ASC' } })
      const shiftIds = lines.flatMap((line) => (line.shiftId ? [line.shiftId] : []))
      if (shiftIds.length && (await em.countBy(Shift, { id: In(shiftIds), status: 'closed' }))) {
        throw AppError.conflict('SHIFT_CLOSED', 'Smena yopilgan: bu to‘lov teskari to‘lov bilan tuzatiladi')
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
          kind: `${DOCUMENT}_cancel`,
          documentType: DOCUMENT,
          documentId: id,
          shiftId: shiftIds[0] ?? null,
        },
        DOCUMENT,
      )
      await em.update(CustomerPayment, id, {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: actor.userId,
        cancelledByName: actor.name,
        cancelReason: reason,
      })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'customer_payment.cancel',
        entity: 'customer_payment',
        entityId: id,
        summary: `${payment.number}: ${reason}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, CHANGED))
      return this.load(em, await em.findOneByOrFail(CustomerPayment, { id }))
    })
  }

  async get(actor: Actor, id: string): Promise<CustomerPaymentDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const payment = await em.findOneBy(CustomerPayment, { id })
      if (!payment) {
        throw AppError.notFound('To‘lov topilmadi')
      }
      return this.load(em, payment)
    })
  }

  async list(actor: Actor, query: CustomerPaymentListQuery): Promise<Page<CustomerPaymentDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em.createQueryBuilder(CustomerPayment, 'p')
      if (query.status !== 'all') qb.andWhere('p.status = :status', { status: query.status })
      if (query.kind) qb.andWhere('p.kind = :kind', { kind: query.kind })
      if (query.customerId) qb.andWhere('p.customerId = :customerId', { customerId: query.customerId })
      if (query.from) qb.andWhere('p.paidOn >= :from', { from: query.from })
      if (query.to) qb.andWhere('p.paidOn <= :to', { to: query.to })
      applySearch(qb, 'p.search_key', query.q)
      const [rows, total] = await qb
        .orderBy('p.paidAt', 'DESC')
        .skip((query.page - 1) * query.size)
        .take(query.size)
        .getManyAndCount()
      const items: CustomerPaymentDto[] = []
      for (const row of rows) {
        items.push(await this.load(em, row))
      }
      return { items, total, page: query.page, size: query.size }
    })
  }

  /**
   * One of a customer's accounts from its first entry: every change, and what was owed after each. A supplier's
   * account is for those who may see suppliers' accounts; anyone else's, for those who may see debts.
   */
  async statement(actor: Actor, customerId: string, asked?: AnyCurrency): Promise<CustomerStatementDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const customer = await this.customer(em, customerId)
      if (!can(actor, customer.isSupplier ? 'customers.suppliers' : 'customers.debts')) {
        throw AppError.forbidden()
      }
      const currency = asked ?? customer.currency
      const account = await em.findOneBy(Account, { customerId, currency })
      const rows: {
        at: Date
        entry_kind: string
        document_type: string | null
        change: number
        document_id: string | null
        number: string | null
        kind: CustomerPaymentKind | null
        note: string | null
        cancel_reason: string | null
        due_id: string | null
        due_date: string | null
      }[] = account
        ? await em.query(
            `SELECT e.created_at AS at, e.kind AS entry_kind, e.document_type, l.amount::float8 AS change, e.document_id,
                    coalesce(p.number, r.number, s.number, sr.number, sd.number) AS number, p.kind,
                    coalesce(p.note, r.note, s.note, sd.note) AS note,
                    coalesce(p.cancel_reason, s.void_reason) AS cancel_reason,
                    d.id AS due_id, d.due_date::text AS due_date
             FROM ledger_lines l
             JOIN ledger_entries e ON e.id = l.entry_id
             LEFT JOIN customer_dues d
               ON (e.document_type = 'sale' AND d.sale_id = e.document_id)
               OR (e.document_type = '${DOCUMENT}' AND d.payment_id = e.document_id)
             LEFT JOIN customer_payments p ON p.id = e.document_id AND e.document_type = '${DOCUMENT}'
             LEFT JOIN receipts r ON r.id = e.document_id AND e.document_type = 'receipt'
             LEFT JOIN sales s ON s.id = e.document_id AND e.document_type = 'sale'
             LEFT JOIN sale_returns sr ON sr.id = e.document_id AND e.document_type = 'sale_return'
             LEFT JOIN stock_documents sd ON sd.id = e.document_id AND e.document_type = 'supplier_return'
             WHERE l.account_id = $1
             ORDER BY e.created_at, l.position`,
            [account.id],
          )
        : []
      let balance = 0
      const undone = new Set(
        rows.flatMap((row) =>
          row.document_id && (row.entry_kind.endsWith('_cancel') || row.entry_kind === 'sale_void')
            ? [row.document_id]
            : [],
        ),
      )
      const lines: CustomerStatementLine[] = rows.map((row) => {
        balance += row.change
        const cancelled = row.entry_kind.endsWith('_cancel') || row.entry_kind === 'sale_void'
        const source =
          row.document_type === 'receipt' ||
          row.document_type === 'sale' ||
          row.document_type === 'sale_return' ||
          row.document_type === 'supplier_return'
            ? row.document_type
            : 'payment'
        return {
          at: row.at.toISOString(),
          kind: cancelled ? 'cancel' : source === 'payment' ? (row.kind ?? 'opening') : source,
          source,
          number: row.number,
          documentId: row.document_id,
          change: row.change,
          balance,
          note: cancelled ? row.cancel_reason : row.note,
          // The day stays with the line that made the debt, and goes once the document is undone.
          due:
            row.due_id && !cancelled && row.change > 0 && !undone.has(row.document_id as string)
              ? { id: row.due_id, dueDate: row.due_date }
              : null,
        }
      })
      return {
        customer: await this.customers.dtoOf(em, actor, customer),
        currency,
        lines,
        balance: account?.balance ?? 0,
      }
    })
  }

  // ───────────────────────────── Inside ─────────────────────────────

  /** A till, the shop it stands in and the shift open on it, if one is. */
  private async tillOf(
    em: EntityManager,
    registerId: string,
  ): Promise<{ locationId: string; shiftId: string | null } | null> {
    const register = await em.findOneBy(Register, { id: registerId })
    if (!register) {
      return null
    }
    const shift = await em.findOneBy(Shift, { registerId, status: 'open' })
    return { locationId: register.locationId, shiftId: shift?.id ?? null }
  }

  /** Whoever the payment is with: one put away pays, and is paid, all the same. */
  private async customer(em: EntityManager, id: string): Promise<Customer> {
    const customer = await em.findOneBy(Customer, { id })
    if (!customer) {
      throw AppError.validation({ customerId: 'Mijoz topilmadi' })
    }
    return customer
  }

  /** Which of the customer's accounts: the one asked for, of a currency the business keeps, or their main one. */
  private currencyOf(actor: Actor, customer: Customer, asked: AnyCurrency | undefined): AnyCurrency {
    const currency = asked ?? customer.currency
    if (currency !== actor.base && !actor.currencies.includes(currency)) {
      throw AppError.validation({ currency: 'Bu valyuta yoqilmagan: Pul → Kurslar' })
    }
    return currency
  }

  private async save(
    em: EntityManager,
    actor: Actor,
    data: {
      clientKey: string
      kind: CustomerPaymentKind
      customer: Customer
      currency: AnyCurrency
      change: number
      today: string
      paidBy: string
      note: string | null
      forgiven?: number
      categoryId?: string
      toCurrency?: AnyCurrency
      toAmount?: number
      fx?: number
      approvedBy?: string | null
      approvedByName?: string | null
    },
  ): Promise<CustomerPayment> {
    const number = `TL-${String(await nextNumbers(em, actor.orgId, COUNTER)).padStart(6, '0')}`
    return em.save(
      em.create(CustomerPayment, {
        orgId: actor.orgId,
        number,
        clientKey: data.clientKey,
        kind: data.kind,
        status: 'posted',
        customerId: data.customer.id,
        currency: data.currency,
        change: data.change,
        paidAt: new Date(),
        paidOn: data.today,
        createdBy: actor.userId,
        createdByName: actor.name,
        paidBy: data.paidBy,
        note: data.note,
        forgiven: data.forgiven ?? 0,
        categoryId: data.categoryId ?? null,
        toCurrency: data.toCurrency ?? null,
        toAmount: data.toAmount ?? null,
        fx: data.fx ?? 0,
        approvedBy: data.approvedBy ?? null,
        approvedByName: data.approvedByName ?? null,
        searchKey: searchKey([number, data.customer.name, actor.name, data.note ?? ''].join(' ')),
      }),
    )
  }

  private async load(em: EntityManager, payment: CustomerPayment): Promise<CustomerPaymentDto> {
    const customer = await em.findOneByOrFail(Customer, { id: payment.customerId })
    const lines = await em
      .createQueryBuilder(CustomerPaymentLine, 'l')
      .innerJoin(Account, 'a', 'a.id = l.accountId')
      .addSelect('a.name', 'account_name')
      .where('l.paymentId = :id', { id: payment.id })
      .orderBy('l.position')
      .getRawAndEntities()
    const category = payment.categoryId ? await em.findOneBy(MoneyCategory, { id: payment.categoryId }) : null
    return {
      id: payment.id,
      number: payment.number,
      kind: payment.kind,
      status: payment.status,
      customerId: payment.customerId,
      customerName: customer.name,
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
        fx: line.fx,
      })),
      forgiven: payment.forgiven,
      categoryId: payment.categoryId,
      categoryName: category?.name ?? null,
      toCurrency: payment.toCurrency,
      toAmount: payment.toAmount,
      fx: payment.fx,
      approvedByName: payment.approvedByName,
    }
  }
}
