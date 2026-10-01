import { Injectable, Logger } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'

/** One unit of work: a transaction that already knows which business it belongs to. */
export interface Tx {
  em: EntityManager
  orgId: string
  /** Runs after the transaction commits; never runs if it rolls back. */
  afterCommit(callback: () => void | Promise<void>): void
}

type Callback = () => void | Promise<void>

/**
 * The only door to tenant data. `tenant()` opens a transaction and names the
 * organization for row-level security; every query inside sees that
 * business's rows and nothing else. A query made outside of it sees no rows
 * at all.
 */
@Injectable()
export class Db {
  private readonly logger = new Logger(Db.name)

  constructor(private readonly dataSource: DataSource) {}

  async tenant<T>(orgId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    const callbacks: Callback[] = []
    const result = await this.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.org_id', $1, true)`, [orgId])
      return work({ em, orgId, afterCommit: (callback) => callbacks.push(callback) })
    })
    await this.runAfterCommit(callbacks)
    return result
  }

  /**
   * For the paths that have no organization yet: finding a user by login,
   * rotating a refresh token, creating a business. Keep these few and small.
   */
  async system<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (em) => {
      await em.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      return work(em)
    })
  }

  private async runAfterCommit(callbacks: Callback[]) {
    for (const callback of callbacks) {
      try {
        await callback()
      } catch (error) {
        // The work is committed; a failed notification must not undo it or fail the request.
        this.logger.error(error instanceof Error ? error.stack : String(error))
      }
    }
  }
}
