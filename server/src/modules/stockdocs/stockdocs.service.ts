import {
  formatMoney,
  searchKey,
  STOCK_DOC_KIND_LABELS,
  STOCK_DOC_PERMISSION,
  STOCK_DOC_STATUS_LABELS,
  WRITEOFF_REASON_LABELS,
  type GoodsSentEvent,
  type Page,
  type ReceiptProductDto,
  type StockDocDto,
  type StockDocInput,
  type StockDocKind,
  type StockDocListItemDto,
  type StockDocListQuery,
  type StockDocReceiveInput,
  type StockDocStatus,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import { In, type EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch, applySort } from '../../common/listing'
import { Db } from '../../database/db.service'
import {
  Location,
  ProductVariant,
  StockBatch,
  StockDocument,
  StockDocumentItem,
  StockDocumentLine,
} from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { nextNumbers } from '../catalog/counters'
import { RealtimeService } from '../realtime/realtime.service'
import { StockService, TRANSIT, type Movement, type Piece } from '../stock/stock.service'

const SORTABLE = { number: 'd.number', docDate: 'd.docDate', createdAt: 'd.createdAt' }

const PREFIX: Record<StockDocKind, string> = { transfer: 'KO', writeoff: 'HC', count: 'IN' }

const QTY_SCALE = 1000
const scaled = (qty: number) => Math.round(qty * QTY_SCALE)
const unscaled = (value: number) => value / QTY_SCALE

/**
 * Transfers, write-offs and counts. All three take goods out of balances
 * oldest batch first and remember exactly which pieces they took, so a
 * transfer delivers the same pieces it collected and a cancelled write-off
 * puts back what it removed, at what it cost.
 */
@Injectable()
export class StockDocsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly stock: StockService,
  ) {}

  async list(actor: Actor, query: StockDocListQuery): Promise<Page<StockDocListItemDto>> {
    need(actor, query.kind, 'view')
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em
        .createQueryBuilder(StockDocument, 'd')
        .leftJoin(Location, 'l', 'l.id = d.locationId')
        .leftJoin(Location, 't', 't.id = d.toLocationId')
        .addSelect('l.name', 'location_name')
        .addSelect('t.name', 'to_location_name')
        .where('d.kind = :kind', { kind: query.kind })

      if (!actor.allLocations) {
        const mine = actor.locationIds.length ? actor.locationIds : [null]
        qb.andWhere('(d.locationId IN (:...mine) OR d.toLocationId IN (:...mine))', { mine })
      }
      if (query.status !== 'all') qb.andWhere('d.status = :status', { status: query.status })
      if (query.locationId) {
        qb.andWhere('(d.locationId = :locationId OR d.toLocationId = :locationId)', { locationId: query.locationId })
      }
      if (query.from) qb.andWhere('d.docDate >= :from', { from: query.from })
      if (query.to) qb.andWhere('d.docDate <= :to', { to: query.to })
      applySearch(qb, 'd.search_key', query.q)
      applySort(qb, SORTABLE, query.sort, query.sort ? query.order : 'desc', 'createdAt')

      const total = await qb.getCount()
      const { entities, raw } = await qb
        .offset((query.page - 1) * query.size)
        .limit(query.size)
        .getRawAndEntities()

      const seesCost = can(actor, 'stock.cost')
      return {
        items: entities.map((doc, index) => ({
          id: doc.id,
          kind: doc.kind,
          number: doc.number,
          status: doc.status,
          docDate: doc.docDate,
          locationName: raw[index].location_name,
          toLocationName: raw[index].to_location_name,
          reason: doc.reason,
          qty: doc.totalQty,
          diffQty: doc.diffQty,
          costUzs: seesCost ? doc.costUzs : null,
          createdByName: doc.createdByName,
          createdAt: doc.createdAt.toISOString(),
        })),
        total,
        page: query.page,
        size: query.size,
      }
    })
  }

  async get(actor: Actor, id: string): Promise<StockDocDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const doc = await this.find(em, actor, id)
      need(actor, doc.kind, 'view')
      return this.load(em, actor, doc)
    })
  }

  async create(actor: Actor, input: StockDocInput): Promise<StockDocDto> {
    need(actor, input.kind, 'manage')
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.assertValid(em, actor, input)
      const number = `${PREFIX[input.kind]}-${String(await nextNumbers(em, actor.orgId, input.kind)).padStart(6, '0')}`
      const doc = await em.save(
        em.create(StockDocument, {
          orgId: actor.orgId,
          kind: input.kind,
          number,
          status: 'draft',
          ...header(input),
          createdBy: actor.userId,
          createdByName: actor.name,
          searchKey: '',
        }),
      )
      await this.saveLines(em, doc, input)
      await this.audit.record(em, actor.orgId, actor, {
        action: `${input.kind}.create`,
        entity: input.kind,
        entityId: doc.id,
        summary: number,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['stockdocs']))
      return this.load(em, actor, await this.find(em, actor, doc.id))
    })
  }

  async update(actor: Actor, id: string, input: StockDocInput): Promise<StockDocDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const doc = await this.lock(em, actor, id)
      need(actor, doc.kind, 'manage')
      assertStatus(doc, 'draft')
      if (input.kind !== doc.kind) {
        throw AppError.validation({ kind: 'Hujjat turini o‘zgartirib bo‘lmaydi' })
      }
      await this.assertValid(em, actor, input)
      await em.update(StockDocument, id, header(input))
      await this.saveLines(em, { ...doc, ...header(input) }, input)
      afterCommit(() => this.realtime.changed(actor.orgId, ['stockdocs']))
      return this.load(em, actor, await this.find(em, actor, id))
    })
  }

  async remove(actor: Actor, id: string): Promise<void> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const doc = await this.lock(em, actor, id)
      need(actor, doc.kind, 'manage')
      assertStatus(doc, 'draft')
      await em.delete(StockDocument, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: `${doc.kind}.delete`,
        entity: doc.kind,
        entityId: id,
        summary: doc.number,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['stockdocs']))
    })
  }

  /** A transfer leaves: the goods come off the shelf they were on and are on the way. */
  async send(actor: Actor, id: string): Promise<StockDocDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const doc = await this.lock(em, actor, id)
      if (doc.kind !== 'transfer') {
        throw AppError.conflict('WRONG_KIND', 'Faqat ko‘chirish jo‘natiladi')
      }
      need(actor, doc.kind, 'manage')
      assertStatus(doc, 'draft')
      this.assertWorksAt(actor, doc.locationId, 'Faqat tovar turgan joyning xodimi jo‘natadi')

      const lines = await this.lines(em, id)
      const taken = await this.takeOut(em, actor, doc, lines, 'transfer', await this.stock.transit(em, actor.orgId))
      await em.update(StockDocument, id, { status: 'sent', sentAt: new Date(), ...taken.cost })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'transfer.send',
        entity: 'transfer',
        entityId: id,
        summary: `${doc.number}: ${doc.totalQty} dona`,
      })
      const sent = await this.load(em, actor, await this.find(em, actor, id))
      afterCommit(() => {
        this.realtime.changed(actor.orgId, ['stockdocs', 'stock'])
        // The shop the goods are going to hears that they are on the way.
        this.realtime.event<GoodsSentEvent>(actor.orgId, 'goods.sent', {
          id,
          number: sent.number,
          fromName: sent.locationName,
          toName: sent.toLocationName ?? '',
          toLocationId: doc.toLocationId as string,
          sentBy: actor.userId,
        })
      })
      return sent
    })
  }

  /**
   * A transfer arrives. What was counted on arrival goes onto the shelf; what
   * was sent and did not arrive leaves the books as a loss on the way, and
   * the document shows how much.
   */
  async receive(actor: Actor, id: string, input: StockDocReceiveInput): Promise<StockDocDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const doc = await this.lock(em, actor, id)
      if (doc.kind !== 'transfer') {
        throw AppError.conflict('WRONG_KIND', 'Faqat ko‘chirish qabul qilinadi')
      }
      need(actor, doc.kind, 'manage')
      assertStatus(doc, 'sent')
      const destination = doc.toLocationId as string
      this.assertWorksAt(actor, destination, 'Faqat qabul qiluvchi joyning xodimi qabul qiladi')

      const lines = await this.lines(em, id)
      const received = new Map(input.lines.map((line) => [line.lineId, line.receivedQty]))
      const fields: Record<string, string> = {}
      lines.forEach((line, index) => {
        if (scaled(received.get(line.id) ?? line.qty) > scaled(line.qty)) {
          fields[`lines.${index}.receivedQty`] = `Jo‘natilgandan ko‘p qabul qilib bo‘lmaydi (jo‘natilgan: ${line.qty})`
        }
      })
      throwIfAny(fields)

      const transit = await this.stock.transit(em, actor.orgId)
      const items = await em.find(StockDocumentItem, { where: { documentId: id }, order: { position: 'ASC' } })
      const movements: Movement[] = []
      let lost = 0
      let lostUzs = 0

      for (const line of lines) {
        const arrived = scaled(received.get(line.id) ?? line.qty)
        let left = arrived
        // The line's pieces in the order they were collected; the first ones are the ones that arrived.
        for (const item of items.filter((piece) => piece.lineId === line.id)) {
          const here = Math.min(left, scaled(item.qty))
          const gone = scaled(item.qty) - here
          left -= here
          const [onTheWay] = await this.stock.pickBatches(em, transit, [{ batchId: item.batchId, qty: item.qty }])
          // Its value is whatever the goods on the way are worth now: a late bill may have changed it since they left.
          const [piece] = onTheWay.pieces
          if (!piece || onTheWay.missing) {
            throw AppError.conflict('TRANSIT_MISSING', 'Yo‘ldagi tovar qoldig‘i hujjatga mos kelmayapti')
          }
          const arrivedPart = part(piece, here)
          const lostPart = part(piece, gone, arrivedPart)
          if (here) {
            movements.push(...move('transfer', doc, line.id, transit, destination, arrivedPart))
          }
          if (gone) {
            movements.push(...move('transfer_loss', doc, line.id, transit, null, lostPart))
            lost += gone
            lostUzs += lostPart.costUzs
          }
        }
        await em.update(StockDocumentLine, line.id, { receivedQty: unscaled(arrived) })
      }

      await this.stock.apply(em, actor.orgId, actor.userId, movements)
      await em.update(StockDocument, id, {
        status: 'posted',
        postedAt: new Date(),
        postedBy: actor.userId,
        postedByName: actor.name,
        diffQty: unscaled(lost),
      })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'transfer.receive',
        entity: 'transfer',
        entityId: id,
        summary: lost
          ? `${doc.number}: ${unscaled(lost)} dona yetib kelmadi (${formatMoney(lostUzs)})`
          : `${doc.number}: to‘liq qabul qilindi`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['stockdocs', 'stock']))
      return this.load(em, actor, await this.find(em, actor, id))
    })
  }

  /** Carries out a write-off or a count. */
  async post(actor: Actor, id: string): Promise<StockDocDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const doc = await this.lock(em, actor, id)
      if (doc.kind === 'transfer') {
        throw AppError.conflict('WRONG_KIND', 'Ko‘chirish jo‘natiladi va qabul qilinadi')
      }
      need(actor, doc.kind, 'post')
      assertStatus(doc, 'draft')
      this.assertWorksAt(actor, doc.locationId)

      const lines = await this.lines(em, id)
      let summary: string
      if (doc.kind === 'writeoff') {
        const taken = await this.takeOut(em, actor, doc, lines, 'writeoff', null)
        await em.update(StockDocument, id, taken.cost)
        summary = `${doc.number}: ${doc.totalQty} dona, ${formatMoney(taken.cost.costUzs)} (${WRITEOFF_REASON_LABELS[doc.reason ?? 'other']})`
      } else {
        summary = await this.settleCount(em, actor, doc, lines)
      }
      await em.update(StockDocument, id, {
        status: 'posted',
        postedAt: new Date(),
        postedBy: actor.userId,
        postedByName: actor.name,
      })
      await this.audit.record(em, actor.orgId, actor, {
        action: `${doc.kind}.post`,
        entity: doc.kind,
        entityId: id,
        summary,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['stockdocs', 'stock']))
      return this.load(em, actor, await this.find(em, actor, id))
    })
  }

  /**
   * Undoes a transfer that is still on the way, or a write-off: the same
   * pieces go back where they came from. A count is not undone; a new count
   * corrects it.
   */
  async cancel(actor: Actor, id: string): Promise<StockDocDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const doc = await this.lock(em, actor, id)
      const items = await em.find(StockDocumentItem, { where: { documentId: id }, order: { position: 'ASC' } })
      const movements: Movement[] = []

      if (doc.kind === 'transfer') {
        need(actor, doc.kind, 'manage')
        assertStatus(doc, 'sent')
        this.assertWorksAt(actor, doc.locationId, 'Faqat jo‘natgan joyning xodimi qaytarib oladi')
        const transit = await this.stock.transit(em, actor.orgId)
        for (const item of items) {
          const [onTheWay] = await this.stock.pickBatches(em, transit, [{ batchId: item.batchId, qty: item.qty }])
          if (!onTheWay.pieces[0] || onTheWay.missing) {
            throw AppError.conflict('TRANSIT_MISSING', 'Yo‘ldagi tovar qoldig‘i hujjatga mos kelmayapti')
          }
          movements.push(...move('transfer_cancel', doc, item.lineId, transit, doc.locationId, onTheWay.pieces[0]))
        }
      } else if (doc.kind === 'writeoff') {
        need(actor, doc.kind, 'post')
        assertStatus(doc, 'posted')
        this.assertWorksAt(actor, doc.locationId)
        for (const item of items) {
          movements.push(...move('writeoff_cancel', doc, item.lineId, null, doc.locationId, item))
        }
      } else {
        throw AppError.conflict('WRONG_KIND', 'Inventarizatsiya bekor qilinmaydi: yangi sanash bilan to‘g‘rilanadi')
      }

      await this.stock.apply(em, actor.orgId, actor.userId, movements)
      await em.update(StockDocument, id, { status: 'cancelled', cancelledAt: new Date(), cancelledBy: actor.userId })
      await this.audit.record(em, actor.orgId, actor, {
        action: `${doc.kind}.cancel`,
        entity: doc.kind,
        entityId: id,
        summary: doc.number,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['stockdocs', 'stock']))
      return this.load(em, actor, await this.find(em, actor, id))
    })
  }

  // ───────────────────────────── Carrying out ─────────────────────────────

  /**
   * Takes every line's quantity out of the document's place, oldest batch
   * first, and sends it to `to` (or nowhere, for a write-off). Refuses the
   * whole document if any line asks for more than is there.
   */
  private async takeOut(
    em: EntityManager,
    actor: Actor,
    doc: StockDocument,
    lines: StockDocumentLine[],
    kind: Movement['kind'],
    to: string | null,
  ): Promise<{ cost: { costUsd: number; costUzs: number } }> {
    if (!lines.length) {
      throw AppError.validation({ lines: 'Hujjatda kamida bitta tovar bo‘lishi kerak' })
    }
    const picked = await this.stock.pick(
      em,
      doc.locationId,
      lines.map((line) => ({ variantId: line.variantId, qty: line.qty })),
    )
    const fields: Record<string, string> = {}
    picked.forEach((result, index) => {
      if (result.missing) {
        const available = unscaled(scaled(lines[index].qty) - scaled(result.missing))
        fields[`lines.${index}.qty`] = `Qoldiq yetarli emas: bor ${available}, kerak ${lines[index].qty}`
      }
    })
    throwIfAny(fields, 'Qoldiq yetarli emas')

    const movements: Movement[] = []
    const items: Partial<StockDocumentItem>[] = []
    let costUsd = 0
    let costUzs = 0
    for (const [index, line] of lines.entries()) {
      const { pieces } = picked[index]
      pieces.forEach((piece, position) => {
        movements.push(...move(kind, doc, line.id, doc.locationId, to, piece))
        items.push({ orgId: actor.orgId, documentId: doc.id, lineId: line.id, position, ...piece })
      })
      const usd = pieces.reduce((sum, piece) => sum + piece.costUsd, 0)
      const uzs = pieces.reduce((sum, piece) => sum + piece.costUzs, 0)
      await em.update(StockDocumentLine, line.id, { costUsd: usd, costUzs: uzs })
      costUsd += usd
      costUzs += uzs
    }
    await this.stock.apply(em, actor.orgId, actor.userId, movements)
    for (let start = 0; start < items.length; start += 500) {
      await em.insert(StockDocumentItem, items.slice(start, start + 500))
    }
    return { cost: { costUsd, costUzs } }
  }

  /**
   * Makes the books agree with what was counted. Less than the books say
   * leaves as a shortage, oldest batch first; more comes in as a new batch at
   * what that variant costs on average. In a full count, whatever is on hand
   * in the place and was not counted is counted as none.
   */
  private async settleCount(
    em: EntityManager,
    actor: Actor,
    doc: StockDocument,
    counted: StockDocumentLine[],
  ): Promise<string> {
    let lines = counted
    if (doc.fullCount) {
      const uncounted: { variant_id: string }[] = await em.query(
        `SELECT DISTINCT variant_id FROM stock_balances WHERE location_id = $1 AND qty > 0 AND NOT (variant_id = ANY($2))`,
        [doc.locationId, lines.map((line) => line.variantId)],
      )
      if (uncounted.length) {
        await em.insert(
          StockDocumentLine,
          uncounted.map((row, index) => ({
            orgId: actor.orgId,
            documentId: doc.id,
            position: lines.length + index,
            variantId: row.variant_id,
            qty: 0,
          })),
        )
        lines = await this.lines(em, doc.id)
      }
    }
    if (!lines.length) {
      throw AppError.validation({ lines: 'Hujjatda kamida bitta tovar bo‘lishi kerak' })
    }

    const onHand = await this.stock.onHand(
      em,
      doc.locationId,
      lines.map((line) => line.variantId),
    )
    const shortages = lines.filter((line) => scaled(line.qty) < scaled(onHand.get(line.variantId) ?? 0))
    const picked = await this.stock.pick(
      em,
      doc.locationId,
      shortages.map((line) => ({
        variantId: line.variantId,
        qty: unscaled(scaled(onHand.get(line.variantId) ?? 0) - scaled(line.qty)),
      })),
    )

    const movements: Movement[] = []
    const items: Partial<StockDocumentItem>[] = []
    let net = 0
    let costUsd = 0
    let costUzs = 0
    let short = 0
    let over = 0

    for (const line of lines) {
      const expected = onHand.get(line.variantId) ?? 0
      const diff = scaled(line.qty) - scaled(expected)
      let usd = 0
      let uzs = 0

      if (diff < 0) {
        const { pieces } = picked[shortages.indexOf(line)]
        pieces.forEach((piece, position) => {
          movements.push(...move('count', doc, line.id, doc.locationId, null, piece))
          items.push({ orgId: actor.orgId, documentId: doc.id, lineId: line.id, position, ...piece })
          usd -= piece.costUsd
          uzs -= piece.costUzs
        })
        short -= diff
      } else if (diff > 0) {
        const found = await this.foundBatch(em, actor, doc, line.variantId, unscaled(diff))
        movements.push(...move('count', doc, line.id, null, doc.locationId, found))
        usd = found.costUsd
        uzs = found.costUzs
        over += diff
      }

      await em.update(StockDocumentLine, line.id, { expectedQty: expected, costUsd: usd, costUzs: uzs })
      net += diff
      costUsd += usd
      costUzs += uzs
    }

    await this.stock.apply(em, actor.orgId, actor.userId, movements)
    if (items.length) {
      await em.insert(StockDocumentItem, items)
    }
    await em.update(StockDocument, doc.id, { diffQty: unscaled(net), costUsd, costUzs })
    return `${doc.number}: kamomad ${unscaled(short)} dona, ortiqcha ${unscaled(over)} dona, farq ${formatMoney(costUzs)}`
  }

  /** A batch for goods a count found that the books did not know of, valued at the variant's average cost. */
  private async foundBatch(
    em: EntityManager,
    actor: Actor,
    doc: StockDocument,
    variantId: string,
    qty: number,
  ): Promise<Piece> {
    // What it costs where it is still on hand; failing that, what it cost the last time it came in.
    const [known]: { qty: number; cost_usd: number; cost_uzs: number }[] = await em.query(
      `SELECT coalesce(sum(qty), 0)::float8 AS qty, coalesce(sum(cost_usd), 0)::float8 AS cost_usd,
              coalesce(sum(cost_uzs), 0)::float8 AS cost_uzs
       FROM stock_balances WHERE variant_id = $1 AND qty > 0`,
      [variantId],
    )
    let basis = known
    if (!(basis.qty > 0)) {
      const [last]: (typeof basis)[] = await em.query(
        `SELECT qty::float8 AS qty, cost_usd::float8 AS cost_usd, cost_uzs::float8 AS cost_uzs
         FROM stock_batches WHERE variant_id = $1 ORDER BY received_on DESC, created_at DESC LIMIT 1`,
        [variantId],
      )
      basis = last ?? { qty: 0, cost_usd: 0, cost_uzs: 0 }
    }
    const each = (cost: number) => (basis.qty > 0 ? Math.round((cost * qty) / basis.qty) : 0)
    const costUsd = each(basis.cost_usd)
    const costUzs = each(basis.cost_uzs)
    const batch = await em.save(
      em.create(StockBatch, {
        orgId: actor.orgId,
        variantId,
        receiptLineId: null,
        receivedOn: doc.docDate,
        qty,
        costUsd,
        costUzs,
      }),
    )
    return { batchId: batch.id, variantId, qty, costUsd, costUzs }
  }

  // ───────────────────────────── Reading ─────────────────────────────

  private async find(em: EntityManager, actor: Actor, id: string): Promise<StockDocument> {
    const doc = await em.findOneBy(StockDocument, { id })
    const mine = (locationId: string | null) =>
      !!locationId && (actor.allLocations || actor.locationIds.includes(locationId))
    if (!doc || !(mine(doc.locationId) || mine(doc.toLocationId))) {
      throw AppError.notFound('Hujjat topilmadi')
    }
    return doc
  }

  private async lock(em: EntityManager, actor: Actor, id: string): Promise<StockDocument> {
    await em.query(`SELECT 1 FROM stock_documents WHERE id = $1 FOR UPDATE`, [id])
    return this.find(em, actor, id)
  }

  private lines(em: EntityManager, documentId: string): Promise<StockDocumentLine[]> {
    return em.find(StockDocumentLine, { where: { documentId }, order: { position: 'ASC' } })
  }

  private assertWorksAt(actor: Actor, locationId: string, message = 'Bu joyda ishlamaysiz') {
    if (!actor.allLocations && !actor.locationIds.includes(locationId)) {
      throw AppError.forbidden(message)
    }
  }

  private async load(em: EntityManager, actor: Actor, doc: StockDocument): Promise<StockDocDto> {
    const lines = await this.lines(em, doc.id)
    const places = await em.findBy(Location, { id: In(placeIds(doc)) })
    const nameOf = (id: string | null) => places.find((place) => place.id === id)?.name ?? null

    const variants = lines.length
      ? await em.findBy(ProductVariant, { id: In(lines.map((line) => line.variantId)) })
      : []
    const productOf = new Map(variants.map((variant) => [variant.id, variant.productId]))
    const products = await this.products(em, [...new Set(productOf.values())])
    const onHand = await this.stock.onHand(
      em,
      doc.locationId,
      products.flatMap((product) => product.variants.map((variant) => variant.id)),
    )

    const seesCost = can(actor, 'stock.cost')
    // Whoever counts should count, not copy: what the books say is for those who approve the count.
    const seesBooks = doc.kind !== 'count' || doc.status !== 'draft' || can(actor, 'counts.post')
    return {
      id: doc.id,
      kind: doc.kind,
      number: doc.number,
      status: doc.status,
      locationId: doc.locationId,
      locationName: nameOf(doc.locationId) ?? '',
      toLocationId: doc.toLocationId,
      toLocationName: nameOf(doc.toLocationId),
      docDate: doc.docDate,
      reason: doc.reason,
      fullCount: doc.fullCount,
      note: doc.note,
      lines: lines.map((line) => ({
        id: line.id,
        variantId: line.variantId,
        productId: productOf.get(line.variantId) as string,
        qty: line.qty,
        receivedQty: line.receivedQty,
        expectedQty: line.expectedQty,
        costUzs: seesCost ? line.costUzs : null,
      })),
      products,
      onHand: seesBooks ? Object.fromEntries(onHand) : {},
      qty: doc.totalQty,
      diffQty: doc.diffQty,
      costUzs: seesCost ? doc.costUzs : null,
      createdByName: doc.createdByName,
      createdAt: doc.createdAt.toISOString(),
      postedAt: doc.postedAt?.toISOString() ?? null,
      postedByName: doc.postedByName,
    }
  }

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
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      weightG: row.weight_g,
      axisIds: row.axis_ids,
      variants: row.variants ?? [],
    }))
  }

  // ───────────────────────────── Writing ─────────────────────────────

  private async assertValid(em: EntityManager, actor: Actor, input: StockDocInput) {
    const fields: Record<string, string> = {}
    const place = async (id: string) => {
      const location = await em.findOneBy(Location, { id })
      return location && location.isActive && (location.kind as string) !== TRANSIT ? location : null
    }

    // A document is made by someone who works where the goods are.
    if (!(await place(input.locationId)) || !(actor.allLocations || actor.locationIds.includes(input.locationId))) {
      fields.locationId = 'O‘zingiz ishlaydigan faol joyni tanlang'
    }
    if (input.kind === 'transfer' && input.toLocationId && !(await place(input.toLocationId))) {
      fields.toLocationId = 'Faol do‘kon yoki skladni tanlang'
    }

    const variantIds = input.lines.map((line) => line.variantId)
    const found = new Set(
      (variantIds.length ? await em.findBy(ProductVariant, { id: In(variantIds) }) : []).map((variant) => variant.id),
    )
    input.lines.forEach((line, index) => {
      if (!found.has(line.variantId)) {
        fields[`lines.${index}.variantId`] = 'Tovar topilmadi'
      }
    })
    throwIfAny(fields)
  }

  private async saveLines(em: EntityManager, doc: StockDocument, input: StockDocInput) {
    await em.delete(StockDocumentLine, { documentId: doc.id })
    for (let start = 0; start < input.lines.length; start += 500) {
      await em.insert(
        StockDocumentLine,
        input.lines.slice(start, start + 500).map((line, index) => ({
          orgId: doc.orgId,
          documentId: doc.id,
          position: start + index,
          variantId: line.variantId,
          qty: line.qty,
        })),
      )
    }
    const places = await em.findBy(Location, { id: In(placeIds(doc)) })
    await em.update(StockDocument, doc.id, {
      totalQty: unscaled(input.lines.reduce((sum, line) => sum + scaled(line.qty), 0)),
      searchKey: searchKey(
        [doc.number, STOCK_DOC_KIND_LABELS[doc.kind], ...places.map((place) => place.name), doc.note ?? ''].join(' '),
      ),
    })
  }
}

const placeIds = (doc: Pick<StockDocument, 'locationId' | 'toLocationId'>) =>
  [doc.locationId, doc.toLocationId].filter((id): id is string => !!id)

function header(input: StockDocInput) {
  return {
    locationId: input.locationId,
    toLocationId: input.kind === 'transfer' ? input.toLocationId : null,
    docDate: input.docDate,
    reason: input.kind === 'writeoff' ? input.reason : null,
    fullCount: input.kind === 'count' && input.fullCount,
    note: input.note,
  }
}

/** The permission is in the document's kind, so it is checked here rather than on the route. */
function need(actor: Actor, kind: StockDocKind, action: 'view' | 'manage' | 'post') {
  if (!can(actor, `${STOCK_DOC_PERMISSION[kind]}.${action}`)) {
    throw AppError.forbidden()
  }
}

function assertStatus(doc: StockDocument, wanted: StockDocStatus) {
  if (doc.status !== wanted) {
    throw AppError.conflict(
      'WRONG_STATUS',
      `Bu amal faqat «${STOCK_DOC_STATUS_LABELS[wanted]}» holatidagi hujjatda bajariladi. Hujjat holati: ${STOCK_DOC_STATUS_LABELS[doc.status]}`,
    )
  }
}

function throwIfAny(fields: Record<string, string>, message?: string) {
  if (Object.keys(fields).length) {
    throw AppError.validation(fields, message)
  }
}

/** The two halves of moving a piece: out of one place, into another. Either may be nowhere. */
function move(
  kind: Movement['kind'],
  doc: StockDocument,
  lineId: string,
  from: string | null,
  to: string | null,
  piece: Piece,
): Movement[] {
  const base = {
    kind,
    docDate: doc.docDate,
    documentType: doc.kind,
    documentId: doc.id,
    lineId,
    batchId: piece.batchId,
    variantId: piece.variantId,
  }
  const movements: Movement[] = []
  if (from) {
    movements.push({ ...base, locationId: from, qty: -piece.qty, costUsd: -piece.costUsd, costUzs: -piece.costUzs })
  }
  if (to) {
    movements.push({ ...base, locationId: to, qty: piece.qty, costUsd: piece.costUsd, costUzs: piece.costUzs })
  }
  return movements
}

/**
 * `units` (in thousandths) of a piece, with their share of its value. When
 * the rest of the piece was already split off, this part takes what is left,
 * so the two parts add up to the piece exactly.
 */
function part(piece: Piece, units: number, other?: Piece): Piece {
  const whole = scaled(piece.qty)
  if (other) {
    return {
      ...piece,
      qty: unscaled(units),
      costUsd: piece.costUsd - other.costUsd,
      costUzs: piece.costUzs - other.costUzs,
    }
  }
  const of = (cost: number) => (units === whole ? cost : Math.round((cost * units) / whole))
  return { ...piece, qty: unscaled(units), costUsd: of(piece.costUsd), costUzs: of(piece.costUzs) }
}
