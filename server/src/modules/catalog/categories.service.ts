import type { CategoryDto, CategoryInput } from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import { In, type EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Attribute, Category } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'

const MAX_DEPTH = 4

const AUDITED: (keyof Category & string)[] = ['name', 'parentId', 'axisIds', 'isActive']

@Injectable()
export class CategoriesService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  /** The whole tree as a flat list, parents before children; the screens nest it. */
  async list(actor: Actor): Promise<CategoryDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const { entities, raw } = await em
        .createQueryBuilder(Category, 'c')
        .addSelect('(SELECT count(*)::int FROM products p WHERE p.category_id = c.id)', 'product_count')
        .orderBy('c.sortOrder', 'ASC')
        .addOrderBy('c.name', 'ASC')
        .getRawAndEntities()
      return entities.map((category, index) => toDto(category, raw[index].product_count))
    })
  }

  async create(actor: Actor, input: CategoryInput): Promise<CategoryDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.assertValid(em, input)
      const [{ next }] = await em.query(
        `SELECT coalesce(max(sort_order), 0) + 1 AS next FROM categories WHERE parent_id IS NOT DISTINCT FROM $1`,
        [input.parentId],
      )
      const saved = await em.save(
        em.create(Category, {
          orgId: actor.orgId,
          name: input.name,
          parentId: input.parentId,
          axisIds: input.axisIds,
          sortOrder: next,
          isActive: true,
        }),
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'category.create',
        entity: 'category',
        entityId: saved.id,
        summary: saved.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['categories']))
      return toDto(saved, 0)
    })
  }

  async update(actor: Actor, id: string, input: CategoryInput): Promise<CategoryDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      await this.assertValid(em, input, id)
      await em.update(Category, id, { name: input.name, parentId: input.parentId, axisIds: input.axisIds })
      const after = await this.find(em, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'category.update',
        entity: 'category',
        entityId: id,
        summary: after.name,
        changes: diff(before, after, AUDITED),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['categories', 'products']))
      return toDto(after, await this.productCount(em, id))
    })
  }

  async setActive(actor: Actor, id: string, active: boolean): Promise<CategoryDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      if (before.isActive !== active) {
        if (!active && (await em.countBy(Category, { parentId: id, isActive: true }))) {
          throw AppError.conflict('HAS_CHILDREN', 'Avval ichidagi kategoriyalarni arxivlang')
        }
        if (active && before.parentId && !(await em.findOneBy(Category, { id: before.parentId }))?.isActive) {
          throw AppError.conflict('PARENT_ARCHIVED', 'Avval yuqori kategoriyani arxivdan chiqaring')
        }
        await em.update(Category, id, { isActive: active })
        await this.audit.record(em, actor.orgId, actor, {
          action: active ? 'category.restore' : 'category.archive',
          entity: 'category',
          entityId: id,
          summary: before.name,
          changes: { isActive: [before.isActive, active] },
        })
        afterCommit(() => this.realtime.changed(actor.orgId, ['categories']))
      }
      return toDto(await this.find(em, id), await this.productCount(em, id))
    })
  }

  async remove(actor: Actor, id: string): Promise<void> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const category = await this.find(em, id)
      if (await em.countBy(Category, { parentId: id })) {
        throw AppError.conflict(
          'HAS_CHILDREN',
          "Ichida kategoriyalar bor. Avval ularni o'chiring yoki boshqa joyga ko'chiring",
        )
      }
      if (await this.productCount(em, id)) {
        throw AppError.conflict('IN_USE', "Bu kategoriyada tovarlar bor. O'chirish o'rniga arxivlang")
      }
      await em.delete(Category, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'category.delete',
        entity: 'category',
        entityId: id,
        summary: category.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['categories']))
    })
  }

  private async find(em: EntityManager, id: string): Promise<Category> {
    const category = await em.findOneBy(Category, { id })
    if (!category) {
      throw AppError.notFound('Kategoriya topilmadi')
    }
    return category
  }

  private async productCount(em: EntityManager, id: string): Promise<number> {
    const [{ count }] = await em.query(`SELECT count(*)::int AS count FROM products WHERE category_id = $1`, [id])
    return count
  }

  private async assertValid(em: EntityManager, input: CategoryInput, selfId?: string) {
    const fields: Record<string, string> = {}

    const sibling = await em
      .createQueryBuilder(Category, 'c')
      .where('lower(c.name) = lower(:name)', { name: input.name })
      .andWhere('c.parentId IS NOT DISTINCT FROM :parentId', { parentId: input.parentId })
      .andWhere(selfId ? 'c.id <> :selfId' : '1 = 1', { selfId })
      .getCount()
    if (sibling) {
      fields.name = 'Bu yerda shunday nomli kategoriya bor'
    }

    if (input.parentId) {
      // Walk up from the new parent: it must exist, must not sit under this category, and must leave room below.
      let depth = 1
      let cursor: string | null = input.parentId
      while (cursor) {
        const parent: Category | null = await em.findOneBy(Category, { id: cursor })
        if (!parent || parent.id === selfId) {
          fields.parentId = parent ? "Kategoriyani o'zining ichiga ko'chirib bo'lmaydi" : 'Kategoriya topilmadi'
          break
        }
        depth++
        cursor = parent.parentId
      }
      if (!fields.parentId && depth > MAX_DEPTH) {
        fields.parentId = `Kategoriyalar ko'pi bilan ${MAX_DEPTH} qavat bo'ladi`
      }
    }

    if (input.axisIds?.length) {
      const found = await em.countBy(Attribute, { id: In(input.axisIds) })
      if (found !== input.axisIds.length) {
        fields.axisIds = 'Xususiyat topilmadi'
      }
    }

    if (Object.keys(fields).length) {
      throw AppError.validation(fields)
    }
  }
}

function toDto(category: Category, productCount: number): CategoryDto {
  return {
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    axisIds: category.axisIds,
    isActive: category.isActive,
    productCount,
  }
}
