import {
  productInputSchema,
  receiptInputSchema,
  searchKey,
  type ImportResult,
  type ImportRow,
  type ProductDto,
  type ReceiptImportInput,
  type ReceiptLineInput,
} from '@erp/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Attribute, AttributeValue, Brand, Category, Partner, Product } from '../../database/entities'
import type { Actor } from '../auth/actor'
import { ProductsService } from '../catalog/products.service'
import { RealtimeService } from '../realtime/realtime.service'
import { ReceiptsService } from './receipts.service'

/** Thrown to undo everything a trial run did, carrying what it found. */
class Undo extends Error {
  constructor(readonly result: ImportResult) {
    super('import undone')
  }
}

const same = (text: string) => searchKey(text)

/** One model as the file describes it: every row that shares its article, or its name and brand. */
interface Group {
  rows: ImportRow[]
}

interface Lists {
  attributes: Attribute[]
  values: AttributeValue[]
  brands: Brand[]
  categories: Category[]
  partners: Partner[]
}

/**
 * Turns a spreadsheet into a draft receipt, adding to the catalogue whatever
 * the file names that is not there yet: models, variants, colours, sizes,
 * brands, categories, suppliers.
 *
 * A trial run does exactly what the real one does and then undoes it, so
 * what the preview promises is what the import delivers. One bad row stops
 * the whole file: half a shipment in stock is worse than none.
 */
@Injectable()
export class ReceiptImportService {
  constructor(
    private readonly db: Db,
    private readonly products: ProductsService,
    private readonly receipts: ReceiptsService,
    private readonly realtime: RealtimeService,
  ) {}

  async run(actor: Actor, input: ReceiptImportInput): Promise<ImportResult> {
    try {
      return await this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
        const result = await this.import(em, actor, input)
        if (input.dryRun || result.problems.length) {
          // The receipt a trial run made is undone with the rest; it has no id to follow.
          throw new Undo({ ...result, receiptId: null, receiptNumber: null })
        }
        afterCommit(() =>
          this.realtime.changed(actor.orgId, [
            'receipts',
            'products',
            'brands',
            'categories',
            'attributes',
            'partners',
          ]),
        )
        return result
      })
    } catch (error) {
      if (error instanceof Undo) {
        return error.result
      }
      throw error
    }
  }

  private async import(em: EntityManager, actor: Actor, input: ReceiptImportInput): Promise<ImportResult> {
    const problems = new Map<number, string[]>()
    const problem = (rows: ImportRow[], message: string) => {
      for (const row of rows) {
        const list = problems.get(row.row) ?? []
        if (!list.includes(message)) {
          list.push(message)
        }
        problems.set(row.row, list)
      }
    }

    const [earlier]: { number: string }[] = await em.query(
      `SELECT number FROM receipts WHERE source_hash = $1 AND status <> 'cancelled' ORDER BY created_at LIMIT 1`,
      [input.fileHash],
    )
    const result: ImportResult = {
      receiptId: null,
      receiptNumber: null,
      duplicateOf: earlier?.number ?? null,
      rows: input.rows.length,
      qty: input.rows.reduce((sum, row) => sum + Math.round(row.qty * 1000), 0) / 1000,
      newProducts: [],
      newVariants: 0,
      newValues: [],
      newBrands: [],
      newCategories: [],
      newSuppliers: [],
      problems: [],
    }

    const lists: Lists = {
      attributes: await em.find(Attribute, { order: { sortOrder: 'ASC', name: 'ASC' } }),
      values: await em.find(AttributeValue, { order: { sortOrder: 'ASC', name: 'ASC' } }),
      brands: await em.find(Brand),
      categories: await em.find(Category, { order: { sortOrder: 'ASC', name: 'ASC' } }),
      partners: await em.find(Partner),
    }

    // ── Rows into models ──
    const groups = new Map<string, Group>()
    for (const row of input.rows) {
      const key = row.sku ? `sku:${row.sku.toLowerCase()}` : `name:${same(row.name)}|${same(row.brand ?? '')}`
      const group = groups.get(key) ?? { rows: [] }
      groups.set(key, group)
      group.rows.push(row)
    }

    const variantOf = new Map<number, string>()
    for (const { rows } of groups.values()) {
      const [first] = rows
      const existing = await this.findProduct(em, first)
      if (existing === 'ambiguous') {
        problem(rows, 'Shu nomli bir nechta tovar bor. Qaysi biri ekanini artikul ustuni bilan ko‘rsating')
        continue
      }

      // The axes: the model's own if it exists, otherwise whatever the rows give.
      const axes: Attribute[] = []
      if (existing) {
        for (const axisId of [existing.axis1Id, existing.axis2Id, existing.axis3Id]) {
          const attribute = lists.attributes.find((item) => item.id === axisId)
          if (attribute) {
            axes.push(attribute)
          }
        }
        const unreadable = axes.find((attribute) => attribute.kind === 'other')
        if (unreadable) {
          problem(rows, `«${existing.name}» tovarining «${unreadable.name}» xususiyati faylda yo‘q`)
          continue
        }
        if (!axes.some((attribute) => attribute.kind === 'color') && rows.some((row) => row.color)) {
          problem(rows, `«${existing.name}» tovarida rang yo‘q, faylda esa rang yozilgan`)
          continue
        }
        if (!axes.some((attribute) => attribute.kind === 'size') && rows.some((row) => row.size)) {
          problem(rows, `«${existing.name}» tovarida o‘lcham yo‘q, faylda esa o‘lcham yozilgan`)
          continue
        }
      } else {
        if (rows.some((row) => row.color)) {
          axes.push(await this.colorAttribute(em, actor, lists))
        }
        if (rows.some((row) => row.size)) {
          axes.push(
            await this.sizeAttribute(
              em,
              actor,
              lists,
              rows.flatMap((row) => (row.size ? [row.size] : [])),
            ),
          )
        }
      }

      // Each row's place in the model: one value per axis.
      const combos: { key: string; valueIds: string[]; rows: ImportRow[] }[] = []
      let complete = true
      for (const row of rows) {
        const valueIds: string[] = []
        for (const attribute of axes) {
          const name = attribute.kind === 'color' ? row.color : row.size
          if (!name) {
            problem([row], `${attribute.kind === 'color' ? 'Rang' : 'O‘lcham'} yozilmagan`)
            complete = false
            continue
          }
          valueIds.push(await this.value(em, actor, lists, attribute, name, result))
        }
        const key = valueIds.join('|')
        const combo = combos.find((item) => item.key === key)
        if (combo) {
          combo.rows.push(row)
        } else {
          combos.push({ key, valueIds, rows: [row] })
        }
      }
      if (!complete) {
        continue
      }

      const barcodesOf = (combo: (typeof combos)[number]) => [
        ...new Set(combo.rows.flatMap((row) => (row.barcode ? [row.barcode] : []))),
      ]
      let saved: ProductDto
      // The variants as they are sent, each with the rows it came from: where a refusal about one of them is shown.
      let sent: ((typeof combos)[number] | undefined)[] = combos
      try {
        if (existing) {
          const current = await this.products.getIn(em, existing.id)
          const comboOf = (variant: { valueIds: string[] }) =>
            combos.find((combo) => combo.key === variant.valueIds.join('|'))
          const fresh = combos.filter((combo) => !current.variants.some((variant) => comboOf(variant) === combo))
          sent = [...current.variants.map(comboOf), ...fresh]
          const variants = [
            ...current.variants.map((variant) => {
              const combo = comboOf(variant)
              return { ...variant, barcodes: [...new Set([...variant.barcodes, ...(combo ? barcodesOf(combo) : [])])] }
            }),
            ...fresh.map((combo) => ({ valueIds: combo.valueIds, barcodes: barcodesOf(combo) })),
          ]
          const changed =
            fresh.length > 0 ||
            variants.some((variant, index) => variant.barcodes.length !== current.variants[index]?.barcodes.length)
          saved = changed
            ? await this.products.updateIn(em, actor, existing.id, productInputSchema.parse({ ...current, variants }))
            : current
          result.newVariants += fresh.length
        } else {
          saved = await this.products.createIn(
            em,
            actor,
            productInputSchema.parse({
              name: first.name,
              sku: first.sku,
              brandId: await this.brand(em, actor, lists, first.brand, result),
              categoryId: await this.category(em, actor, lists, first.category, result),
              gender: first.gender,
              season: first.season,
              collectionYear: first.collectionYear,
              factoryCode: first.factoryCode,
              manufacturer: first.manufacturer,
              axisIds: axes.map((attribute) => attribute.id),
              variants: combos.map((combo) => ({ valueIds: combo.valueIds, barcodes: barcodesOf(combo) })),
            }),
          )
          result.newProducts.push(first.sku ? `${first.name} (${first.sku})` : first.name)
          result.newVariants += combos.length
        }
      } catch (error) {
        const fields = fieldsOf(error)
        if (!fields) {
          throw error
        }
        // A message about one variant belongs to the rows of that variant; anything else to the model's first row.
        for (const [path, message] of Object.entries(fields)) {
          const index = /^variants\.(\d+)\./.exec(path)?.[1]
          const combo = index === undefined ? undefined : sent[Number(index)]
          problem(combo ? combo.rows : [first], message)
        }
        continue
      }

      for (const combo of combos) {
        const variant = saved.variants.find((item) => item.valueIds.join('|') === combo.key)
        combo.rows.forEach((row) => variantOf.set(row.row, (variant as ProductDto['variants'][number]).id))
      }
    }

    // ── Suppliers ──
    const supplierOf = new Map<number, string | null>()
    for (const row of input.rows) {
      supplierOf.set(row.row, row.supplier ? await this.supplier(em, actor, lists, row.supplier, result) : null)
    }
    // One supplier for the whole file goes on the receipt itself rather than on every line.
    const named = [...new Set([...supplierOf.values()].filter((id): id is string => !!id))]
    const everyRowNamed = input.rows.every((row) => supplierOf.get(row.row))
    const receiptSupplier = input.supplierId ?? (named.length === 1 && everyRowNamed ? named[0] : null)

    result.problems = [...problems.entries()].sort(([a], [b]) => a - b).map(([row, list]) => ({ row, problems: list }))
    if (result.problems.length) {
      return result
    }

    const lines: ReceiptLineInput[] = input.rows.map((row) => {
      const supplierId = supplierOf.get(row.row) ?? null
      return {
        variantId: variantOf.get(row.row) as string,
        supplierId: supplierId === receiptSupplier ? null : supplierId,
        qty: row.qty,
        price: row.price,
        extra: row.extra,
        retailPrice: row.retailPrice,
        wholesalePrice: row.wholesalePrice,
        // A sheet has columns for the two; the others are set on the receipt's own screen.
        otherPrices: {},
      }
    })
    const receipt = await this.receipts.createIn(
      em,
      actor,
      receiptInputSchema.parse({
        locationId: input.locationId,
        supplierId: receiptSupplier,
        docDate: input.docDate,
        currency: input.currency,
        usdRate: input.usdRate,
        uzsRate: input.uzsRate,
        extraCurrency: input.extraCurrency,
        note: input.note,
        lines,
        expenses: [],
      }),
      { file: input.fileName, hash: input.fileHash },
    )
    result.receiptId = receipt.id
    result.receiptNumber = receipt.number
    return result
  }

  /** The model a row means: by article when it has one, by name otherwise. */
  private async findProduct(em: EntityManager, row: ImportRow): Promise<Product | null | 'ambiguous'> {
    if (row.sku) {
      return em.createQueryBuilder(Product, 'p').where('lower(p.sku) = lower(:sku)', { sku: row.sku }).getOne()
    }
    const found = await em
      .createQueryBuilder(Product, 'p')
      .where('lower(p.name) = lower(:name)', { name: row.name })
      .limit(2)
      .getMany()
    return found.length > 1 ? 'ambiguous' : (found[0] ?? null)
  }

  private async colorAttribute(em: EntityManager, actor: Actor, lists: Lists): Promise<Attribute> {
    return (
      lists.attributes.find((attribute) => attribute.kind === 'color' && attribute.isActive) ??
      this.attribute(em, actor, lists, 'Rang', 'color')
    )
  }

  /** The size scale that already knows the most of these sizes; a new one only when there is none at all. */
  private async sizeAttribute(em: EntityManager, actor: Actor, lists: Lists, sizes: string[]): Promise<Attribute> {
    const scales = lists.attributes.filter((attribute) => attribute.kind === 'size' && attribute.isActive)
    if (!scales.length) {
      return this.attribute(em, actor, lists, 'O‘lcham', 'size')
    }
    const wanted = new Set(sizes.map(same))
    const known = (scale: Attribute) =>
      lists.values.filter((value) => value.attributeId === scale.id && wanted.has(same(value.name))).length
    return scales.reduce((best, scale) => (known(scale) > known(best) ? scale : best), scales[0])
  }

  private async attribute(
    em: EntityManager,
    actor: Actor,
    lists: Lists,
    name: string,
    kind: Attribute['kind'],
  ): Promise<Attribute> {
    const created = await em.save(
      em.create(Attribute, { orgId: actor.orgId, name, kind, sortOrder: lists.attributes.length + 1, isActive: true }),
    )
    lists.attributes.push(created)
    return created
  }

  /** A value of an attribute by name, in any script or case; added at the end of the list if it is new. */
  private async value(
    em: EntityManager,
    actor: Actor,
    lists: Lists,
    attribute: Attribute,
    name: string,
    result: ImportResult,
  ): Promise<string> {
    const mine = lists.values.filter((value) => value.attributeId === attribute.id)
    const found = mine.find((value) => same(value.name) === same(name))
    if (found) {
      return found.id
    }
    const created = await em.save(
      em.create(AttributeValue, {
        orgId: actor.orgId,
        attributeId: attribute.id,
        name,
        hex: null,
        sortOrder: mine.reduce((max, value) => Math.max(max, value.sortOrder), 0) + 1,
        isActive: true,
      }),
    )
    lists.values.push(created)
    result.newValues.push(`${attribute.name}: ${name}`)
    return created.id
  }

  private async brand(
    em: EntityManager,
    actor: Actor,
    lists: Lists,
    name: string | null,
    result: ImportResult,
  ): Promise<string | null> {
    if (!name) {
      return null
    }
    const found = lists.brands.find((brand) => same(brand.name) === same(name))
    if (found) {
      return found.id
    }
    const created = await em.save(em.create(Brand, { orgId: actor.orgId, name, isActive: true }))
    lists.brands.push(created)
    result.newBrands.push(name)
    return created.id
  }

  private async category(
    em: EntityManager,
    actor: Actor,
    lists: Lists,
    name: string | null,
    result: ImportResult,
  ): Promise<string | null> {
    if (!name) {
      return null
    }
    const found = lists.categories.find((category) => same(category.name) === same(name))
    if (found) {
      return found.id
    }
    const created = await em.save(
      em.create(Category, {
        orgId: actor.orgId,
        name,
        parentId: null,
        axisIds: null,
        sortOrder: lists.categories.filter((category) => !category.parentId).length + 1,
        isActive: true,
      }),
    )
    lists.categories.push(created)
    result.newCategories.push(name)
    return created.id
  }

  private async supplier(
    em: EntityManager,
    actor: Actor,
    lists: Lists,
    name: string,
    result: ImportResult,
  ): Promise<string> {
    const found = lists.partners.find((partner) => same(partner.name) === same(name))
    if (found) {
      if (!found.isSupplier) {
        await em.update(Partner, found.id, { isSupplier: true })
        found.isSupplier = true
      }
      return found.id
    }
    const created = await em.save(
      em.create(Partner, {
        orgId: actor.orgId,
        name,
        phone: null,
        isSupplier: true,
        isBuyer: false,
        note: null,
        isActive: true,
        searchKey: searchKey(name),
      }),
    )
    lists.partners.push(created)
    result.newSuppliers.push(name)
    return created.id
  }
}

/** The per-field messages of a validation failure, from the service or from the contract. */
function fieldsOf(error: unknown): Record<string, string> | null {
  if (error instanceof AppError) {
    const body = error.getResponse() as { error?: { fields?: Record<string, string>; message?: string } }
    return body.error?.fields ?? { '': body.error?.message ?? 'Xatolik' }
  }
  if (error instanceof Error && error.name === 'ZodError') {
    const issues = (error as unknown as { issues: { path: (string | number)[]; message: string }[] }).issues
    return Object.fromEntries(issues.map((issue) => [issue.path.join('.'), issue.message]))
  }
  return null
}
