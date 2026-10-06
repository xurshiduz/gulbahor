import { randomUUID } from 'node:crypto'

import {
  DEFAULT_ORG_SETTINGS,
  formatMoney,
  normalizeEpc,
  partnerShare,
  returnShare,
  searchKey,
  settleRefund,
  toBase,
  UNIT_INFO,
  variantLabel,
  type Page,
  type ReturnableDto,
  type ReturnDto,
  type ReturnInput,
  type ReturnListItemDto,
  type ReturnListQuery,
  type SaleInput,
  type TenderMethod,
  type Unit,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import { In, type EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch } from '../../common/listing'
import { Db } from '../../database/db.service'
import {
  Account,
  CustomerDebt,
  Customer,
  Location,
  Organization,
  Register,
  Sale,
  SaleItem,
  SaleLine,
  SalePayment,
  SaleReturn,
  SaleReturnLine,
  SaleReturnPayment,
  Shift,
} from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { nextNumbers } from '../catalog/counters'
import { rulesOf } from '../customers/groups'
import { LedgerService, type Posting } from '../money/ledger.service'
import { RealtimeService } from '../realtime/realtime.service'
import { StockService, type Movement } from '../stock/stock.service'
import { allows, ApprovalsService } from './approvals.service'
import { SalesService } from './sales.service'

const DOCUMENT = 'sale_return'
const DAY_MS = 86_400_000

const mayWorkAt = (actor: Actor, locationId: string) => actor.allLocations || actor.locationIds.includes(locationId)

/** The share of an exchange difference that goes with `part` of `whole`, rounded half away from nothing. */
const fxShareOf = (fx: number, whole: number, part: number) =>
  Math.sign(fx) * Number((BigInt(Math.abs(fx)) * BigInt(part) * 2n + BigInt(whole)) / (BigInt(whole) * 2n))

/** Quantities are kept to three decimals; they are added up as whole thousandths. */
const milli = (qty: number) => Math.round(qty * 1000)

/** `part` thousandths of something that cost `cost` for `whole` thousandths, rounded half up. */
const costOf = (cost: number, part: number, whole: number) =>
  Number((BigInt(cost) * BigInt(part) * 2n + BigInt(whole)) / (BigInt(whole) * 2n))

function throwIfAny(fields: Record<string, string>) {
  const first = Object.values(fields)[0]
  if (first) {
    throw AppError.validation(fields, first)
  }
}

/** Whether a sale made on `soldOn` is past the days the shop takes goods back for. */
function isLate(soldOn: string, today: string, returnDays: number): boolean {
  return returnDays > 0 && (Date.parse(today) - Date.parse(soldOn)) / DAY_MS > returnDays
}

interface Caps {
  cash: number
  accounts: { accountId: string; method: TenderMethod; name: string; last4: string | null; left: number }[]
  /** What the receipt still leaves owing. */
  debt: number
  /** What of it still stands on a partner's account, in so'm. */
  partner: number
}

/**
 * Returns and exchanges. Goods come back only against the receipt that sold
 * them, and no more of a line than it sold: the very pieces of batches the
 * sale took go back to stock at what they cost, a tagged piece becomes
 * sellable again. The money goes back the way it was paid, or towards goods
 * taken instead, which are a sale made in the same transaction, so an
 * exchange either happens whole or not at all. A return is never edited.
 */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly stock: StockService,
    private readonly ledger: LedgerService,
    private readonly sales: SalesService,
    private readonly approvals: ApprovalsService,
  ) {}

  /** The receipt goods are brought back on: found by its number, or by the tag of a piece it sold. */
  async lookup(actor: Actor, code: string): Promise<ReturnableDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const epc = normalizeEpc(code)
      let sale: Sale | null = null
      let lineId: string | null = null
      if (epc) {
        const [unit]: { id: string; status: string; sale_id: string | null }[] = await em.query(
          `SELECT id, status, sale_id FROM rfid_units WHERE epc = $1`,
          [epc],
        )
        if (!unit) {
          throw AppError.notFound('Bu RFID belgi tizimda yo‘q')
        }
        if (unit.status !== 'sold' || !unit.sale_id) {
          throw AppError.conflict('UNIT_NOT_SOLD', 'Bu dona sotilmagan: uni qaytarib olib bo‘lmaydi')
        }
        sale = await em.findOneBy(Sale, { id: unit.sale_id })
        lineId = (await em.findOneBy(SaleLine, { saleId: unit.sale_id, unitId: unit.id }))?.id ?? null
      } else {
        const text = code.trim().toUpperCase()
        // The number alone will do: "12" is receipt CH-000012.
        sale = await em.findOneBy(Sale, { number: /^\d+$/.test(text) ? `CH-${text.padStart(6, '0')}` : text })
      }
      if (!sale) {
        throw AppError.notFound('Chek topilmadi')
      }
      if (sale.status !== 'completed') {
        throw AppError.conflict('SALE_VOIDED', 'Bu chek bekor qilingan')
      }
      const settings = await this.settings(em, actor.orgId)
      const today = await this.ledger.today(em, actor.orgId)
      const buyer = sale.customerId ? await em.findOneBy(Customer, { id: sale.customerId }) : null
      return {
        // Whoever may take goods back sees the receipt they are brought back on, whoever rang it up.
        sale: await this.sales.loadIn(em, actor, sale),
        lineId,
        late: isLate(sale.soldOn, today, settings.returnDays),
        returnDays: settings.returnDays,
        free: can(actor, 'pos.return_any'),
        noExchange: buyer ? !!(await rulesOf(em, [buyer])).get(buyer.id)?.noExchange : false,
        caps: await this.caps(em, sale),
      }
    })
  }

  async create(actor: Actor, input: ReturnInput): Promise<ReturnDto> {
    const approver = await this.approvals.verify(actor, input.approval, input.registerId)
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      // The till sends a return again when it did not hear back: the one it made the first time is the answer.
      const again = await em.findOneBy(SaleReturn, { clientKey: input.clientKey })
      if (again) {
        return this.load(em, again)
      }

      const register = await em.findOneBy(Register, { id: input.registerId })
      if (!register || !register.isActive || !mayWorkAt(actor, register.locationId)) {
        throw AppError.validation({ registerId: 'Kassa topilmadi' })
      }
      // The money leaves this till's drawer, so it is this till's shift that must be open, and stay open.
      const [open]: { id: string }[] = await em.query(
        `SELECT id FROM shifts WHERE register_id = $1 AND status = 'open' FOR UPDATE`,
        [register.id],
      )
      if (!open) {
        throw AppError.conflict('NO_SHIFT', 'Smena ochilmagan. Avval smenani oching')
      }

      // Two returns against one receipt follow one another, each seeing what the other took.
      await em.query(`SELECT 1 FROM sales WHERE id = $1 FOR UPDATE`, [input.saleId])
      const sale = await em.findOneBy(Sale, { id: input.saleId })
      if (!sale) {
        throw AppError.notFound('Chek topilmadi')
      }
      if (sale.status !== 'completed') {
        throw AppError.conflict('SALE_VOIDED', 'Bu chek bekor qilingan')
      }

      const settings = await this.settings(em, actor.orgId)
      const today = await this.ledger.today(em, actor.orgId)
      const usd = actor.modules.includes('usd')
      const rate = usd ? ((await this.ledger.rate(em, today))?.uzsPerUsd ?? null) : null
      // What a cashier may not do alone goes through on their own right, or on a manager's PIN given with it.
      const own = can(actor, 'pos.return_any')
      const free = own || allows(approver, 'pos.return_any')
      const late = isLate(sale.soldOn, today, settings.returnDays)
      if (late && !free) {
        throw AppError.conflict(
          'RETURN_LATE',
          approver
            ? `${approver.name} muddati o‘tgan qaytarishni tasdiqlay olmaydi`
            : `Qaytarish muddati (${settings.returnDays} kun) o‘tgan: rahbar ruxsati kerak`,
        )
      }

      // What is not done for a customer's group is refused here, not left to the cashier's memory.
      const buyer = input.exchange && sale.customerId ? await em.findOneBy(Customer, { id: sale.customerId }) : null
      const barred = buyer ? !!(await rulesOf(em, [buyer])).get(buyer.id)?.noExchange : false
      if (barred && !free) {
        throw AppError.conflict(
          'NO_EXCHANGE',
          approver
            ? `${approver.name} bu almashtirishni tasdiqlay olmaydi`
            : `${buyer?.name}: bu mijozga almashtirib berilmaydi. Rahbar ruxsati kerak`,
        )
      }

      // ── The goods: lines of this receipt, and no more of each than is still out. ──
      const saleLines = await em.findBy(SaleLine, { saleId: sale.id })
      const lineOf = new Map(saleLines.map((line) => [line.id, line]))
      const units: { id: string; unit: Unit }[] = await em.query(
        `SELECT v.id, p.unit FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ANY($1)`,
        [saleLines.map((line) => line.variantId)],
      )
      const decimalsOf = new Map(units.map((row) => [row.id, UNIT_INFO[row.unit].decimals]))
      const fields: Record<string, string> = {}
      const taken: { line: SaleLine; qty: number; total: number }[] = []
      input.lines.forEach((item, index) => {
        const line = lineOf.get(item.saleLineId)
        if (!line) {
          fields[`lines.${index}.saleLineId`] = 'Bu qator chekda yo‘q'
          return
        }
        const left = (milli(line.qty) - milli(line.returnedQty)) / 1000
        if (item.qty > left) {
          fields[`lines.${index}.qty`] = left ? `Ko‘pi bilan ${left} ta qaytariladi` : 'Bu tovar allaqachon qaytarilgan'
        } else if (!decimalsOf.get(line.variantId) && !Number.isInteger(item.qty)) {
          fields[`lines.${index}.qty`] = 'Bu tovar butun dona bilan qaytariladi'
        } else {
          taken.push({ line, qty: item.qty, total: returnShare(line, item.qty) })
        }
      })
      throwIfAny(fields)
      const total = taken.reduce((sum, item) => sum + item.total, 0)
      if (total !== input.total) {
        throw AppError.conflict('RETURN_CHANGED', 'Chek o‘zgargan: uni qaytadan ochib, summani tekshiring')
      }

      // ── The return. ──
      const number = `QT-${String(await nextNumbers(em, actor.orgId, 'sale_return')).padStart(6, '0')}`
      const made = await em.save(
        em.create(SaleReturn, {
          orgId: actor.orgId,
          number,
          clientKey: input.clientKey,
          saleId: sale.id,
          shiftId: open.id,
          registerId: register.id,
          locationId: register.locationId,
          returnedAt: new Date(),
          returnedOn: today,
          cashierId: actor.userId,
          cashierName: actor.name,
          qty: taken.reduce((sum, item) => sum + milli(item.qty), 0) / 1000,
          total,
          exchangeTotal: 0,
          exchangeSaleId: null,
          rounding: 0,
          uzsPerUsd: rate,
          late,
          reason: input.reason ?? null,
          searchKey: searchKey([number, sale.number, actor.name].join(' ')),
        }),
      )
      const lines = await em.save(
        taken.map((item, position) =>
          em.create(SaleReturnLine, {
            orgId: actor.orgId,
            returnId: made.id,
            position,
            saleLineId: item.line.id,
            variantId: item.line.variantId,
            qty: item.qty,
            total: item.total,
            costUsd: 0,
            costUzs: 0,
            unitId: item.line.unitId,
          }),
        ),
      )

      // ── Stock: the pieces the sale took go back, the last taken first, at what they cost. ──
      const movements: Movement[] = []
      for (const [index, item] of taken.entries()) {
        const pieces = await em.find(SaleItem, { where: { lineId: item.line.id }, order: { position: 'DESC' } })
        let left = milli(item.qty)
        let lineUsd = 0
        let lineUzs = 0
        for (const piece of pieces) {
          const has = milli(piece.qty) - milli(piece.returnedQty)
          if (!left || has <= 0) {
            continue
          }
          const take = Math.min(has, left)
          // The last of a piece takes all the cost that is left of it, so nothing is lost to rounding.
          const costUsd =
            take === has ? piece.costUsd - piece.returnedUsd : costOf(piece.costUsd, take, milli(piece.qty))
          const costUzs =
            take === has ? piece.costUzs - piece.returnedUzs : costOf(piece.costUzs, take, milli(piece.qty))
          movements.push({
            kind: 'sale_return',
            docDate: today,
            documentType: DOCUMENT,
            documentId: made.id,
            lineId: lines[index].id,
            locationId: register.locationId,
            batchId: piece.batchId,
            variantId: piece.variantId,
            qty: take / 1000,
            costUsd,
            costUzs,
          })
          await em.update(SaleItem, piece.id, {
            returnedQty: (milli(piece.returnedQty) + take) / 1000,
            returnedUsd: piece.returnedUsd + costUsd,
            returnedUzs: piece.returnedUzs + costUzs,
          })
          left -= take
          lineUsd += costUsd
          lineUzs += costUzs
        }
        if (left) {
          throw new Error(`Sale line ${item.line.id} has fewer pieces out than are coming back`)
        }
        await em.update(SaleReturnLine, lines[index].id, { costUsd: lineUsd, costUzs: lineUzs })
        await em.update(SaleLine, item.line.id, {
          returnedQty: (milli(item.line.returnedQty) + milli(item.qty)) / 1000,
          returnedTotal: item.line.returnedTotal + item.total,
        })
      }
      await this.stock.apply(em, actor.orgId, actor.userId, movements)
      await em.update(Sale, sale.id, { returnedTotal: sale.returnedTotal + total })
      const tagged = taken.flatMap((item) => (item.line.unitId ? [item.line.unitId] : []))
      if (tagged.length) {
        // Back on the shelf of the shop that took it, and sellable again.
        await em.query(
          `UPDATE rfid_units SET status = 'in_stock', sale_id = NULL, location_id = $2 WHERE id = ANY($1)`,
          [tagged, register.locationId],
        )
      }

      // ── An exchange: the goods taken instead are a sale, paid first with what came back. ──
      let credit = 0
      let exchange: Sale | null = null
      if (input.exchange) {
        const sold = await this.sales.createIn(
          em,
          actor,
          { ...input.exchange, clientKey: randomUUID(), registerId: register.id, note: null } as SaleInput,
          total,
          approver,
        )
        credit = sold.credit
        exchange = sold.sale
      }
      // ── What the receipt still leaves owing comes off first: nobody is handed money they have not paid. ──
      const [owing]: { id: string; left: number }[] = await em.query(
        `SELECT id, (amount - paid - returned)::float8 AS left FROM customer_debts
         WHERE sale_id = $1 AND NOT cancelled FOR UPDATE`,
        [sale.id],
      )
      const offDebt = Math.min(total - credit, owing?.left ?? 0)
      // ── What the sale put on a partner's account comes off it next, at what the sale wrote, not today's rate. ──
      const onAccount = await this.partnerPart(em, sale.id)
      const offAccount = onAccount
        ? Math.min(total - credit - offDebt, onAccount.put.base - onAccount.returned.base)
        : 0
      const due = total - credit - offDebt - offAccount

      // ── The money that goes back: the way it was paid, unless this person may do otherwise. ──
      const caps = await this.caps(em, sale)
      const accounts = await em.findBy(Account, {
        id: In(input.refunds.flatMap((refund) => (refund.accountId ? [refund.accountId] : []))),
      })
      /** Money goes back otherwise than it was paid: to an account the sale was not paid to, or past a cap. */
      let otherwise = false
      const refunds: {
        method: TenderMethod
        account: Account
        currency: 'UZS' | 'USD'
        amount: number
        base: number
        reference: string | null
      }[] = []
      for (const [index, refund] of input.refunds.entries()) {
        if (refund.currency === 'USD' && !usd) {
          fields[`refunds.${index}.currency`] = 'Dollar bilan ishlash yoqilmagan'
          continue
        }
        if (refund.currency === 'USD' && !rate) {
          fields[`refunds.${index}.currency`] = 'Dollar kursi qo‘yilmagan'
          continue
        }
        let account: Account | undefined
        if (refund.method === 'cash') {
          account = await this.ledger.cashAccount(em, register, refund.currency)
        } else {
          account = accounts.find((item) => item.id === refund.accountId)
          const paidHere = caps.accounts.some((cap) => cap.accountId === account?.id)
          otherwise ||= !paidHere
          // A sale is in so'm: what is handed back for it goes to a so'm card, never a dollar one.
          const fits =
            account &&
            account.kind === refund.method &&
            account.currency === 'UZS' &&
            account.isActive &&
            (free || paidHere)
          if (!fits) {
            fields[`refunds.${index}.accountId`] =
              refund.method === 'card' ? 'Bu chek shu kartaga to‘lanmagan' : 'Bu chek shu terminal orqali to‘lanmagan'
            continue
          }
        }
        refunds.push({
          method: refund.method,
          account: account as Account,
          currency: refund.currency,
          amount: refund.amount,
          base: toBase(refund.amount, refund.currency, rate),
          reference: refund.reference ?? null,
        })
      }
      throwIfAny(fields)

      const settlement = settleRefund(due, refunds, { uzsPerUsd: rate, roundStep: settings.changeRoundStep })
      if (settlement.problem === 'over') {
        throw AppError.validation({ refunds: `Qaytariladigan pul ${formatMoney(due)} dan oshmasligi kerak` })
      }
      if (settlement.due > 0) {
        throw AppError.validation({ refunds: `Yana ${formatMoney(settlement.due)} qaytarilishi kerak` })
      }
      const elsewhere = refunds.reduce((sum, refund) => sum + (refund.method === 'cash' ? 0 : refund.base), 0)
      if (due - elsewhere > caps.cash) {
        otherwise = true
        if (!free) {
          throw AppError.badRequest(
            'REFUND_METHOD',
            `Naqd ko‘pi bilan ${formatMoney(caps.cash)} qaytariladi: qolgani to‘langan usulda qaytadi`,
            { refunds: 'Pul to‘langan usulda qaytariladi' },
          )
        }
      }
      for (const cap of caps.accounts) {
        const back = refunds.reduce((sum, refund) => sum + (refund.account.id === cap.accountId ? refund.base : 0), 0)
        if (back > cap.left) {
          otherwise = true
          if (!free) {
            throw AppError.badRequest(
              'REFUND_METHOD',
              `«${cap.name}»ga ko‘pi bilan ${formatMoney(cap.left)} qaytariladi`,
              { refunds: 'Pul to‘langan usulda qaytariladi' },
            )
          }
        }
      }
      // The manager's word is written down only where it was needed.
      const vouched = !own && (late || otherwise || barred) ? approver : null

      if (refunds.length) {
        await em.insert(
          SaleReturnPayment,
          refunds.map((refund, position) => ({
            orgId: actor.orgId,
            returnId: made.id,
            position,
            method: refund.method,
            accountId: refund.account.id,
            currency: refund.currency,
            amount: refund.amount,
            base: refund.base,
            reference: refund.reference,
          })),
        )
      }
      const receivables = offDebt ? await this.ledger.systemAccount(em, actor.orgId, 'receivables') : null
      if (receivables && owing) {
        // Written down beside the money handed back: so much of what came back was never paid for.
        await em.insert(SaleReturnPayment, {
          orgId: actor.orgId,
          returnId: made.id,
          position: refunds.length,
          method: 'debt',
          accountId: receivables.id,
          currency: 'UZS',
          amount: offDebt,
          base: offDebt,
          reference: null,
        })
        await em.query(`UPDATE customer_debts SET returned = returned + $2 WHERE id = $1`, [owing.id, offDebt])
      }
      // What was sold is unsold; its worth goes back out of the accounts, or on towards the goods taken instead.
      const postings: Posting[] = [
        { accountId: (await this.ledger.systemAccount(em, actor.orgId, 'sales')).id, amount: total, base: total },
        ...refunds.map((refund) => ({ accountId: refund.account.id, amount: -refund.amount, base: -refund.base })),
      ]
      if (credit) {
        const account = await this.ledger.systemAccount(em, actor.orgId, 'exchange')
        postings.push({ accountId: account.id, amount: -credit, base: -credit })
      }
      if (receivables) {
        postings.push({ accountId: receivables.id, amount: -offDebt, base: -offDebt })
      }
      if (onAccount && offAccount) {
        const share = partnerShare(onAccount.put, onAccount.returned, offAccount)
        // The account was put at its worth on the day of the sale: the same share of that worth comes off,
        // and what the sale wrote down as an exchange difference goes back with it.
        const last = offAccount === onAccount.put.base - onAccount.returned.base
        const fxBack = last
          ? onAccount.fx - onAccount.returned.fx
          : fxShareOf(onAccount.fx, onAccount.put.base, offAccount)
        await em.insert(SaleReturnPayment, {
          orgId: actor.orgId,
          returnId: made.id,
          position: refunds.length + (receivables ? 1 : 0),
          method: 'partner',
          accountId: onAccount.accountId,
          currency: onAccount.currency,
          amount: share,
          base: offAccount,
          reference: null,
        })
        postings.push({ accountId: onAccount.accountId, amount: -share, base: -(offAccount + fxBack) })
        if (fxBack) {
          const fx = await this.ledger.systemAccount(em, actor.orgId, 'fx')
          postings.push({ accountId: fx.id, amount: fxBack, base: fxBack })
        }
      }
      if (settlement.rounding) {
        const account = await this.ledger.systemAccount(em, actor.orgId, 'rounding')
        postings.push({ accountId: account.id, amount: -settlement.rounding, base: -settlement.rounding })
      }
      await this.ledger.post(
        em,
        actor,
        { date: today, kind: 'sale_return', documentType: DOCUMENT, documentId: made.id, shiftId: open.id },
        postings,
      )
      await em.update(SaleReturn, made.id, {
        exchangeTotal: credit,
        exchangeSaleId: exchange?.id ?? null,
        rounding: settlement.rounding,
        approvedBy: vouched?.id ?? null,
        approvedByName: vouched?.name ?? null,
      })

      await this.audit.record(em, actor.orgId, actor, {
        action: 'return.create',
        entity: 'return',
        entityId: made.id,
        summary: `${number}: ${sale.number} dan ${made.qty} dona, ${formatMoney(total)}${
          exchange ? `, almashtirildi (${exchange.number})` : ''
        }${late ? ', muddati o‘tgan' : ''}${vouched ? `, tasdiqladi: ${vouched.name}` : ''}${
          input.reason ? `. ${input.reason}` : ''
        }`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['returns', 'sales', 'stock', 'shifts', 'money', 'pos']))
      return this.load(em, await em.findOneByOrFail(SaleReturn, { id: made.id }))
    })
  }

  async get(actor: Actor, id: string): Promise<ReturnDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const found = await em.findOneBy(SaleReturn, { id })
      const visible =
        found && mayWorkAt(actor, found.locationId) && (can(actor, 'sales.view') || found.cashierId === actor.userId)
      if (!found || !visible) {
        throw AppError.notFound('Qaytarish topilmadi')
      }
      return this.load(em, found)
    })
  }

  async list(actor: Actor, query: ReturnListQuery): Promise<Page<ReturnListItemDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em.createQueryBuilder(SaleReturn, 'r')
      if (!actor.allLocations) {
        qb.andWhere('r.locationId IN (:...mine)', { mine: actor.locationIds.length ? actor.locationIds : [null] })
      }
      // Without the right to see every sale, a cashier sees the returns they made.
      if (!can(actor, 'sales.view')) qb.andWhere('r.cashierId = :me', { me: actor.userId })
      if (query.locationId) qb.andWhere('r.locationId = :locationId', { locationId: query.locationId })
      if (query.shiftId) qb.andWhere('r.shiftId = :shiftId', { shiftId: query.shiftId })
      if (query.from) qb.andWhere('r.returnedOn >= :from', { from: query.from })
      if (query.to) qb.andWhere('r.returnedOn <= :to', { to: query.to })
      applySearch(qb, 'r.search_key', query.q)

      const [rows, total] = await qb
        .orderBy('r.returnedAt', 'DESC')
        .skip((query.page - 1) * query.size)
        .take(query.size)
        .getManyAndCount()
      return { items: await this.summaries(em, rows), total, page: query.page, size: query.size }
    })
  }

  // ───────────────────────────── Reading ─────────────────────────────

  private async settings(em: EntityManager, orgId: string) {
    const org = await em.findOneByOrFail(Organization, { id: orgId })
    return { ...DEFAULT_ORG_SETTINGS, ...org.settings }
  }

  /**
   * How much of a sale may still go back each way: what was paid that way,
   * less what has gone back already. What an exchange paid for came from no
   * drawer, so it does not go back as cash.
   */
  private async caps(em: EntityManager, sale: Sale): Promise<Caps> {
    const payments = await em.findBy(SalePayment, { saleId: sale.id })
    const byAccount = new Map<string, { method: TenderMethod; paid: number }>()
    // A debt is no place money went into: it has no account of its own to go back to.
    let notCash = 0
    for (const payment of payments) {
      if (payment.method === 'cash') {
        continue
      }
      notCash += payment.base
      if (payment.method === 'card' || payment.method === 'terminal') {
        const entry = byAccount.get(payment.accountId) ?? { method: payment.method, paid: 0 }
        entry.paid += payment.base
        byAccount.set(payment.accountId, entry)
      }
    }
    const back: { method: TenderMethod; account_id: string; base: number }[] = await em.query(
      `SELECT p.method, p.account_id, sum(p.base)::float8 AS base
       FROM sale_return_payments p JOIN sale_returns r ON r.id = p.return_id
       WHERE r.sale_id = $1 GROUP BY p.method, p.account_id`,
      [sale.id],
    )
    // Cash handed back was rounded; what it stood for is the cash plus what rounding kept or gave.
    const [{ rounding }]: { rounding: number }[] = await em.query(
      `SELECT coalesce(sum(rounding), 0)::float8 AS rounding FROM sale_returns WHERE sale_id = $1`,
      [sale.id],
    )
    const cashBack = back.reduce((sum, row) => sum + (row.method === 'cash' ? row.base : 0), 0) + rounding
    const accounts = byAccount.size ? await em.findBy(Account, { id: In([...byAccount.keys()]) }) : []
    const debt = await em.findOneBy(CustomerDebt, { saleId: sale.id, cancelled: false })
    const onAccount = await this.partnerPart(em, sale.id)
    return {
      partner: onAccount ? onAccount.put.base - onAccount.returned.base : 0,
      // What was left owing and has been paid since was paid in money: it may go back as money.
      cash: Math.max(0, sale.total - notCash + (debt?.paid ?? 0) - cashBack),
      debt: debt ? debt.amount - debt.paid - debt.returned : 0,
      accounts: accounts.map((account) => {
        const entry = byAccount.get(account.id) as { method: TenderMethod; paid: number }
        const gone = back.reduce((sum, row) => sum + (row.account_id === account.id ? row.base : 0), 0)
        return {
          accountId: account.id,
          method: entry.method,
          name: account.name,
          last4: account.last4,
          left: Math.max(0, entry.paid - gone),
        }
      }),
    }
  }

  /**
   * What a sale put on a partner's account, and what of it has come back:
   * in so'm of the sale (`base`) and in the partner's currency (`settled`).
   * Null for a sale that put nothing there.
   */
  private async partnerPart(em: EntityManager, saleId: string) {
    const put = await em.findOneBy(SalePayment, { saleId, method: 'partner' })
    if (!put) {
      return null
    }
    const back: { base: number }[] = await em.query(
      `SELECT p.base::float8 AS base, p.amount::float8 AS amount
       FROM sale_return_payments p JOIN sale_returns r ON r.id = p.return_id
       WHERE r.sale_id = $1 AND p.method = 'partner'`,
      [saleId],
    )
    const rows = back as { base: number; amount: number }[]
    return {
      accountId: put.accountId,
      currency: put.currency,
      put: { base: put.base, settled: put.amount },
      fx: put.fx,
      returned: {
        base: rows.reduce((sum, row) => sum + row.base, 0),
        settled: rows.reduce((sum, row) => sum + row.amount, 0),
        // Every return before the last took its share of the difference, rounded; the last takes what is left.
        fx: rows.reduce((sum, row) => sum + fxShareOf(put.fx, put.base, row.base), 0),
      },
    }
  }

  private async summaries(em: EntityManager, rows: SaleReturn[]): Promise<ReturnListItemDto[]> {
    if (!rows.length) {
      return []
    }
    const sales = await em.findBy(Sale, {
      id: In(rows.flatMap((row) => (row.exchangeSaleId ? [row.saleId, row.exchangeSaleId] : [row.saleId]))),
    })
    const locations = await em.findBy(Location, { id: In(rows.map((row) => row.locationId)) })
    const registers = await em.findBy(Register, { id: In(rows.map((row) => row.registerId)) })
    const numberOf = new Map(sales.map((sale) => [sale.id, sale.number]))
    const locationOf = new Map(locations.map((location) => [location.id, location.name]))
    const registerOf = new Map(registers.map((register) => [register.id, register.name]))
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      returnedAt: row.returnedAt.toISOString(),
      saleId: row.saleId,
      saleNumber: numberOf.get(row.saleId) ?? '',
      locationName: locationOf.get(row.locationId) ?? '',
      registerName: registerOf.get(row.registerId) ?? '',
      cashierName: row.cashierName,
      qty: row.qty,
      total: row.total,
      exchangeTotal: row.exchangeTotal,
      exchangeSaleId: row.exchangeSaleId,
      exchangeSaleNumber: row.exchangeSaleId ? (numberOf.get(row.exchangeSaleId) ?? null) : null,
      late: row.late,
      reason: row.reason,
      approvedByName: row.approvedByName,
    }))
  }

  private async load(em: EntityManager, row: SaleReturn): Promise<ReturnDto> {
    const [summary] = await this.summaries(em, [row])
    const shift = await em.findOneByOrFail(Shift, { id: row.shiftId })
    const lines: {
      id: string
      name: string
      sku: string
      value_names: string[]
      qty: number
      total: number
      epc: string | null
    }[] = await em.query(
      `SELECT rl.id, p.name, v.sku, array_remove(ARRAY[a1.name, a2.name, a3.name], NULL) AS value_names,
              rl.qty::float8 AS qty, rl.total::float8 AS total, u.epc
       FROM sale_return_lines rl
       JOIN product_variants v ON v.id = rl.variant_id
       JOIN products p ON p.id = v.product_id
       LEFT JOIN attribute_values a1 ON a1.id = v.value1_id
       LEFT JOIN attribute_values a2 ON a2.id = v.value2_id
       LEFT JOIN attribute_values a3 ON a3.id = v.value3_id
       LEFT JOIN rfid_units u ON u.id = rl.unit_id
       WHERE rl.return_id = $1
       ORDER BY rl.position`,
      [row.id],
    )
    const refunds = await em
      .createQueryBuilder(SaleReturnPayment, 'rp')
      .innerJoin(Account, 'a', 'a.id = rp.accountId')
      .addSelect('a.name', 'account_name')
      .where('rp.returnId = :id', { id: row.id })
      .orderBy('rp.position')
      .getRawAndEntities()
    return {
      ...summary,
      shiftNumber: shift.number,
      rounding: row.rounding,
      uzsPerUsd: row.uzsPerUsd,
      lines: lines.map((line) => ({
        id: line.id,
        productName: line.name,
        label: variantLabel(line.value_names),
        sku: line.sku,
        qty: line.qty,
        total: line.total,
        epc: line.epc,
      })),
      refunds: refunds.entities.map((refund, index) => ({
        method: refund.method,
        accountName: refunds.raw[index].account_name,
        currency: refund.currency,
        amount: refund.amount,
        base: refund.base,
        fx: 0,
        reference: refund.reference,
      })),
    }
  }
}
