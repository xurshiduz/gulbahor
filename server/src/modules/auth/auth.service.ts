import {
  searchKey,
  type ChangePasswordInput,
  type LoginInput,
  type MeDto,
  type ProfileInput,
  type SessionDto,
  type SetPinInput,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Organization, Session, User } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import { toOrgDto } from '../orgs/org.mapper'
import { RealtimeService } from '../realtime/realtime.service'
import type { Actor } from './actor'
import { ActorService, REFRESH_TTL_DAYS } from './actor.service'
import { fakeVerify, hashSecret, hashToken, newToken, verifySecret } from './crypto'

export interface ClientMeta {
  ip: string | null
  userAgent: string | undefined
  device: string
}

export interface Tokens {
  access: string
  /** Absent when the previous token was reused within the grace window: the browser already holds the new one. */
  refresh?: string
}

/** A replaced refresh token still works this long, for tabs that were refreshing at the same moment. */
const ROTATION_GRACE_SECONDS = 60
const MAX_PIN_FAILURES = 5

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly actors: ActorService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async login(input: LoginInput, meta: ClientMeta): Promise<Tokens> {
    const user = await this.db.system((em) =>
      em.createQueryBuilder(User, 'u').where('lower(u.login) = :login', { login: input.login }).getOne(),
    )

    if (!user) {
      await fakeVerify(input.password)
      throw this.invalidCredentials()
    }

    if (!(await verifySecret(input.password, user.passwordHash))) {
      await this.db.tenant(user.orgId, ({ em }) =>
        this.audit.record(
          em,
          user.orgId,
          { userId: user.id, name: user.fullName, ip: meta.ip },
          { action: 'auth.login_failed', entity: 'user', entityId: user.id, summary: `Noto'g'ri parol · ${meta.device}` },
        ),
      )
      throw this.invalidCredentials()
    }

    if (!user.isActive) {
      throw AppError.forbidden('Hisobingiz bloklangan. Rahbarga murojaat qiling', 'BLOCKED')
    }

    const refresh = newToken()
    const sessionId = await this.db.tenant(user.orgId, async ({ em }) => {
      const session = await em.save(
        em.create(Session, {
          orgId: user.orgId,
          userId: user.id,
          refreshHash: hashToken(refresh),
          device: meta.device,
          userAgent: meta.userAgent?.slice(0, 400) ?? null,
          ip: meta.ip,
          lastUsedAt: new Date(),
          expiresAt: daysFromNow(REFRESH_TTL_DAYS),
        }),
      )
      await em.update(User, user.id, { lastLoginAt: new Date() })
      await this.audit.record(
        em,
        user.orgId,
        { userId: user.id, name: user.fullName, ip: meta.ip },
        { action: 'auth.login', entity: 'user', entityId: user.id, summary: meta.device },
      )
      return session.id
    })

    return { access: this.actors.signAccess({ sub: user.id, org: user.orgId, sid: sessionId }), refresh }
  }

  async refresh(token: string | undefined, meta: ClientMeta): Promise<Tokens> {
    if (!token) {
      throw this.sessionEnded()
    }
    const hash = hashToken(token)

    // The transaction returns a verdict rather than throwing, so a revocation made inside it is kept.
    const tokens = await this.db.system(async (em): Promise<Tokens | null> => {
      const session = await em
        .createQueryBuilder(Session, 's')
        .setLock('pessimistic_write')
        .where('(s.refreshHash = :hash OR s.prevRefreshHash = :hash)', { hash })
        .andWhere('s.revokedAt IS NULL AND s.expiresAt > now()')
        .getOne()
      if (!session) {
        return null
      }

      const user = await em.findOneBy(User, { id: session.userId, isActive: true })
      if (!user) {
        return null
      }

      const access = this.actors.signAccess({ sub: user.id, org: user.orgId, sid: session.id })

      if (session.refreshHash !== hash) {
        const fresh = session.rotatedAt && Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_SECONDS * 1000
        if (!fresh) {
          // An old token came back long after its replacement was issued: treat the session as stolen.
          await em.update(Session, session.id, { revokedAt: new Date(), revokedReason: 'refresh_reuse' })
          return null
        }
        return { access }
      }

      const refresh = newToken()
      await em.update(Session, session.id, {
        refreshHash: hashToken(refresh),
        prevRefreshHash: hash,
        rotatedAt: new Date(),
        lastUsedAt: new Date(),
        ip: meta.ip,
        expiresAt: daysFromNow(REFRESH_TTL_DAYS),
      })
      return { access, refresh }
    })

    if (!tokens) {
      this.actors.invalidate()
      throw this.sessionEnded()
    }
    return tokens
  }

  async logout(actor: Actor): Promise<void> {
    await this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await em.update(Session, actor.sessionId, { revokedAt: new Date(), revokedReason: 'logout' })
      await this.audit.record(em, actor.orgId, actor, { action: 'auth.logout', entity: 'user', entityId: actor.userId })
      afterCommit(() => this.actors.invalidate())
    })
  }

  async me(actor: Actor): Promise<MeDto> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const user = await em.findOneByOrFail(User, { id: actor.userId })
      const org = await em.findOneByOrFail(Organization, { id: actor.orgId })
      const roles: { id: string; name: string }[] = await em.query(
        `SELECT r.id, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 ORDER BY r.name`,
        [actor.userId],
      )
      return {
        user: {
          id: user.id,
          fullName: user.fullName,
          login: user.login,
          phone: user.phone,
          language: user.language,
          hasPin: !!user.pinHash,
          mustChangePassword: user.mustChangePassword,
          roles,
          isOwner: actor.isOwner,
          permissions: actor.permissions,
          allLocations: actor.allLocations,
          locationIds: actor.locationIds,
        },
        org: toOrgDto(org),
      }
    })
  }

  async updateProfile(actor: Actor, input: ProfileInput): Promise<void> {
    await this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const user = await em.findOneByOrFail(User, { id: actor.userId })
      await em.update(User, user.id, {
        fullName: input.fullName,
        language: input.language,
        searchKey: searchKey(`${input.fullName} ${user.login} ${user.phone ?? ''}`),
      })
      afterCommit(() => {
        this.actors.invalidate()
        this.realtime.changed(actor.orgId, ['users', 'me'])
      })
    })
  }

  async changePassword(actor: Actor, input: ChangePasswordInput): Promise<void> {
    const user = await this.db.tenant(actor.orgId, ({ em }) => em.findOneByOrFail(User, { id: actor.userId }))
    if (!(await verifySecret(input.current, user.passwordHash))) {
      throw AppError.validation({ current: "Joriy parol noto'g'ri" })
    }
    const passwordHash = await hashSecret(input.next)

    await this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await em.update(User, user.id, { passwordHash, mustChangePassword: false })
      // Every other device has to sign in again with the new password.
      await em
        .createQueryBuilder()
        .update(Session)
        .set({ revokedAt: new Date(), revokedReason: 'password_changed' })
        .where('userId = :userId AND id <> :current AND revokedAt IS NULL', { userId: user.id, current: actor.sessionId })
        .execute()
      await this.audit.record(em, actor.orgId, actor, {
        action: 'auth.password_changed',
        entity: 'user',
        entityId: user.id,
        summary: "Parol o'zgartirildi",
      })
      afterCommit(() => this.actors.invalidate())
    })
  }

  async setPin(actor: Actor, input: SetPinInput): Promise<void> {
    const user = await this.db.tenant(actor.orgId, ({ em }) => em.findOneByOrFail(User, { id: actor.userId }))
    if (!(await verifySecret(input.password, user.passwordHash))) {
      throw AppError.validation({ password: "Parol noto'g'ri" })
    }
    const pinHash = await hashSecret(input.pin)
    await this.db.tenant(actor.orgId, async ({ em }) => {
      await em.update(User, user.id, { pinHash, pinFailures: 0 })
      await this.audit.record(em, actor.orgId, actor, {
        action: 'auth.pin_set',
        entity: 'user',
        entityId: user.id,
        summary: "PIN kod o'rnatildi",
      })
    })
  }

  /**
   * Checks the PIN that unlocks the screen. After several wrong tries the
   * session itself ends and the full password is needed again.
   */
  async unlock(actor: Actor, pin: string): Promise<void> {
    const user = await this.db.tenant(actor.orgId, ({ em }) => em.findOneByOrFail(User, { id: actor.userId }))
    if (!user.pinHash) {
      throw AppError.badRequest('NO_PIN', "PIN kod o'rnatilmagan")
    }

    if (await verifySecret(pin, user.pinHash)) {
      if (user.pinFailures) {
        await this.db.tenant(actor.orgId, ({ em }) => em.update(User, user.id, { pinFailures: 0 }))
      }
      return
    }

    const failures = user.pinFailures + 1
    const locked = failures >= MAX_PIN_FAILURES
    await this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await em.update(User, user.id, { pinFailures: locked ? 0 : failures })
      if (locked) {
        await em.update(Session, actor.sessionId, { revokedAt: new Date(), revokedReason: 'pin_failures' })
        await this.audit.record(em, actor.orgId, actor, {
          action: 'auth.pin_locked',
          entity: 'user',
          entityId: user.id,
          summary: `PIN ${MAX_PIN_FAILURES} marta noto'g'ri kiritildi, sessiya yopildi`,
        })
        afterCommit(() => this.actors.invalidate())
      }
    })

    if (locked) {
      throw AppError.unauthorized('SESSION_ENDED', "PIN ko'p marta noto'g'ri kiritildi. Parol bilan qayta kiring")
    }
    throw AppError.validation({ pin: `PIN noto'g'ri. Yana ${MAX_PIN_FAILURES - failures} ta urinish qoldi` })
  }

  async sessions(actor: Actor): Promise<SessionDto[]> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const rows = await em
        .createQueryBuilder(Session, 's')
        .where('s.userId = :userId AND s.revokedAt IS NULL AND s.expiresAt > now()', { userId: actor.userId })
        .orderBy('s.lastUsedAt', 'DESC')
        .getMany()
      return rows.map((row) => toSessionDto(row, actor.sessionId))
    })
  }

  async revokeSession(actor: Actor, sessionId: string): Promise<void> {
    await this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const result = await em
        .createQueryBuilder()
        .update(Session)
        .set({ revokedAt: new Date(), revokedReason: 'revoked_by_user' })
        .where('id = :sessionId AND userId = :userId AND revokedAt IS NULL', { sessionId, userId: actor.userId })
        .execute()
      if (!result.affected) {
        throw AppError.notFound('Sessiya topilmadi')
      }
      afterCommit(() => {
        this.actors.invalidate()
        this.realtime.sessionEnded(sessionId)
      })
    })
  }

  private invalidCredentials() {
    return AppError.unauthorized('INVALID_CREDENTIALS', "Login yoki parol noto'g'ri")
  }

  private sessionEnded() {
    return AppError.unauthorized('SESSION_ENDED', 'Sessiya yakunlangan. Qayta kiring')
  }
}

export function toSessionDto(row: Session, currentId?: string): SessionDto {
  return {
    id: row.id,
    device: row.device,
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
    current: row.id === currentId,
  }
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}
