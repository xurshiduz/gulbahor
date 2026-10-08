import {
  formatMoney,
  tillCurrencies,
  internalBarcode,
  normalizeEpc,
  variantLabel,
  type AxisSummary,
  type Page,
  type PriceDto,
  type PriceInput,
  type ProductDto,
  type ProductInput,
  type ProductListItemDto,
  type ProductListQuery,
  type VariantInput,
  type VariantLookupDto,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import { In, IsNull, type EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch, applySort } from '../../common/listing'
import { Db } from '../../database/db.service'
import {
  Attribute,
  AttributeValue,
  Brand,
  Category,
  Price,
  PriceType,
  Product,
  ProductVariant,
  VariantBarcode,
} from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'
import { nextNumbers } from './counters'
import { ProductImagesService } from './product-images.service'
import { reindexProducts } from './product-index'

const SORTABLE = { name: 'p.name', sku: 'p.sku', category: 'c.name', brand: 'b.name', createdAt: 'p.createdAt' }

/** The category and everything under it. */
const CATEGORY_TREE = `p.category_id IN (
  WITH RECURSIVE tree AS (
    SELECT id FROM categories WHERE id = :categoryId
    UNION ALL
    SELECT k.id FROM categories k JOIN tree ON k.parent_id = tree.id
  )
  SELECT id FROM tree
)`

const VALUE_JOINS = `
  LEFT JOIN attribute_values a1 ON a1.id = v.value1_id
  LEFT JOIN attribute_values a2 ON a2.id = v.value2_id
  LEFT JOIN attribute_values a3 ON a3.id = v.value3_id`

const VALUE_NAMES = `array_remove(ARRAY[a1.name, a2.name, a3.name], NULL)`

/** History never lists more single price or barcode changes than this for one save. */
const AUDIT_DETAIL_LIMIT = 30

type Changes = Record<string, [unknown, unknown]>

interface Described {
  name: string
  sku: string
  category: string | null
  brand: string | null
  gender: string | null
  season: string | null
  collectionYear: number | null
  material: string | null
  originCountry: string | null
  unit: string
  weightG: number | null
  mxikCode: string | null
  description: string | null
  factoryCode: string | null
  manufacturer: string | null
  axes: string[]
  isActive: boolean
}

const AUDITED: (keyof Described & string)[] = [
  'name',
  'sku',
  'category',
  'brand',
  'gender',
  'season',
  'collectionYear',
  'material',
  'originCountry',
  'unit',
  'weightG',
  'mxikCode',
  'description',
  'factoryCode',
  'manufacturer',
  'axes',
]

interface References {
  attributes: Attribute[]
  values: Map<string, AttributeValue>
  priceTypes: Map<string, PriceType>
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly images: ProductImagesService,
  ) {}

  async list(actor: Actor, query: ProductListQuery): Promise<Page<ProductListItemDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em
        .createQueryBuilder(Product, 'p')
        .leftJoin(Category, 'c', 'c.id = p.categoryId')
        .leftJoin(Brand, 'b', 'b.id = p.brandId')
        .addSelect('c.name', 'category_name')
        .addSelect('b.name', 'brand_name')
        .addSelect(
          '(SELECT count(*)::int FROM product_variants v WHERE v.product_id = p.id AND v.is_active)',
          'variant_count',
        )

      if (query.status !== 'all') qb.andWhere('p.isActive = :active', { active: query.status === 'active' })
      if (query.categoryId) qb.andWhere(CATEGORY_TREE, { categoryId: query.categoryId })
      if (query.brandId) qb.andWhere('p.brandId = :brandId', { brandId: query.brandId })
      if (query.season) qb.andWhere('p.season = :season', { season: query.season })
      if (query.gender) qb.andWhere('p.gender = :gender', { gender: query.gender })
      applySearch(qb, 'p.search_key', query.q)
      applySort(qb, SORTABLE, query.sort, query.order, 'name')
      qb.addOrderBy('p.id', 'ASC')

      const total = await qb.getCount()
      const { entities, raw } = await qb
        .offset((query.page - 1) * query.size)
        .limit(query.size)
        .getRawAndEntities()

      const ids = entities.map((product) => product.id)
      const axes = await this.axisSummaries(em, ids)
      const retail = await this.retailPrices(em, ids)
      const faces = await this.images.faces(em, ids)

      return {
        items: entities.map((product, index) => ({
          id: product.id,
          sku: product.sku,
          name: product.name,
          categoryId: product.categoryId,
          categoryName: raw[index].category_name,
          brandId: product.brandId,
          brandName: raw[index].brand_name,
          season: product.season,
          collectionYear: product.collectionYear,
          variantCount: raw[index].variant_count,
          axes: axes.get(product.id) ?? [],
          retailPrice: retail.get(product.id) ?? null,
          image: faces.get(product.id) ?? null,
          isActive: product.isActive,
          createdAt: product.createdAt.toISOString(),
        })),
        total,
        page: query.page,
        size: query.size,
      }
    })
  }

  async get(actor: Actor, id: string): Promise<ProductDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => this.load(em, id))
  }

  /** Which variant a scanned barcode, a typed article or a read RFID tag belongs to. */
  async lookup(actor: Actor, code: string): Promise<VariantLookupDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const epc = normalizeEpc(code)
      if (epc) {
        const tagged: { product_id: string; variant_id: string; name: string; sku: string; value_names: string[] }[] =
          await em.query(
            `SELECT p.id AS product_id, v.id AS variant_id, p.name, v.sku, ${VALUE_NAMES} AS value_names
             FROM rfid_units u
             JOIN product_variants v ON v.id = u.variant_id
             JOIN products p ON p.id = v.product_id
             ${VALUE_JOINS}
             WHERE u.epc = $1 AND u.status <> 'void'`,
            [epc],
          )
        if (tagged[0]) {
          const [unit] = tagged
          return {
            productId: unit.product_id,
            variantId: unit.variant_id,
            productName: unit.name,
            sku: unit.sku,
            label: variantLabel(unit.value_names),
            epc,
          }
        }
      }
      const rows: { product_id: string; variant_id: string; name: string; sku: string; value_names: string[] }[] =
        await em.query(
          `SELECT p.id AS product_id, v.id AS variant_id, p.name, v.sku, ${VALUE_NAMES} AS value_names
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         ${VALUE_JOINS}
         LEFT JOIN variant_barcodes c ON c.variant_id = v.id AND c.code = $1
         WHERE c.id IS NOT NULL OR lower(v.sku) = lower($1) OR lower(p.sku) = lower($1)
         ORDER BY (c.id IS NOT NULL) DESC, (lower(v.sku) = lower($1)) DESC, v.created_at
         LIMIT 1`,
          [code],
        )
      if (!rows[0]) {
        throw AppError.notFound(epc ? 'Bu RFID belgi tizimda yo‘q' : 'Bu kod bilan tovar topilmadi')
      }
      const [row] = rows
      return {
        productId: row.product_id,
        variantId: row.variant_id,
        productName: row.name,
        sku: row.sku,
        label: variantLabel(row.value_names),
      }
    })
  }

  async create(actor: Actor, input: ProductInput): Promise<ProductDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      afterCommit(() => this.realtime.changed(actor.orgId, ['products']))
      return this.createIn(em, actor, input)
    })
  }

  async update(actor: Actor, id: string, input: ProductInput): Promise<ProductDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      afterCommit(() => this.realtime.changed(actor.orgId, ['products']))
      return this.updateIn(em, actor, id, input)
    })
  }

  /** `create` inside a transaction the caller already has: an import makes many models in one. */
  async createIn(em: EntityManager, actor: Actor, input: ProductInput): Promise<ProductDto> {
    const references = await this.resolve(em, input)
    const sku = input.sku ? await this.assertSkuFree(em, input.sku) : await this.nextSku(em, actor.orgId)

    const product = await em.save(
      em.create(Product, {
        orgId: actor.orgId,
        ...scalars(input),
        sku,
        variantSeq: 0,
        isActive: true,
        searchKey: '',
      }),
    )
    await this.saveVariants(em, actor, product, product.sku, input, [], references)
    if (can(actor, 'products.prices')) {
      await this.savePrices(em, actor, product.id, null, input.prices, [], references, '')
    }
    await reindexProducts(em, [product.id])

    await this.audit.record(em, actor.orgId, actor, {
      action: 'product.create',
      entity: 'product',
      entityId: product.id,
      summary: `${product.name} (${product.sku}), ${input.variants.length} ta variant`,
    })
    return this.load(em, product.id)
  }

  /** `update` inside a transaction the caller already has. */
  async updateIn(em: EntityManager, actor: Actor, id: string, input: ProductInput): Promise<ProductDto> {
    const before = await this.find(em, id)
    const describedBefore = await this.describe(em, before)
    const references = await this.resolve(em, input)
    // An article left empty on an existing model means "keep it".
    const sku =
      input.sku && input.sku.toLowerCase() !== before.sku.toLowerCase()
        ? await this.assertSkuFree(em, input.sku, id)
        : (input.sku ?? before.sku)

    await em.update(Product, id, { ...scalars(input), sku })
    const product = await this.find(em, id)
    const existing = await em.findBy(ProductVariant, { productId: id })
    const variantChanges = await this.saveVariants(em, actor, product, before.sku, input, existing, references)

    let priceChanges: Changes = {}
    if (can(actor, 'products.prices')) {
      const current = await em.findBy(Price, { productId: id, variantId: IsNull(), locationId: IsNull() })
      priceChanges = await this.savePrices(em, actor, id, null, input.prices, current, references, '')
    }
    await reindexProducts(em, [id])

    await this.audit.record(em, actor.orgId, actor, {
      action: 'product.update',
      entity: 'product',
      entityId: id,
      summary: `${product.name} (${product.sku})`,
      changes: limit({
        ...diff(describedBefore, await this.describe(em, product), AUDITED),
        ...priceChanges,
        ...variantChanges,
      }),
    })
    return this.load(em, id)
  }

  /** A model as the API returns it, read inside the caller's transaction. */
  async getIn(em: EntityManager, id: string): Promise<ProductDto> {
    return this.load(em, id)
  }

  async setActive(actor: Actor, id: string, active: boolean): Promise<ProductDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      if (before.isActive !== active) {
        await em.update(Product, id, { isActive: active })
        await this.audit.record(em, actor.orgId, actor, {
          action: active ? 'product.restore' : 'product.archive',
          entity: 'product',
          entityId: id,
          summary: `${before.name} (${before.sku})`,
          changes: { isActive: [before.isActive, active] },
        })
        afterCommit(() => this.realtime.changed(actor.orgId, ['products']))
      }
      return this.load(em, id)
    })
  }

  /** Removes a model entered by mistake. Once anything points at it, the database refuses and it can only be archived. */
  async remove(actor: Actor, id: string): Promise<void> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const product = await this.find(em, id)
      // Its photographs go with it: the rows by themselves, the files once the model is gone for good.
      const imageIds = await this.images.idsOf(em, id)
      await em.delete(Product, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'product.delete',
        entity: 'product',
        entityId: id,
        summary: `${product.name} (${product.sku})`,
      })
      afterCommit(() => {
        this.realtime.changed(actor.orgId, ['products'])
        return this.images.discard(actor.orgId, imageIds)
      })
    })
  }

  // ───────────────────────────── Reading ─────────────────────────────

  private async find(em: EntityManager, id: string): Promise<Product> {
    const product = await em.findOneBy(Product, { id })
    if (!product) {
      throw AppError.notFound('Tovar topilmadi')
    }
    return product
  }

  private async load(em: EntityManager, id: string): Promise<ProductDto> {
    const product = await this.find(em, id)
    const variants: {
      id: string
      value1_id: string | null
      value2_id: string | null
      value3_id: string | null
      sku: string
      is_active: boolean
      barcodes: string[]
    }[] = await em.query(
      `SELECT v.id, v.value1_id, v.value2_id, v.value3_id, v.sku, v.is_active,
                coalesce((SELECT array_agg(c.code ORDER BY c.sort_order, c.created_at) FROM variant_barcodes c WHERE c.variant_id = v.id), '{}') AS barcodes
         FROM product_variants v
         ${VALUE_JOINS}
         WHERE v.product_id = $1
         ORDER BY a1.sort_order NULLS FIRST, a1.name, a2.sort_order NULLS FIRST, a2.name, a3.sort_order NULLS FIRST, a3.name, v.created_at`,
      [id],
    )
    const prices = await em.findBy(Price, { productId: id, locationId: IsNull() })
    const priceDto = (price: Price): PriceDto => ({
      priceTypeId: price.priceTypeId,
      amount: price.amount,
      currency: price.currency,
    })

    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      categoryId: product.categoryId,
      brandId: product.brandId,
      gender: product.gender,
      season: product.season,
      collectionYear: product.collectionYear,
      material: product.material,
      originCountry: product.originCountry,
      unit: product.unit,
      weightG: product.weightG,
      mxikCode: product.mxikCode,
      description: product.description,
      factoryCode: product.factoryCode,
      manufacturer: product.manufacturer,
      axisIds: axisIdsOf(product),
      variants: variants.map((variant) => ({
        id: variant.id,
        valueIds: [variant.value1_id, variant.value2_id, variant.value3_id].filter((value): value is string => !!value),
        sku: variant.sku,
        barcodes: variant.barcodes,
        isActive: variant.is_active,
        prices: prices.filter((price) => price.variantId === variant.id).map(priceDto),
      })),
      prices: prices.filter((price) => !price.variantId).map(priceDto),
      images: (await this.images.of(em, [id])).get(id) ?? [],
      isActive: product.isActive,
      createdAt: product.createdAt.toISOString(),
    }
  }

  /** For each model, its axes with the values its active variants use, in list order. */
  private async axisSummaries(em: EntityManager, productIds: string[]): Promise<Map<string, AxisSummary[]>> {
    const result = new Map<string, AxisSummary[]>()
    if (!productIds.length) {
      return result
    }
    const rows: {
      product_id: string
      attribute_id: string
      attribute_name: string
      kind: AxisSummary['kind']
      id: string
      name: string
      hex: string | null
    }[] = await em.query(
      `SELECT v.product_id, a.id AS attribute_id, a.name AS attribute_name, a.kind, av.id, av.name, av.hex
         FROM product_variants v
         CROSS JOIN LATERAL (VALUES (1, v.value1_id), (2, v.value2_id), (3, v.value3_id)) AS x (position, value_id)
         JOIN attribute_values av ON av.id = x.value_id
         JOIN attributes a ON a.id = av.attribute_id
         WHERE v.product_id = ANY($1) AND v.is_active
         GROUP BY v.product_id, x.position, a.id, av.id
         ORDER BY v.product_id, x.position, av.sort_order, av.name`,
      [productIds],
    )
    for (const row of rows) {
      const axes = result.get(row.product_id) ?? []
      result.set(row.product_id, axes)
      let axis = axes.find((item) => item.attributeId === row.attribute_id)
      if (!axis) {
        axis = { attributeId: row.attribute_id, name: row.attribute_name, kind: row.kind, values: [] }
        axes.push(axis)
      }
      axis.values.push({ id: row.id, name: row.name, hex: row.hex })
    }
    return result
  }

  private async retailPrices(
    em: EntityManager,
    productIds: string[],
  ): Promise<Map<string, NonNullable<ProductListItemDto['retailPrice']>>> {
    if (!productIds.length) {
      return new Map()
    }
    const rows: { product_id: string; amount: string; currency: Price['currency'] }[] = await em.query(
      `SELECT pr.product_id, pr.amount, pr.currency
       FROM prices pr JOIN price_types t ON t.id = pr.price_type_id
       WHERE t.kind = 'retail' AND pr.variant_id IS NULL AND pr.location_id IS NULL AND pr.product_id = ANY($1)`,
      [productIds],
    )
    return new Map(rows.map((row) => [row.product_id, { amount: Number(row.amount), currency: row.currency }]))
  }

  /** The model as history words it: names instead of ids. */
  private async describe(em: EntityManager, product: Product): Promise<Described> {
    const axisIds = axisIdsOf(product)
    // One connection carries the whole transaction, so these run one after another.
    const category = product.categoryId ? await em.findOneBy(Category, { id: product.categoryId }) : null
    const brand = product.brandId ? await em.findOneBy(Brand, { id: product.brandId }) : null
    const attributes = axisIds.length ? await em.findBy(Attribute, { id: In(axisIds) }) : []
    return {
      name: product.name,
      sku: product.sku,
      category: category?.name ?? null,
      brand: brand?.name ?? null,
      gender: product.gender,
      season: product.season,
      collectionYear: product.collectionYear,
      material: product.material,
      originCountry: product.originCountry,
      unit: product.unit,
      weightG: product.weightG,
      mxikCode: product.mxikCode,
      description: product.description,
      factoryCode: product.factoryCode,
      manufacturer: product.manufacturer,
      axes: axisIds.map((id) => attributes.find((attribute) => attribute.id === id)?.name ?? ''),
      isActive: product.isActive,
    }
  }

  // ───────────────────────────── Writing ─────────────────────────────

  /** Checks that everything the input points at exists in this business and fits together. */
  private async resolve(em: EntityManager, input: ProductInput): Promise<References> {
    const fields: Record<string, string> = {}

    if (input.categoryId && !(await em.countBy(Category, { id: input.categoryId }))) {
      fields.categoryId = 'Kategoriya topilmadi'
    }
    if (input.brandId && !(await em.countBy(Brand, { id: input.brandId }))) {
      fields.brandId = 'Brend topilmadi'
    }

    const attributes = input.axisIds.length ? await em.findBy(Attribute, { id: In(input.axisIds) }) : []
    if (attributes.length !== input.axisIds.length) {
      fields.axisIds = 'Xususiyat topilmadi'
    }

    const valueIds = [...new Set(input.variants.flatMap((variant) => variant.valueIds))]
    const values = new Map(
      (valueIds.length ? await em.findBy(AttributeValue, { id: In(valueIds) }) : []).map((value) => [value.id, value]),
    )
    input.variants.forEach((variant, index) => {
      if (variant.valueIds.some((valueId, position) => values.get(valueId)?.attributeId !== input.axisIds[position])) {
        fields[`variants.${index}.valueIds`] = 'Qiymat modelning xususiyatiga tegishli emas'
      }
    })

    const priceTypeIds = [
      ...new Set(
        [...input.prices, ...input.variants.flatMap((variant) => variant.prices)].map((price) => price.priceTypeId),
      ),
    ]
    const priceTypes = new Map(
      (priceTypeIds.length ? await em.findBy(PriceType, { id: In(priceTypeIds) }) : []).map((type) => [type.id, type]),
    )
    if (priceTypes.size !== priceTypeIds.length) {
      fields.prices = 'Narx turi topilmadi'
    }

    if (Object.keys(fields).length) {
      throw AppError.validation(fields)
    }
    return {
      attributes: input.axisIds.map((id) => attributes.find((attribute) => attribute.id === id) as Attribute),
      values,
      priceTypes,
    }
  }

  private async assertSkuFree(em: EntityManager, sku: string, exceptId?: string): Promise<string> {
    const taken = await em
      .createQueryBuilder(Product, 'p')
      .where('lower(p.sku) = lower(:sku)', { sku })
      .andWhere(exceptId ? 'p.id <> :exceptId' : '1 = 1', { exceptId })
      .getOne()
    if (taken) {
      throw AppError.validation({ sku: `Bu artikul band: ${taken.name}` })
    }
    return sku
  }

  /** "1001", "1002", …: the next number no model uses yet. */
  private async nextSku(em: EntityManager, orgId: string): Promise<string> {
    for (;;) {
      const candidate = String(1000 + (await nextNumbers(em, orgId, 'product_sku')))
      const [{ taken }] = await em.query(`SELECT EXISTS (SELECT 1 FROM products WHERE lower(sku) = $1) AS taken`, [
        candidate,
      ])
      if (!taken) {
        return candidate
      }
    }
  }

  /**
   * Brings the model's variants in line with the input: variants left out
   * are removed, new ones are added, and every variant ends up with an
   * article and at least one barcode. Returns what history should say.
   */
  private async saveVariants(
    em: EntityManager,
    actor: Actor,
    product: Product,
    previousSku: string,
    input: ProductInput,
    existing: ProductVariant[],
    references: References,
  ): Promise<Changes> {
    const fields: Record<string, string> = {}
    const existingById = new Map(existing.map((variant) => [variant.id, variant]))
    input.variants.forEach((variant, index) => {
      if (variant.id && !existingById.has(variant.id)) {
        fields[`variants.${index}.id`] = 'Variant topilmadi'
      }
    })
    throwIfAny(fields)

    const keptIds = new Set(input.variants.map((variant) => variant.id).filter((id): id is string => !!id))
    const removed = existing.filter((variant) => !keptIds.has(variant.id))
    let removedLabels: string[] = []
    if (removed.length) {
      const removedIds = removed.map((variant) => variant.id)
      const rows: { value_names: string[] }[] = await em.query(
        `SELECT ${VALUE_NAMES} AS value_names FROM product_variants v ${VALUE_JOINS} WHERE v.id = ANY($1)`,
        [removedIds],
      )
      removedLabels = rows.map((row) => variantLabel(row.value_names))
      await em.delete(ProductVariant, removedIds)
    }

    // ── Articles ──
    const automatic = new RegExp(`^${escapeRegExp(previousSku)}-(\\d+)$`, 'i')
    const used = new Set<string>()
    const skus = input.variants.map((variant, index) => {
      let sku = variant.sku
      if (!sku && variant.id) {
        const current = (existingById.get(variant.id) as ProductVariant).sku
        // An automatic article follows its model when the model's article changes.
        const match = automatic.exec(current)
        sku = match && product.sku !== previousSku ? `${product.sku}-${match[1]}` : current
      }
      if (sku) {
        if (used.has(sku.toLowerCase())) {
          fields[`variants.${index}.sku`] = 'Bu artikul takrorlangan'
        }
        used.add(sku.toLowerCase())
      }
      return sku
    })
    const elsewhere = async (candidates: string[]): Promise<Set<string>> => {
      if (!candidates.length) {
        return new Set()
      }
      const rows: { sku: string }[] = await em.query(
        `SELECT lower(sku) AS sku FROM product_variants WHERE product_id <> $1 AND lower(sku) = ANY($2)`,
        [product.id, candidates.map((sku) => sku.toLowerCase())],
      )
      return new Set(rows.map((row) => row.sku))
    }
    const clashing = await elsewhere(skus.filter((sku): sku is string => !!sku))
    skus.forEach((sku, index) => {
      if (sku && clashing.has(sku.toLowerCase())) {
        fields[`variants.${index}.sku`] = 'Bu artikul boshqa tovarda bor'
      }
    })
    throwIfAny(fields)

    let sequence = product.variantSeq
    let pending = skus.flatMap((sku, index) => (sku ? [] : [index]))
    while (pending.length) {
      const candidates = pending.map(() => {
        let candidate: string
        do {
          candidate = `${product.sku}-${String(++sequence).padStart(2, '0')}`
        } while (used.has(candidate.toLowerCase()))
        used.add(candidate.toLowerCase())
        return candidate
      })
      const taken = await elsewhere(candidates)
      pending = pending.filter((index, position) => {
        if (taken.has(candidates[position].toLowerCase())) {
          return true
        }
        skus[index] = candidates[position]
        return false
      })
    }
    if (sequence !== product.variantSeq) {
      await em.update(Product, product.id, { variantSeq: sequence })
    }

    // ── Rows ──
    const row = (variant: VariantInput, index: number) => ({
      value1Id: variant.valueIds[0] ?? null,
      value2Id: variant.valueIds[1] ?? null,
      value3Id: variant.valueIds[2] ?? null,
      sku: skus[index] as string,
      isActive: variant.isActive,
    })

    // Two variants may trade articles in one save; parking the changed ones first keeps the unique index quiet.
    const renamed = input.variants
      .filter((variant, index) => variant.id && existingById.get(variant.id)?.sku !== skus[index])
      .map((variant) => variant.id)
    if (renamed.length) {
      await em.query(`UPDATE product_variants SET sku = '~' || id WHERE id = ANY($1)`, [renamed])
    }

    const ids: string[] = []
    const fresh: number[] = []
    for (const [index, variant] of input.variants.entries()) {
      if (!variant.id) {
        fresh.push(index)
        continue
      }
      ids[index] = variant.id
      const current = existingById.get(variant.id) as ProductVariant
      const next = row(variant, index)
      if (
        renamed.includes(variant.id) ||
        (Object.keys(next) as (keyof typeof next)[]).some((key) => current[key] !== next[key])
      ) {
        await em.update(ProductVariant, variant.id, next)
      }
    }
    if (fresh.length) {
      const inserted = await em.insert(
        ProductVariant,
        fresh.map((index) => ({
          orgId: actor.orgId,
          productId: product.id,
          searchKey: '',
          ...row(input.variants[index], index),
        })),
      )
      fresh.forEach((index, position) => {
        ids[index] = inserted.identifiers[position].id as string
      })
    }

    const barcodeChanges = await this.saveBarcodes(em, actor, product, input, ids, keptIds, fields)
    throwIfAny(fields)

    // ── Prices that differ from the model's ──
    let priceChanges: Changes = {}
    if (can(actor, 'products.prices')) {
      const current = keptIds.size ? await em.findBy(Price, { variantId: In([...keptIds]), locationId: IsNull() }) : []
      for (const [index, variant] of input.variants.entries()) {
        const label = variantLabel(
          variant.valueIds.map((valueId) => (references.values.get(valueId) as AttributeValue).name),
        )
        const changed = await this.savePrices(
          em,
          actor,
          product.id,
          ids[index],
          variant.prices,
          current.filter((price) => price.variantId === ids[index]),
          references,
          label ? ` · ${label}` : '',
        )
        // A new variant's own prices arrive with it; history lists the variant, not each price.
        if (variant.id) {
          priceChanges = { ...priceChanges, ...changed }
        }
      }
    }

    const labelOf = (variant: VariantInput) =>
      variantLabel(variant.valueIds.map((valueId) => (references.values.get(valueId) as AttributeValue).name))
    const changes: Changes = { ...barcodeChanges, ...priceChanges }
    if (removed.length) {
      changes.variantsRemoved = [summarize(removedLabels), null]
    }
    // A model's first variants are part of creating it, not a change to it.
    if (existing.length && fresh.length) {
      changes.variantsAdded = [null, summarize(fresh.map((index) => labelOf(input.variants[index])))]
    }
    const archived = input.variants.filter(
      (variant) => variant.id && existingById.get(variant.id)?.isActive && !variant.isActive,
    )
    const restored = input.variants.filter(
      (variant) => variant.id && !existingById.get(variant.id)?.isActive && variant.isActive,
    )
    if (archived.length) {
      changes.variantsArchived = [null, summarize(archived.map(labelOf))]
    }
    if (restored.length) {
      changes.variantsRestored = [null, summarize(restored.map(labelOf))]
    }
    return changes
  }

  /** Each variant keeps the codes it was given; one without any gets an in-store code. */
  private async saveBarcodes(
    em: EntityManager,
    actor: Actor,
    product: Product,
    input: ProductInput,
    variantIds: string[],
    existingIds: Set<string>,
    fields: Record<string, string>,
  ): Promise<Changes> {
    const wantedCodes = input.variants.flatMap((variant) => variant.barcodes)
    if (wantedCodes.length) {
      const clashes: { code: string; name: string; value_names: string[] }[] = await em.query(
        `SELECT c.code, p.name, ${VALUE_NAMES} AS value_names
         FROM variant_barcodes c
         JOIN product_variants v ON v.id = c.variant_id
         JOIN products p ON p.id = v.product_id
         ${VALUE_JOINS}
         WHERE c.code = ANY($1) AND v.product_id <> $2`,
        [wantedCodes, product.id],
      )
      for (const clash of clashes) {
        input.variants.forEach((variant, index) => {
          const position = variant.barcodes.indexOf(clash.code)
          if (position !== -1) {
            fields[`variants.${index}.barcodes.${position}`] =
              `Bu shtrix-kod «${[clash.name, ...clash.value_names].join(', ')}» da bor`
          }
        })
      }
      if (clashes.length) {
        return {}
      }
    }

    const current = variantIds.length ? await em.findBy(VariantBarcode, { variantId: In(variantIds) }) : []
    const wanted = input.variants.map((variant) => [...variant.barcodes])

    const bare = wanted.flatMap((codes, index) => (codes.length ? [] : [index]))
    const generated: string[] = []
    while (generated.length < bare.length) {
      const count = bare.length - generated.length
      const first = await nextNumbers(em, actor.orgId, 'barcode', count)
      const candidates = Array.from({ length: count }, (_, offset) => internalBarcode(first + offset))
      const taken: { code: string }[] = await em.query(`SELECT code FROM variant_barcodes WHERE code = ANY($1)`, [
        candidates,
      ])
      generated.push(...candidates.filter((code) => !taken.some((row) => row.code === code)))
    }
    bare.forEach((index, position) => {
      // A variant that already had codes and was sent none keeps them rather than getting a new one.
      const kept = current
        .filter((barcode) => barcode.variantId === variantIds[index])
        .sort((a, b) => a.sortOrder - b.sortOrder)
      wanted[index] =
        input.variants[index].id && kept.length && !input.variants[index].barcodes.length
          ? kept.map((barcode) => barcode.code)
          : [generated[position]]
    })

    const removedIds: string[] = []
    const removedCodes: string[] = []
    const added: { orgId: string; variantId: string; code: string; sortOrder: number }[] = []
    for (const [index, codes] of wanted.entries()) {
      const variantId = variantIds[index]
      const mine = current.filter((barcode) => barcode.variantId === variantId)
      for (const barcode of mine) {
        if (!codes.includes(barcode.code)) {
          removedIds.push(barcode.id)
          removedCodes.push(barcode.code)
        }
      }
      for (const [position, code] of codes.entries()) {
        const present = mine.find((barcode) => barcode.code === code)
        if (!present) {
          added.push({ orgId: actor.orgId, variantId, code, sortOrder: position })
        } else if (present.sortOrder !== position) {
          await em.update(VariantBarcode, present.id, { sortOrder: position })
        }
      }
    }
    if (removedIds.length) {
      await em.delete(VariantBarcode, removedIds)
    }
    if (added.length) {
      await em.insert(VariantBarcode, added)
    }

    // History tells of codes added to or taken from variants that were already there. A code moved between
    // two variants is a change of place, and a new variant's codes arrive with the variant.
    const addedCodes = added
      .filter((barcode) => existingIds.has(barcode.variantId) && !removedCodes.includes(barcode.code))
      .map((barcode) => barcode.code)
    const goneCodes = removedCodes.filter((code) => !added.some((barcode) => barcode.code === code))
    if (!addedCodes.length && !goneCodes.length) {
      return {}
    }
    return { barcodes: [summarize(goneCodes, ', '), summarize(addedCodes, ', ')] }
  }

  /**
   * Makes the prices of one scope (the model, or one variant) equal to
   * `wanted`. Returns the changes keyed the way history shows them.
   */
  private async savePrices(
    em: EntityManager,
    actor: Actor,
    productId: string,
    variantId: string | null,
    wanted: PriceInput[],
    current: Price[],
    references: References,
    suffix: string,
  ): Promise<Changes> {
    const changes: Changes = {}
    const title = (priceTypeId: string, known?: Map<string, string>) =>
      `Narx: ${references.priceTypes.get(priceTypeId)?.name ?? known?.get(priceTypeId) ?? '?'}${suffix}`
    const show = (price: { amount: number; currency: Price['currency'] }) => formatMoney(price.amount, price.currency)

    const dropped = current.filter((price) => !wanted.some((item) => item.priceTypeId === price.priceTypeId))
    if (dropped.length) {
      const names = new Map(
        (await em.findBy(PriceType, { id: In(dropped.map((price) => price.priceTypeId)) })).map((type) => [
          type.id,
          type.name,
        ]),
      )
      await em.delete(
        Price,
        dropped.map((price) => price.id),
      )
      dropped.forEach((price) => {
        changes[title(price.priceTypeId, names)] = [show(price), null]
      })
    }

    // Prices are what the till sells at: in the base, or in dollars beside it.
    if (wanted.some((item) => !tillCurrencies(actor.base).includes(item.currency))) {
      throw AppError.validation({ prices: 'Narx asosiy valyuta yoki dollarda bo‘ladi' })
    }
    for (const item of wanted) {
      const existing = current.find((price) => price.priceTypeId === item.priceTypeId)
      if (!existing) {
        await em.insert(Price, {
          orgId: actor.orgId,
          productId,
          variantId,
          locationId: null,
          ...item,
          updatedBy: actor.userId,
        })
        changes[title(item.priceTypeId)] = [null, show(item)]
      } else if (existing.amount !== item.amount || existing.currency !== item.currency) {
        await em.update(Price, existing.id, { amount: item.amount, currency: item.currency, updatedBy: actor.userId })
        changes[title(item.priceTypeId)] = [show(existing), show(item)]
      }
    }
    return changes
  }
}

function scalars(input: ProductInput) {
  return {
    name: input.name,
    categoryId: input.categoryId,
    brandId: input.brandId,
    gender: input.gender,
    season: input.season,
    collectionYear: input.collectionYear,
    material: input.material,
    originCountry: input.originCountry,
    unit: input.unit,
    weightG: input.weightG,
    mxikCode: input.mxikCode,
    description: input.description,
    factoryCode: input.factoryCode,
    manufacturer: input.manufacturer,
    axis1Id: input.axisIds[0] ?? null,
    axis2Id: input.axisIds[1] ?? null,
    axis3Id: input.axisIds[2] ?? null,
  }
}

function axisIdsOf(product: Product): string[] {
  return [product.axis1Id, product.axis2Id, product.axis3Id].filter((id): id is string => !!id)
}

function throwIfAny(fields: Record<string, string>) {
  if (Object.keys(fields).length) {
    throw AppError.validation(fields)
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** "Oq, S; Oq, M va yana 6 ta": a variant's own label has commas, so variants are set apart by semicolons. */
function summarize(items: string[], separator = '; '): string | null {
  if (!items.length) {
    return null
  }
  const shown = items.slice(0, 5).join(separator)
  return items.length > 5 ? `${shown} va yana ${items.length - 5} ta` : shown
}

/** Keeps one save's history readable: the first changes in full, the rest as a count. */
function limit(changes: Changes): Changes {
  const entries = Object.entries(changes)
  if (entries.length <= AUDIT_DETAIL_LIMIT) {
    return changes
  }
  return {
    ...Object.fromEntries(entries.slice(0, AUDIT_DETAIL_LIMIT)),
    more: [null, `yana ${entries.length - AUDIT_DETAIL_LIMIT} ta o‘zgarish`],
  }
}
