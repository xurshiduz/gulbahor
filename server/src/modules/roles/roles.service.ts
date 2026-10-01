import { ALL_PERMISSIONS, hasPermission, PERMISSION_GROUPS, PERMISSION_KEYS, type RoleDto, type RoleInput } from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Role } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { ActorService } from '../auth/actor.service'
import { RealtimeService } from '../realtime/realtime.service'

const GRANTABLE = new Set([...PERMISSION_KEYS, ...PERMISSION_GROUPS.map((group) => `${group.key}.*`)])

@Injectable()
export class RolesService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly actors: ActorService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(actor: Actor): Promise<RoleDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const { entities, raw } = await em
        .createQueryBuilder(Role, 'r')
        .addSelect('(SELECT count(*)::int FROM user_roles ur WHERE ur.role_id = r.id)', 'user_count')
        .orderBy('r.isSystem', 'DESC')
        .addOrderBy('r.createdAt', 'ASC')
        .addOrderBy('r.name', 'ASC')
        .getRawAndEntities()
      return entities.map((role, index) => toDto(role, raw[index].user_count))
    })
  }

  async create(actor: Actor, input: RoleInput): Promise<RoleDto> {
    this.assertGrantable(actor, input.permissions)
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.assertNameFree(em, input.name)
      const role = await em.save(
        em.create(Role, {
          orgId: actor.orgId,
          name: input.name,
          description: input.description,
          permissions: unique(input.permissions),
          isSystem: false,
        }),
      )
      await this.audit.record(em, actor.orgId, actor, {
        action: 'role.create',
        entity: 'role',
        entityId: role.id,
        summary: role.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['roles']))
      return toDto(role, 0)
    })
  }

  async update(actor: Actor, id: string, input: RoleInput): Promise<RoleDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.find(em, id)
      if (before.isSystem) {
        throw AppError.forbidden("«Egasi» roli o'zgartirilmaydi", 'SYSTEM_ROLE')
      }
      // Only what is being added needs to be within the actor's own rights; what the role already had may stay.
      this.assertGrantable(
        actor,
        input.permissions.filter((permission) => !before.permissions.includes(permission)),
      )
      await this.assertNameFree(em, input.name, id)

      await em.update(Role, id, {
        name: input.name,
        description: input.description,
        permissions: unique(input.permissions),
      })
      const after = await this.find(em, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'role.update',
        entity: 'role',
        entityId: id,
        summary: after.name,
        changes: diff(before, after, ['name', 'description', 'permissions']),
      })
      afterCommit(() => {
        this.actors.invalidate()
        this.realtime.changed(actor.orgId, ['roles', 'me'])
      })
      const [{ count }] = await em.query(`SELECT count(*)::int AS count FROM user_roles WHERE role_id = $1`, [id])
      return toDto(after, count)
    })
  }

  async remove(actor: Actor, id: string): Promise<void> {
    await this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const role = await this.find(em, id)
      if (role.isSystem) {
        throw AppError.forbidden("«Egasi» roli o'chirilmaydi", 'SYSTEM_ROLE')
      }
      const [{ count }] = await em.query(`SELECT count(*)::int AS count FROM user_roles WHERE role_id = $1`, [id])
      if (count) {
        throw AppError.conflict('ROLE_IN_USE', `Bu rol ${count} ta xodimga berilgan. Avval ulardan olib tashlang`)
      }
      await em.delete(Role, id)
      await this.audit.record(em, actor.orgId, actor, {
        action: 'role.delete',
        entity: 'role',
        entityId: id,
        summary: role.name,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['roles']))
    })
  }

  private async find(em: EntityManager, id: string): Promise<Role> {
    const role = await em.findOneBy(Role, { id })
    if (!role) {
      throw AppError.notFound('Rol topilmadi')
    }
    return role
  }

  private async assertNameFree(em: EntityManager, name: string, exceptId?: string) {
    const clash = await em
      .createQueryBuilder(Role, 'r')
      .where('lower(r.name) = lower(:name)', { name })
      .andWhere(exceptId ? 'r.id <> :exceptId' : '1 = 1', { exceptId })
      .getCount()
    if (clash) {
      throw AppError.validation({ name: 'Bunday nomli rol bor' })
    }
  }

  /** Nobody hands out a right they do not hold themselves. */
  private assertGrantable(actor: Actor, permissions: string[]) {
    for (const permission of permissions) {
      if (permission === ALL_PERMISSIONS || !GRANTABLE.has(permission)) {
        throw AppError.validation({ permissions: `Noma'lum ruxsat: ${permission}` })
      }
      const held = permission.endsWith('.*')
        ? PERMISSION_KEYS.filter((key) => key.startsWith(permission.slice(0, -1))).every((key) => hasPermission(actor.permissions, key))
        : hasPermission(actor.permissions, permission)
      if (!held) {
        throw AppError.forbidden("O'zingizda yo'q ruxsatni boshqaga bera olmaysiz", 'ESCALATION')
      }
    }
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort()
}

function toDto(role: Role, userCount: number): RoleDto {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    templateKey: role.templateKey,
    permissions: role.permissions,
    isSystem: role.isSystem,
    userCount,
  }
}
