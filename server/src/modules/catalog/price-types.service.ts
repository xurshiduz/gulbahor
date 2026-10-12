import { formulaText, type PriceTypeDto, type PriceTypeInput } from '@erp/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Price, PriceRule, PriceRuleMarkup, PriceType } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'

/**
 * The prices a model can carry: the retail one, the floor nobody sells under,
 * and whatever a business adds — wholesale, a family price. The first two are
 * the system's own: there is always exactly one of each, because the till
 * needs a price to start from and a floor to stop at. Every price is in the
 * base.
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
      const own = await this.formulas(em)
      return types.map((type) => toDto(type, own.get(type.id) ?? null))
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
          kind: 'other',
          currency: actor.base,
          roundStep: input.roundStep,
          roundEnding: input.roundEnding,
          tillAccess: input.tillAccess,
          skipsFloor: input.tillAccess !== 'none' && input.skipsFloor,
          sortOrder: next,
          isActive: true,
        }),
      )
      if (input.formula) {
        await this.setFormula(em, actor, saved, input.formula)
      }
      await this.audit.record(em, actor.orgId, actor, {
        action: 'price_type.create',
        entity: 'price_type',
        entityId: saved.id,
        summary: saved.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['price-types', 'pricing']))
      return toDto(saved, (await this.formulas(em)).get(saved.id) ?? null)
    })
  }

  async update(actor: Actor, id: string, input: PriceTypeInput): Promise<PriceTypeDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      await this.assertValid(em, input, before)
      await em.update(PriceType, id, {
        name: input.name,
        roundStep: input.roundStep,
        roundEnding: input.roundEnding,
        tillAccess: input.tillAccess,
        // What is not sold at the till has no floor to go under.
        skipsFloor: input.tillAccess !== 'none' && input.skipsFloor,
      })
      const after = await this.find(em, id)
      const was = (await this.formulas(em)).get(id) ?? null
      if (input.formula !== undefined) {
        await this.setFormula(em, actor, after, input.formula)
      }
      const now = (await this.formulas(em)).get(id) ?? null
      const said = (formula: PriceTypeDto['formula']) => (formula ? formulaText(formula, after.currency) : 'qo‘lda')
      await this.audit.record(em, actor.orgId, actor, {
        action: 'price_type.update',
        entity: 'price_type',
        entityId: id,
        summary: after.name,
        changes: {
          ...diff(before, after, ['name', 'roundStep', 'roundEnding', 'tillAccess', 'skipsFloor']),
          ...(said(was) === said(now) ? {} : { formula: [said(was), said(now)] }),
        },
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['price-types', 'products', 'pos', 'pricing']))
      return toDto(after, now)
    })
  }

  async setActive(actor: Actor, id: string, active: boolean): Promise<PriceTypeDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      if (before.isActive !== active) {
        if (!active && before.kind !== 'other') {
          throw AppError.conflict('SYSTEM_PRICE_TYPE', `«${before.name}» — tizim narxi: uni arxivlab bo‘lmaydi`)
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
      return toDto(await this.find(em, id), (await this.formulas(em)).get(id) ?? null)
    })
  }

  async remove(actor: Actor, id: string): Promise<void> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const type = await this.find(em, id)
      if (type.kind !== 'other') {
        throw AppError.conflict('SYSTEM_PRICE_TYPE', `«${type.name}» — tizim narxi: uni o‘chirib bo‘lmaydi`)
      }
      if (await em.countBy(Price, { priceTypeId: id })) {
        throw AppError.conflict('IN_USE', 'Bu narx turida narxlar qo‘yilgan. O‘chirish o‘rniga arxivlang')
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

  /**
   * Each price type's own way of being worked out: what the rule for everything — no category, brand or season —
   * says of it. Kept there so that one lookup (`pickMarkup`) answers for every product, the narrowest rule first.
   */
  private async formulas(em: EntityManager): Promise<Map<string, NonNullable<PriceTypeDto['formula']>>> {
    const rows: { price_type_id: string; base: 'cost' | 'retail' | 'fixed'; percent: number; amount: number }[] =
      await em.query(
        `SELECT m.price_type_id, m.base, m.percent::float8 AS percent, m.amount::float8 AS amount
         FROM price_rule_markups m JOIN price_rules r ON r.id = m.rule_id
         WHERE r.category_id IS NULL AND r.brand_id IS NULL AND r.season IS NULL`,
      )
    return new Map(
      rows.flatMap((row) =>
        row.base === 'fixed' ? [] : [[row.price_type_id, { base: row.base, percent: row.percent, amount: row.amount }]],
      ),
    )
  }

  /** Writes a price type's own way into the rule for everything, or takes it out; a rule left empty goes. */
  private async setFormula(
    em: EntityManager,
    actor: Actor,
    type: PriceType,
    formula: NonNullable<PriceTypeInput['formula']> | null,
  ) {
    const [everything]: { id: string }[] = await em.query(
      `SELECT id FROM price_rules WHERE category_id IS NULL AND brand_id IS NULL AND season IS NULL`,
    )
    const ruleId =
      everything?.id ??
      (formula
        ? (await em.save(em.create(PriceRule, { orgId: actor.orgId, categoryId: null, brandId: null, season: null })))
            .id
        : null)
    if (!ruleId) {
      return
    }
    await em.delete(PriceRuleMarkup, { ruleId, priceTypeId: type.id })
    if (formula) {
      await em.insert(PriceRuleMarkup, { orgId: actor.orgId, ruleId, priceTypeId: type.id, ...formula })
    } else if (!(await em.countBy(PriceRuleMarkup, { ruleId }))) {
      await em.delete(PriceRule, ruleId)
    }
  }

  private async find(em: EntityManager, id: string): Promise<PriceType> {
    const type = await em.findOneBy(PriceType, { id })
    if (!type) {
      throw AppError.notFound('Narx turi topilmadi')
    }
    return type
  }

  /** `before` is the type being changed; a new one is always an added price, never the system's own. */
  private async assertValid(em: EntityManager, input: PriceTypeInput, before?: PriceType) {
    const others = await em
      .createQueryBuilder(PriceType, 't')
      .where(before ? 't.id <> :id' : '1 = 1', { id: before?.id })
      .getMany()
    const fields: Record<string, string> = {}
    if (others.some((other) => other.name.toLowerCase() === input.name.toLowerCase())) {
      fields.name = 'Bunday narx turi bor'
    }
    if (before && before.kind !== 'other' && input.tillAccess !== 'none') {
      fields.tillAccess = 'Chakana narx — kassaning o‘z narxi; minimal narxda esa sotilmaydi'
    }
    if (input.formula?.base === 'retail' && before?.kind === 'retail') {
      fields.formula = 'Chakana narxning o‘zi chakana narxdan hisoblanmaydi'
    }
    if (Object.keys(fields).length) {
      throw AppError.validation(fields)
    }
  }
}

function toDto(type: PriceType, formula: PriceTypeDto['formula']): PriceTypeDto {
  return {
    formula,
    id: type.id,
    name: type.name,
    kind: type.kind,
    currency: type.currency,
    roundStep: type.roundStep,
    roundEnding: type.roundEnding,
    tillAccess: type.tillAccess,
    skipsFloor: type.skipsFloor,
    isActive: type.isActive,
  }
}
