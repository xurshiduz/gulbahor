import { OWNER_ROLE_KEY } from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

import { Db } from '../../database/db.service'
import type { Actor } from './actor'

export interface AccessClaims {
  sub: string
  org: string
  sid: string
}

export const ACCESS_COOKIE = 'gb_at'
export const REFRESH_COOKIE = 'gb_rt'
export const ACCESS_TTL_SECONDS = 15 * 60
export const REFRESH_TTL_DAYS = 30

type ActorWithoutIp = Omit<Actor, 'ip'>

/** How long a resolved actor is trusted before the database is asked again. */
const CACHE_MS = 5_000

/**
 * Turns an access token into the person behind it: still active, session not
 * revoked, with today's roles and locations. Shared by the HTTP guard and the
 * socket gateway.
 */
@Injectable()
export class ActorService {
  private readonly cache = new Map<string, { at: number; actor: ActorWithoutIp | null }>()

  constructor(
    private readonly jwt: JwtService,
    private readonly db: Db,
  ) {}

  signAccess(claims: AccessClaims): string {
    return this.jwt.sign(claims, { expiresIn: ACCESS_TTL_SECONDS })
  }

  verifyAccess(token: string | undefined): AccessClaims | null {
    if (!token) {
      return null
    }
    try {
      return this.jwt.verify<AccessClaims>(token)
    } catch {
      return null
    }
  }

  async resolve(claims: AccessClaims): Promise<ActorWithoutIp | null> {
    const cached = this.cache.get(claims.sid)
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return cached.actor
    }
    const actor = await this.load(claims)
    this.cache.set(claims.sid, { at: Date.now(), actor })
    if (this.cache.size > 5_000) {
      this.prune()
    }
    return actor
  }

  /** Call after anything that changes what people may do: roles, users, modules, sessions. */
  invalidate() {
    this.cache.clear()
  }

  private async load(claims: AccessClaims): Promise<ActorWithoutIp | null> {
    return this.db.tenant(claims.org, async ({ em }) => {
      const rows: {
        id: string
        full_name: string
        all_locations: boolean
        modules: string[]
        permissions: string[]
        is_owner: boolean
        location_ids: string[]
      }[] = await em.query(
        `
        SELECT u.id, u.full_name, u.all_locations, o.modules,
          coalesce((
            SELECT array_agg(DISTINCT permission)
            FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
            CROSS JOIN LATERAL unnest(r.permissions) AS permission
            WHERE ur.user_id = u.id
          ), '{}') AS permissions,
          EXISTS (
            SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = u.id AND r.is_system AND r.template_key = $3
          ) AS is_owner,
          coalesce((SELECT array_agg(location_id) FROM user_locations WHERE user_id = u.id), '{}') AS location_ids
        FROM users u
        JOIN organizations o ON o.id = u.org_id
        JOIN sessions s ON s.user_id = u.id
        WHERE u.id = $1 AND s.id = $2 AND u.is_active AND s.revoked_at IS NULL AND s.expires_at > now()
        `,
        [claims.sub, claims.sid, OWNER_ROLE_KEY],
      )
      const row = rows[0]
      if (!row) {
        return null
      }
      return {
        userId: row.id,
        orgId: claims.org,
        sessionId: claims.sid,
        name: row.full_name,
        isOwner: row.is_owner,
        permissions: row.permissions,
        modules: row.modules,
        allLocations: row.all_locations,
        locationIds: row.location_ids,
      }
    })
  }

  private prune() {
    const cutoff = Date.now() - CACHE_MS
    for (const [key, entry] of this.cache) {
      if (entry.at < cutoff) {
        this.cache.delete(key)
      }
    }
  }
}
