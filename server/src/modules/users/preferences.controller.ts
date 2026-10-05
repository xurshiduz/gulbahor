import { preferenceSchema } from '@gulbahor/core'
import { Body, Controller, Get, HttpCode, Param, Put } from '@nestjs/common'

import { AppError } from '../../common/errors'
import { zod } from '../../common/zod.pipe'
import { Db } from '../../database/db.service'
import { Actor, CurrentActor } from '../auth/actor'

const KEY = /^[a-z0-9._:-]{1,80}$/

/**
 * Small per-person settings the screens remember between visits and
 * devices: which columns a table shows and in what order, for example.
 */
@Controller('me/preferences')
export class PreferencesController {
  constructor(private readonly db: Db) {}

  @Get()
  async all(@CurrentActor() actor: Actor): Promise<Record<string, unknown>> {
    return this.db.tenant(actor.orgId, async ({ em }) => {
      const rows: { key: string; value: unknown }[] = await em.query(
        `SELECT key, value FROM user_preferences WHERE user_id = $1`,
        [actor.userId],
      )
      return Object.fromEntries(rows.map((row) => [row.key, row.value]))
    })
  }

  @Put(':key')
  @HttpCode(204)
  async set(
    @CurrentActor() actor: Actor,
    @Param('key') key: string,
    @Body(zod(preferenceSchema)) body: { value?: unknown },
  ): Promise<void> {
    if (!KEY.test(key)) {
      throw AppError.badRequest('BAD_KEY', 'Sozlama nomi noto‘g‘ri')
    }
    const json = JSON.stringify(body.value ?? null)
    if (json.length > 20_000) {
      throw AppError.badRequest('TOO_LARGE', 'Sozlama juda katta')
    }
    await this.db.tenant(actor.orgId, ({ em }) =>
      em.query(
        `INSERT INTO user_preferences (user_id, org_id, key, value) VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = now()`,
        [actor.userId, actor.orgId, key, json],
      ),
    )
  }
}
