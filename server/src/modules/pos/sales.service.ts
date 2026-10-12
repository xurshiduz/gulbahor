import {
  accountBar,
  addDays,
  belowFloor,
  DEFAULT_ORG_SETTINGS,
  fromIsoDate,
  toIsoDate,
  worthInBase,
  floorOf,
  cartAutos,
  formatMoney,
  overChangeLoss,
  overDiscountLimit,
  overRateLoss,
  PAYMENT_METHOD_LABELS,
  rateGap,
  saleTotals,
  searchKey,
  rateGain,
  settle,
  settleLine,
  straysFromRate,
  CURRENCIES,
  variantLabel,
  worthOf,
  type AccountBar,
  type AnyCurrency,
  type ChangeWay,
  type LineAuto,
  type LocalDate,
  type LineWorth,
  type Page,
  type PosItemDto,
  type SaleChangeDto,
  type SaleDto,
  type SaleInput,
  type SaleListItemDto,
  type SaleListQuery,
  type SaleVoidInput,
  type TenderMethod,
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
  Location,
  Organization,
  PriceType,
  Register,
  Sale,
  SaleChange,
  SaleItem,
  SaleLine,
  SalePayment,
  SaleReturn,
  Shift,
  User,
} from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { nextNumbers } from '../catalog/counters'
import { rulesOf } from '../customers/groups'
import { wantingRate } from '../money/agreed'
import { tillCurrenciesOf, tillCurrencyProblem } from '../money/base'
import { CurrenciesService } from '../money/currencies.service'
import { LedgerService, type Posting } from '../money/ledger.service'
import { servesShop } from '../money/places'
import { runningAt } from '../promotions/promotions.service'
import { RealtimeService } from '../realtime/realtime.service'
import { StockService, type Movement } from '../stock/stock.service'
import { allows, ApprovalsService, type Approver } from './approvals.service'
import { sellables } from './items'

const DOCUMENT = 'sale'

/** What the till is told when a sale on account needs someone's word, and why. */
const ACCOUNT_BAR_CODES: Record<AccountBar, string> = {
  supplier: 'SUPPLIER_ON_ACCOUNT',
  barred: 'NO_DEBT',
  no_phone: 'NO_PHONE',
  overdue: 'DEBT_OVERDUE',
  over_limit: 'DEBT_OVER_LIMIT',
}

const mayWorkAt = (actor: Actor, locationId: string) => actor.allLocations || actor.locationIds.includes(locationId)

/**
 * A debt that goes on with goods taken in exchange: what the goods brought back had put on the customer's
 * account and still stood there. It is no new lending — the same sum on the same account, now for the goods
 * that are out — so none of the bars on lending are asked about it.
 */
export interface Carried {
  accountId: string
  currency: AnyCurrency
  /** In the sale's money, in the account's, and what the first sale wrote down as the rate's between them. */
  base: number
  settled: number
  fx: number
  /** The day it falls due, where the first sale's debt had one (`dated`). */
  dated: boolean
  dueDate: string | null
}

function throwIfAny(fields: Record<string, string>) {
  const first = Object.values(fields)[0]
  if (first) {
    throw AppError.validation(fields, first)
  }
}

/**
 * Sales. One sale is one transaction: the goods leave stock oldest batch
 * first, each tagged piece is marked as sold, and the money is posted to the
 * accounts it was paid into, all or nothing. A sale is never edited. While
 * its shift is open it can be voided, which puts everything back as it was
 * and leaves both the sale and the void in the books.
 */
@Injectable()
export class SalesService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly stock: StockService,
    private readonly ledger: LedgerService,
    private readonly approvals: ApprovalsService,
    private readonly currencies: CurrenciesService,
  ) {}

  async create(actor: Actor, input: SaleInput): Promise<SaleDto> {
    const approver = await this.approvals.verify(actor, input.approval, input.registerId)
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      // The till sends a sale again when it did not hear back: the sale it made the first time is the answer.
      const again = await em.findOneBy(Sale, { clientKey: input.clientKey })
      if (again) {
        return this.loadIn(em, actor, again)
      }
      const { sale } = await this.createIn(em, actor, input, 0, approver)
      // A sale to someone on the books moves what stands on their account: lent, spent, or change kept there.
      const touched = ['sales', 'stock', 'shifts', 'money', 'pos', ...(input.customerId ? ['customers'] : [])]
      afterCommit(() => this.realtime.changed(actor.orgId, touched))
      return this.loadIn(em, actor, sale)
    })
  }

  /**
   * Makes a sale inside a transaction that is already open. `credit` is what
   * goods brought back were worth (an exchange): the sale is paid with it
   * first, and with the customer's money only for what is left. Returns how
   * much of the credit the sale took.
   */
  async createIn(
    em: EntityManager,
    actor: Actor,
    input: SaleInput,
    credit: number,
    approver: Approver | null = null,
    carry: Carried | null = null,
  ): Promise<{ sale: Sale; credit: number }> {
    const register = await em.findOneBy(Register, { id: input.registerId })
    if (!register || !register.isActive || !mayWorkAt(actor, register.locationId)) {
      throw AppError.validation({ registerId: 'Kassa topilmadi' })
    }
    // Holding the shift makes sales at one till follow one another, and keeps it from closing under a sale.
    const [open]: { id: string }[] = await em.query(
      `SELECT id FROM shifts WHERE register_id = $1 AND status = 'open' FOR UPDATE`,
      [register.id],
    )
    if (!open) {
      throw AppError.conflict('NO_SHIFT', 'Smena ochilmagan. Avval smenani oching')
    }
    const shift = await em.findOneByOrFail(Shift, { id: open.id })

    const org = await em.findOneByOrFail(Organization, { id: actor.orgId })
    const settings = { ...DEFAULT_ORG_SETTINGS, ...org.settings }
    const today = await this.ledger.today(em, actor.orgId)
    const { base } = actor
    const book = await this.currencies.book(em, actor, today)
    const till = tillCurrenciesOf(actor, register)

    // ── Who is buying, when they are on the books. ──
    const customer = input.customerId ? await em.findOneBy(Customer, { id: input.customerId, isActive: true }) : null
    if (input.customerId && !customer) {
      throw AppError.validation({ customerId: 'Mijoz topilmadi' })
    }

    // ── The price type the cart is sold at, when it is not the retail one, and whether this person may. ──
    const rules = customer ? (await rulesOf(em, [customer])).get(customer.id) : undefined
    let priceType: PriceType | null = null
    // The price a customer's card or group gives them is theirs whoever is at the till: nobody picked it.
    const theirs = !!input.priceTypeId && rules?.priceType?.id === input.priceTypeId
    if (input.priceTypeId) {
      priceType = await em.findOneBy(PriceType, { id: input.priceTypeId })
      if (!priceType || !priceType.isActive || (priceType.tillAccess === 'none' && !theirs)) {
        throw AppError.validation({ priceTypeId: 'Bu narx turida kassada sotilmaydi' })
      }
    }
    const mayPrice = can(actor, 'pos.prices') || theirs
    if (priceType?.tillAccess === 'permitted' && !mayPrice) {
      throw AppError.forbidden(`«${priceType.name}» narxida sotishga ruxsat yo‘q`)
    }
    // A manager's word, for a price type that takes one.
    const pricedByWord = priceType?.tillAccess === 'approval' && !mayPrice
    if (pricedByWord && !allows(approver, 'pos.prices')) {
      throw AppError.badRequest(
        'PRICE_TYPE_NEEDS_WORD',
        approver
          ? `${approver.name} «${priceType?.name}» narxida sotishni tasdiqlay olmaydi`
          : `«${priceType?.name}» narxida sotish uchun rahbar tasdig‘i kerak`,
        { priceTypeId: 'Rahbar tasdig‘i kerak' },
      )
    }

    // ── The promotions in force here today, with the code the customer said. ──
    const running = await runningAt(em, register.locationId, today, input.promoCode)
    if (input.promoCode && !running.promotions.some((promotion) => promotion.code === input.promoCode)) {
      throw AppError.validation({ promoCode: 'Bunday promokod yo‘q, yoki muddati o‘tgan' })
    }

    // ── The goods: what each is and what it costs here, by the system's prices, not the till's. ──
    const items = await sellables(
      em,
      { ids: [...new Set(input.lines.map((line) => line.variantId))] },
      register.locationId,
      await this.currencies.book(em, actor, today),
      priceType?.id ?? null,
      running,
    )
    const itemOf = new Map(items.map((item) => [item.variantId, item]))
    const fields: Record<string, string> = {}
    input.lines.forEach((line, index) => {
      const item = itemOf.get(line.variantId)
      if (!item) {
        fields[`lines.${index}.variantId`] = 'Tovar topilmadi'
      } else if (item.price === null) {
        fields[`lines.${index}.variantId`] = `«${item.name}»: chakana narx qo‘yilmagan`
      } else if (!item.decimals && !Number.isInteger(line.qty)) {
        fields[`lines.${index}.qty`] = `«${item.name}» butun dona bilan sotiladi`
      }
    })
    throwIfAny(fields)

    // ── Tagged pieces: each must be this very thing, and on hand. ──
    const tags = input.lines.flatMap((line) => (line.epc ? [line.epc] : []))
    const units: { id: string; epc: string; variant_id: string; status: string }[] = tags.length
      ? await em.query(`SELECT id, epc, variant_id, status FROM rfid_units WHERE epc = ANY($1) FOR UPDATE`, [tags])
      : []
    const unitOf = new Map(units.map((unit) => [unit.epc, unit]))
    input.lines.forEach((line, index) => {
      if (!line.epc) {
        return
      }
      const unit = unitOf.get(line.epc)
      if (!unit || unit.variant_id !== line.variantId) {
        fields[`lines.${index}.epc`] = 'Bu RFID belgi shu tovarga tegishli emas'
      } else if (unit.status !== 'in_stock') {
        fields[`lines.${index}.epc`] = unit.status === 'sold' ? 'Bu dona allaqachon sotilgan' : 'Bu dona qoldiqda yo‘q'
      }
    })
    throwIfAny(fields)

    // ── The sum. ──
    // The customer's own discount comes off by itself, and only off the retail price: a price of their
    // own (wholesale, a family price) is already what they were given.
    const ownPercent = priceType ? 0 : (rules?.discountPercent ?? 0)
    // Each line with what comes off it by itself: the best promotion that covers it, the customer's own
    // discount, or both where the promotion stacks. The till works out the same from the same offers.
    const autos = cartAutos(
      input.lines.map((line) => {
        const item = itemOf.get(line.variantId) as PosItemDto
        return { price: item.price as number, qty: line.qty, offers: item.promos ?? [] }
      }),
      ownPercent,
    )
    const totals = saleTotals(
      input.lines.map((line, index) => ({
        price: itemOf.get(line.variantId)?.price as number,
        qty: line.qty,
        discount: line.discount,
        auto: autos[index].auto,
      })),
      input.discount,
    )
    if (totals.total !== input.total) {
      throw AppError.conflict('PRICE_CHANGED', 'Narxlar o‘zgargan. Chekni yangilab, summani qayta tekshiring')
    }
    const offered = input.discount + input.lines.reduce((sum, line) => sum + line.discount, 0)
    if (offered > totals.subtotal - totals.auto) {
      throw AppError.validation({ discount: 'Chegirma tovar summasidan katta' })
    }
    // Over the limit a cashier needs someone's word: their own right, or a manager's PIN given with the sale.
    // What came off by itself is not the cashier's giving and is not held against their limit.
    const overLimit = overDiscountLimit(totals, settings.maxDiscountPercent)
    // The same word is needed under a thing's floor, however small the discount that took it there.
    const priced = input.lines.map((line) => {
      const item = itemOf.get(line.variantId) as PosItemDto
      return { name: item.name, price: item.price as number, minPrice: item.minPrice, qty: line.qty }
    })
    // A price type may be meant to go under it: a family price at cost.
    const under = priceType?.skipsFloor ? [] : belowFloor(priced, totals)
    const alone = can(actor, 'pos.discount')
    const allowed = alone || allows(approver, 'pos.discount')
    if (overLimit && !allowed) {
      throw AppError.badRequest(
        'DISCOUNT_OVER_LIMIT',
        approver
          ? `${approver.name} chegaradan oshiq chegirmani tasdiqlay olmaydi`
          : `Chegirma ${settings.maxDiscountPercent}% dan oshdi: rahbar tasdig‘i kerak`,
        { discount: `Ko‘pi bilan ${settings.maxDiscountPercent}%` },
      )
    }
    if (under.length && !allowed) {
      throw AppError.badRequest(
        'BELOW_MIN_PRICE',
        approver
          ? `${approver.name} minimal narxdan past sotishni tasdiqlay olmaydi`
          : `«${priced[under[0]].name}» minimal narxdan past: rahbar tasdig‘i kerak`,
        Object.fromEntries(
          under.map((index) => {
            const line = priced[index]
            return [
              `lines.${index}.discount`,
              `Minimal narx ${formatMoney(floorOf(line.price, line.minPrice, line.qty) as number, base)}`,
            ]
          }),
        ),
      )
    }

    // ── The money: where each payment goes. ──
    const accounts = await em.findBy(Account, {
      id: In(input.payments.flatMap((payment) => (payment.accountId ? [payment.accountId] : []))),
    })
    const payments: {
      method: TenderMethod
      account: Account
      currency: AnyCurrency
      amount: number
      /** What it pays of the sale: what was agreed, or what the rate makes it. */
      base: number
      /** What the rate makes it, over what it pays. */
      fx: number
      reference: string | null
    }[] = []
    for (const [index, payment] of input.payments.entries()) {
      // Left out, it is the base: the money the shop keeps its books in.
      const currency = payment.currency ?? base
      const problem = tillCurrencyProblem(currency, till, book)
      if (problem) {
        fields[`payments.${index}.currency`] = problem
        continue
      }
      if (payment.value !== null && currency === base) {
        fields[`payments.${index}.value`] = 'Kelishilgan qiymat chet valyuta uchun yoziladi'
        continue
      }
      if (payment.method === 'terminal' && currency !== base) {
        fields[`payments.${index}.currency`] = 'Terminal faqat asosiy valyutada'
        continue
      }
      let account: Account | undefined
      if (payment.method === 'cash') {
        account = await this.ledger.cashAccount(em, register, currency)
      } else {
        account = accounts.find((item) => item.id === payment.accountId)
        const fits =
          account &&
          account.kind === payment.method &&
          account.currency === currency &&
          account.isActive &&
          servesShop(account, register.locationId)
        if (!fits) {
          fields[`payments.${index}.accountId`] = payment.method === 'card' ? 'Karta topilmadi' : 'Terminal topilmadi'
          continue
        }
      }
      const tender = { ...payment, currency }
      payments.push({
        method: payment.method,
        account: account as Account,
        currency,
        amount: payment.amount,
        base: worthOf(tender, book) as number,
        fx: rateGain(tender, book),
        reference: payment.reference ?? null,
      })
    }
    throwIfAny(fields)
    // Dollars taken for more than the rate makes them are a discount by another name: past the shop's limit
    // they need the same word.
    const overRate = overRateLoss(
      payments.map((payment) => ({ ...payment, value: payment.base })),
      book,
      settings.maxRateLossPercent,
    )
    if (overRate && !allowed) {
      throw AppError.badRequest(
        'RATE_LOSS_OVER_LIMIT',
        approver
          ? `${approver.name} valyutani kursdan qimmat olishni tasdiqlay olmaydi`
          : `Valyuta kun kursidan ${settings.maxRateLossPercent}% dan ko‘proq qimmat olinmoqda: rahbar tasdig‘i kerak`,
        { payments: `Kursdan farq ko‘pi bilan ${settings.maxRateLossPercent}%` },
      )
    }
    // Goods brought back pay first; the customer's money is for what is left.
    const used = Math.min(credit, totals.total)
    // And what they still owed for those goods goes on with these.
    const carried = carry?.base ?? 0
    if (used < credit && payments.length) {
      throw AppError.validation({ payments: 'Qaytarilgan tovar summasi yetarli: qo‘shimcha to‘lov kerak emas' })
    }

    // ── What goes on the customer's account: in one of its currencies, at the day's rate or a sum agreed. What
    // is theirs there (haqi) pays first; only the rest is lent, and a cashier lends only as far as the customer's
    // terms and the business's limit go — further, someone's word. ──
    const onAccount = input.onAccount?.amount ?? 0
    let accountWorth: LineWorth | null = null
    let soldByWord = false
    let accountOverRate = false
    let prepaid = 0
    let lent = 0
    let dueDate: string | null = null
    const accountCurrency = input.onAccount?.currency ?? customer?.currency ?? base
    if (input.onAccount) {
      if (!customer || !rules) {
        throw AppError.validation({ customerId: 'Hisobiga yozish uchun mijozni tanlang' })
      }
      if (carry && accountCurrency !== carry.currency) {
        throw AppError.validation({
          onAccount: `Qaytgan tovarning qarzi ${carry.currency} hisobida: farq ham shu hisobga yoziladi`,
        })
      }
      if (onAccount > totals.total - used - carried) {
        throw AppError.validation({ onAccount: 'Hisobiga yoziladigan summa chekdan oshmasligi kerak' })
      }
      if (accountCurrency !== base && !actor.currencies.includes(accountCurrency)) {
        throw AppError.validation({ onAccount: 'Bu valyuta yoqilmagan: Pul → Kurslar' })
      }
      const wanting = wantingRate(book, book.base, accountCurrency)
      if (wanting) {
        throw AppError.validation({ onAccount: wanting })
      }
      accountWorth = settleLine(onAccount, book.base, accountCurrency, book, input.onAccount.settled)
      // An agreed sum far from the day's rate gives as much away as a discount does: the same word lets it.
      accountOverRate = accountWorth.agreed && straysFromRate(accountWorth, settings.maxRateLossPercent)
      if (accountOverRate && !allowed) {
        const gap = String(rateGap(accountWorth)).replace('.', ',')
        throw AppError.badRequest(
          'RATE_LOSS_OVER_LIMIT',
          approver
            ? `${approver.name} kun kursidan uzoq kelishilgan summani tasdiqlay olmaydi`
            : `Kelishilgan summa kun kursidan ${gap}% farq qiladi: rahbar tasdig‘i kerak`,
          { onAccount: `Kursdan farq ko‘pi bilan ${settings.maxRateLossPercent}%` },
        )
      }
      // Two sales to one customer, or a sale and a payment, wait for each other here: neither lends past the
      // limit unseen. The accounts are read again once held.
      await em.query(`SELECT 1 FROM customers WHERE id = $1 FOR UPDATE`, [customer.id])
      const held = (await rulesOf(em, [customer])).get(customer.id)?.accounts ?? []
      const balance = held.find((account) => account.currency === accountCurrency)?.balance ?? 0
      prepaid = Math.min(accountWorth.settled, Math.max(0, -balance))
      lent = accountWorth.settled - prepaid
      // Weighed in the base at today's rates: what they owe across their accounts, and what this adds.
      const unrated = lent
        ? wantingRate(book, book.base, ...held.filter((a) => a.balance).map((a) => a.currency))
        : null
      if (unrated) {
        throw AppError.validation({ onAccount: unrated })
      }
      const owedBase = held.reduce(
        (sum, account) => sum + (worthInBase(account.balance, account.currency, book) ?? 0),
        0,
      )
      const adds = lent ? (worthInBase(lent, accountCurrency, book) ?? 0) : 0
      const late = held.find((account) => account.overdue > 0)
      const bar = accountBar(
        {
          supplier: customer.isSupplier,
          barred: rules.noDebt,
          hasPhone: !!customer.phone,
          credit: customer.credit,
          creditLimit: customer.creditLimit,
          owedBase,
          overdue: !!late,
        },
        adds,
        settings.debtLimit,
      )
      if (bar && !can(actor, 'pos.debt')) {
        if (!allows(approver, 'pos.debt')) {
          const limit = customer.credit === 'limit' ? (customer.creditLimit ?? 0) : settings.debtLimit
          const why =
            bar === 'supplier'
              ? `${customer.name} — yetkazib beruvchi`
              : bar === 'barred'
                ? `${customer.name}: bu mijozga qarzga berilmaydi`
                : bar === 'no_phone'
                  ? `${customer.name}: telefoni yo‘q mijozga qarz berilmaydi`
                  : bar === 'overdue'
                    ? `${customer.name}: muddati o‘tgan qarzi bor (${formatMoney(late?.overdue ?? 0, late?.currency ?? base)})`
                    : limit
                      ? `${customer.name}: qarzi chegaradan oshadi (${formatMoney(owedBase + adds, base)}, chegara ${formatMoney(limit, base)})`
                      : `${customer.name}: qarzga faqat rahbar tasdig‘i bilan beriladi`
          throw AppError.badRequest(
            ACCOUNT_BAR_CODES[bar],
            approver ? `${approver.name} qarzga sotishni tasdiqlay olmaydi` : `${why}: rahbar tasdig‘i kerak`,
            { onAccount: why },
          )
        }
        soldByWord = true
      }
      // The day the debt falls due: the one the cashier set, else the customer's own days or the business's.
      if (lent) {
        const asked = input.onAccount.dueDate
        if (asked === null && !customer.noDue) {
          throw AppError.validation({ 'onAccount.dueDate': 'Qarz muddatini kiriting' })
        }
        if (asked && asked < today) {
          throw AppError.validation({ 'onAccount.dueDate': 'Qarz muddati o‘tgan kunga qo‘yilmaydi' })
        }
        dueDate =
          asked !== undefined
            ? asked
            : customer.noDue
              ? null
              : toIsoDate(addDays(fromIsoDate(today) as LocalDate, customer.dueDays ?? settings.debtDays))
      }
    }

    // ── The change, where not all of it goes back as cash in the base: each part, and where it comes out of.
    // Another drawer's notes, one of the shop's cards, or the customer's own account. ──
    const sending = input.change.flatMap((line) => (line.way === 'card' && line.accountId ? [line.accountId] : []))
    const senders = sending.length ? await em.findBy(Account, { id: In(sending) }) : []
    const back: { way: ChangeWay; account: Account; currency: AnyCurrency; amount: number; value: number | null }[] = []
    for (const [index, line] of input.change.entries()) {
      let account: Account
      if (line.way === 'cash') {
        const currency = line.currency ?? base
        if (currency === base) {
          fields[`change.${index}.currency`] = 'Asosiy valyutadagi naqd qaytim o‘zi hisoblanadi'
          continue
        }
        const problem = tillCurrencyProblem(currency, till, book)
        if (problem) {
          fields[`change.${index}.currency`] = problem
          continue
        }
        account = await this.ledger.cashAccount(em, register, currency)
      } else if (line.way === 'card') {
        const card = senders.find((item) => item.id === line.accountId)
        if (!card || card.kind !== 'card' || !card.isActive || !servesShop(card, register.locationId)) {
          fields[`change.${index}.accountId`] = 'Karta topilmadi'
          continue
        }
        if (line.currency && line.currency !== card.currency) {
          fields[`change.${index}.currency`] = 'Kartaning valyutasi boshqa'
          continue
        }
        account = card
      } else {
        if (!customer) {
          throw AppError.validation({ customerId: 'Qaytimni hisobiga yozish uchun mijozni tanlang' })
        }
        // A supplier's account is the business's dealings with them: the till writes there on the word a
        // sale on that account takes.
        if (customer.isSupplier && !can(actor, 'pos.debt')) {
          if (!allows(approver, 'pos.debt')) {
            throw AppError.badRequest(
              'SUPPLIER_ON_ACCOUNT',
              approver
                ? `${approver.name} yetkazib beruvchi hisobiga yozishni tasdiqlay olmaydi`
                : `${customer.name} — yetkazib beruvchi: hisobiga qaytim rahbar tasdig‘i bilan yoziladi`,
              { [`change.${index}.way`]: `${customer.name} — yetkazib beruvchi` },
            )
          }
          soldByWord = true
        }
        if (input.onAccount) {
          fields[`change.${index}.way`] = 'Chekning bir qismi hisobiga yozilgan: o‘sha summani kamaytiring'
          continue
        }
        const currency = line.currency ?? customer.currency ?? base
        if (currency !== base && !actor.currencies.includes(currency)) {
          fields[`change.${index}.currency`] = 'Bu valyuta yoqilmagan: Pul → Kurslar'
          continue
        }
        const wanting = wantingRate(book, book.base, currency)
        if (wanting) {
          fields[`change.${index}.currency`] = wanting
          continue
        }
        // A sale and a payment to one customer wait for each other, as where the sale lends.
        await em.query(`SELECT 1 FROM customers WHERE id = $1 FOR UPDATE`, [customer.id])
        account = await this.ledger.customerAccount(em, customer, currency)
      }
      if (account.currency === base && line.value !== null && line.value !== line.amount) {
        fields[`change.${index}.value`] = 'Kelishilgan qiymat chet valyuta uchun yoziladi'
        continue
      }
      back.push({ way: line.way, account, currency: account.currency, amount: line.amount, value: line.value })
    }
    throwIfAny(fields)

    const settlement = settle(
      totals.total - used - onAccount - carried,
      payments.map((payment) => ({ ...payment, value: payment.base })),
      {
        book,
        change: back.map((line) => ({
          way: line.way,
          currency: line.currency,
          amount: line.amount,
          value: line.value,
        })),
        roundStep: settings.changeRoundStep,
      },
    )
    if (settlement.problem === 'terminal_over') {
      throw AppError.validation({
        payments: 'Terminal summasi chekdan oshmasligi kerak: undan qaytim berilmaydi',
      })
    }
    if (settlement.problem === 'rate') {
      throw AppError.validation({
        change: (settlement.wanting && wantingRate(book, book.base, settlement.wanting)) ?? 'Kurs qo‘yilmagan',
      })
    }
    if (settlement.due > 0) {
      throw AppError.validation({ payments: `To‘lov yetarli emas: yana ${formatMoney(settlement.due, base)}` })
    }
    if (settlement.problem === 'change_over') {
      const over = settlement.paid - (totals.total - used - onAccount - carried)
      throw AppError.validation({
        change: over
          ? `Qaytim ${formatMoney(over, base)} dan oshmasligi kerak`
          : 'Ortiqcha to‘lov yo‘q: qaytim berilmaydi',
      })
    }
    // Change sent from a card is money handed back otherwise than it was paid, and nothing in the till shows
    // that it went: this person's own right, or someone's word.
    const cardByWord = back.some((line) => line.way === 'card') && !can(actor, 'pos.return_any')
    if (cardByWord && !allows(approver, 'pos.return_any')) {
      throw AppError.badRequest(
        'CHANGE_NEEDS_WORD',
        approver
          ? `${approver.name} kartadan qaytim berishni tasdiqlay olmaydi`
          : 'Kartadan qaytim berish uchun rahbar tasdig‘i kerak',
        { change: 'Rahbar tasdig‘i kerak' },
      )
    }
    // Notes handed back for less than the rate makes them give away what a discount would: the same word.
    const changeOverRate = overChangeLoss(settlement.given, settings.maxRateLossPercent)
    if (changeOverRate && !allowed) {
      throw AppError.badRequest(
        'RATE_LOSS_OVER_LIMIT',
        approver
          ? `${approver.name} kun kursidan uzoq qaytimni tasdiqlay olmaydi`
          : `Qaytim kun kursidan ${settings.maxRateLossPercent}% dan ko‘proq arzonga berilmoqda: rahbar tasdig‘i kerak`,
        { change: `Kursdan farq ko‘pi bilan ${settings.maxRateLossPercent}%` },
      )
    }
    const vouched =
      ((overLimit || under.length > 0 || overRate || accountOverRate || changeOverRate) && !alone) ||
      pricedByWord ||
      soldByWord ||
      cardByWord

    const seller = input.sellerId ? await em.findOneBy(User, { id: input.sellerId, isActive: true }) : null
    if (input.sellerId && !seller) {
      throw AppError.validation({ sellerId: 'Sotuvchi topilmadi' })
    }

    // ── The sale. ──
    const number = `CH-${String(await nextNumbers(em, actor.orgId, 'sale')).padStart(6, '0')}`
    const paidBy = [
      ...new Set([
        ...(used ? [PAYMENT_METHOD_LABELS.exchange] : []),
        ...payments.map(
          (payment) =>
            PAYMENT_METHOD_LABELS[payment.method] +
            (payment.currency !== base ? ` ${CURRENCIES[payment.currency].symbol}` : ''),
        ),
        ...(onAccount || carried ? [PAYMENT_METHOD_LABELS.account] : []),
      ]),
    ].join(', ')
    const sale = await em.save(
      em.create(Sale, {
        orgId: actor.orgId,
        number,
        clientKey: input.clientKey,
        shiftId: shift.id,
        registerId: register.id,
        locationId: register.locationId,
        status: 'completed',
        soldAt: new Date(),
        soldOn: today,
        cashierId: actor.userId,
        cashierName: actor.name,
        sellerId: seller?.id ?? null,
        sellerName: seller?.fullName ?? null,
        qty: input.lines.reduce((sum, line) => sum + Math.round(line.qty * 1000), 0) / 1000,
        subtotal: totals.subtotal,
        discount: totals.discount,
        total: totals.total,
        uzsPerUsd: null,
        rounding: settlement.rounding,
        costUzs: 0,
        paidBy,
        approvedBy: vouched ? (approver?.id ?? null) : null,
        approvedByName: vouched ? (approver?.name ?? null) : null,
        priceTypeId: priceType?.id ?? null,
        priceTypeName: priceType?.name ?? null,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        autoDiscount: totals.auto,
        autoReason: totals.auto ? autoReason(autos, rules?.discountReason ?? null) : null,
        promoCode: input.promoCode,
        note: input.note ?? null,
        searchKey: searchKey([number, actor.name, seller?.fullName ?? '', customer?.name ?? ''].join(' ')),
      }),
    )
    const lines = await em.save(
      input.lines.map((line, index) =>
        em.create(SaleLine, {
          orgId: actor.orgId,
          saleId: sale.id,
          position: index,
          variantId: line.variantId,
          qty: line.qty,
          price: itemOf.get(line.variantId)?.price as number,
          discount: totals.lines[index].discount,
          autoDiscount: totals.lines[index].auto,
          // A line given away whole by the cashier still says which promotion was on it, and for how much.
          promotionId: autos[index].promo?.id ?? null,
          promotionName: autos[index].promo?.name ?? null,
          promoDiscount: Math.min(autos[index].promoOff, totals.lines[index].auto),
          total: totals.lines[index].total,
          costUzs: 0,
          unitId: line.epc ? (unitOf.get(line.epc)?.id ?? null) : null,
        }),
      ),
    )

    // ── Stock: oldest batch first, and remembered piece by piece. ──
    const picked = await this.stock.pick(
      em,
      register.locationId,
      lines.map((line) => ({ variantId: line.variantId, qty: line.qty })),
    )
    picked.forEach((result, index) => {
      if (result.missing) {
        const item = itemOf.get(lines[index].variantId)
        const have = Math.round((lines[index].qty - result.missing) * 1000) / 1000
        fields[`lines.${index}.qty`] =
          `«${item?.name}${item?.label ? `, ${item.label}` : ''}»: qoldiq yetarli emas (bor ${have})`
      }
    })
    throwIfAny(fields)

    const movements: Movement[] = []
    const pieces: Partial<SaleItem>[] = []
    let costUzs = 0
    for (const [index, line] of lines.entries()) {
      let lineUzs = 0
      picked[index].pieces.forEach((piece, position) => {
        movements.push({
          kind: 'sale',
          docDate: today,
          documentType: DOCUMENT,
          documentId: sale.id,
          lineId: line.id,
          locationId: register.locationId,
          batchId: piece.batchId,
          variantId: piece.variantId,
          qty: -piece.qty,
          costUzs: -piece.costUzs,
        })
        pieces.push({ orgId: actor.orgId, saleId: sale.id, lineId: line.id, position, ...piece })
        lineUzs += piece.costUzs
      })
      await em.update(SaleLine, line.id, { costUzs: lineUzs })
      costUzs += lineUzs
    }
    await this.stock.apply(em, actor.orgId, actor.userId, movements)
    await em.insert(SaleItem, pieces)
    await em.update(Sale, sale.id, { costUzs })
    if (units.length) {
      await em.query(`UPDATE rfid_units SET status = 'sold', sale_id = $1 WHERE id = ANY($2)`, [
        sale.id,
        units.map((unit) => unit.id),
      ])
    }

    // ── Money: into the accounts it was paid to, the change back out, the rest is the sale. ──
    const paid: Partial<SalePayment>[] = payments.map((payment) => ({
      method: payment.method,
      accountId: payment.account.id,
      currency: payment.currency,
      amount: payment.amount,
      base: payment.base,
      fx: payment.fx,
      reference: payment.reference,
    }))
    if (used) {
      const exchange = await this.ledger.systemAccount(em, actor.orgId, 'exchange')
      paid.unshift({
        method: 'exchange',
        accountId: exchange.id,
        currency: base,
        amount: used,
        base: used,
        reference: null,
      })
    }
    if ((accountWorth && customer) || carry) {
      // On the customer's account in that currency; its worth there is what the day's rates make of that sum.
      // A debt carried on from goods brought back is one line with it: the same account, as the first sale wrote it.
      const account = accountWorth && customer ? await this.ledger.customerAccount(em, customer, accountCurrency) : null
      paid.push({
        method: 'account',
        accountId: (account?.id ?? carry?.accountId) as string,
        currency: accountWorth ? accountCurrency : (carry as Carried).currency,
        amount: (accountWorth?.settled ?? 0) + (carry?.settled ?? 0),
        base: onAccount + carried,
        fx: (accountWorth ? accountWorth.partnerBase - onAccount : 0) + (carry?.fx ?? 0),
        prepaid,
        reference: null,
      })
      if ((lent || carry?.dated) && customer) {
        // What it lends falls due on its day, kept apart from the payment so that the day can be moved. A debt
        // carried on keeps the day it had; with new lending beside it, the earlier of the two.
        const days = [lent ? dueDate : null, carry?.dated ? carry.dueDate : null].filter((day): day is string => !!day)
        await em.insert(CustomerDue, {
          orgId: actor.orgId,
          customerId: customer.id,
          saleId: sale.id,
          dueDate: days.sort()[0] ?? null,
        })
      }
    }
    await em.insert(
      SalePayment,
      paid.map((payment, position) => ({ ...payment, orgId: actor.orgId, saleId: sale.id, position })),
    )
    // The change as it went: the parts that were named, then what is left of it as cash in the base.
    const changed: Pick<SaleChange, 'way' | 'accountId' | 'currency' | 'amount' | 'base' | 'fx'>[] =
      settlement.given.map((line, index) => ({
        way: line.way,
        accountId: back[index].account.id,
        currency: line.currency,
        amount: line.amount,
        base: line.base,
        fx: line.fx,
      }))
    if (settlement.changeUzs) {
      const drawer = await this.ledger.cashAccount(em, register, base)
      changed.push({
        way: 'cash',
        accountId: drawer.id,
        currency: base,
        amount: settlement.changeUzs,
        base: settlement.changeUzs,
        fx: 0,
      })
    }
    if (changed.length) {
      await em.insert(
        SaleChange,
        changed.map((line, position) => ({ ...line, orgId: actor.orgId, saleId: sale.id, position })),
      )
    }
    // The drawer holds the notes at the day's rate, whatever they were taken for — and gives them up at it.
    const postings: Posting[] = [
      ...paid.map((payment) => ({
        accountId: payment.accountId as string,
        amount: payment.amount as number,
        base: (payment.base as number) + (payment.fx ?? 0),
      })),
      ...changed.map((line) => ({ accountId: line.accountId, amount: -line.amount, base: -(line.base - line.fx) })),
    ]
    const gained =
      payments.reduce((sum, payment) => sum + payment.fx, 0) +
      (accountWorth ? accountWorth.partnerBase - onAccount : 0) +
      (carry?.fx ?? 0) +
      changed.reduce((sum, line) => sum + line.fx, 0)
    if (gained) {
      const fx = await this.ledger.systemAccount(em, actor.orgId, 'fx')
      postings.push({ accountId: fx.id, amount: -gained, base: -gained })
    }
    const revenue = await this.ledger.systemAccount(em, actor.orgId, 'sales')
    postings.push({ accountId: revenue.id, amount: -totals.total, base: -totals.total })
    if (settlement.rounding) {
      const rounding = await this.ledger.systemAccount(em, actor.orgId, 'rounding')
      postings.push({ accountId: rounding.id, amount: -settlement.rounding, base: -settlement.rounding })
    }
    await this.ledger.post(
      em,
      actor,
      { date: today, kind: 'sale', documentType: DOCUMENT, documentId: sale.id, shiftId: shift.id },
      postings,
    )

    await this.audit.record(em, actor.orgId, actor, {
      action: 'sale.create',
      entity: 'sale',
      entityId: sale.id,
      summary: `${number}: ${sale.qty} dona, ${formatMoney(totals.total, base)}${
        totals.discount ? `, chegirma ${formatMoney(totals.discount, base)}` : ''
      } (${paidBy})${priceType ? `, narx: ${priceType.name}` : ''}${
        gained ? `, kurs farqi ${gained > 0 ? '+' : '−'}${formatMoney(Math.abs(gained), base)}` : ''
      }${changed
        .filter((line) => line.way !== 'cash')
        .map(
          (line) =>
            `, ${line.way === 'account' ? 'qaytim hisobiga yozildi' : 'qaytim kartadan berildi'}: ${formatMoney(line.amount, line.currency)}`,
        )
        .join('')}${vouched && approver ? `, tasdiqladi: ${approver.name}` : ''}`,
    })
    return { sale: await em.findOneByOrFail(Sale, { id: sale.id }), credit: used }
  }

  /**
   * Undoes a sale made in a shift that is still open: the goods go back to
   * the batches they came from, the money goes back out of the accounts it
   * went into. After the shift is closed a sale is undone by a return.
   */
  async void(actor: Actor, id: string, input: SaleVoidInput): Promise<SaleDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await em.query(`SELECT 1 FROM sales WHERE id = $1 FOR UPDATE`, [id])
      const sale = await this.find(em, actor, id)
      if (sale.status !== 'completed') {
        throw AppError.conflict('SALE_VOIDED', 'Bu chek allaqachon bekor qilingan')
      }
      // What a return has touched is put right by another return: a void would put the same goods back twice.
      if (sale.returnedTotal) {
        throw AppError.conflict('SALE_RETURNED', 'Bu chekdan tovar qaytarilgan: uni bekor qilib bo‘lmaydi')
      }
      if (await em.findOneBy(SalePayment, { saleId: id, method: 'exchange' })) {
        throw AppError.conflict(
          'SALE_EXCHANGED',
          'Bu chek almashtirish bilan to‘langan: bekor qilinmaydi, tovar qaytarish orqali olinadi',
        )
      }
      const [open]: { id: string }[] = await em.query(
        `SELECT id FROM shifts WHERE id = $1 AND status = 'open' FOR UPDATE`,
        [sale.shiftId],
      )
      if (!open) {
        throw AppError.conflict('SHIFT_CLOSED', 'Smena yopilgan. Bu chek qaytarish orqali rasmiylashtiriladi')
      }
      const today = await this.ledger.today(em, actor.orgId)

      const pieces = await em.find(SaleItem, { where: { saleId: id }, order: { position: 'ASC' } })
      await this.stock.apply(
        em,
        actor.orgId,
        actor.userId,
        pieces.map((piece) => ({
          kind: 'sale_void',
          docDate: today,
          documentType: DOCUMENT,
          documentId: id,
          lineId: piece.lineId,
          locationId: sale.locationId,
          batchId: piece.batchId,
          variantId: piece.variantId,
          qty: piece.qty,
          costUzs: piece.costUzs,
        })),
      )
      await em.query(`UPDATE rfid_units SET status = 'in_stock', sale_id = NULL WHERE sale_id = $1`, [id])
      await this.ledger.reverse(
        em,
        actor,
        { date: today, kind: 'sale_void', documentType: DOCUMENT, documentId: id, shiftId: sale.shiftId },
        'sale',
      )
      // A receipt given to another customer since: what moved between their accounts goes back the same way.
      const [moved]: { entries: number }[] = await em.query(
        `SELECT count(*)::int AS entries FROM ledger_entries
         WHERE document_type = $1 AND document_id = $2 AND kind = 'sale_customer'`,
        [DOCUMENT, id],
      )
      if (moved.entries) {
        await this.ledger.reverse(
          em,
          actor,
          { date: today, kind: 'sale_void', documentType: DOCUMENT, documentId: id, shiftId: sale.shiftId },
          'sale_customer',
        )
      }
      await em.update(Sale, id, {
        status: 'voided',
        voidedAt: new Date(),
        voidedBy: actor.userId,
        voidedByName: actor.name,
        voidReason: input.reason,
      })

      await this.audit.record(em, actor.orgId, actor, {
        action: 'sale.void',
        entity: 'sale',
        entityId: id,
        summary: `${sale.number}: ${formatMoney(sale.total, actor.base)}. ${input.reason}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['sales', 'stock', 'shifts', 'money', 'pos']))
      return this.loadIn(em, actor, await em.findOneByOrFail(Sale, { id }))
    })
  }

  /**
   * Gives a receipt to another customer — it was rung up to the wrong one, or to none. What the sale put on
   * the first one's account (a debt, or change kept there) moves to the same account of the second, in the
   * same currency and at the same worth, by an entry of its own; the day the debt falls due goes with it. A
   * receipt goods have come back on stays whose it is: its returns are written against that account.
   */
  async giveTo(actor: Actor, id: string, customerId: string | null): Promise<SaleDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await em.query(`SELECT 1 FROM sales WHERE id = $1 FOR UPDATE`, [id])
      const sale = await this.find(em, actor, id)
      if (sale.status !== 'completed') {
        throw AppError.conflict('SALE_VOIDED', 'Bu chek bekor qilingan')
      }
      if (sale.returnedTotal || (await em.countBy(SaleReturn, { saleId: id }))) {
        throw AppError.conflict('SALE_RETURNED', 'Bu chekdan tovar qaytarilgan: mijozini almashtirib bo‘lmaydi')
      }
      if ((sale.customerId ?? null) === customerId) {
        return this.loadIn(em, actor, sale)
      }
      const next = customerId ? await em.findOneBy(Customer, { id: customerId, isActive: true }) : null
      if (customerId && !next) {
        throw AppError.validation({ customerId: 'Mijoz topilmadi' })
      }
      const lent = await em.findOneBy(SalePayment, { saleId: id, method: 'account' })
      const kept = await em.findBy(SaleChange, { saleId: id, way: 'account' })
      if (lent || kept.length) {
        if (!next) {
          throw AppError.validation({
            customerId: 'Chekning bir qismi mijoz hisobida turibdi: mijozsiz qoldirib bo‘lmaydi',
          })
        }
        if (next.isSupplier) {
          throw AppError.validation({ customerId: `${next.name} — yetkazib beruvchi: hisobiga chek yozilmaydi` })
        }
      }
      // Both are held, always in the same order: nothing else moves either account meanwhile.
      const held = [sale.customerId, next?.id].filter((item): item is string => !!item).sort()
      await em.query(`SELECT 1 FROM customers WHERE id = ANY($1) ORDER BY id FOR UPDATE`, [held])

      const postings: Posting[] = []
      if (lent && next) {
        const from = await em.findOneByOrFail(Account, { id: lent.accountId })
        const to = await this.ledger.customerAccount(em, next, from.currency)
        // At what the sale put it there: its worth on the day of the sale, not today's.
        const worth = lent.base + lent.fx
        postings.push(
          { accountId: from.id, amount: -lent.amount, base: -worth },
          { accountId: to.id, amount: lent.amount, base: worth },
        )
        await em.update(SalePayment, lent.id, { accountId: to.id })
        await em.update(CustomerDue, { saleId: id }, { customerId: next.id })
      }
      for (const line of kept) {
        if (!next) {
          continue
        }
        const to = await this.ledger.customerAccount(em, next, line.currency)
        const worth = line.base - line.fx
        postings.push(
          { accountId: line.accountId, amount: line.amount, base: worth },
          { accountId: to.id, amount: -line.amount, base: -worth },
        )
        await em.update(SaleChange, line.id, { accountId: to.id })
      }
      if (postings.length) {
        const today = await this.ledger.today(em, actor.orgId)
        await this.ledger.post(
          em,
          actor,
          { date: today, kind: 'sale_customer', documentType: DOCUMENT, documentId: id },
          postings,
        )
      }
      await em.update(Sale, id, {
        customerId: next?.id ?? null,
        customerName: next?.name ?? null,
        searchKey: searchKey([sale.number, sale.cashierName ?? '', sale.sellerName ?? '', next?.name ?? ''].join(' ')),
      })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'sale.customer',
        entity: 'sale',
        entityId: id,
        summary: `${sale.number}: ${sale.customerName ?? 'mijozsiz'} → ${next?.name ?? 'mijozsiz'}${
          postings.length ? ', hisobdagi qismi ham ko‘chdi' : ''
        }`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['sales', 'customers', 'pos']))
      return this.loadIn(em, actor, await em.findOneByOrFail(Sale, { id }))
    })
  }

  async get(actor: Actor, id: string): Promise<SaleDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => this.loadIn(em, actor, await this.find(em, actor, id)))
  }

  async list(actor: Actor, query: SaleListQuery): Promise<Page<SaleListItemDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em
        .createQueryBuilder(Sale, 's')
        .innerJoin(Location, 'l', 'l.id = s.locationId')
        .innerJoin(Register, 'r', 'r.id = s.registerId')
        .addSelect('l.name', 'location_name')
        .addSelect('r.name', 'register_name')
      if (!actor.allLocations) {
        qb.andWhere('s.locationId IN (:...mine)', { mine: actor.locationIds.length ? actor.locationIds : [null] })
      }
      // Without the right to see every sale, a cashier sees the ones they rang up.
      if (!can(actor, 'sales.view')) qb.andWhere('s.cashierId = :me', { me: actor.userId })
      if (query.status !== 'all') qb.andWhere('s.status = :status', { status: query.status })
      if (query.locationId) qb.andWhere('s.locationId = :locationId', { locationId: query.locationId })
      if (query.shiftId) qb.andWhere('s.shiftId = :shiftId', { shiftId: query.shiftId })
      if (query.from) qb.andWhere('s.soldOn >= :from', { from: query.from })
      if (query.to) qb.andWhere('s.soldOn <= :to', { to: query.to })
      applySearch(qb, 's.search_key', query.q)

      const total = await qb.getCount()
      const { entities, raw } = await qb
        .orderBy('s.soldAt', 'DESC')
        .offset((query.page - 1) * query.size)
        .limit(query.size)
        .getRawAndEntities()
      const seesCost = can(actor, 'stock.cost')
      return {
        items: entities.map((sale, index) => ({
          ...summary(sale, raw[index].location_name, raw[index].register_name, seesCost),
          qty: sale.qty,
          paidBy: sale.paidBy,
        })),
        total,
        page: query.page,
        size: query.size,
      }
    })
  }

  // ───────────────────────────── Reading ─────────────────────────────

  private async find(em: EntityManager, actor: Actor, id: string): Promise<Sale> {
    const sale = await em.findOneBy(Sale, { id })
    const visible =
      sale && mayWorkAt(actor, sale.locationId) && (can(actor, 'sales.view') || sale.cashierId === actor.userId)
    if (!sale || !visible) {
      throw AppError.notFound('Chek topilmadi')
    }
    return sale
  }

  /** A sale in full, for a person already known to be allowed to see it. */
  async loadIn(em: EntityManager, actor: Actor, sale: Sale): Promise<SaleDto> {
    const location = await em.findOneByOrFail(Location, { id: sale.locationId })
    const register = await em.findOneByOrFail(Register, { id: sale.registerId })
    const shift = await em.findOneByOrFail(Shift, { id: sale.shiftId })
    const lines: {
      id: string
      variant_id: string
      name: string
      sku: string
      value_names: string[]
      qty: number
      price: number
      discount: number
      auto_discount: number
      promotion_name: string | null
      promo_discount: number
      total: number
      epc: string | null
      returned_qty: number
      returned_total: number
    }[] = await em.query(
      `SELECT sl.id, sl.variant_id, p.name, v.sku, array_remove(ARRAY[a1.name, a2.name, a3.name], NULL) AS value_names,
              sl.qty::float8 AS qty, sl.price::float8 AS price, sl.discount::float8 AS discount, sl.auto_discount::float8 AS auto_discount,
              sl.promotion_name, sl.promo_discount::float8 AS promo_discount,
              sl.total::float8 AS total, u.epc, sl.returned_qty::float8 AS returned_qty,
              sl.returned_total::float8 AS returned_total
       FROM sale_lines sl
       JOIN product_variants v ON v.id = sl.variant_id
       JOIN products p ON p.id = v.product_id
       LEFT JOIN attribute_values a1 ON a1.id = v.value1_id
       LEFT JOIN attribute_values a2 ON a2.id = v.value2_id
       LEFT JOIN attribute_values a3 ON a3.id = v.value3_id
       LEFT JOIN rfid_units u ON u.id = sl.unit_id
       WHERE sl.sale_id = $1
       ORDER BY sl.position`,
      [sale.id],
    )
    const payments = await em
      .createQueryBuilder(SalePayment, 'sp')
      .innerJoin(Account, 'a', 'a.id = sp.accountId')
      .addSelect('a.name', 'account_name')
      .where('sp.saleId = :id', { id: sale.id })
      .orderBy('sp.position')
      .getRawAndEntities()
    const returns = sale.returnedTotal
      ? await em.find(SaleReturn, { where: { saleId: sale.id }, order: { returnedAt: 'ASC' } })
      : []
    const due = await em.findOneBy(CustomerDue, { saleId: sale.id })
    const change: SaleChangeDto[] = await em.query(
      `SELECT c.way, CASE WHEN c.way = 'account' THEN '' ELSE a.name END AS "accountName", c.currency,
              c.amount::float8 AS amount, c.base::float8 AS base, c.fx::float8 AS fx
       FROM sale_changes c JOIN accounts a ON a.id = c.account_id
       WHERE c.sale_id = $1 ORDER BY c.position`,
      [sale.id],
    )

    // What they owe in all on the account the sale went on: said on the paper they sign. A supplier's sums are
    // for those who keep suppliers' accounts.
    const lentOn =
      sale.status === 'completed' ? payments.entities.find((payment) => payment.method === 'account') : null
    const theirs = lentOn ? await em.findOneBy(Account, { id: lentOn.accountId }) : null
    const buyer = theirs?.customerId ? await em.findOneBy(Customer, { id: theirs.customerId }) : null
    const seesIt = !!buyer && (!buyer.isSupplier || can(actor, 'customers.suppliers'))

    return {
      ...summary(sale, location.name, register.name, can(actor, 'stock.cost')),
      locationAddress: location.address,
      locationPhone: location.phone,
      shiftId: sale.shiftId,
      shiftNumber: shift.number,
      subtotal: sale.subtotal,
      change,
      rounding: sale.rounding,
      due: due && sale.status === 'completed' ? { id: due.id, dueDate: due.dueDate } : null,
      owes: theirs && seesIt && theirs.balance > 0 ? { currency: theirs.currency, balance: theirs.balance } : null,
      note: sale.note,
      voidedAt: sale.voidedAt ? sale.voidedAt.toISOString() : null,
      voidedByName: sale.voidedByName,
      voidReason: sale.voidReason,
      approvedByName: sale.approvedByName,
      lines: lines.map((line) => ({
        id: line.id,
        variantId: line.variant_id,
        productName: line.name,
        label: variantLabel(line.value_names),
        sku: line.sku,
        qty: line.qty,
        price: line.price,
        discount: line.discount,
        autoDiscount: line.auto_discount,
        promotionName: line.promotion_name,
        promoDiscount: line.promo_discount,
        total: line.total,
        epc: line.epc,
        returnedQty: line.returned_qty,
        returnedTotal: line.returned_total,
      })),
      payments: payments.entities.map((payment, index) => ({
        method: payment.method,
        accountName: payments.raw[index].account_name,
        currency: payment.currency,
        amount: payment.amount,
        base: payment.base,
        fx: payment.fx,
        reference: payment.reference,
      })),
      returns: returns.map((item) => ({
        id: item.id,
        number: item.number,
        returnedAt: item.returnedAt.toISOString(),
        total: item.total,
      })),
    }
  }
}

function summary(sale: Sale, locationName: string, registerName: string, seesCost: boolean) {
  return {
    id: sale.id,
    number: sale.number,
    status: sale.status,
    soldAt: sale.soldAt.toISOString(),
    locationName,
    registerName,
    cashierName: sale.cashierName,
    sellerName: sale.sellerName,
    discount: sale.discount,
    total: sale.total,
    costUzs: seesCost ? sale.costUzs : null,
    returnedTotal: sale.returnedTotal,
    priceTypeName: sale.priceTypeName,
    customerId: sale.customerId,
    customerName: sale.customerName,
    autoDiscount: sale.autoDiscount,
    autoReason: sale.autoReason,
    promoCode: sale.promoCode,
  }
}

/** Why money came off by itself, in a line for the receipt: the promotions by name, then the customer's own. */
function autoReason(autos: LineAuto[], own: string | null): string | null {
  const promotions = [...new Set(autos.flatMap((line) => (line.promoOff && line.promo ? [line.promo.name] : [])))]
  const parts = [...promotions, ...(own && autos.some((line) => line.ownOff) ? [own] : [])]
  return parts.join(', ') || null
}
