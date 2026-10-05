import { hasPermission, type ApprovalInput } from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { User } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { verifySecret } from '../auth/crypto'

/** Wrong PINs in a row before a person's PIN is taken away. */
const MAX_FAILURES = 5

/** Someone who stood at the till and gave their word, with what they may allow. */
export interface Approver {
  id: string
  name: string
  permissions: string[]
}

export const allows = (approver: Approver | null, permission: string) =>
  !!approver && hasPermission(approver.permissions, permission)

interface Candidate {
  id: string
  full_name: string
  pin_hash: string | null
  pin_failures: number
  permissions: string[]
  works_here: boolean
}

const PERMISSIONS = `coalesce((
  SELECT array_agg(DISTINCT permission)
  FROM user_roles ur JOIN roles r ON r.id = ur.role_id CROSS JOIN LATERAL unnest(r.permissions) AS permission
  WHERE ur.user_id = u.id
), '{}')`

/**
 * A manager's word at the till. What a cashier may not do alone (a discount
 * over the limit, goods taken back late) goes through when someone who may
 * allow it types their PIN on the cashier's screen.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  /**
   * Checks the PIN, on its own and before the deed it approves: a wrong PIN
   * is counted even though the deed then does not happen, so PINs cannot be
   * guessed through failed sales. After several wrong tries the PIN is taken
   * away and its owner sets a new one.
   */
  async verify(actor: Actor, approval: ApprovalInput | null, registerId: string): Promise<Approver | null> {
    if (!approval) {
      return null
    }
    const found = await this.db.tenant(actor.orgId, async ({ em }) => {
      const [row]: Candidate[] = await em.query(
        `SELECT u.id, u.full_name, u.pin_hash, u.pin_failures, ${PERMISSIONS} AS permissions,
                (u.all_locations OR EXISTS (
                  SELECT 1 FROM user_locations ul JOIN registers g ON g.location_id = ul.location_id
                  WHERE ul.user_id = u.id AND g.id = $2
                )) AS works_here
         FROM users u WHERE u.id = $1 AND u.is_active`,
        [approval.userId, registerId],
      )
      return row
    })
    // One's own word is no second word.
    if (!found || !found.works_here || found.id === actor.userId) {
      throw AppError.validation({ approval: 'Bu xodim tasdiqlay olmaydi' })
    }
    if (!found.pin_hash) {
      throw AppError.validation({ approval: `${found.full_name}: PIN kod o'rnatilmagan` })
    }
    if (await verifySecret(approval.pin, found.pin_hash)) {
      if (found.pin_failures) {
        await this.db.tenant(actor.orgId, ({ em }) => em.update(User, found.id, { pinFailures: 0 }))
      }
      return { id: found.id, name: found.full_name, permissions: found.permissions }
    }

    const failures = found.pin_failures + 1
    const locked = failures >= MAX_FAILURES
    await this.db.tenant(actor.orgId, async ({ em }) => {
      await em.update(User, found.id, locked ? { pinHash: null, pinFailures: 0 } : { pinFailures: failures })
      if (locked) {
        await this.audit.record(em, actor.orgId, actor, {
          action: 'auth.pin_locked',
          entity: 'user',
          entityId: found.id,
          summary: `${found.full_name}: tasdiqlashda PIN ${MAX_FAILURES} marta noto'g'ri kiritildi, PIN o'chirildi`,
        })
      }
    })
    throw AppError.validation({
      approval: locked
        ? `PIN ko'p marta noto'g'ri kiritildi: ${found.full_name} yangi PIN o'rnatishi kerak`
        : `PIN noto'g'ri. Yana ${MAX_FAILURES - failures} ta urinish qoldi`,
    })
  }

  /** Who at a shop may allow what a cashier may not, and has a PIN to say so with. */
  async approversAt(
    em: EntityManager,
    locationId: string,
    exceptUserId: string,
  ): Promise<{ id: string; name: string; discount: boolean; returns: boolean; prices: boolean }[]> {
    const rows: { id: string; full_name: string; permissions: string[] }[] = await em.query(
      `SELECT u.id, u.full_name, ${PERMISSIONS} AS permissions
       FROM users u
       WHERE u.is_active AND u.pin_hash IS NOT NULL AND u.id <> $2
         AND (u.all_locations OR EXISTS (
           SELECT 1 FROM user_locations ul WHERE ul.user_id = u.id AND ul.location_id = $1
         ))
       ORDER BY u.full_name`,
      [locationId, exceptUserId],
    )
    return rows
      .map((row) => ({
        id: row.id,
        name: row.full_name,
        discount: hasPermission(row.permissions, 'pos.discount'),
        returns: hasPermission(row.permissions, 'pos.return_any'),
        prices: hasPermission(row.permissions, 'pos.prices'),
      }))
      .filter((row) => row.discount || row.returns || row.prices)
  }
}
