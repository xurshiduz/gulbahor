import {
  hasPermission,
  OWNER_ROLE_KEY,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  searchKey,
  type Page,
  type SessionDto,
  type UserCreateInput,
  type UserDto,
  type UserListQuery,
  type UserUpdateInput,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import { In, type EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { applySearch, applySort } from '../../common/listing'
import { Db } from '../../database/db.service'
import { Location, Role, Session, User } from '../../database/entities'
import { AuditService, diff } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { ActorService } from '../auth/actor.service'
import { toSessionDto } from '../auth/auth.service'
import { hashSecret } from '../auth/crypto'
import { RealtimeService } from '../realtime/realtime.service'

const SORTABLE = { fullName: 'u.fullName', login: 'u.login', lastLoginAt: 'u.lastLoginAt', createdAt: 'u.createdAt' }

const ROLES_JSON = `coalesce((
  SELECT json_agg(json_build_object('id', r.id, 'name', r.name) ORDER BY r.name)
  FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id
), '[]')`

const LOCATIONS_JSON = `coalesce((
  SELECT json_agg(json_build_object('id', l.id, 'name', l.name) ORDER BY l.name)
  FROM user_locations ul JOIN locations l ON l.id = ul.location_id WHERE ul.user_id = u.id
), '[]')`

const IS_OWNER = `EXISTS (
  SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = u.id AND r.is_system AND r.template_key = '${OWNER_ROLE_KEY}'
)`

interface Extras {
  roles: { id: string; name: string }[]
  locations: { id: string; name: string }[]
  is_owner: boolean
}

@Injectable()
export class UsersService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly actors: ActorService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(actor: Actor, query: UserListQuery): Promise<Page<UserDto>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const qb = this.baseQuery(em)
      if (query.status !== 'all') qb.andWhere('u.isActive = :active', { active: query.status === 'active' })
      if (query.roleId) {
        qb.andWhere('EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id = u.id AND x.role_id = :roleId)', { roleId: query.roleId })
      }
      if (query.locationId) {
        qb.andWhere(
          '(u.allLocations OR EXISTS (SELECT 1 FROM user_locations x WHERE x.user_id = u.id AND x.location_id = :locationId))',
          { locationId: query.locationId },
        )
      }
      applySearch(qb, 'u.search_key', query.q)
      applySort(qb, SORTABLE, query.sort, query.order, 'fullName')

      const total = await qb.getCount()
      const { entities, raw } = await qb
        .offset((query.page - 1) * query.size)
        .limit(query.size)
        .getRawAndEntities()

      return {
        items: entities.map((user, index) => toDto(user, raw[index])),
        total,
        page: query.page,
        size: query.size,
      }
    })
  }

  async get(actor: Actor, id: string): Promise<UserDto> {
    return this.db.tenant(actor.orgId, ({ em }) => this.findDto(em, id))
  }

  async create(actor: Actor, input: UserCreateInput): Promise<UserDto> {
    await this.assertLoginFree(input.login)
    const passwordHash = await hashSecret(input.password)

    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.assertPhoneFree(em, input.phone)
      await this.assertRoles(em, actor, input.roleIds)
      this.assertExtras(actor, input.extraPermissions)
      const locationIds = await this.resolveLocations(em, input)

      const user = await em.save(
        em.create(User, {
          orgId: actor.orgId,
          fullName: input.fullName,
          login: input.login,
          phone: input.phone,
          passwordHash,
          language: input.language,
          isActive: true,
          allLocations: input.allLocations,
          extraPermissions: tidy(input.extraPermissions),
          // The password was chosen by someone else, so the person sets their own at first sign-in.
          mustChangePassword: true,
          pinFailures: 0,
          searchKey: keyOf(input),
        }),
      )
      await this.replaceLinks(em, actor.orgId, user.id, input.roleIds, locationIds)

      await this.audit.record(em, actor.orgId, actor, {
        action: 'user.create',
        entity: 'user',
        entityId: user.id,
        summary: `${user.fullName} (${user.login})`,
      })
      afterCommit(() => this.realtime.changed(actor.orgId, ['users', 'roles']))
      return this.findDto(em, user.id)
    })
  }

  async update(actor: Actor, id: string, input: UserUpdateInput): Promise<UserDto> {
    const current = await this.db.tenant(actor.orgId, ({ em }) => this.findDto(em, id))
    if (current.login !== input.login) {
      await this.assertLoginFree(input.login)
    }

    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.findDto(em, id)
      this.assertMayTouch(actor, before)
      await this.assertPhoneFree(em, input.phone, id)
      await this.assertRoles(em, actor, input.roleIds, before.roles.map((role) => role.id))
      this.assertExtras(actor, input.extraPermissions, before.extraPermissions)
      const locationIds = await this.resolveLocations(em, input)

      const ownerRole = await this.ownerRole(em)
      const staysOwner = input.roleIds.includes(ownerRole.id)
      if (before.isOwner && !staysOwner) {
        await this.assertAnotherOwner(em, id)
      }

      await em.update(User, id, {
        fullName: input.fullName,
        login: input.login,
        phone: input.phone,
        language: input.language,
        allLocations: input.allLocations,
        extraPermissions: tidy(input.extraPermissions),
        searchKey: keyOf(input),
      })
      await this.replaceLinks(em, actor.orgId, id, input.roleIds, locationIds)
      const after = await this.findDto(em, id)

      await this.audit.record(em, actor.orgId, actor, {
        action: 'user.update',
        entity: 'user',
        entityId: id,
        summary: after.fullName,
        changes: diff(auditView(before), auditView(after), ['fullName', 'login', 'phone', 'language', 'allLocations', 'roles', 'extraPermissions', 'locations']),
      })
      afterCommit(() => {
        this.actors.invalidate()
        this.realtime.changed(actor.orgId, ['users', 'roles', 'me'])
      })
      return after
    })
  }

  async setActive(actor: Actor, id: string, active: boolean): Promise<UserDto> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const before = await this.findDto(em, id)
      if (before.isActive === active) {
        return before
      }
      this.assertMayTouch(actor, before)
      if (!active) {
        if (id === actor.userId) {
          throw AppError.conflict('SELF_BLOCK', 'O‘zingizni bloklay olmaysiz')
        }
        if (before.isOwner) {
          await this.assertAnotherOwner(em, id)
        }
        await this.revokeSessions(em, id, 'blocked')
      }

      await em.update(User, id, { isActive: active })
      await this.audit.record(em, actor.orgId, actor, {
        action: active ? 'user.unblock' : 'user.block',
        entity: 'user',
        entityId: id,
        summary: before.fullName,
        changes: { isActive: [before.isActive, active] },
      })
      afterCommit(() => {
        this.actors.invalidate()
        this.realtime.changed(actor.orgId, ['users'])
        if (!active) {
          this.realtime.userSignedOut(id)
        }
      })
      return this.findDto(em, id)
    })
  }

  /** A manager sets a temporary password; the person must replace it at next sign-in. */
  async resetPassword(actor: Actor, id: string, password: string): Promise<void> {
    const passwordHash = await hashSecret(password)
    await this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const user = await this.findDto(em, id)
      this.assertMayTouch(actor, user)
      await em.update(User, id, { passwordHash, mustChangePassword: id !== actor.userId, pinHash: null, pinFailures: 0 })
      if (id !== actor.userId) {
        await this.revokeSessions(em, id, 'password_reset')
      }
      await this.audit.record(em, actor.orgId, actor, {
        action: 'user.password_reset',
        entity: 'user',
        entityId: id,
        summary: `${user.fullName}: parol yangilandi`,
      })
      afterCommit(() => {
        this.actors.invalidate()
        if (id !== actor.userId) {
          this.realtime.userSignedOut(id)
        }
      })
    })
  }

  async sessions(actor: Actor, id: string): Promise<SessionDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      await this.findDto(em, id)
      const rows = await em
        .createQueryBuilder(Session, 's')
        .where('s.userId = :id AND s.revokedAt IS NULL AND s.expiresAt > now()', { id })
        .orderBy('s.lastUsedAt', 'DESC')
        .getMany()
      return rows.map((row) => toSessionDto(row, actor.sessionId))
    })
  }

  async revokeSession(actor: Actor, id: string, sessionId: string): Promise<void> {
    await this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const user = await this.findDto(em, id)
      this.assertMayTouch(actor, user)
      const result = await em
        .createQueryBuilder()
        .update(Session)
        .set({ revokedAt: new Date(), revokedReason: 'revoked_by_manager' })
        .where('id = :sessionId AND userId = :id AND revokedAt IS NULL', { sessionId, id })
        .execute()
      if (!result.affected) {
        throw AppError.notFound('Sessiya topilmadi')
      }
      await this.audit.record(em, actor.orgId, actor, {
        action: 'user.session_revoked',
        entity: 'user',
        entityId: id,
        summary: `${user.fullName}: qurilmadan chiqarildi`,
      })
      afterCommit(() => {
        this.actors.invalidate()
        this.realtime.sessionEnded(sessionId)
      })
    })
  }

  private baseQuery(em: EntityManager) {
    return em
      .createQueryBuilder(User, 'u')
      .addSelect(ROLES_JSON, 'roles')
      .addSelect(LOCATIONS_JSON, 'locations')
      .addSelect(IS_OWNER, 'is_owner')
  }

  private async findDto(em: EntityManager, id: string): Promise<UserDto> {
    const { entities, raw } = await this.baseQuery(em).where('u.id = :id', { id }).getRawAndEntities()
    if (!entities[0]) {
      throw AppError.notFound('Xodim topilmadi')
    }
    return toDto(entities[0], raw[0])
  }

  /** Logins are unique across every business, so the check has to look past this one. */
  private async assertLoginFree(login: string) {
    const taken = await this.db.system((em) =>
      em.createQueryBuilder(User, 'u').where('lower(u.login) = :login', { login }).getCount(),
    )
    if (taken) {
      throw AppError.validation({ login: 'Bu login band' })
    }
  }

  private async assertPhoneFree(em: EntityManager, phone: string | null, exceptId?: string) {
    if (!phone) {
      return
    }
    const other = await em
      .createQueryBuilder(User, 'u')
      .where('u.phone = :phone', { phone })
      .andWhere(exceptId ? 'u.id <> :exceptId' : '1 = 1', { exceptId })
      .getOne()
    if (other) {
      throw AppError.validation({ phone: `Bu raqam ${other.fullName}da bor` })
    }
  }

  /**
   * Roles must exist here, and a person can hand out only roles whose rights
   * they hold themselves. Roles the user already had may stay as they were.
   */
  private async assertRoles(em: EntityManager, actor: Actor, roleIds: string[], alreadyHeld: string[] = []) {
    const roles = await em.findBy(Role, { id: In(roleIds) })
    if (roles.length !== new Set(roleIds).size) {
      throw AppError.validation({ roleIds: 'Rol topilmadi' })
    }
    for (const role of roles) {
      if (alreadyHeld.includes(role.id)) {
        continue
      }
      if (role.isSystem && !actor.isOwner) {
        throw AppError.forbidden("«Egasi» rolini faqat egasi bera oladi", 'ESCALATION')
      }
      const covered = role.permissions.every((permission) =>
        permission === '*'
          ? actor.isOwner
          : permission.endsWith('.*')
            ? PERMISSION_KEYS.filter((key) => key.startsWith(permission.slice(0, -1))).every((key) =>
                hasPermission(actor.permissions, key),
              )
            : hasPermission(actor.permissions, permission),
      )
      if (!covered) {
        throw AppError.forbidden(`«${role.name}» rolida sizda yo‘q ruxsatlar bor, uni bera olmaysiz`, 'ESCALATION')
      }
    }
  }

  private async resolveLocations(em: EntityManager, input: { allLocations: boolean; locationIds: string[] }) {
    if (input.allLocations) {
      return []
    }
    const ids = [...new Set(input.locationIds)]
    const found = await em.findBy(Location, { id: In(ids), isActive: true })
    if (found.length !== ids.length) {
      throw AppError.validation({ locationIds: 'Do‘kon yoki sklad topilmadi' })
    }
    return ids
  }

  private async replaceLinks(em: EntityManager, orgId: string, userId: string, roleIds: string[], locationIds: string[]) {
    await em.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId])
    await em.query(`DELETE FROM user_locations WHERE user_id = $1`, [userId])
    for (const roleId of new Set(roleIds)) {
      await em.query(`INSERT INTO user_roles (user_id, role_id, org_id) VALUES ($1, $2, $3)`, [userId, roleId, orgId])
    }
    for (const locationId of locationIds) {
      await em.query(`INSERT INTO user_locations (user_id, location_id, org_id) VALUES ($1, $2, $3)`, [userId, locationId, orgId])
    }
  }

  private async revokeSessions(em: EntityManager, userId: string, reason: string) {
    await em
      .createQueryBuilder()
      .update(Session)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where('userId = :userId AND revokedAt IS NULL', { userId })
      .execute()
  }

  private async ownerRole(em: EntityManager): Promise<Role> {
    return em.findOneByOrFail(Role, { isSystem: true, templateKey: OWNER_ROLE_KEY })
  }

  /** A business must always keep at least one owner who can sign in. */
  private async assertAnotherOwner(em: EntityManager, exceptUserId: string) {
    const [{ count }] = await em.query(
      `SELECT count(*)::int AS count
       FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
       WHERE r.is_system AND r.template_key = $1 AND u.is_active AND u.id <> $2`,
      [OWNER_ROLE_KEY, exceptUserId],
    )
    if (!count) {
      throw AppError.conflict('LAST_OWNER', "Biznesda kamida bitta faol egasi qolishi kerak")
    }
  }

  /**
   * Permissions given beside the roles are given by someone who holds them: nobody hands out what they may not do
   * themselves. Those the person already had may stay.
   */
  private assertExtras(actor: Actor, extras: string[], alreadyHeld: string[] = []) {
    const beyond = extras.filter(
      (permission) => !alreadyHeld.includes(permission) && !hasPermission(actor.permissions, permission),
    )
    if (beyond.length) {
      throw AppError.forbidden(
        `Sizda yo‘q ruxsatni bera olmaysiz: ${beyond.map(permissionName).join(', ')}`,
        'ESCALATION',
      )
    }
  }

  private assertMayTouch(actor: Actor, target: UserDto) {
    if (target.isOwner && !actor.isOwner) {
      throw AppError.forbidden('Egasining ma’lumotlarini faqat egasi o‘zgartira oladi')
    }
  }
}

function keyOf(user: { fullName: string; login: string; phone: string | null }): string {
  return searchKey(`${user.fullName} ${user.login} ${user.phone ?? ''}`)
}

function auditView(user: UserDto) {
  return {
    fullName: user.fullName,
    login: user.login,
    phone: user.phone,
    language: user.language,
    allLocations: user.allLocations,
    roles: user.roles.map((role) => role.name),
    extraPermissions: user.extraPermissions.map(permissionName),
    locations: user.locations.map((location) => location.name),
  }
}

/** Each once, in the order of the list of permissions: what is stored does not change with the order it was ticked. */
function tidy(extras: string[]): string[] {
  return PERMISSION_KEYS.filter((key) => extras.includes(key))
}

/** "Kassa: Qarzga sotish": a permission as the screens name it. */
function permissionName(key: string): string {
  for (const group of PERMISSION_GROUPS) {
    const found = group.permissions.find((item) => item.key === key)
    if (found) {
      return `${group.title}: ${found.title}`
    }
  }
  return key
}

function toDto(user: User, extras: Extras): UserDto {
  return {
    id: user.id,
    fullName: user.fullName,
    login: user.login,
    phone: user.phone,
    language: user.language,
    isActive: user.isActive,
    isOwner: extras.is_owner,
    allLocations: user.allLocations,
    roles: extras.roles,
    extraPermissions: user.extraPermissions,
    locations: extras.locations,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  }
}
