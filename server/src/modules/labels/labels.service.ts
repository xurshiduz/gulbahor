import {
  buildDesignZpl,
  buildLabelZpl,
  DEFAULT_LABEL_TEMPLATE,
  formatMoney,
  GENDER_LABELS,
  SEASON_LABELS,
  variantLabel,
  type CurrencyCode,
  type Gender,
  type LabelData,
  type LabelDesign,
  type LabelDesigns,
  type LabelValues,
  type Season,
  type LabelPrintInput,
  type LabelPrintResult,
  type ReceiptLabelsDto,
} from '@erp/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Organization, Receipt } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'
import { PrintQueueService } from './print-queue.service'
import { NEXT_EPC, receiptUnitCounts, settleReceiptUnits } from './units'

type Described = Omit<LabelData, 'epc' | 'copies'> & { values: LabelValues }

interface Unit {
  id: string
  epc: string
  variant_id: string
}

/**
 * Makes labels. A plain label is a barcode and a price, as many copies as
 * asked for. A tagged label is one of a kind: it stands for one piece, whose
 * code the printer writes to the chip, and that piece is remembered.
 */
@Injectable()
export class LabelsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly queue: PrintQueueService,
  ) {}

  /** For each variant of a receipt: how many pieces it has and how many of their labels are printed. */
  async receiptLabels(actor: Actor, receiptId: string): Promise<ReceiptLabelsDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      await this.receipt(em, actor, receiptId)
      const units = await receiptUnitCounts(em, receiptId)
      const printed: { variant_id: string; printed: number }[] = await em.query(
        `SELECT variant_id, count(*)::int AS printed FROM rfid_units
         WHERE receipt_id = $1 AND print_count > 0 AND status <> 'void' GROUP BY variant_id`,
        [receiptId],
      )
      const printedOf = new Map(printed.map((row) => [row.variant_id, row.printed]))
      return {
        receiptId,
        items: [...units].map(([variantId, count]) => ({
          variantId,
          units: count,
          printed: Math.min(printedOf.get(variantId) ?? 0, count),
        })),
      }
    })
  }

  async print(actor: Actor, input: LabelPrintInput): Promise<LabelPrintResult> {
    if (input.rfid && !actor.modules.includes('rfid')) {
      throw AppError.forbidden('RFID moduli yoqilmagan', 'MODULE_OFF')
    }
    const { result, agentId } = await this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const printer = input.printerId ? await this.queue.printer(em, input.printerId) : null
      if (input.rfid && printer && !printer.rfid) {
        throw AppError.validation({ printerId: 'Bu printer RFID chipga yoza olmaydi' })
      }

      const receipt = input.receiptId ? await this.lockReceipt(em, actor, input.receiptId) : null
      if (receipt?.status === 'cancelled') {
        throw AppError.conflict('RECEIPT_CANCELLED', 'Bekor qilingan kirimga etiketka chop etilmaydi')
      }
      const locationId = receipt?.locationId ?? input.locationId
      if (!receipt && locationId) {
        await this.assertPlace(em, actor, locationId)
      }

      const described = await this.describe(
        em,
        input.items.map((item) => item.variantId),
        locationId,
      )
      const fields: Record<string, string> = {}
      input.items.forEach((item, index) => {
        if (!described.has(item.variantId)) {
          fields[`items.${index}.variantId`] = 'Tovar topilmadi'
        }
      })
      throwIfAny(fields)
      const dataOf = (variantId: string): Described => {
        const data = described.get(variantId) as Described
        return input.withPrice ? data : { ...data, price: null, values: { ...data.values, price: undefined } }
      }
      const design = input.designId ? await this.design(em, actor.orgId, input.designId) : null

      let labels: (LabelData & { values: LabelValues })[]
      let count: number
      if (input.rfid) {
        const units = receipt
          ? await this.receiptUnits(em, actor, receipt, input)
          : await this.looseUnits(em, actor, locationId as string, input.items)
        if (!units.length) {
          throw AppError.conflict('NOTHING_TO_PRINT', 'Tanlangan etiketkalarning hammasi allaqachon chop etilgan')
        }
        await em.query(
          `UPDATE rfid_units SET print_count = print_count + 1, last_printed_at = now() WHERE id = ANY($1)`,
          [units.map((unit) => unit.id)],
        )
        labels = units.map((unit) => {
          const data = dataOf(unit.variant_id)
          return { ...data, epc: unit.epc, values: { ...data.values, tag: `#${unit.epc.slice(-6)}` } }
        })
        count = units.length
      } else {
        labels = input.items.map((item) => ({ ...dataOf(item.variantId), epc: null, copies: item.count }))
        count = input.items.reduce((sum, item) => sum + item.count, 0)
      }

      const format = { size: input.size, dpi: printer?.dpi ?? input.dpi }
      // Laid out the way the business set its labels.
      const org = await em.findOneByOrFail(Organization, { id: actor.orgId })
      const template = { ...DEFAULT_LABEL_TEMPLATE, ...org.settings.label }
      const dpi = printer?.dpi ?? input.dpi
      const zpl = labels
        .map((label) =>
          design
            ? buildDesignZpl(design, label.values, { dpi, epc: label.epc, copies: label.copies })
            : buildLabelZpl(label, format, template),
        )
        .join('\n')
      const what = `${count} ta ${input.rfid ? 'RFID ' : ''}etiketka`
      const title = receipt ? `${receipt.number}: ${what}` : what

      await this.audit.record(em, actor.orgId, actor, {
        action: 'labels.print',
        entity: receipt ? 'receipt' : undefined,
        entityId: receipt?.id,
        summary: printer ? `${title} → ${printer.name}` : `${title} (fayl)`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['labels', 'printjobs']))

      if (!printer) {
        const name = `etiketka-${receipt?.number ?? new Date().toISOString().slice(0, 10)}.zpl`
        return { result: { count, job: null, file: { name, zpl } } satisfies LabelPrintResult, agentId: null }
      }
      const job = await this.queue.enqueueIn(em, actor, printer, { title, labels: count, payload: zpl })
      return { result: { count, job, file: null } satisfies LabelPrintResult, agentId: printer.agentId }
    })

    if (agentId) {
      void this.queue.dispatch(actor.orgId, agentId)
    }
    return result
  }

  // ───────────────────────────── Pieces ─────────────────────────────

  /**
   * The pieces of a receipt to print: for each variant its first `count`,
   * made now if they do not exist yet. A piece keeps its code for good, so
   * printing again replaces a torn label rather than inventing a new piece.
   */
  private async receiptUnits(
    em: EntityManager,
    actor: Actor,
    receipt: Receipt,
    input: LabelPrintInput,
  ): Promise<Unit[]> {
    const has = await receiptUnitCounts(em, receipt.id)
    const fields: Record<string, string> = {}
    input.items.forEach((item, index) => {
      const units = has.get(item.variantId) ?? 0
      if (item.count > units) {
        fields[`items.${index}.count`] = units
          ? `Hujjatda bu tovardan ${units} dona bor`
          : 'Bu tovar hujjatda yo‘q: hujjatni saqlab, qayta urinib ko‘ring'
      }
    })
    throwIfAny(fields)

    const variantIds = input.items.map((item) => item.variantId)
    const counts = input.items.map((item) => item.count)
    await em.query(
      `INSERT INTO rfid_units (org_id, epc, variant_id, receipt_id, unit_no, location_id, status, created_by)
       SELECT $1, ${NEXT_EPC}, w.variant_id, $2, n, $3, 'ready', $4
       FROM unnest($5::uuid[], $6::int[]) AS w(variant_id, count)
       CROSS JOIN LATERAL generate_series(1, w.count) AS n
       WHERE NOT EXISTS (
         SELECT 1 FROM rfid_units u WHERE u.receipt_id = $2 AND u.variant_id = w.variant_id AND u.unit_no = n
       )`,
      [actor.orgId, receipt.id, receipt.locationId, actor.userId, variantIds, counts],
    )
    if (receipt.status === 'posted') {
      await settleReceiptUnits(em, receipt.id, receipt.locationId)
    }
    return em.query(
      `SELECT u.id, u.epc, u.variant_id
       FROM rfid_units u
       JOIN unnest($2::uuid[], $3::int[]) WITH ORDINALITY AS w(variant_id, count, position)
         ON w.variant_id = u.variant_id
       WHERE u.receipt_id = $1 AND u.unit_no <= w.count AND u.status <> 'void' AND ($4 = false OR u.print_count = 0)
       ORDER BY w.position, u.unit_no`,
      [receipt.id, variantIds, counts, input.onlyNew],
    )
  }

  /** New pieces for goods that are already on hand: tagging stock that came in before there were tags. */
  private async looseUnits(
    em: EntityManager,
    actor: Actor,
    locationId: string,
    items: LabelPrintInput['items'],
  ): Promise<Unit[]> {
    const units: Unit[] = await em.query(
      `INSERT INTO rfid_units (org_id, epc, variant_id, location_id, status, created_by)
       SELECT $1, ${NEXT_EPC}, w.variant_id, $2, 'in_stock', $3
       FROM unnest($4::uuid[], $5::int[]) AS w(variant_id, count)
       CROSS JOIN LATERAL generate_series(1, w.count) AS n
       RETURNING id, epc, variant_id`,
      [actor.orgId, locationId, actor.userId, items.map((item) => item.variantId), items.map((item) => item.count)],
    )
    const position = new Map(items.map((item, index) => [item.variantId, index]))
    return units.sort(
      (a, b) =>
        (position.get(a.variant_id) as number) - (position.get(b.variant_id) as number) || a.epc.localeCompare(b.epc),
    )
  }

  // ───────────────────────────── Reading ─────────────────────────────

  /** What goes on a label: the name, the colour and size, the article, the first barcode, the retail price. */
  private async describe(
    em: EntityManager,
    variantIds: string[],
    locationId: string | null,
  ): Promise<Map<string, Described>> {
    const rows: {
      id: string
      name: string
      sku: string
      value_names: string[]
      barcode: string | null
      price: { amount: number | string; currency: CurrencyCode } | null
      brand: string | null
      category: string | null
      season: Season | null
      gender: Gender | null
      origin_country: string | null
      collection_year: number | null
      material: string | null
      manufacturer: string | null
      color: string | null
      size: string | null
    }[] = await em.query(
      `SELECT v.id, p.name, v.sku, array_remove(ARRAY[a1.name, a2.name, a3.name], NULL) AS value_names,
              (SELECT b.name FROM brands b WHERE b.id = p.brand_id) AS brand,
              (SELECT c.name FROM categories c WHERE c.id = p.category_id) AS category,
              p.season, p.gender, p.origin_country, p.collection_year, p.material, p.manufacturer,
              (SELECT string_agg(av.name, ', ') FROM attribute_values av JOIN attributes at ON at.id = av.attribute_id
               WHERE av.id IN (v.value1_id, v.value2_id, v.value3_id) AND at.kind = 'color') AS color,
              (SELECT string_agg(av.name, ', ') FROM attribute_values av JOIN attributes at ON at.id = av.attribute_id
               WHERE av.id IN (v.value1_id, v.value2_id, v.value3_id) AND at.kind = 'size') AS size,
              (SELECT c.code FROM variant_barcodes c WHERE c.variant_id = v.id
               ORDER BY c.sort_order, c.created_at LIMIT 1) AS barcode,
              -- The most specific price wins: this variant here, this variant, this place, the model.
              (SELECT jsonb_build_object('amount', pr.amount, 'currency', pr.currency)
               FROM prices pr JOIN price_types t ON t.id = pr.price_type_id
               WHERE t.kind = 'retail' AND t.is_active AND pr.product_id = v.product_id
                 AND (pr.variant_id IS NULL OR pr.variant_id = v.id)
                 AND (pr.location_id IS NULL OR pr.location_id = $2::uuid)
               ORDER BY (pr.variant_id IS NOT NULL) DESC, (pr.location_id IS NOT NULL) DESC, t.sort_order
               LIMIT 1) AS price
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN attribute_values a1 ON a1.id = v.value1_id
       LEFT JOIN attribute_values a2 ON a2.id = v.value2_id
       LEFT JOIN attribute_values a3 ON a3.id = v.value3_id
       WHERE v.id = ANY($1)`,
      [variantIds, locationId],
    )
    const printedAt = new Date().toLocaleDateString('ru-RU')
    return new Map(
      rows.map((row) => {
        const price = row.price ? formatMoney(Number(row.price.amount), row.price.currency, { minor: 'auto' }) : null
        const details = variantLabel(row.value_names)
        // What a design may put on the label; a fact the goods do not have is left out, and so is its line.
        const values: LabelValues = {
          name: row.name,
          brand: row.brand ?? undefined,
          category: row.category ?? undefined,
          details: details || undefined,
          color: row.color ?? undefined,
          size: row.size ?? undefined,
          season: row.season ? SEASON_LABELS[row.season] : undefined,
          gender: row.gender ? GENDER_LABELS[row.gender] : undefined,
          country: row.origin_country ?? undefined,
          collection: row.collection_year ? String(row.collection_year) : undefined,
          material: row.material ?? undefined,
          manufacturer: row.manufacturer ?? undefined,
          sku: row.sku,
          price: price ?? undefined,
          barcode: row.barcode ?? row.sku,
          printedAt,
        }
        return [row.id, { name: row.name, details, sku: row.sku, barcode: row.barcode, price, values }]
      }),
    )
  }

  /** The business's label designs. */
  async designs(actor: Actor): Promise<LabelDesigns> {
    return this.db.tenant(actor.orgId, ({ em }) => this.designsIn(em, actor.orgId))
  }

  async setDesigns(actor: Actor, input: LabelDesigns): Promise<LabelDesigns> {
    const ids = new Set(input.designs.map((design) => design.id))
    if (ids.size !== input.designs.length) {
      throw AppError.validation({ designs: 'Shablon takrorlangan' })
    }
    const saved: LabelDesigns = {
      designs: input.designs,
      defaultId: input.defaultId && ids.has(input.defaultId) ? input.defaultId : (input.designs[0]?.id ?? null),
    }
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.designsIn(em, actor.orgId)
      await em.query(`UPDATE organizations SET label_designs = $2 WHERE id = $1`, [actor.orgId, JSON.stringify(saved)])
      const names = (list: LabelDesigns) => list.designs.map((design) => design.name).join(', ')
      await this.audit.record(em, actor.orgId, actor, {
        action: 'org.label',
        entity: 'org',
        entityId: actor.orgId,
        summary: 'Etiketka shablonlari',
        changes: { designs: [names(before), names(saved)] },
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['labels']))
      return saved
    })
  }

  private async designsIn(em: EntityManager, orgId: string): Promise<LabelDesigns> {
    const [row]: { label_designs: LabelDesigns }[] = await em.query(
      `SELECT label_designs FROM organizations WHERE id = $1`,
      [orgId],
    )
    return row?.label_designs ?? { designs: [], defaultId: null }
  }

  private async design(em: EntityManager, orgId: string, id: string): Promise<LabelDesign> {
    const design = (await this.designsIn(em, orgId)).designs.find((item) => item.id === id)
    if (!design) {
      throw AppError.validation({ designId: 'Etiketka shabloni topilmadi' })
    }
    return design
  }

  private async receipt(em: EntityManager, actor: Actor, id: string): Promise<Receipt> {
    const receipt = await em.findOneBy(Receipt, { id })
    if (!receipt || !mayWorkAt(actor, receipt.locationId)) {
      throw AppError.notFound('Kirim hujjati topilmadi')
    }
    return receipt
  }

  /** Two people printing one receipt at once must not both make its pieces. */
  private async lockReceipt(em: EntityManager, actor: Actor, id: string): Promise<Receipt> {
    await em.query(`SELECT 1 FROM receipts WHERE id = $1 FOR UPDATE`, [id])
    return this.receipt(em, actor, id)
  }

  private async assertPlace(em: EntityManager, actor: Actor, locationId: string) {
    const [place] = await em.query(`SELECT 1 FROM locations WHERE id = $1 AND kind <> 'transit' AND is_active`, [
      locationId,
    ])
    if (!place || !mayWorkAt(actor, locationId)) {
      throw AppError.validation({ locationId: 'Joy topilmadi' })
    }
  }
}

const mayWorkAt = (actor: Actor, locationId: string) => actor.allLocations || actor.locationIds.includes(locationId)

function throwIfAny(fields: Record<string, string>) {
  const first = Object.values(fields)[0]
  if (first) {
    throw AppError.validation(fields, first)
  }
}
