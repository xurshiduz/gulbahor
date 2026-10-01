import type { BrandDto, BrandInput } from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Brand } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'
import { reindexProductsWhere } from './product-index'

@Injectable()
export class BrandsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(actor: Actor): Promise<BrandDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const { entities, raw } = await em
        .createQueryBuilder(Brand, 'b')
        .addSelect('(SELECT count(*)::int FROM products p WHERE p.brand_id = b.id)', 'product_count')
        .orderBy('lower(b.name)', 'ASC')
        .getRawAndEntities()
      return entities.map((brand, index) => toDto(brand, raw[index].product_count))
    })
  }

  async create(actor: Actor, input: BrandInput): Promise<BrandDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.assertNameFree(em, input.name)
      const saved = await em.save(em.create(Brand, { orgId: actor.orgId, name: input.name, isActive: true }))
      await this.audit.record(em, actor.orgId, actor, {
        action: 'brand.create',
        entity: 'brand',
        entityId: saved.id,
        summary: saved.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['brands']))
      return toDto(saved, 0)
    })
  }

  async update(actor: Actor, id: string, input: BrandInput): Promise<BrandDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      await this.assertNameFree(em, input.name, id)
      if (before.name !== input.name) {
        await em.update(Brand, id, { name: input.name })
        // Models are found by their brand's name.
        await reindexProductsWhere(em, 'p.brand_id = $1', [id])
        await this.audit.record(em, actor.orgId, actor, {
          action: 'brand.update',
          entity: 'brand',
          entityId: id,
          summary: input.name,
          changes: { name: [before.name, input.name] },
        })
        afterCommit(() => this.realtime.changed(actor.orgId, ['brands', 'products']))
      }
      return toDto(await this.find(em, id), await this.productCount(em, id))
    })
  }

  async setActive(actor: Actor, id: string, active: boolean): Promise<BrandDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      if (before.isActive !== active) {
        await em.update(Brand, id, { isActive: active })
        await this.audit.record(em, actor.orgId, actor, {
          action: active ? 'brand.restore' : 'brand.archive',
          entity: 'brand',
          entityId: id,
          summary: before.name,
          changes: { isActive: [before.isActive, active] },
        })
        afterCommit(() => this.realtime.changed(actor.orgId, ['brands']))
      }
      return toDto(await this.find(em, id), await this.productCount(em, id))
    })
  }

  async remove(actor: Actor, id: string): Promise<void> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const brand = await this.find(em, id)
      if (await this.productCount(em, id)) {
        throw AppError.conflict('IN_USE', "Bu brendda tovarlar bor. O'chirish o'rniga arxivlang")
      }
      await em.delete(Brand, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'brand.delete',
        entity: 'brand',
        entityId: id,
        summary: brand.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['brands']))
    })
  }

  private async find(em: EntityManager, id: string): Promise<Brand> {
    const brand = await em.findOneBy(Brand, { id })
    if (!brand) {
      throw AppError.notFound('Brend topilmadi')
    }
    return brand
  }

  private async productCount(em: EntityManager, id: string): Promise<number> {
    const [{ count }] = await em.query(`SELECT count(*)::int AS count FROM products WHERE brand_id = $1`, [id])
    return count
  }

  private async assertNameFree(em: EntityManager, name: string, exceptId?: string) {
    const taken = await em
      .createQueryBuilder(Brand, 'b')
      .where('lower(b.name) = lower(:name)', { name })
      .andWhere(exceptId ? 'b.id <> :exceptId' : '1 = 1', { exceptId })
      .getCount()
    if (taken) {
      throw AppError.validation({ name: 'Bunday brend bor' })
    }
  }
}

function toDto(brand: Brand, productCount: number): BrandDto {
  return { id: brand.id, name: brand.name, isActive: brand.isActive, productCount }
}
