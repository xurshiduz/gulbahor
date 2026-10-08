import {
  allocateExact,
  costReceipt,
  exchange,
  formatMoney,
  receiptRateWay,
  RECEIPT_STATUS_LABELS,
  searchKey,
  type AnyCurrency,
  type Costing,
  type Page,
  type ReceiptDto,
  type ReceiptExpenseInput,
  type ReceiptExpensesInput,
  type ReceiptInput,
  type ReceiptLineInput,
  type ReceiptListItemDto,
  type ReceiptListQuery,
  type ReceiptProductDto,
  type ReceiptTotals,
} from '@erp/core'
import { Injectable } from '@nestjs/common'
import { In, type EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch, applySort } from '../../common/listing'
import { Db } from '../../database/db.service'
import {
  Location,
  Organization,
  Partner,
  PriceType,
  ProductVariant,
  Receipt,
  ReceiptExpense,
  ReceiptLine,
  StockBalance,
  StockBatch,
} from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { productFaces } from '../catalog/faces'
import { nextNumbers } from '../catalog/counters'
import { settleReceiptUnits, voidReceiptUnits } from '../labels/units'
import { wantingRate } from '../money/agreed'
import { CurrenciesService } from '../money/currencies.service'
import { LedgerService, type Posting } from '../money/ledger.service'
import { RealtimeService } from '../realtime/realtime.service'
import { StockService, TRANSIT, type Movement } from '../stock/stock.service'

const SORTABLE = { number: 'r.number', docDate: 'r.docDate', cost: 'r.costUzs', createdAt: 'r.createdAt' }

const DOCUMENT = 'receipt'
const QTY_SCALE = 1000

/** Every supplier named on the receipt, or the one on its header when it has no lines yet. */
const SUPPLIER_NAMES = `coalesce(
  (SELECT string_agg(DISTINCT pt.name, ', ' ORDER BY pt.name)
   FROM receipt_lines rl JOIN partners pt ON pt.id = coalesce(rl.supplier_id, r.supplier_id)
   WHERE rl.receipt_id = r.id),
  s.name
)`

/**
 * Receipts: the documents that bring goods into stock. A receipt is a draft
 * until it is posted; posting works out what each line costs with its share
 * of the expenses and puts the goods on hand. A posted receipt is never
 * edited: it can be cancelled while its goods are untouched, and its
 * expenses can be corrected when the real bills arrive.
 */
@Injectable()
export class ReceiptsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly stock: StockService,
    private readonly ledger: LedgerService,
    private readonly currencies: CurrenciesService,
  ) {}

  async list(actor: Actor, query: ReceiptListQuery): Promise<Page<ReceiptListItemDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em
        .createQueryBuilder(Receipt, 'r')
        .leftJoin(Location, 'l', 'l.id = r.locationId')
        .leftJoin(Partner, 's', 's.id = r.supplierId')
        .addSelect('l.name', 'location_name')
        .addSelect(SUPPLIER_NAMES, 'supplier_names')

      if (!actor.allLocations) {
        qb.andWhere('r.locationId IN (:...mine)', { mine: actor.locationIds.length ? actor.locationIds : [null] })
      }
      if (query.status !== 'all') qb.andWhere('r.status = :status', { status: query.status })
      if (query.locationId) qb.andWhere('r.locationId = :locationId', { locationId: query.locationId })
      if (query.supplierId) {
        qb.andWhere(
          `(r.supplierId = :supplierId OR EXISTS (SELECT 1 FROM receipt_lines rl WHERE rl.receipt_id = r.id AND rl.supplier_id = :supplierId))`,
          { supplierId: query.supplierId },
        )
      }
      if (query.from) qb.andWhere('r.docDate >= :from', { from: query.from })
      if (query.to) qb.andWhere('r.docDate <= :to', { to: query.to })
      applySearch(qb, 'r.search_key', query.q)
      applySort(qb, SORTABLE, query.sort, query.sort ? query.order : 'desc', 'createdAt')

      const total = await qb.getCount()
      const { entities, raw } = await qb
        .offset((query.page - 1) * query.size)
        .limit(query.size)
        .getRawAndEntities()

      return {
        items: entities.map((receipt, index) => ({
          id: receipt.id,
          number: receipt.number,
          status: receipt.status,
          docDate: receipt.docDate,
          locationId: receipt.locationId,
          locationName: raw[index].location_name,
          supplierName: raw[index].supplier_names,
          currency: receipt.currency,
          totals: totalsOf(receipt),
          hasEstimates: receipt.hasEstimates,
          createdByName: receipt.createdByName,
          createdAt: receipt.createdAt.toISOString(),
        })),
        total,
        page: query.page,
        size: query.size,
      }
    })
  }

  async get(actor: Actor, id: string): Promise<ReceiptDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => this.load(em, await this.find(em, actor, id)))
  }

  async create(actor: Actor, input: ReceiptInput, source?: { file: string; hash: string }): Promise<ReceiptDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const receipt = await this.createIn(em, actor, input, source)
      afterCommit(() => this.realtime.changed(actor.orgId, ['receipts']))
      return this.load(em, receipt)
    })
  }

  /** The same as `create`, inside a transaction the caller already has. */
  async createIn(
    em: EntityManager,
    actor: Actor,
    input: ReceiptInput,
    source?: { file: string; hash: string },
  ): Promise<Receipt> {
    await this.assertValid(em, actor, input)
    const number = `K-${String(await nextNumbers(em, actor.orgId, 'receipt')).padStart(6, '0')}`
    const receipt = await em.save(
      em.create(Receipt, {
        orgId: actor.orgId,
        number,
        status: 'draft',
        ...header(input, actor),
        sourceFile: source?.file ?? null,
        sourceHash: source?.hash ?? null,
        createdBy: actor.userId,
        createdByName: actor.name,
        searchKey: '',
      }),
    )
    await this.saveContents(em, receipt, input)
    await this.audit.record(em, actor.orgId, actor, {
      action: 'receipt.create',
      entity: 'receipt',
      entityId: receipt.id,
      summary: source ? `${number} (${source.file})` : number,
    })
    return this.find(em, actor, receipt.id)
  }

  async update(actor: Actor, id: string, input: ReceiptInput): Promise<ReceiptDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const receipt = await this.lock(em, actor, id)
      this.assertStatus(receipt, 'draft')
      await this.assertValid(em, actor, input)
      await em.update(Receipt, id, header(input, actor))
      await this.saveContents(em, { ...receipt, ...header(input, actor) }, input)
      afterCommit(() => this.realtime.changed(actor.orgId, ['receipts']))
      return this.load(em, await this.find(em, actor, id))
    })
  }

  /** A draft is nobody's history yet, so it simply goes. */
  async remove(actor: Actor, id: string): Promise<void> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const receipt = await this.lock(em, actor, id)
      this.assertStatus(receipt, 'draft')
      // Labels printed for it stand for nothing now.
      await voidReceiptUnits(em, id)
      await em.delete(Receipt, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'receipt.delete',
        entity: 'receipt',
        entityId: id,
        summary: receipt.number,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['receipts']))
    })
  }

  /** A new draft with the same lines and expenses: how a cancelled receipt is entered again, corrected. */
  async copy(actor: Actor, id: string): Promise<ReceiptDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const source = await this.find(em, actor, id)
      const lines = await em.find(ReceiptLine, { where: { receiptId: id }, order: { position: 'ASC' } })
      const expenses = await em.find(ReceiptExpense, { where: { receiptId: id }, order: { position: 'ASC' } })
      const receipt = await this.createIn(em, actor, {
        ...header(source, actor),
        lines: lines.map(({ variantId, supplierId, qty, price, extra, retailPrice, wholesalePrice, otherPrices }) => ({
          variantId,
          supplierId,
          qty,
          price,
          extra,
          retailPrice,
          wholesalePrice,
          otherPrices,
        })),
        expenses: expenses.map(({ name, amount, currency, basis, isEstimate }) => ({
          name,
          amount,
          currency,
          basis,
          isEstimate,
        })),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['receipts']))
      return this.load(em, receipt)
    })
  }

  /** Puts the goods on hand, each line at what it cost with its share of the expenses. */
  async post(actor: Actor, id: string): Promise<ReceiptDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const receipt = await this.lock(em, actor, id)
      this.assertStatus(receipt, 'draft')
      const lines = await em.find(ReceiptLine, { where: { receiptId: id }, order: { position: 'ASC' } })
      if (!lines.length) {
        throw AppError.validation({ lines: 'Kirimda kamida bitta qator bo‘lishi kerak' })
      }
      const expenses = await em.find(ReceiptExpense, { where: { receiptId: id }, order: { position: 'ASC' } })
      const costing = await this.cost(em, receipt, lines, expenses)

      const batches = await em.insert(
        StockBatch,
        lines.map((line, index) => ({
          orgId: actor.orgId,
          variantId: line.variantId,
          receiptLineId: line.id,
          receivedOn: receipt.docDate,
          qty: line.qty,
          costUzs: costing.lines[index].costUzs,
        })),
      )
      await this.stock.apply(
        em,
        actor.orgId,
        actor.userId,
        lines.map((line, index) => ({
          kind: 'receipt',
          docDate: receipt.docDate,
          documentType: DOCUMENT,
          documentId: id,
          lineId: line.id,
          locationId: receipt.locationId,
          batchId: batches.identifiers[index].id as string,
          variantId: line.variantId,
          qty: line.qty,
          costUzs: costing.lines[index].costUzs,
        })),
      )
      await this.writeCosts(em, lines, expenses, costing)
      await em.update(Receipt, id, {
        status: 'posted',
        postedAt: new Date(),
        postedBy: actor.userId,
        postedByName: actor.name,
        ...totalColumns(costing.totals),
      })

      // Pieces labelled before posting are on hand from now on.
      await settleReceiptUnits(em, id, receipt.locationId)
      await this.owe(em, actor, receipt, lines, costing)

      const priced = can(actor, 'products.prices') ? await this.applyPrices(em, actor, lines) : 0
      await this.audit.record(em, actor.orgId, actor, {
        action: 'receipt.post',
        entity: 'receipt',
        entityId: id,
        summary: `${receipt.number}: ${costing.totals.qty} dona, ${formatMoney(costing.totals.costUzs, actor.base)}${
          priced ? `; ${priced} ta model narxi yangilandi` : ''
        }`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['receipts', 'stock', 'products', 'labels', 'partners']))
      return this.load(em, await this.find(em, actor, id))
    })
  }

  /**
   * What each supplier is owed for their goods on a receipt being posted: the
   * goods at their prices, without the expenses (those are paid to others),
   * written to the supplier's account in the currency it is kept in. A line
   * names its own supplier when one shipment carries several; goods with no
   * supplier at all were paid for on the spot.
   *
   * An account in the receipt's own currency is owed exactly what the
   * supplier billed, whatever any rate says; one in the base, what the
   * receipt's rate makes of it; one in any other currency, the bill at the
   * rates of the receipt's day. In the books it is worth what the receipt's
   * rate makes of it in the base. A cancelled receipt takes back exactly
   * what was written.
   */
  private async owe(
    em: EntityManager,
    actor: Actor,
    receipt: Receipt,
    lines: ReceiptLine[],
    costing: Costing,
  ): Promise<void> {
    const owed = new Map<string, { goods: number; uzs: number }>()
    lines.forEach((line, index) => {
      const supplierId = line.supplierId ?? receipt.supplierId
      if (!supplierId) {
        return
      }
      const sum = owed.get(supplierId) ?? { goods: 0, uzs: 0 }
      sum.goods += costing.lines[index].goods
      sum.uzs += costing.lines[index].goodsUzs
      owed.set(supplierId, sum)
    })
    if (!owed.size) {
      return
    }
    const ids = [...owed.keys()].sort()
    const suppliers = await em.findBy(Partner, { id: In(ids) })
    const postings: Posting[] = []
    let worth = 0
    // One supplier after another in the same order every time: two receipts never wait on each other's accounts.
    for (const supplierId of ids) {
      const supplier = suppliers.find((item) => item.id === supplierId) as Partner
      const { goods, uzs } = owed.get(supplierId) as { goods: number; uzs: number }
      const account = await this.ledger.partnerAccount(em, supplier)
      const amount = await this.inAccount(em, actor, receipt, account.currency, { goods, uzs })
      postings.push({ accountId: account.id, amount: -amount, base: -uzs })
      worth += uzs
    }
    const purchases = await this.ledger.systemAccount(em, actor.orgId, 'purchases')
    postings.push({ accountId: purchases.id, amount: worth, base: worth })
    await this.ledger.post(
      em,
      actor,
      { date: receipt.docDate, kind: 'receipt', documentType: DOCUMENT, documentId: receipt.id },
      postings,
    )
  }

  /**
   * Goods of a posted receipt sent back to who supplied them: what the
   * business owes for them comes off each supplier's account, at the
   * receipt's prices and by the same rules it was written with, for the
   * share of each line sent back. Goods with no supplier were paid on the
   * spot and change no account. Returns what came off, in the currency of
   * the account, when there was one supplier; posts nothing when nothing
   * was owed.
   */
  async creditIn(
    em: EntityManager,
    actor: Actor,
    receiptId: string,
    parts: { receiptLineId: string; qty: number }[],
    head: { date: string; documentType: string; documentId: string },
  ): Promise<{ amount: number; currency: AnyCurrency } | null> {
    const receipt = await em.findOneByOrFail(Receipt, { id: receiptId })
    const lines = await em.find(ReceiptLine, { where: { receiptId }, order: { position: 'ASC' } })
    const expenses = await em.find(ReceiptExpense, { where: { receiptId }, order: { position: 'ASC' } })
    const costing = await this.cost(em, receipt, lines, expenses)
    const owed = new Map<string, { goods: number; uzs: number }>()
    for (const piece of parts) {
      const index = lines.findIndex((line) => line.id === piece.receiptLineId)
      const line = lines[index]
      const supplierId = line ? (line.supplierId ?? receipt.supplierId) : null
      if (!line || !supplierId) {
        continue
      }
      // So many thousandths of the line: its sums shared out in proportion, rounded half up.
      const share = (sum: number) =>
        Number(
          (BigInt(sum) * BigInt(Math.round(piece.qty * 1000)) * 2n + BigInt(Math.round(line.qty * 1000))) /
            (BigInt(Math.round(line.qty * 1000)) * 2n),
        )
      const sum = owed.get(supplierId) ?? { goods: 0, uzs: 0 }
      sum.goods += share(costing.lines[index].goods)
      sum.uzs += share(costing.lines[index].goodsUzs)
      owed.set(supplierId, sum)
    }
    if (!owed.size) {
      return null
    }
    const ids = [...owed.keys()].sort()
    const suppliers = await em.findBy(Partner, { id: In(ids) })
    const postings: Posting[] = []
    let worth = 0
    let credited: { amount: number; currency: AnyCurrency } | null = null
    for (const supplierId of ids) {
      const supplier = suppliers.find((item) => item.id === supplierId) as Partner
      const sums = owed.get(supplierId) as { goods: number; uzs: number }
      const account = await this.ledger.partnerAccount(em, supplier)
      const amount = await this.inAccount(em, actor, receipt, account.currency, sums)
      postings.push({ accountId: account.id, amount, base: sums.uzs })
      worth += sums.uzs
      credited = { amount, currency: account.currency }
    }
    const purchases = await this.ledger.systemAccount(em, actor.orgId, 'purchases')
    postings.push({ accountId: purchases.id, amount: -worth, base: -worth })
    await this.ledger.post(em, actor, { ...head, kind: head.documentType }, postings)
    return ids.length === 1 ? credited : null
  }

  /**
   * What the goods of a receipt come to on an account kept in `currency`:
   * exactly what was billed in the receipt's own currency; in the base, what
   * the receipt's rate makes of it; in any other, the bill at the rates of
   * the receipt's day.
   */
  private async inAccount(
    em: EntityManager,
    actor: Actor,
    receipt: Receipt,
    currency: AnyCurrency,
    sums: { goods: number; uzs: number },
  ): Promise<number> {
    if (currency === receipt.currency) {
      return sums.goods
    }
    if (currency === actor.base) {
      return sums.uzs
    }
    const book = await this.currencies.book(em, actor, receipt.docDate)
    const wanting = wantingRate(book, receipt.currency, currency)
    const amount = wanting ? null : exchange(sums.goods, receipt.currency, currency, book)
    if (amount === null) {
      throw AppError.conflict(
        'RATE_MISSING',
        `${wanting ?? 'Kurs qo‘yilmagan'}: yetkazib beruvchi qarzini hisoblab bo‘lmaydi`,
      )
    }
    return amount
  }

  /** Takes the goods back off hand. Possible only while every piece is still where the receipt put it. */
  async cancel(actor: Actor, id: string): Promise<ReceiptDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const receipt = await this.lock(em, actor, id)
      this.assertStatus(receipt, 'posted')
      const lines = await em.find(ReceiptLine, { where: { receiptId: id }, order: { position: 'ASC' } })
      const batches = await em.findBy(StockBatch, { receiptLineId: In(lines.map((line) => line.id)) })
      const balances = await em.findBy(StockBalance, { batchId: In(batches.map((batch) => batch.id)) })

      const movements: Movement[] = batches.map((batch) => {
        const here = balances.find(
          (balance) => balance.batchId === batch.id && balance.locationId === receipt.locationId,
        )
        if (!here || scaled(here.qty) !== scaled(batch.qty)) {
          throw AppError.conflict(
            'RECEIPT_IN_USE',
            'Bu kirimdagi tovarning bir qismi sotilgan, ko‘chirilgan yoki hisobdan chiqarilgan. Uni bekor qilib bo‘lmaydi',
          )
        }
        return {
          kind: 'receipt_cancel',
          docDate: receipt.docDate,
          documentType: DOCUMENT,
          documentId: id,
          lineId: batch.receiptLineId,
          locationId: receipt.locationId,
          batchId: batch.id,
          variantId: batch.variantId,
          qty: -here.qty,
          costUzs: -here.costUzs,
        }
      })
      await this.stock.apply(em, actor.orgId, actor.userId, movements)
      await voidReceiptUnits(em, id)
      // What the suppliers were owed for these goods is owed no more.
      await this.ledger.reverse(
        em,
        actor,
        {
          date: await this.ledger.today(em, actor.orgId),
          kind: 'receipt_cancel',
          documentType: DOCUMENT,
          documentId: id,
        },
        'receipt',
      )
      await em.update(Receipt, id, { status: 'cancelled', cancelledAt: new Date(), cancelledBy: actor.userId })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'receipt.cancel',
        entity: 'receipt',
        entityId: id,
        summary: receipt.number,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['receipts', 'stock', 'partners']))
      return this.load(em, await this.find(em, actor, id))
    })
  }

  /**
   * Replaces the expenses of a posted receipt: an estimate becomes the real
   * bill, or a bill arrives late. Each line's cost is worked out again and
   * the difference follows the goods to wherever they are now. What belongs
   * to pieces that have already left is recorded against no place, to be
   * taken into the cost of what was sold.
   */
  async updateExpenses(actor: Actor, id: string, input: ReceiptExpensesInput): Promise<ReceiptDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const receipt = await this.lock(em, actor, id)
      this.assertStatus(receipt, 'posted')
      const kept = await this.currencies.kept(em, actor)
      throwIfAny(keptFields(kept, null, input.expenses))

      const lines = await em.find(ReceiptLine, { where: { receiptId: id }, order: { position: 'ASC' } })
      await em.delete(ReceiptExpense, { receiptId: id })
      const expenses = await this.insertExpenses(em, receipt, input.expenses)
      const costing = await this.cost(em, receipt, lines, expenses)

      const batches = await em.findBy(StockBatch, { receiptLineId: In(lines.map((line) => line.id)) })
      const balances = await em.findBy(StockBalance, { batchId: In(batches.map((batch) => batch.id)) })
      const today = new Date().toISOString().slice(0, 10)
      const movements: Movement[] = []

      for (const [index, line] of lines.entries()) {
        const deltaUzs = costing.lines[index].costUzs - (line.costUzs ?? 0)
        if (!deltaUzs) {
          continue
        }
        const batch = batches.find((item) => item.receiptLineId === line.id) as StockBatch
        const held = balances.filter((balance) => balance.batchId === batch.id)
        const gone = scaled(batch.qty) - held.reduce((sum, balance) => sum + scaled(balance.qty), 0n)
        const weights = [...held.map((balance) => scaled(balance.qty)), gone]
        const uzs = allocateExact(deltaUzs, weights)

        weights.forEach((weight, position) => {
          if (weight === 0n || !uzs[position]) {
            return
          }
          movements.push({
            kind: 'revalue',
            docDate: today,
            documentType: DOCUMENT,
            documentId: id,
            lineId: line.id,
            locationId: held[position]?.locationId ?? null,
            batchId: batch.id,
            variantId: batch.variantId,
            qty: 0,
            costUzs: uzs[position],
          })
        })
        await em.update(StockBatch, batch.id, { costUzs: costing.lines[index].costUzs })
      }

      await this.stock.apply(em, actor.orgId, actor.userId, movements)
      await this.writeCosts(em, lines, expenses, costing)
      await em.update(Receipt, id, {
        ...totalColumns(costing.totals),
        hasEstimates: expenses.some((expense) => expense.isEstimate),
      })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'receipt.expenses',
        entity: 'receipt',
        entityId: id,
        summary: receipt.number,
        changes: {
          expenses: [formatMoney(receipt.expensesUzs, actor.base), formatMoney(costing.totals.expensesUzs, actor.base)],
          cost: [formatMoney(receipt.costUzs, actor.base), formatMoney(costing.totals.costUzs, actor.base)],
        },
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['receipts', 'stock']))
      return this.load(em, await this.find(em, actor, id))
    })
  }

  // ───────────────────────────── Reading ─────────────────────────────

  private async find(em: EntityManager, actor: Actor, id: string): Promise<Receipt> {
    const receipt = await em.findOneBy(Receipt, { id })
    if (!receipt || !this.mayWorkAt(actor, receipt.locationId)) {
      throw AppError.notFound('Kirim hujjati topilmadi')
    }
    return receipt
  }

  /** Reads the receipt and holds it until the transaction ends, so two people cannot post it at once. */
  private async lock(em: EntityManager, actor: Actor, id: string): Promise<Receipt> {
    await em.query(`SELECT 1 FROM receipts WHERE id = $1 FOR UPDATE`, [id])
    return this.find(em, actor, id)
  }

  private mayWorkAt(actor: Actor, locationId: string): boolean {
    return actor.allLocations || actor.locationIds.includes(locationId)
  }

  private assertStatus(receipt: Receipt, wanted: Receipt['status']) {
    if (receipt.status !== wanted) {
      throw AppError.conflict(
        'WRONG_STATUS',
        `Bu amal faqat «${RECEIPT_STATUS_LABELS[wanted]}» holatidagi hujjatda bajariladi. Hujjat holati: ${RECEIPT_STATUS_LABELS[receipt.status]}`,
      )
    }
  }

  private async load(em: EntityManager, receipt: Receipt): Promise<ReceiptDto> {
    const lines = await em.find(ReceiptLine, { where: { receiptId: receipt.id }, order: { position: 'ASC' } })
    const expenses = await em.find(ReceiptExpense, { where: { receiptId: receipt.id }, order: { position: 'ASC' } })
    const location = await em.findOneBy(Location, { id: receipt.locationId })

    const variants = lines.length
      ? await em.findBy(ProductVariant, { id: In([...new Set(lines.map((line) => line.variantId))]) })
      : []
    const productOf = new Map(variants.map((variant) => [variant.id, variant.productId]))
    const products = await this.products(em, [...new Set(productOf.values())])

    return {
      id: receipt.id,
      number: receipt.number,
      status: receipt.status,
      locationId: receipt.locationId,
      locationName: location?.name ?? '',
      supplierId: receipt.supplierId,
      docDate: receipt.docDate,
      currency: receipt.currency,
      rate: receipt.rate,
      rateWay: receipt.rateWay,
      extraCurrency: receipt.extraCurrency,
      note: receipt.note,
      sourceFile: receipt.sourceFile,
      lines: lines.map((line) => ({
        id: line.id,
        variantId: line.variantId,
        productId: productOf.get(line.variantId) as string,
        supplierId: line.supplierId,
        qty: line.qty,
        price: line.price,
        extra: line.extra,
        retailPrice: line.retailPrice,
        wholesalePrice: line.wholesalePrice,
        otherPrices: line.otherPrices,
        costUzs: line.costUzs,
      })),
      expenses: expenses.map((expense) => ({
        id: expense.id,
        name: expense.name,
        amount: expense.amount,
        currency: expense.currency,
        basis: expense.basis,
        isEstimate: expense.isEstimate,
        amountUzs: expense.amountUzs,
      })),
      products,
      totals: totalsOf(receipt),
      createdByName: receipt.createdByName,
      createdAt: receipt.createdAt.toISOString(),
      postedAt: receipt.postedAt?.toISOString() ?? null,
      postedByName: receipt.postedByName,
    }
  }

  /** The models on a receipt with all their variants, in size order, for the quantity matrix. */
  private async products(em: EntityManager, productIds: string[]): Promise<ReceiptProductDto[]> {
    if (!productIds.length) {
      return []
    }
    const rows: {
      id: string
      name: string
      sku: string
      unit: ReceiptProductDto['unit']
      weight_g: number | null
      axis_ids: string[]
      variants: ReceiptProductDto['variants']
    }[] = await em.query(
      `SELECT p.id, p.name, p.sku, p.unit, p.weight_g,
              array_remove(ARRAY[p.axis1_id, p.axis2_id, p.axis3_id], NULL) AS axis_ids,
              (SELECT jsonb_agg(
                        jsonb_build_object(
                          'id', v.id, 'sku', v.sku, 'isActive', v.is_active,
                          'valueIds', to_jsonb(array_remove(ARRAY[v.value1_id, v.value2_id, v.value3_id], NULL))
                        )
                        ORDER BY a1.sort_order NULLS FIRST, a1.name, a2.sort_order NULLS FIRST, a2.name,
                                 a3.sort_order NULLS FIRST, a3.name, v.created_at
                      )
               FROM product_variants v
               LEFT JOIN attribute_values a1 ON a1.id = v.value1_id
               LEFT JOIN attribute_values a2 ON a2.id = v.value2_id
               LEFT JOIN attribute_values a3 ON a3.id = v.value3_id
               WHERE v.product_id = p.id) AS variants
       FROM products p WHERE p.id = ANY($1) ORDER BY p.name`,
      [productIds],
    )
    const faces = await productFaces(em, productIds)
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      weightG: row.weight_g,
      axisIds: row.axis_ids,
      variants: row.variants ?? [],
      image: faces.get(row.id) ?? null,
    }))
  }

  // ───────────────────────────── Writing ─────────────────────────────

  private async assertValid(em: EntityManager, actor: Actor, input: ReceiptInput) {
    const fields: Record<string, string> = {}

    const location = await em.findOneBy(Location, { id: input.locationId })
    if (
      !location ||
      !location.isActive ||
      (location.kind as string) === TRANSIT ||
      !this.mayWorkAt(actor, input.locationId)
    ) {
      fields.locationId = 'Faol do‘kon yoki skladni tanlang'
    }

    const supplierIds = [
      ...new Set([input.supplierId, ...input.lines.map((line) => line.supplierId)].filter((id): id is string => !!id)),
    ]
    const suppliers = supplierIds.length ? await em.findBy(Partner, { id: In(supplierIds) }) : []
    const known = new Set(suppliers.filter((partner) => partner.isSupplier).map((partner) => partner.id))
    if (input.supplierId && !known.has(input.supplierId)) {
      fields.supplierId = 'Yetkazib beruvchi topilmadi'
    }

    // Goods are bought, and expenses paid, in currencies the business keeps; one other than the base has a rate.
    const kept = await this.currencies.kept(em, actor)
    if (!kept.includes(input.currency)) {
      fields.currency = NOT_KEPT
    } else if (input.currency !== actor.base && !input.rate) {
      fields.rate = 'Kursni yozing'
    }
    Object.assign(fields, keptFields(kept, input.extraCurrency ?? null, input.expenses))

    const variantIds = [...new Set(input.lines.map((line) => line.variantId))]
    const variants = variantIds.length ? await em.findBy(ProductVariant, { id: In(variantIds) }) : []
    const found = new Set(variants.map((variant) => variant.id))
    // A price can be set only for a price type the business keeps, and only in the field that is its own.
    const { others } = await priceFields(em)
    const priced = new Set(others.map((type) => type.id))
    input.lines.forEach((line, index) => {
      if (!found.has(line.variantId)) {
        fields[`lines.${index}.variantId`] = 'Tovar topilmadi'
      }
      if (Object.keys(line.otherPrices).some((id) => !priced.has(id))) {
        fields[`lines.${index}.otherPrices`] = 'Narx turi topilmadi'
      }
      if (line.supplierId && !known.has(line.supplierId)) {
        fields[`lines.${index}.supplierId`] = 'Yetkazib beruvchi topilmadi'
      }
    })

    if (Object.keys(fields).length) {
      throw AppError.validation(fields)
    }
  }

  /** Replaces the lines and expenses of a draft and refreshes what the list shows about it. */
  private async saveContents(em: EntityManager, receipt: Receipt, input: ReceiptInput) {
    await em.delete(ReceiptLine, { receiptId: receipt.id })
    await em.delete(ReceiptExpense, { receiptId: receipt.id })

    const lines = await this.insertLines(em, receipt, input.lines)
    const expenses = await this.insertExpenses(em, receipt, input.expenses)
    const costing = await this.cost(em, receipt, lines, expenses)

    const supplierIds = [
      ...new Set([receipt.supplierId, ...lines.map((line) => line.supplierId)].filter((id): id is string => !!id)),
    ]
    const suppliers = supplierIds.length ? await em.findBy(Partner, { id: In(supplierIds) }) : []
    await em.update(Receipt, receipt.id, {
      ...totalColumns(costing.totals),
      hasEstimates: expenses.some((expense) => expense.isEstimate),
      searchKey: searchKey(
        [
          receipt.number,
          ...suppliers.map((partner) => partner.name),
          receipt.note ?? '',
          receipt.sourceFile ?? '',
        ].join(' '),
      ),
    })
  }

  private async insertLines(em: EntityManager, receipt: Receipt, lines: ReceiptLineInput[]): Promise<ReceiptLine[]> {
    // Thousands of lines go in a few statements, not thousands.
    const CHUNK = 500
    for (let start = 0; start < lines.length; start += CHUNK) {
      await em.insert(
        ReceiptLine,
        lines.slice(start, start + CHUNK).map((line, index) => ({
          orgId: receipt.orgId,
          receiptId: receipt.id,
          position: start + index,
          ...line,
        })),
      )
    }
    return em.find(ReceiptLine, { where: { receiptId: receipt.id }, order: { position: 'ASC' } })
  }

  private async insertExpenses(
    em: EntityManager,
    receipt: Receipt,
    expenses: ReceiptExpenseInput[],
  ): Promise<ReceiptExpense[]> {
    if (expenses.length) {
      await em.insert(
        ReceiptExpense,
        expenses.map((expense, position) => ({ orgId: receipt.orgId, receiptId: receipt.id, position, ...expense })),
      )
    }
    return em.find(ReceiptExpense, { where: { receiptId: receipt.id }, order: { position: 'ASC' } })
  }

  /**
   * What each line costs, in the base. Anything in a third currency goes at
   * the rates of the receipt's day; one with no rate stops the receipt, under
   * the field it is in.
   */
  private async cost(
    em: EntityManager,
    receipt: Receipt,
    lines: ReceiptLine[],
    expenses: ReceiptExpense[],
  ): Promise<Costing> {
    const weights: { id: string; weight_g: number | null }[] = lines.length
      ? await em.query(
          `SELECT v.id, p.weight_g FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ANY($1)`,
          [[...new Set(lines.map((line) => line.variantId))]],
        )
      : []
    const weightOf = new Map(weights.map((row) => [row.id, row.weight_g]))
    const { baseCurrency: base } = await em.findOneByOrFail(Organization, { id: receipt.orgId })
    const third = [receipt.extraCurrency, ...expenses.map((expense) => expense.currency)].some(
      (code) => code !== base && code !== receipt.currency,
    )
    const book = third ? await this.currencies.book(em, receipt, receipt.docDate) : { base, rates: {} }
    const costing = costReceipt({
      base,
      currency: receipt.currency,
      rate: receipt.rate,
      rateWay: receipt.rateWay,
      book,
      extraCurrency: receipt.extraCurrency,
      lines: lines.map((line) => ({
        qty: line.qty,
        price: line.price,
        extra: line.extra,
        weightG: weightOf.get(line.variantId) ?? null,
      })),
      expenses: expenses.map((expense) => ({
        amount: expense.amount,
        currency: expense.currency,
        basis: expense.basis,
      })),
    })
    const wanting = costing.wanting
    if (wanting) {
      if (wanting === receipt.currency) {
        throw AppError.validation({ rate: 'Kursni yozing' })
      }
      const words = `${wantingRate(book, wanting) ?? 'Kurs qo‘yilmagan'} (kirim sanasiga)`
      const fields: Record<string, string> = {}
      if (receipt.extraCurrency === wanting) {
        fields.extraCurrency = words
      }
      expenses.forEach((expense, index) => {
        if (expense.currency === wanting) {
          fields[`expenses.${index}.currency`] = words
        }
      })
      throw AppError.validation(fields)
    }
    return costing
  }

  private async writeCosts(em: EntityManager, lines: ReceiptLine[], expenses: ReceiptExpense[], costing: Costing) {
    await em.query(
      `UPDATE receipt_lines l SET cost_uzs = d.cost_uzs
       FROM unnest($1::uuid[], $2::bigint[]) AS d (id, cost_uzs) WHERE l.id = d.id`,
      [lines.map((line) => line.id), costing.lines.map((line) => line.costUzs)],
    )
    await em.query(
      `UPDATE receipt_expenses e SET amount_uzs = d.amount_uzs
       FROM unnest($1::uuid[], $2::bigint[]) AS d (id, amount_uzs) WHERE e.id = d.id`,
      [expenses.map((expense) => expense.id), costing.expenses.map((expense) => expense.amountUzs)],
    )
  }

  /**
   * Puts the selling prices written on the lines onto their models. The price
   * most lines of a model agree on becomes the model's; a variant whose line
   * says otherwise keeps its own. Returns how many models were touched.
   */
  private async applyPrices(em: EntityManager, actor: Actor, lines: ReceiptLine[]): Promise<number> {
    const { retail, wholesale, others } = await priceFields(em)
    const variants = await em.findBy(ProductVariant, { id: In([...new Set(lines.map((line) => line.variantId))]) })
    const productOf = new Map(variants.map((variant) => [variant.id, variant.productId]))
    const touched = new Set<string>()

    for (const type of [retail, wholesale, ...others]) {
      if (!type) {
        continue
      }
      const pick = (line: ReceiptLine): number | null =>
        type === retail
          ? line.retailPrice
          : type === wholesale
            ? line.wholesalePrice
            : (line.otherPrices[type.id] ?? null)
      const byProduct = new Map<string, Map<string, number>>()
      for (const line of lines) {
        const amount = pick(line)
        if (amount === null) {
          continue
        }
        const productId = productOf.get(line.variantId) as string
        const prices = byProduct.get(productId) ?? new Map<string, number>()
        byProduct.set(productId, prices)
        prices.set(line.variantId, amount)
      }

      for (const [productId, prices] of byProduct) {
        const counts = new Map<number, number>()
        prices.forEach((amount) => counts.set(amount, (counts.get(amount) ?? 0) + 1))
        const [model] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
        const upsert = (variantId: string | null, amount: number) =>
          em.query(
            `INSERT INTO prices (org_id, price_type_id, product_id, variant_id, location_id, amount, currency, updated_by)
             VALUES ($1, $2, $3, $4, NULL, $5, $6, $7)
             ON CONFLICT ON CONSTRAINT prices_scope
             DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency, updated_by = EXCLUDED.updated_by, updated_at = now()`,
            [actor.orgId, type.id, productId, variantId, amount, type.currency, actor.userId],
          )

        await upsert(null, model)
        for (const [variantId, amount] of prices) {
          if (amount === model) {
            await em.query(`DELETE FROM prices WHERE price_type_id = $1 AND variant_id = $2 AND location_id IS NULL`, [
              type.id,
              variantId,
            ])
          } else {
            await upsert(variantId, amount)
          }
        }
        touched.add(productId)
      }
    }
    return touched.size
  }
}

/**
 * Which price type each price field of a line is for. The retail type and the
 * first wholesale one have fields of their own; every other active price type
 * is set through `otherPrices`. The screen picks them the same way.
 */
async function priceFields(
  em: EntityManager,
): Promise<{ retail: PriceType | undefined; wholesale: PriceType | undefined; others: PriceType[] }> {
  const types = await em.find(PriceType, { where: { isActive: true }, order: { sortOrder: 'ASC', name: 'ASC' } })
  const retail = types.find((type) => type.kind === 'retail')
  const wholesale = types.find((type) => type.kind === 'wholesale')
  return { retail, wholesale, others: types.filter((type) => type !== retail && type !== wholesale) }
}

function header(
  input: Pick<ReceiptInput, 'locationId' | 'supplierId' | 'docDate' | 'currency' | 'rate' | 'extraCurrency' | 'note'>,
  actor: Pick<Actor, 'base'>,
) {
  const inBase = input.currency === actor.base
  return {
    locationId: input.locationId,
    supplierId: input.supplierId,
    docDate: input.docDate,
    currency: input.currency,
    // Nothing between the base and itself.
    rate: inBase ? null : input.rate,
    rateWay: receiptRateWay(input.currency, actor.base),
    extraCurrency: input.extraCurrency ?? actor.base,
    note: input.note,
  }
}

const NOT_KEPT = 'Bu valyuta yoqilmagan: Pul → Kurslar'

/** The lines' extra costs and every expense are in a currency the business keeps: the base or one switched on. */
function keptFields(
  kept: AnyCurrency[],
  extraCurrency: AnyCurrency | null,
  expenses: ReceiptExpenseInput[],
): Record<string, string> {
  const fields: Record<string, string> = {}
  if (extraCurrency && !kept.includes(extraCurrency)) {
    fields.extraCurrency = NOT_KEPT
  }
  expenses.forEach((expense, index) => {
    if (!kept.includes(expense.currency)) {
      fields[`expenses.${index}.currency`] = NOT_KEPT
    }
  })
  return fields
}

function throwIfAny(fields: Record<string, string>) {
  if (Object.keys(fields).length) {
    throw AppError.validation(fields)
  }
}

function totalColumns(totals: ReceiptTotals) {
  return {
    totalQty: totals.qty,
    goods: totals.goods,
    goodsUzs: totals.goodsUzs,
    expensesUzs: totals.expensesUzs,
    costUzs: totals.costUzs,
  }
}

function totalsOf(receipt: Receipt): ReceiptTotals {
  return {
    qty: receipt.totalQty,
    goods: receipt.goods,
    goodsUzs: receipt.goodsUzs,
    expensesUzs: receipt.expensesUzs,
    costUzs: receipt.costUzs,
  }
}

const scaled = (qty: number) => BigInt(Math.round(qty * QTY_SCALE))
