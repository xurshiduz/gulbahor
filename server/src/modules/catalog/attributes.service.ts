import type {
  AttributeDto,
  AttributeInput,
  AttributeValueInput,
  AttributeValuesBulkInput,
  OrderInput,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Attribute, AttributeValue } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'
import { reindexProductsWhere } from './product-index'

const USES_VALUE = `(v.value1_id = $1 OR v.value2_id = $1 OR v.value3_id = $1)`
const USES_AXIS = `(p.axis1_id = $1 OR p.axis2_id = $1 OR p.axis3_id = $1)`

/**
 * The lists a model's variants are built from: colours, size scales and
 * anything else a business tells its goods apart by. Each attribute is an
 * ordered list of values; the order is the order sizes appear in everywhere.
 */
@Injectable()
export class AttributesService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(actor: Actor): Promise<AttributeDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const attributes = await em.find(Attribute, { order: { sortOrder: 'ASC', name: 'ASC' } })
      const values = await em.find(AttributeValue, { order: { sortOrder: 'ASC', name: 'ASC' } })
      return attributes.map((attribute) =>
        toDto(
          attribute,
          values.filter((value) => value.attributeId === attribute.id),
        ),
      )
    })
  }

  async create(actor: Actor, input: AttributeInput): Promise<AttributeDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.assertNameFree(em, input.name)
      const [{ next }] = await em.query(`SELECT coalesce(max(sort_order), 0) + 1 AS next FROM attributes`)
      const saved = await em.save(
        em.create(Attribute, {
          orgId: actor.orgId,
          name: input.name,
          kind: input.kind,
          sortOrder: next,
          isActive: true,
        }),
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'attribute.create',
        entity: 'attribute',
        entityId: saved.id,
        summary: saved.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['attributes']))
      return toDto(saved, [])
    })
  }

  async update(actor: Actor, id: string, input: AttributeInput): Promise<AttributeDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      await this.assertNameFree(em, input.name, id)
      await em.update(Attribute, id, { name: input.name, kind: input.kind })
      const after = await this.find(em, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'attribute.update',
        entity: 'attribute',
        entityId: id,
        summary: after.name,
        changes: diff(before, after, ['name', 'kind']),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['attributes', 'products']))
      return this.load(em, id)
    })
  }

  async setActive(actor: Actor, id: string, active: boolean): Promise<AttributeDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      if (before.isActive !== active) {
        await em.update(Attribute, id, { isActive: active })
        await this.audit.record(em, actor.orgId, actor, {
          action: active ? 'attribute.restore' : 'attribute.archive',
          entity: 'attribute',
          entityId: id,
          summary: before.name,
          changes: { isActive: [before.isActive, active] },
        })
        afterCommit(() => this.realtime.changed(actor.orgId, ['attributes']))
      }
      return this.load(em, id)
    })
  }

  async remove(actor: Actor, id: string): Promise<void> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const attribute = await this.find(em, id)
      const [{ used }] = await em.query(
        `SELECT EXISTS (SELECT 1 FROM products p WHERE ${USES_AXIS})
             OR EXISTS (SELECT 1 FROM categories c WHERE $1 = ANY(c.axis_ids)) AS used`,
        [id],
      )
      if (used) {
        throw AppError.conflict(
          'IN_USE',
          "Bu xususiyat tovar yoki kategoriyalarda ishlatilgan. O'chirish o'rniga arxivlang",
        )
      }
      await em.delete(Attribute, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'attribute.delete',
        entity: 'attribute',
        entityId: id,
        summary: attribute.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['attributes']))
    })
  }

  /** Adds values at the end of the list. Names the list already has are skipped, so the same paste can be sent twice. */
  async addValues(actor: Actor, attributeId: string, input: AttributeValuesBulkInput): Promise<AttributeDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const attribute = await this.find(em, attributeId)
      const existing = await em.findBy(AttributeValue, { attributeId })
      const taken = new Set(existing.map((value) => value.name.toLowerCase()))
      let position = existing.reduce((max, value) => Math.max(max, value.sortOrder), 0)

      const fresh = input.values.filter((value) => {
        const key = value.name.toLowerCase()
        if (taken.has(key)) {
          return false
        }
        taken.add(key)
        return true
      })
      if (!fresh.length) {
        throw AppError.validation({ name: "Bu qiymat ro'yxatda bor" })
      }

      await em.insert(
        AttributeValue,
        fresh.map((value) => ({
          orgId: actor.orgId,
          attributeId,
          name: value.name,
          hex: attribute.kind === 'color' ? value.hex : null,
          sortOrder: ++position,
          isActive: true,
        })),
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'attribute.values_add',
        entity: 'attribute',
        entityId: attributeId,
        summary: `${attribute.name}: ${fresh.map((value) => value.name).join(', ')}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['attributes']))
      return this.load(em, attributeId)
    })
  }

  async updateValue(actor: Actor, valueId: string, input: AttributeValueInput): Promise<AttributeDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.findValue(em, valueId)
      const attribute = await this.find(em, before.attributeId)
      const clash = await em
        .createQueryBuilder(AttributeValue, 'v')
        .where('v.attributeId = :attributeId AND lower(v.name) = lower(:name) AND v.id <> :valueId', {
          attributeId: before.attributeId,
          name: input.name,
          valueId,
        })
        .getCount()
      if (clash) {
        throw AppError.validation({ name: "Bu qiymat ro'yxatda bor" })
      }

      await em.update(AttributeValue, valueId, { name: input.name, hex: attribute.kind === 'color' ? input.hex : null })
      const after = await this.findValue(em, valueId)
      if (before.name !== after.name) {
        // Variants are found by the names of their values.
        await reindexProductsWhere(
          em,
          `EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND ${USES_VALUE})`,
          [valueId],
        )
      }
      await this.audit.record(em, actor.orgId, actor, {
        action: 'attribute.value_update',
        entity: 'attribute',
        entityId: before.attributeId,
        summary: `${attribute.name}: ${after.name}`,
        changes: diff(before, after, ['name', 'hex']),
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['attributes', 'products']))
      return this.load(em, before.attributeId)
    })
  }

  async setValueActive(actor: Actor, valueId: string, active: boolean): Promise<AttributeDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.findValue(em, valueId)
      if (before.isActive !== active) {
        const attribute = await this.find(em, before.attributeId)
        await em.update(AttributeValue, valueId, { isActive: active })
        await this.audit.record(em, actor.orgId, actor, {
          action: active ? 'attribute.value_restore' : 'attribute.value_archive',
          entity: 'attribute',
          entityId: before.attributeId,
          summary: `${attribute.name}: ${before.name}`,
        })
        afterCommit(() => this.realtime.changed(actor.orgId, ['attributes']))
      }
      return this.load(em, before.attributeId)
    })
  }

  async removeValue(actor: Actor, valueId: string): Promise<AttributeDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const value = await this.findValue(em, valueId)
      const attribute = await this.find(em, value.attributeId)
      const [{ used }] = await em.query(
        `SELECT EXISTS (SELECT 1 FROM product_variants v WHERE ${USES_VALUE}) AS used`,
        [valueId],
      )
      if (used) {
        throw AppError.conflict('IN_USE', "Bu qiymat tovarlarda ishlatilgan. O'chirish o'rniga arxivlang")
      }
      await em.delete(AttributeValue, valueId)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'attribute.value_delete',
        entity: 'attribute',
        entityId: value.attributeId,
        summary: `${attribute.name}: ${value.name}`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['attributes']))
      return this.load(em, value.attributeId)
    })
  }

  /** Puts the values in the given order; values left out keep their place after them. */
  async reorderValues(actor: Actor, attributeId: string, input: OrderInput): Promise<AttributeDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.find(em, attributeId)
      const values = await em.find(AttributeValue, { where: { attributeId }, order: { sortOrder: 'ASC', name: 'ASC' } })
      const known = new Set(values.map((value) => value.id))
      const first = input.ids.filter((id, index) => known.has(id) && input.ids.indexOf(id) === index)
      const order = [...first, ...values.map((value) => value.id).filter((id) => !first.includes(id))]
      await em.query(
        `UPDATE attribute_values v SET sort_order = d.position
         FROM unnest($1::uuid[]) WITH ORDINALITY AS d (id, position)
         WHERE v.id = d.id AND v.sort_order <> d.position`,
        [order],
      )
      afterCommit(() => this.realtime.changed(actor.orgId, ['attributes', 'products']))
      return this.load(em, attributeId)
    })
  }

  private async load(em: EntityManager, id: string): Promise<AttributeDto> {
    const attribute = await this.find(em, id)
    const values = await em.find(AttributeValue, {
      where: { attributeId: id },
      order: { sortOrder: 'ASC', name: 'ASC' },
    })
    return toDto(attribute, values)
  }

  private async find(em: EntityManager, id: string): Promise<Attribute> {
    const attribute = await em.findOneBy(Attribute, { id })
    if (!attribute) {
      throw AppError.notFound('Xususiyat topilmadi')
    }
    return attribute
  }

  private async findValue(em: EntityManager, id: string): Promise<AttributeValue> {
    const value = await em.findOneBy(AttributeValue, { id })
    if (!value) {
      throw AppError.notFound('Qiymat topilmadi')
    }
    return value
  }

  private async assertNameFree(em: EntityManager, name: string, exceptId?: string) {
    const taken = await em
      .createQueryBuilder(Attribute, 'a')
      .where('lower(a.name) = lower(:name)', { name })
      .andWhere(exceptId ? 'a.id <> :exceptId' : '1 = 1', { exceptId })
      .getCount()
    if (taken) {
      throw AppError.validation({ name: 'Bunday xususiyat bor' })
    }
  }
}

function toDto(attribute: Attribute, values: AttributeValue[]): AttributeDto {
  return {
    id: attribute.id,
    name: attribute.name,
    kind: attribute.kind,
    isActive: attribute.isActive,
    values: values.map((value) => ({ id: value.id, name: value.name, hex: value.hex, isActive: value.isActive })),
  }
}
