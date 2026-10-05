import {
  LOCATION_KIND_LABELS,
  MODULES,
  ROLE_TEMPLATES,
  OWNER_ROLE_KEY,
  searchKey,
  type ModulesInput,
  type OrgDto,
  type OrgUpdateInput,
  type SetupInput,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Location, Organization, Role, User } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { ActorService } from '../auth/actor.service'
import { hashSecret } from '../auth/crypto'
import { applyStarter, createPriceTypes } from '../catalog/starter'
import { LocationsService } from '../locations/locations.service'
import { RealtimeService } from '../realtime/realtime.service'
import { toOrgDto } from './org.mapper'

/** Only what was sent: a setting left out of a request stays as it is. */
const given = <T extends object>(values: T): Partial<T> =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<T>

export interface NewOrganization {
  name: string
  owner: { fullName: string; login: string; password: string }
}

@Injectable()
export class OrgsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly actors: ActorService,
    private readonly realtime: RealtimeService,
    private readonly locations: LocationsService,
  ) {}

  async get(actor: Actor): Promise<OrgDto> {
    return this.db.tenant(actor.orgId, async ({ em }) =>
      toOrgDto(await em.findOneByOrFail(Organization, { id: actor.orgId })),
    )
  }

  async update(actor: Actor, input: OrgUpdateInput): Promise<OrgDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await em.findOneByOrFail(Organization, { id: actor.orgId })
      await em.update(Organization, actor.orgId, {
        name: input.name,
        settings: { ...before.settings, ...given(input.settings) },
      })
      const after = await em.findOneByOrFail(Organization, { id: actor.orgId })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'org.update',
        entity: 'org',
        entityId: actor.orgId,
        summary: 'Biznes sozlamalari',
        changes: {
          ...diff(before, after, ['name']),
          ...diff(before.settings as Record<string, unknown>, after.settings as Record<string, unknown>, [
            'autoLockMinutes',
            'changeRoundStep',
            'maxDiscountPercent',
            'maxRateLossPercent',
            'returnDays',
          ]),
        },
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['me']))
      return toOrgDto(after)
    })
  }

  async setModules(actor: Actor, input: ModulesInput): Promise<OrgDto> {
    const modules = withRequired(input.modules)
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await em.findOneByOrFail(Organization, { id: actor.orgId })
      await em.update(Organization, actor.orgId, { modules })
      const after = await em.findOneByOrFail(Organization, { id: actor.orgId })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'org.modules',
        entity: 'org',
        entityId: actor.orgId,
        summary: 'Modullar',
        changes: diff(before, after, ['modules']),
      })
      afterCommit(() => {
        this.actors.invalidate()
        this.realtime.changed(actor.orgId, ['me'])
      })
      return toOrgDto(after)
    })
  }

  /** The first-run wizard: name the business, list its shops and pick what it needs. Runs once. */
  async setup(actor: Actor, input: SetupInput): Promise<OrgDto> {
    if (!actor.isOwner) {
      throw AppError.forbidden("Boshlang'ich sozlashni faqat egasi qiladi")
    }
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const org = await em.findOneByOrFail(Organization, { id: actor.orgId })
      if (org.setupCompleted) {
        throw AppError.conflict('ALREADY_SET_UP', "Boshlang'ich sozlash allaqachon bajarilgan")
      }

      const names = input.locations.map((location) => location.name.toLowerCase())
      const repeated = names.findIndex((name, index) => names.indexOf(name) !== index)
      if (repeated !== -1) {
        throw AppError.validation({ [`locations.${repeated}.name`]: 'Bu nom takrorlangan' })
      }

      for (const location of input.locations) {
        const code = await this.locations.nextCode(em, location.kind)
        const saved = await em.save(
          em.create(Location, {
            orgId: actor.orgId,
            name: location.name,
            code,
            kind: location.kind,
            isActive: true,
            searchKey: searchKey(`${location.name} ${code}`),
          }),
        )
        await this.audit.record(em, actor.orgId, actor, {
          action: 'location.create',
          entity: 'location',
          entityId: saved.id,
          summary: `${LOCATION_KIND_LABELS[saved.kind]}: ${saved.name}`,
        })
      }

      await applyStarter(em, actor.orgId)

      const modules = withRequired([...input.modules, ...(input.useUsd ? ['usd'] : [])])
      await em.update(Organization, actor.orgId, { name: input.name, modules, setupCompleted: true })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'org.setup',
        entity: 'org',
        entityId: actor.orgId,
        summary: `Boshlang'ich sozlash: ${input.name}`,
      })

      afterCommit(() => {
        this.actors.invalidate()
        this.realtime.changed(actor.orgId, ['me', 'locations', 'attributes', 'categories'])
      })
      return toOrgDto(await em.findOneByOrFail(Organization, { id: actor.orgId }))
    })
  }

  /**
   * Creates a business with its ready-made roles and its owner. There is no
   * organization to scope to yet, so this runs as a system transaction.
   */
  async create(input: NewOrganization): Promise<{ orgId: string; ownerId: string }> {
    const passwordHash = await hashSecret(input.owner.password)
    return this.db.system(async (em) => {
      const taken = await em
        .createQueryBuilder(User, 'u')
        .where('lower(u.login) = :login', { login: input.owner.login })
        .getCount()
      if (taken) {
        throw AppError.validation({ login: 'Bu login band' })
      }

      const org = await em.save(
        em.create(Organization, {
          name: input.name,
          timezone: 'Asia/Tashkent',
          baseCurrency: 'UZS',
          modules: [],
          settings: {},
          setupCompleted: false,
        }),
      )
      const roles = await this.createRoles(em, org.id)
      await createPriceTypes(em, org.id)
      const owner = await em.save(
        em.create(User, {
          orgId: org.id,
          fullName: input.owner.fullName,
          login: input.owner.login.toLowerCase(),
          passwordHash,
          language: 'uz',
          isActive: true,
          allLocations: true,
          mustChangePassword: false,
          pinFailures: 0,
          searchKey: searchKey(`${input.owner.fullName} ${input.owner.login}`),
        }),
      )
      const ownerRole = roles.find((role) => role.templateKey === OWNER_ROLE_KEY) as Role
      await em.query(`INSERT INTO user_roles (user_id, role_id, org_id) VALUES ($1, $2, $3)`, [
        owner.id,
        ownerRole.id,
        org.id,
      ])
      await this.audit.record(em, org.id, null, {
        action: 'org.create',
        entity: 'org',
        entityId: org.id,
        summary: `Biznes yaratildi: ${org.name}`,
      })
      return { orgId: org.id, ownerId: owner.id }
    })
  }

  private async createRoles(em: EntityManager, orgId: string): Promise<Role[]> {
    return em.save(
      ROLE_TEMPLATES.map((template) =>
        em.create(Role, {
          orgId,
          name: template.name,
          description: template.description,
          templateKey: template.key,
          permissions: template.permissions,
          isSystem: !!template.system,
        }),
      ),
    )
  }
}

/** A module that depends on another switches that one on too. */
function withRequired(modules: string[]): string[] {
  const result = new Set(modules)
  for (const key of modules) {
    for (const required of MODULES.find((module) => module.key === key)?.requires ?? []) {
      result.add(required)
    }
  }
  return [...result].sort()
}
