import type { PriceTypeDto, PriceTypeInput } from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Price, PriceType } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'

/**
 * The prices a model can carry: retail, wholesale, the floor nobody sells
 * under, and whatever else a business adds. There is always exactly one
 * retail type, because the till needs a price to start from.
 */
@Injectable()
export class PriceTypesService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(actor: Actor): Promise<PriceTypeDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const types = await em.find(PriceType, { order: { sortOrder: 'ASC', name: 'ASC' } })
      return types.map(toDto)
    })
  }

  async create(actor: Actor, input: PriceTypeInput): Promise<PriceTypeDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.assertValid(em, input)
      const [{ next }] = await em.query(`SELECT coalesce(max(sort_order), 0) + 1 AS next FROM price_types`)
      const saved = await em.save(
        em.create(PriceType, {
          orgId: actor.orgId,
          name: input.name,
          kind: input.kind,
          currency: input.currency,
          sortOrder: next,
          isActive: true,
        }),
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'price_type.create',
        entity: 'price_type',
        entityId: saved.id,
        summary: saved.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['price-types']))
      return toDto(saved)
    })
  }

  async update(actor: Actor, id: string, input: PriceTypeInput): Promise<PriceTypeDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      if (before.kind === 'retail' && input.kind !== 'retail') {
        throw AppError.validation({ kind: "Chakana narx turi doim bo'lishi kerak" })
      }
      await this.assertValid(em, input, id)
      await em.update(PriceType, id, { name: input.name, kind: input.kind, currency: input.currency })
      const after = await this.find(em, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'price_type.update',
        entity: 'price_type',
        entityId: id,
        summary: after.name,
        changes: diff(before, after, ['name', 'kind', 'currency']),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['price-types', 'products']))
      return toDto(after)
    })
  }

  async setActive(actor: Actor, id: string, active: boolean): Promise<PriceTypeDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      if (before.isActive !== active) {
        if (!active && before.kind === 'retail') {
          throw AppError.conflict('RETAIL_REQUIRED', "Chakana narx turini arxivlab bo'lmaydi")
        }
        await em.update(PriceType, id, { isActive: active })
        await this.audit.record(em, actor.orgId, actor, {
          action: active ? 'price_type.restore' : 'price_type.archive',
          entity: 'price_type',
          entityId: id,
          summary: before.name,
          changes: { isActive: [before.isActive, active] },
        })
        afterCommit(() => this.realtime.changed(actor.orgId, ['price-types']))
      }
      return toDto(await this.find(em, id))
    })
  }

  async remove(actor: Actor, id: string): Promise<void> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const type = await this.find(em, id)
      if (type.kind === 'retail') {
        throw AppError.conflict('RETAIL_REQUIRED', "Chakana narx turini o'chirib bo'lmaydi")
      }
      if (await em.countBy(Price, { priceTypeId: id })) {
        throw AppError.conflict('IN_USE', "Bu narx turida narxlar qo'yilgan. O'chirish o'rniga arxivlang")
      }
      await em.delete(PriceType, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'price_type.delete',
        entity: 'price_type',
        entityId: id,
        summary: type.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['price-types']))
    })
  }

  private async find(em: EntityManager, id: string): Promise<PriceType> {
    const type = await em.findOneBy(PriceType, { id })
    if (!type) {
      throw AppError.notFound('Narx turi topilmadi')
    }
    return type
  }

  private async assertValid(em: EntityManager, input: PriceTypeInput, exceptId?: string) {
    const others = await em
      .createQueryBuilder(PriceType, 't')
      .where(exceptId ? 't.id <> :exceptId' : '1 = 1', { exceptId })
      .getMany()
    const fields: Record<string, string> = {}
    if (others.some((other) => other.name.toLowerCase() === input.name.toLowerCase())) {
      fields.name = 'Bunday narx turi bor'
    }
    if ((input.kind === 'retail' || input.kind === 'min') && others.some((other) => other.kind === input.kind)) {
      fields.kind = input.kind === 'retail' ? "Chakana narx turi bitta bo'ladi" : "Minimal narx turi bitta bo'ladi"
    }
    if (Object.keys(fields).length) {
      throw AppError.validation(fields)
    }
  }
}

function toDto(type: PriceType): PriceTypeDto {
  return { id: type.id, name: type.name, kind: type.kind, currency: type.currency, isActive: type.isActive }
}
