import {
  baseWorth,
  exchange,
  formatMoney,
  NO_ROUNDING,
  pickMarkup,
  roundPrice,
  REPRICE_PREVIEW_LINES,
  SEASON_LABELS,
  withPercent,
  type CurrencyCode,
  type Markup,
  type MarkupLookupResult,
  type Page,
  type PriceListFilter,
  type PriceListItemDto,
  type PriceListQuery,
  type PriceRevisionDto,
  type PriceRevisionListQuery,
  type PriceRuleDto,
  type PriceRuleInput,
  type RepriceInput,
  type RepriceLineDto,
  type RepriceOperation,
  type RepriceResult,
  type RepriceSkip,
  type Season,
  type AnyCurrency,
  type RateBook,
} from '@erp/core'
import { Injectable } from '@nestjs/common'
import { In, type EntityManager, type SelectQueryBuilder } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch, applySort } from '../../common/listing'
import { Db } from '../../database/db.service'
import { Brand, Category, PriceRevision, PriceRule, PriceRuleMarkup, PriceType, Product } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import { can, type Actor } from '../auth/actor'
import { nextNumbers } from '../catalog/counters'
import { bookToday } from '../money/rate-book'
import { RealtimeService } from '../realtime/realtime.service'

const SORTABLE = { name: 'p.name', sku: 'p.sku' }

/** More models than this are not repriced in one go: narrow the filter. */
const MAX_MODELS = 20_000

/** Goods on hand of a model, in any place, the road between places included. */
const ON_HAND = `EXISTS (
  SELECT 1 FROM stock_balances sb JOIN product_variants v ON v.id = sb.variant_id
  WHERE v.product_id = p.id AND sb.qty > 0
)`

interface Subject {
  id: string
  sku: string
  name: string
  categoryId: string | null
  brandId: string | null
  season: Season | null
}

interface PriceRow {
  price_type_id: string
  product_id: string
  variant_id: string | null
  location_id: string | null
  amount: number
}

interface UnitCost {
  qty: number
  /** One unit, in the base, at what the goods cost when they came in. */
  uzs: number | null
  /** The same with the goods bought for foreign money at today's rates of their currencies. */
  today: number | null
}

/** One price as a revision records it. */
interface Change {
  priceTypeId: string
  productId: string
  variantId: string | null
  locationId: string | null
  old: number | null
  next: number | null
}

const percentText = (percent: number) => `${percent > 0 ? '+' : percent < 0 ? '−' : ''}${Math.abs(percent)}%`

/**
 * Prices in bulk: the list of what every model sells for against what it
 * cost, the rules that say what it should sell for, and the changes of many
 * prices at once. Such a change moves a model's own price; a price set apart
 * for one size or one shop moves with it in proportion, so an XXL that was
 * a tenth dearer stays a tenth dearer.
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  // ───────────────────────────── The price list ─────────────────────────────

  async list(actor: Actor, query: PriceListQuery): Promise<Page<PriceListItemDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = this.scope(em, query)
        .leftJoin(Category, 'c', 'c.id = p.categoryId')
        .leftJoin(Brand, 'b', 'b.id = p.brandId')
        .addSelect('c.name', 'category_name')
        .addSelect('b.name', 'brand_name')
      applySort(qb, SORTABLE, query.sort, query.order, 'name')
      qb.addOrderBy('p.id', 'ASC')

      const total = await qb.getCount()
      const { entities, raw } = await qb
        .offset((query.page - 1) * query.size)
        .limit(query.size)
        .getRawAndEntities()

      const ids = entities.map((product) => product.id)
      const costs = await this.unitCosts(em, ids, await bookToday(em))
      const prices = await this.prices(em, ids)
      const seesCost = can(actor, 'stock.cost')

      return {
        items: entities.map((product, index) => {
          const cost = costs.get(product.id)
          const mine = prices.filter((price) => price.product_id === product.id)
          return {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            categoryName: raw[index].category_name,
            brandName: raw[index].brand_name,
            season: product.season,
            qty: cost?.qty ?? 0,
            unitCostUzs: seesCost ? (cost?.uzs ?? null) : null,
            unitCostToday: seesCost && cost?.today !== cost?.uzs ? (cost?.today ?? null) : null,
            prices: Object.fromEntries(
              mine
                .filter((price) => !price.variant_id && !price.location_id)
                .map((price) => [price.price_type_id, price.amount]),
            ),
            overrides: mine.filter((price) => price.variant_id || price.location_id).length,
          }
        }),
        total,
        page: query.page,
        size: query.size,
      }
    })
  }

  // ───────────────────────────── Changing prices ─────────────────────────────

  async reprice(actor: Actor, input: RepriceInput): Promise<RepriceResult> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const type = await this.type(em, input.priceTypeId, 'priceTypeId')
      const operation = input.operation
      const source =
        operation.kind === 'from_type' ? await this.type(em, operation.priceTypeId, 'operation.priceTypeId') : null
      if (source && source.id === type.id) {
        throw AppError.validation({ 'operation.priceTypeId': 'Boshqa narx turini tanlang' })
      }
      if (source && source.currency !== type.currency) {
        throw AppError.validation({ 'operation.priceTypeId': 'Narx turlarining valyutasi bir xil bo‘lishi kerak' })
      }

      const subjects = await this.subjects(em, input.filter)
      if (subjects.length > MAX_MODELS) {
        throw AppError.badRequest(
          'TOO_MANY',
          `Bir martada ko‘pi bilan ${MAX_MODELS} ta model o‘zgartiriladi. Filtr bilan toraytiring`,
        )
      }
      const ids = subjects.map((subject) => subject.id)

      const byRule = operation.kind === 'markup' && operation.percent === null
      const rules = byRule ? await this.ruleScopes(em) : []
      const parents = byRule ? await this.categoryParents(em) : new Map<string, string | null>()
      const [retail] = byRule ? await em.findBy(PriceType, { kind: 'retail' }) : []

      const book = await bookToday(em)
      const costs = await this.unitCosts(em, ids, book)
      // At today's rates of the currencies the goods came in, when asked: what bringing them in again would cost.
      const today = operation.kind === 'markup' && operation.today
      const rows = await this.prices(em, ids)
      const priceOf = (productId: string, priceTypeId: string | undefined) =>
        rows.find(
          (row) =>
            row.product_id === productId && row.price_type_id === priceTypeId && !row.variant_id && !row.location_id,
        )?.amount ?? null
      const rounding = input.round ? { step: type.roundStep, ending: type.roundEnding } : NO_ROUNDING
      const seesCost = can(actor, 'stock.cost')

      const lines: RepriceLineDto[] = []
      const changes: Change[] = []
      let changed = 0
      let unchanged = 0
      let skipped = 0
      let belowCost = 0

      for (const subject of subjects) {
        const old = priceOf(subject.id, type.id)
        const cost = costs.get(subject.id)
        const inBase = (today ? (cost?.today ?? cost?.uzs) : cost?.uzs) ?? null
        // A price in another currency is marked up on the cost in it, at today's rates.
        const unitCost =
          inBase === null || type.currency === actor.base ? inBase : exchange(inBase, actor.base, type.currency, book)
        const worked = this.work(operation, {
          old,
          unitCost,
          source: source ? priceOf(subject.id, source.id) : null,
          retail: retail && retail.id !== type.id ? priceOf(subject.id, retail.id) : null,
          markup: byRule
            ? pickMarkup(rules, { ...subject, categoryIds: chain(parents, subject.categoryId) }, type.id)
            : null,
        })
        const line = {
          productId: subject.id,
          sku: subject.sku,
          name: subject.name,
          old,
          unitCost: seesCost ? unitCost : null,
        }
        if (typeof worked === 'string') {
          skipped++
          lines.push({ ...line, next: null, skip: worked })
          continue
        }
        const next = roundPrice(worked, rounding)
        if (next === old) {
          unchanged++
          continue
        }
        changed++
        if (unitCost !== null && next < unitCost) {
          belowCost++
        }
        lines.push({ ...line, next, skip: null })
        changes.push({ priceTypeId: type.id, productId: subject.id, variantId: null, locationId: null, old, next })

        // Prices set apart for a size or a shop keep their distance from the model's price.
        if (old) {
          for (const row of rows) {
            if (
              row.product_id !== subject.id ||
              row.price_type_id !== type.id ||
              (!row.variant_id && !row.location_id)
            ) {
              continue
            }
            const moved = roundPrice(scale(row.amount, next, old), rounding)
            if (moved !== row.amount) {
              changes.push({
                priceTypeId: type.id,
                productId: subject.id,
                variantId: row.variant_id,
                locationId: row.location_id,
                old: row.amount,
                next: moved,
              })
            }
          }
        }
      }

      // What changes is shown first; what was passed over, after it.
      lines.sort((a, b) => Number(!!a.skip) - Number(!!b.skip))
      const result: RepriceResult = {
        revision: null,
        total: subjects.length,
        changed,
        unchanged,
        skipped,
        belowCost,
        lines: lines.slice(0, REPRICE_PREVIEW_LINES),
      }
      if (input.dryRun) {
        return result
      }
      if (!changed) {
        throw AppError.conflict('NOTHING_TO_CHANGE', 'O‘zgaradigan narx yo‘q')
      }

      const revision = await this.record(em, actor, type, changes, {
        summary: describe(operation, type.currency, source?.name),
        note: input.note ?? null,
        changed,
        revertsId: null,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['pricing', 'products', 'stock']))
      return { ...result, revision: { id: revision.id, number: revision.number } }
    })
  }

  /** The new price of one model, or why it has none. */
  private work(
    operation: RepriceOperation,
    known: {
      old: number | null
      unitCost: number | null
      source: number | null
      retail: number | null
      markup: Markup | null
    },
  ): number | RepriceSkip {
    switch (operation.kind) {
      case 'percent':
        return known.old === null ? 'no_price' : withPercent(known.old, operation.percent)
      case 'amount':
        return known.old === null ? 'no_price' : Math.max(0, known.old + operation.amount)
      case 'from_type':
        return known.source === null ? 'no_source' : withPercent(known.source, operation.percent)
      case 'markup': {
        if (operation.percent !== null) {
          return known.unitCost === null ? 'no_cost' : withPercent(known.unitCost, operation.percent)
        }
        if (!known.markup) {
          return 'no_rule'
        }
        if (known.markup.base === 'retail') {
          return known.retail === null ? 'no_source' : withPercent(known.retail, known.markup.percent)
        }
        return known.unitCost === null ? 'no_cost' : withPercent(known.unitCost, known.markup.percent)
      }
    }
  }

  /** Writes the new prices and keeps what they were. */
  private async record(
    em: EntityManager,
    actor: Actor,
    type: PriceType,
    changes: Change[],
    about: Pick<PriceRevision, 'summary' | 'note' | 'changed' | 'revertsId'>,
  ): Promise<PriceRevision> {
    const number = `NO-${String(await nextNumbers(em, actor.orgId, 'price_revision')).padStart(6, '0')}`
    const revision = await em.save(
      em.create(PriceRevision, {
        orgId: actor.orgId,
        number,
        priceTypeId: type.id,
        priceTypeName: type.name,
        ...about,
        createdBy: actor.userId,
        createdByName: actor.name,
      }),
    )

    const set = changes.filter((change) => change.next !== null)
    if (set.length) {
      await em.query(
        `INSERT INTO prices (org_id, price_type_id, product_id, variant_id, location_id, amount, currency, updated_by)
         SELECT $1, $2, x.product_id, x.variant_id, x.location_id, x.amount, $3, $4
         FROM unnest($5::uuid[], $6::uuid[], $7::uuid[], $8::bigint[]) AS x(product_id, variant_id, location_id, amount)
         ON CONFLICT ON CONSTRAINT prices_scope
         DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [
          actor.orgId,
          type.id,
          type.currency,
          actor.userId,
          set.map((change) => change.productId),
          set.map((change) => change.variantId),
          set.map((change) => change.locationId),
          set.map((change) => change.next),
        ],
      )
    }
    // A price that did not exist before the change being put back goes away again.
    const gone = changes.filter((change) => change.next === null)
    if (gone.length) {
      await em.query(
        `DELETE FROM prices pr
         USING unnest($2::uuid[], $3::uuid[], $4::uuid[]) AS x(product_id, variant_id, location_id)
         WHERE pr.price_type_id = $1 AND pr.product_id = x.product_id
           AND pr.variant_id IS NOT DISTINCT FROM x.variant_id AND pr.location_id IS NOT DISTINCT FROM x.location_id`,
        [
          type.id,
          gone.map((change) => change.productId),
          gone.map((change) => change.variantId),
          gone.map((change) => change.locationId),
        ],
      )
    }
    await em.query(
      `INSERT INTO price_revision_lines
         (org_id, revision_id, price_type_id, product_id, variant_id, location_id, old_amount, new_amount, currency)
       SELECT $1, $2, $3, x.product_id, x.variant_id, x.location_id, x.old_amount, x.new_amount, $4
       FROM unnest($5::uuid[], $6::uuid[], $7::uuid[], $8::bigint[], $9::bigint[])
         AS x(product_id, variant_id, location_id, old_amount, new_amount)`,
      [
        actor.orgId,
        revision.id,
        type.id,
        type.currency,
        changes.map((change) => change.productId),
        changes.map((change) => change.variantId),
        changes.map((change) => change.locationId),
        changes.map((change) => change.old),
        changes.map((change) => change.next),
      ],
    )

    await this.audit.record(em, actor.orgId, actor, {
      action: about.revertsId ? 'prices.revert' : 'prices.reprice',
      entity: 'price_revision',
      entityId: revision.id,
      summary: `${number}: ${type.name}, ${about.changed} ta model, ${about.summary}`,
    })
    return revision
  }

  // ───────────────────────────── History ─────────────────────────────

  async revisions(actor: Actor, query: PriceRevisionListQuery): Promise<Page<PriceRevisionDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = em
        .createQueryBuilder(PriceRevision, 'r')
        .leftJoin(PriceRevision, 'o', 'o.id = r.revertsId')
        .leftJoin(PriceRevision, 'u', 'u.revertsId = r.id')
        .addSelect('o.number', 'reverts_number')
        .addSelect('u.number', 'reverted_by_number')
        .orderBy('r.createdAt', 'DESC')
      if (query.q) {
        qb.where('(r.number ILIKE :q OR r.note ILIKE :q OR r.summary ILIKE :q)', {
          q: `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`,
        })
      }
      const total = await qb.getCount()
      const { entities, raw } = await qb
        .offset((query.page - 1) * query.size)
        .limit(query.size)
        .getRawAndEntities()
      return {
        items: entities.map((revision, index) => ({
          id: revision.id,
          number: revision.number,
          priceTypeName: revision.priceTypeName,
          summary: revision.summary,
          note: revision.note,
          changed: revision.changed,
          createdByName: revision.createdByName,
          createdAt: revision.createdAt.toISOString(),
          revertsNumber: raw[index].reverts_number,
          revertedByNumber: raw[index].reverted_by_number,
        })),
        total,
        page: query.page,
        size: query.size,
      }
    })
  }

  /**
   * Puts back what a revision changed. Only prices that still stand as the
   * revision left them are touched: one changed again since is someone's
   * later decision and stays.
   */
  async revert(actor: Actor, id: string): Promise<RepriceResult> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await em.query(`SELECT 1 FROM price_revisions WHERE id = $1 FOR UPDATE`, [id])
      const revision = await em.findOneBy(PriceRevision, { id })
      if (!revision) {
        throw AppError.notFound('Narx o‘zgarishi topilmadi')
      }
      if (await em.findOneBy(PriceRevision, { revertsId: id })) {
        throw AppError.conflict('ALREADY_REVERTED', 'Bu o‘zgarish allaqachon qaytarilgan')
      }
      const type = revision.priceTypeId ? await em.findOneBy(PriceType, { id: revision.priceTypeId }) : null
      if (!type) {
        throw AppError.conflict('TYPE_GONE', 'Bu narx turi o‘chirilgan')
      }

      const rows: {
        product_id: string
        variant_id: string | null
        location_id: string | null
        old_amount: number | null
        new_amount: number | null
        current: number | null
      }[] = await em.query(
        `SELECT l.product_id, l.variant_id, l.location_id, l.old_amount::float8 AS old_amount,
                l.new_amount::float8 AS new_amount, pr.amount::float8 AS current
         FROM price_revision_lines l
         LEFT JOIN prices pr ON pr.price_type_id = l.price_type_id AND pr.product_id = l.product_id
           AND pr.variant_id IS NOT DISTINCT FROM l.variant_id AND pr.location_id IS NOT DISTINCT FROM l.location_id
         WHERE l.revision_id = $1`,
        [id],
      )
      const standing = rows.filter((row) => row.current === row.new_amount)
      const models = standing.filter((row) => !row.variant_id && !row.location_id).length
      if (!standing.length) {
        throw AppError.conflict('NOTHING_TO_CHANGE', 'Bu narxlar keyin yana o‘zgargan: qaytariladigan narx yo‘q')
      }

      const undo = await this.record(
        em,
        actor,
        type,
        standing.map((row) => ({
          priceTypeId: type.id,
          productId: row.product_id,
          variantId: row.variant_id,
          locationId: row.location_id,
          old: row.new_amount,
          next: row.old_amount,
        })),
        { summary: `${revision.number} qaytarildi`, note: null, changed: models, revertsId: id },
      )
      afterCommit(() => this.realtime.changed(actor.orgId, ['pricing', 'products', 'stock']))
      return {
        revision: { id: undo.id, number: undo.number },
        total: rows.filter((row) => !row.variant_id && !row.location_id).length,
        changed: models,
        unchanged: 0,
        skipped: rows.length - standing.length,
        belowCost: 0,
        lines: [],
      }
    })
  }

  // ───────────────────────────── Markup rules ─────────────────────────────

  async rules(actor: Actor): Promise<PriceRuleDto[]> {
    return this.db.tenant(actor.orgId, ({ em }) => this.ruleRows(em))
  }

  async saveRule(actor: Actor, id: string | null, input: PriceRuleInput): Promise<PriceRuleDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      if (id && !(await em.findOneBy(PriceRule, { id }))) {
        throw AppError.notFound('Qoida topilmadi')
      }
      const fields: Record<string, string> = {}
      if (input.categoryId && !(await em.findOneBy(Category, { id: input.categoryId }))) {
        fields.categoryId = 'Kategoriya topilmadi'
      }
      if (input.brandId && !(await em.findOneBy(Brand, { id: input.brandId }))) {
        fields.brandId = 'Brend topilmadi'
      }
      const types = await em.findBy(PriceType, { id: In(input.markups.map((markup) => markup.priceTypeId)) })
      input.markups.forEach((markup, index) => {
        const type = types.find((item) => item.id === markup.priceTypeId)
        if (!type) {
          fields[`markups.${index}.priceTypeId`] = 'Narx turi topilmadi'
        } else if (markup.base === 'retail' && type.kind === 'retail') {
          fields[`markups.${index}.base`] = 'Chakana narxning o‘zi chakana narxdan hisoblanmaydi'
        }
      })
      const [same] = await em.query(
        `SELECT id FROM price_rules
         WHERE category_id IS NOT DISTINCT FROM $1 AND brand_id IS NOT DISTINCT FROM $2
           AND season IS NOT DISTINCT FROM $3 AND id IS DISTINCT FROM $4`,
        [input.categoryId, input.brandId, input.season, id],
      )
      if (same) {
        fields.categoryId ??= 'Bunday kategoriya, brend va sezon uchun qoida bor'
      }
      if (Object.keys(fields).length) {
        throw AppError.validation(fields, Object.values(fields)[0])
      }

      const scope = { categoryId: input.categoryId, brandId: input.brandId, season: input.season }
      const ruleId = id ?? (await em.save(em.create(PriceRule, { orgId: actor.orgId, ...scope }))).id
      if (id) {
        await em.update(PriceRule, id, scope)
        await em.delete(PriceRuleMarkup, { ruleId: id })
      }
      await em.insert(
        PriceRuleMarkup,
        input.markups.map((markup) => ({ orgId: actor.orgId, ruleId, ...markup })),
      )

      const rule = (await this.ruleRows(em)).find((row) => row.id === ruleId) as PriceRuleDto
      await this.audit.record(em, actor.orgId, actor, {
        action: id ? 'price_rule.update' : 'price_rule.create',
        entity: 'price_rule',
        entityId: ruleId,
        summary: `${scopeText(rule)}: ${rule.markups
          .map(
            (markup) => `${types.find((type) => type.id === markup.priceTypeId)?.name} ${percentText(markup.percent)}`,
          )
          .join(', ')}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['pricing']))
      return rule
    })
  }

  async removeRule(actor: Actor, id: string): Promise<void> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const rule = (await this.ruleRows(em)).find((row) => row.id === id)
      if (!rule) {
        throw AppError.notFound('Qoida topilmadi')
      }
      await em.delete(PriceRule, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'price_rule.delete',
        entity: 'price_rule',
        entityId: id,
        summary: scopeText(rule),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['pricing']))
    })
  }

  /** For each product, the markup every price type's rule gives it: what a receipt suggests prices from. */
  async markups(actor: Actor, productIds: string[]): Promise<MarkupLookupResult> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const products = await em.findBy(Product, { id: In(productIds) })
      const rules = await this.ruleScopes(em)
      const parents = await this.categoryParents(em)
      const types = await em.findBy(PriceType, { isActive: true })
      return Object.fromEntries(
        products.map((product) => {
          const subject = {
            categoryIds: chain(parents, product.categoryId),
            brandId: product.brandId,
            season: product.season,
          }
          return [
            product.id,
            types.flatMap((type) => {
              const markup = pickMarkup(rules, subject, type.id)
              return markup ? [markup] : []
            }),
          ]
        }),
      )
    })
  }

  // ───────────────────────────── Reading ─────────────────────────────

  /** The models a filter covers. */
  private scope(em: EntityManager, filter: PriceListFilter): SelectQueryBuilder<Product> {
    const qb = em.createQueryBuilder(Product, 'p').where('p.isActive')
    if (filter.presence === 'in') qb.andWhere(ON_HAND)
    if (filter.brandId) qb.andWhere('p.brandId = :brandId', { brandId: filter.brandId })
    if (filter.season) qb.andWhere('p.season = :season', { season: filter.season })
    if (filter.categoryId) {
      qb.andWhere(
        `p.category_id IN (
          WITH RECURSIVE tree AS (
            SELECT id FROM categories WHERE id = :categoryId
            UNION ALL
            SELECT k.id FROM categories k JOIN tree ON k.parent_id = tree.id
          )
          SELECT id FROM tree
        )`,
        { categoryId: filter.categoryId },
      )
    }
    applySearch(qb, 'p.search_key', filter.q)
    return qb
  }

  private async subjects(em: EntityManager, filter: PriceListFilter): Promise<Subject[]> {
    const products = await this.scope(em, filter)
      .orderBy('p.name', 'ASC')
      .addOrderBy('p.id', 'ASC')
      .limit(MAX_MODELS + 1)
      .getMany()
    return products.map(({ id, sku, name, categoryId, brandId, season }) => ({
      id,
      sku,
      name,
      categoryId,
      brandId,
      season,
    }))
  }

  private async prices(em: EntityManager, productIds: string[]): Promise<PriceRow[]> {
    if (!productIds.length) {
      return []
    }
    return em.query(
      `SELECT price_type_id, product_id, variant_id, location_id, amount::float8 AS amount
       FROM prices WHERE product_id = ANY($1)`,
      [productIds],
    )
  }

  /**
   * What one unit of each model costs: the average of what is on hand, or,
   * with nothing on hand, what the last batch cost. Beside it, the same with
   * the goods bought for foreign money at today's rates of the currencies
   * they came in — their price in that currency again, their expenses as they
   * were: what bringing them in again would cost. Goods bought in the base,
   * and found ones, cost what they cost; a currency with no rate today, too.
   */
  private async unitCosts(em: EntityManager, productIds: string[], book: RateBook): Promise<Map<string, UnitCost>> {
    if (!productIds.length) {
      return new Map()
    }
    // One of each currency in the base today, exactly enough for a price in minor units.
    const worth: Partial<Record<AnyCurrency, string>> = {}
    for (const code of Object.keys(book.rates) as AnyCurrency[]) {
      worth[code] = baseWorth(code, book)?.toDecimalString(12)
    }
    const today = (alias: string) =>
      `${alias}.cost_uzs + coalesce(round(${alias}.qty * rl.price * (
         ($2::jsonb ->> r.currency)::numeric - CASE r.rate_way WHEN 'in' THEN r.rate ELSE 1 / r.rate END
       )), 0)`
    const origin = `LEFT JOIN receipt_lines rl ON rl.id = b.receipt_line_id LEFT JOIN receipts r ON r.id = rl.receipt_id`
    const rows: { product_id: string; qty: number; unit_uzs: number | null; unit_today: number | null }[] =
      await em.query(
        `WITH held AS (
         SELECT v.product_id, sum(sb.qty) AS qty, sum(sb.cost_uzs) AS uzs, sum(${today('sb')}) AS today
         FROM stock_balances sb
         JOIN product_variants v ON v.id = sb.variant_id
         JOIN stock_batches b ON b.id = sb.batch_id
         ${origin}
         WHERE sb.qty > 0 AND v.product_id = ANY($1)
         GROUP BY v.product_id
       ), last AS (
         SELECT DISTINCT ON (v.product_id) v.product_id, b.qty, b.cost_uzs AS uzs, ${today('b')} AS today
         FROM stock_batches b
         JOIN product_variants v ON v.id = b.variant_id
         ${origin}
         WHERE b.qty > 0 AND v.product_id = ANY($1) AND r.status IS DISTINCT FROM 'cancelled'
         ORDER BY v.product_id, b.received_on DESC, b.created_at DESC
       )
       SELECT p AS product_id, coalesce(h.qty, 0)::float8 AS qty,
              (coalesce(h.uzs, l.uzs) / coalesce(h.qty, l.qty))::float8 AS unit_uzs,
              (coalesce(h.today, l.today) / coalesce(h.qty, l.qty))::float8 AS unit_today
       FROM unnest($1::uuid[]) AS p
       LEFT JOIN held h ON h.product_id = p
       LEFT JOIN last l ON l.product_id = p`,
        [productIds, JSON.stringify(worth)],
      )
    const whole = (value: number | null) => (value === null ? null : Math.round(value))
    return new Map(
      rows.map((row) => [row.product_id, { qty: row.qty, uzs: whole(row.unit_uzs), today: whole(row.unit_today) }]),
    )
  }

  private async type(em: EntityManager, id: string, field: string): Promise<PriceType> {
    const type = await em.findOneBy(PriceType, { id })
    if (!type || !type.isActive) {
      throw AppError.validation({ [field]: 'Narx turi topilmadi' })
    }
    return type
  }

  private async ruleScopes(
    em: EntityManager,
  ): Promise<Pick<PriceRuleDto, 'categoryId' | 'brandId' | 'season' | 'markups'>[]> {
    const rules = await em.find(PriceRule)
    const markups = await em.find(PriceRuleMarkup)
    return rules.map((rule) => ({
      categoryId: rule.categoryId,
      brandId: rule.brandId,
      season: rule.season,
      markups: markups
        .filter((markup) => markup.ruleId === rule.id)
        .map(({ priceTypeId, base, percent }) => ({ priceTypeId, base, percent })),
    }))
  }

  private async ruleRows(em: EntityManager): Promise<PriceRuleDto[]> {
    const { entities, raw } = await em
      .createQueryBuilder(PriceRule, 'r')
      .leftJoin(Category, 'c', 'c.id = r.categoryId')
      .leftJoin(Brand, 'b', 'b.id = r.brandId')
      .addSelect('c.name', 'category_name')
      .addSelect('b.name', 'brand_name')
      // The rule for everything first, then the narrower ones by name.
      .orderBy('(r.categoryId IS NOT NULL)::int + (r.brandId IS NOT NULL)::int + (r.season IS NOT NULL)::int', 'ASC')
      .addOrderBy('c.name', 'ASC', 'NULLS FIRST')
      .addOrderBy('b.name', 'ASC', 'NULLS FIRST')
      .addOrderBy('r.season', 'ASC', 'NULLS FIRST')
      .getRawAndEntities()
    const markups = await em
      .createQueryBuilder(PriceRuleMarkup, 'm')
      .innerJoin(PriceType, 't', 't.id = m.priceTypeId')
      .orderBy('t.sortOrder', 'ASC')
      .getMany()
    return entities.map((rule, index) => ({
      id: rule.id,
      categoryId: rule.categoryId,
      categoryName: raw[index].category_name,
      brandId: rule.brandId,
      brandName: raw[index].brand_name,
      season: rule.season,
      markups: markups
        .filter((markup) => markup.ruleId === rule.id)
        .map(({ priceTypeId, base, percent }) => ({ priceTypeId, base, percent })),
    }))
  }

  private async categoryParents(em: EntityManager): Promise<Map<string, string | null>> {
    const categories = await em.find(Category, { select: { id: true, parentId: true } })
    return new Map(categories.map((category) => [category.id, category.parentId]))
  }
}

/** A category and each of its parents up to the top. */
function chain(parents: Map<string, string | null>, categoryId: string | null): string[] {
  const ids: string[] = []
  for (let id = categoryId; id && !ids.includes(id); id = parents.get(id) ?? null) {
    ids.push(id)
  }
  return ids
}

/** `amount * next / old`, exactly, rounded half up. */
function scale(amount: number, next: number, old: number): number {
  return Number((BigInt(amount) * BigInt(next) * 2n + BigInt(old)) / (BigInt(old) * 2n))
}

function scopeText(rule: Pick<PriceRuleDto, 'categoryName' | 'brandName' | 'season'>): string {
  const parts = [rule.categoryName, rule.brandName, rule.season ? SEASON_LABELS[rule.season] : null].filter(Boolean)
  return parts.length ? parts.join(', ') : 'Hamma tovar'
}

function describe(operation: RepriceOperation, currency: CurrencyCode, sourceName?: string): string {
  switch (operation.kind) {
    case 'percent':
      return percentText(operation.percent)
    case 'amount':
      return `${operation.amount < 0 ? '−' : '+'}${formatMoney(Math.abs(operation.amount), currency)}`
    case 'from_type':
      return `${sourceName} ${percentText(operation.percent)}`
    case 'markup': {
      const how = operation.percent === null ? 'qoida bo‘yicha' : percentText(operation.percent)
      return `Tannarxdan ${how}${operation.today ? ', bugungi kurslarda' : ''}`
    }
  }
}
