import {
  PROMOTION_KIND_LABELS,
  promotionCovers,
  promotionState,
  searchKey,
  type Page,
  type PromoOffer,
  type PromoSubject,
  type PromotionDto,
  type PromotionInput,
  type PromotionListQuery,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import { In, type EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch } from '../../common/listing'
import { Db } from '../../database/db.service'
import { Brand, Category, Location, Product, Promotion } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { LedgerService } from '../money/ledger.service'
import { RealtimeService } from '../realtime/realtime.service'

const AUDITED: (keyof Promotion & string)[] = [
  'name',
  'kind',
  'value',
  'minQty',
  'startsOn',
  'endsOn',
  'locationIds',
  'productIds',
  'categoryIds',
  'brandIds',
  'seasons',
  'stackable',
  'code',
  'isActive',
]

/** The promotions in force at a shop on a day, with what is needed to tell which goods each covers. */
export interface RunningPromotions {
  promotions: Promotion[]
  /** Every category above a category, by its id. */
  above: Map<string, string[]>
}

/**
 * What is running at a shop today. A promotion that takes a code is left
 * out unless that code was said: the till is not told the codes it was not
 * given.
 */
export async function runningAt(
  em: EntityManager,
  locationId: string,
  today: string,
  code: string | null,
): Promise<RunningPromotions> {
  const promotions = await em
    .createQueryBuilder(Promotion, 'p')
    .where('p.isActive')
    .andWhere('p.startsOn <= :today AND (p.endsOn IS NULL OR p.endsOn >= :today)', { today })
    .andWhere(`(cardinality(p.location_ids) = 0 OR :locationId = ANY(p.location_ids))`, { locationId })
    .andWhere('(p.code IS NULL OR p.code = :code)', { code })
    .orderBy('p.createdAt')
    .getMany()
  const above = new Map<string, string[]>()
  if (promotions.some((promotion) => promotion.categoryIds.length)) {
    const rows: { id: string; parent_id: string | null }[] = await em.query(`SELECT id, parent_id FROM categories`)
    const parentOf = new Map(rows.map((row) => [row.id, row.parent_id]))
    for (const row of rows) {
      const chain = [row.id]
      // A category that is, by some slip, above itself is not followed round and round.
      for (let up = row.parent_id; up && !chain.includes(up); up = parentOf.get(up) ?? null) {
        chain.push(up)
      }
      above.set(row.id, chain)
    }
  }
  return { promotions, above }
}

/** The promotions that cover one model, as the till takes them off. */
export function offersFor(
  running: RunningPromotions,
  product: { productId: string; categoryId: string | null; brandId: string | null; season: string | null },
): PromoOffer[] {
  const subject: PromoSubject = {
    productId: product.productId,
    categoryIds: product.categoryId ? (running.above.get(product.categoryId) ?? [product.categoryId]) : [],
    brandId: product.brandId,
    season: product.season,
  }
  return running.promotions
    .filter((promotion) => promotionCovers(promotion, subject))
    .map((promotion) => ({
      id: promotion.id,
      name: promotion.name,
      kind: promotion.kind,
      value: promotion.value,
      minQty: promotion.minQty,
      stackable: promotion.stackable,
    }))
}

/**
 * Promotions: for a while, in some shops, some goods are cheaper. They are
 * set up here; the till takes them off by itself while they run. One that
 * has been on a receipt is never removed, only stopped, so the receipts keep
 * saying what took the money off.
 */
@Injectable()
export class PromotionsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly ledger: LedgerService,
  ) {}

  async list(actor: Actor, query: PromotionListQuery): Promise<Page<PromotionDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const today = await this.ledger.today(em, actor.orgId)
      const qb = em.createQueryBuilder(Promotion, 'p')
      if (query.state === 'stopped') qb.andWhere('NOT p.isActive')
      if (query.state === 'scheduled') qb.andWhere('p.isActive AND p.startsOn > :today', { today })
      if (query.state === 'ended') qb.andWhere('p.isActive AND p.endsOn < :today', { today })
      if (query.state === 'running') {
        qb.andWhere('p.isActive AND p.startsOn <= :today AND (p.endsOn IS NULL OR p.endsOn >= :today)', { today })
      }
      applySearch(qb, 'p.search_key', query.q)
      const [rows, total] = await qb
        .orderBy('p.startsOn', 'DESC')
        .addOrderBy('p.createdAt', 'DESC')
        .skip((query.page - 1) * query.size)
        .take(query.size)
        .getManyAndCount()
      return { items: await this.dtos(em, rows, today), total, page: query.page, size: query.size }
    })
  }

  async get(actor: Actor, id: string): Promise<PromotionDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => this.dto(em, actor, await this.find(em, id)))
  }

  async create(actor: Actor, input: PromotionInput): Promise<PromotionDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.assertValid(em, input)
      const saved = await em.save(
        em.create(Promotion, {
          orgId: actor.orgId,
          ...input,
          // How many is asked only of the kind that goes by how many.
          minQty: input.kind === 'quantity' ? input.minQty : null,
          isActive: true,
          createdBy: actor.userId,
          createdByName: actor.name,
          searchKey: keyOf(input),
        }),
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'promotion.create',
        entity: 'promotion',
        entityId: saved.id,
        summary: `${saved.name}: ${PROMOTION_KIND_LABELS[saved.kind]}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['promotions', 'pos']))
      return this.dto(em, actor, saved)
    })
  }

  async update(actor: Actor, id: string, input: PromotionInput): Promise<PromotionDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      // What it gave on the receipts it is on stays what it was: its kind does not change under them.
      if (before.kind !== input.kind && (await this.used(em, id))) {
        throw AppError.validation({ kind: "Cheklarda ishlatilgan aksiyaning turi o'zgartirilmaydi" })
      }
      await this.assertValid(em, input, id)
      await em.update(Promotion, id, {
        ...input,
        minQty: input.kind === 'quantity' ? input.minQty : null,
        searchKey: keyOf(input),
      })
      const after = await this.find(em, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'promotion.update',
        entity: 'promotion',
        entityId: id,
        summary: after.name,
        changes: diff(before, after, AUDITED),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['promotions', 'pos']))
      return this.dto(em, actor, after)
    })
  }

  /** Stops a promotion before its last day, or lets it run again. */
  async setActive(actor: Actor, id: string, active: boolean): Promise<PromotionDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      if (before.isActive !== active) {
        await em.update(Promotion, id, { isActive: active })
        await this.audit.record(em, actor.orgId, actor, {
          action: active ? 'promotion.resume' : 'promotion.stop',
          entity: 'promotion',
          entityId: id,
          summary: before.name,
        })
        afterCommit(() => this.realtime.changed(actor.orgId, ['promotions', 'pos']))
      }
      return this.dto(em, actor, await this.find(em, id))
    })
  }

  /** One that was never on a receipt can be removed altogether. */
  async remove(actor: Actor, id: string): Promise<void> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const promotion = await this.find(em, id)
      if (await this.used(em, id)) {
        throw AppError.conflict('IN_USE', "Bu aksiya cheklarda bor. O'chirish o'rniga to'xtating")
      }
      await em.delete(Promotion, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'promotion.delete',
        entity: 'promotion',
        entityId: id,
        summary: promotion.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['promotions', 'pos']))
    })
  }

  // ───────────────────────────── Inside ─────────────────────────────

  private async find(em: EntityManager, id: string): Promise<Promotion> {
    const promotion = await em.findOneBy(Promotion, { id })
    if (!promotion) {
      throw AppError.notFound('Aksiya topilmadi')
    }
    return promotion
  }

  private async used(em: EntityManager, id: string): Promise<boolean> {
    const [row] = await em.query(`SELECT 1 FROM sale_lines WHERE promotion_id = $1 LIMIT 1`, [id])
    return !!row
  }

  private async assertValid(em: EntityManager, input: PromotionInput, exceptId?: string) {
    const fields: Record<string, string> = {}
    const all = async (entity: typeof Location | typeof Product | typeof Category | typeof Brand, list: string[]) =>
      !list.length || (await em.countBy(entity, { id: In(list) })) === new Set(list).size
    if (!(await all(Location, input.locationIds))) fields.locationIds = "Do'kon topilmadi"
    if (!(await all(Product, input.productIds))) fields.productIds = 'Tovar topilmadi'
    if (!(await all(Category, input.categoryIds))) fields.categoryIds = 'Kategoriya topilmadi'
    if (!(await all(Brand, input.brandIds))) fields.brandIds = 'Brend topilmadi'
    if (input.code) {
      // One word, one promotion: said at the till, it must mean one thing.
      const [taken] = await em.query(`SELECT name FROM promotions WHERE code = $1 AND id IS DISTINCT FROM $2`, [
        input.code,
        exceptId ?? null,
      ])
      if (taken) {
        fields.code = `Bu kod «${taken.name}» aksiyasida ishlatilgan`
      }
    }
    if (Object.keys(fields).length) {
      throw AppError.validation(fields)
    }
  }

  private async dto(em: EntityManager, actor: Actor, promotion: Promotion): Promise<PromotionDto> {
    return (await this.dtos(em, [promotion], await this.ledger.today(em, actor.orgId)))[0]
  }

  private async dtos(em: EntityManager, promotions: Promotion[], today: string): Promise<PromotionDto[]> {
    if (!promotions.length) {
      return []
    }
    const productIds = [...new Set(promotions.flatMap((promotion) => promotion.productIds))]
    const products = productIds.length
      ? await em.find(Product, { where: { id: In(productIds) }, select: ['id', 'name', 'sku'] })
      : []
    const productOf = new Map(products.map((product) => [product.id, product]))
    const given: { promotion_id: string; given: number; sales: number }[] = await em.query(
      `SELECT l.promotion_id, sum(l.promo_discount)::float8 AS given, count(DISTINCT l.sale_id)::int AS sales
       FROM sale_lines l JOIN sales s ON s.id = l.sale_id
       WHERE l.promotion_id = ANY($1) AND s.status = 'completed' GROUP BY l.promotion_id`,
      [promotions.map((promotion) => promotion.id)],
    )
    const givenBy = new Map(given.map((row) => [row.promotion_id, row]))
    return promotions.map((promotion) => ({
      id: promotion.id,
      name: promotion.name,
      kind: promotion.kind,
      value: promotion.value,
      minQty: promotion.minQty,
      startsOn: promotion.startsOn,
      endsOn: promotion.endsOn,
      locationIds: promotion.locationIds,
      productIds: promotion.productIds,
      products: promotion.productIds.flatMap((id) => {
        const product = productOf.get(id)
        return product ? [{ id, name: product.name, sku: product.sku }] : []
      }),
      categoryIds: promotion.categoryIds,
      brandIds: promotion.brandIds,
      seasons: promotion.seasons,
      stackable: promotion.stackable,
      code: promotion.code,
      isActive: promotion.isActive,
      state: promotionState(promotion, today),
      createdByName: promotion.createdByName,
      given: givenBy.get(promotion.id)?.given ?? 0,
      sales: givenBy.get(promotion.id)?.sales ?? 0,
    }))
  }
}

function keyOf(promotion: { name: string; code: string | null }): string {
  return searchKey(`${promotion.name} ${promotion.code ?? ''}`)
}
