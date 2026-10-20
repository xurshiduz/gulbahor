import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { Env } from '../../config/env'
import type { TelegramDriver } from './telegram.driver'

/**
 * The server's way to Telegram, and the seal on what it keeps of an account.
 *
 * The way is there only where the server has the keys of a Telegram app
 * (`TELEGRAM_API_ID`, `TELEGRAM_API_HASH`); the library behind it is loaded
 * when it is first wanted. A test puts a Telegram of its own in `driver`.
 *
 * A session's key opens the whole account, so it is never kept as it is:
 * it is sealed (AES-256-GCM) with `TELEGRAM_SESSION_KEY` — or, where none
 * is given, with a key made from `JWT_SECRET` — and opened only in memory.
 */
@Injectable()
export class TelegramGateway {
  driver: TelegramDriver | null = null
  private readonly key: Buffer
  private readonly apiId: number | undefined
  private readonly apiHash: string | undefined

  constructor(config: ConfigService<Env, true>) {
    this.apiId = config.get('TELEGRAM_API_ID')
    this.apiHash = config.get('TELEGRAM_API_HASH')
    const secret: string = config.get('TELEGRAM_SESSION_KEY') ?? config.get('JWT_SECRET')
    this.key = scryptSync(secret, 'telegram-session', 32)
  }

  /** Whether an account can be signed into at all. */
  get configured(): boolean {
    return !!this.driver || (!!this.apiId && !!this.apiHash)
  }

  async way(): Promise<TelegramDriver> {
    if (!this.driver) {
      if (!this.apiId || !this.apiHash) {
        throw new Error('Telegram is not configured')
      }
      const { gramDriver } = await import('./gram.driver')
      this.driver = gramDriver(this.apiId, this.apiHash)
    }
    return this.driver
  }

  seal(session: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const sealed = Buffer.concat([cipher.update(session, 'utf8'), cipher.final()])
    return `v1:${Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString('base64')}`
  }

  /** Null where the seal does not open: the key it was sealed with is no longer the server's. */
  open(sealed: string): string | null {
    try {
      const raw = Buffer.from(sealed.replace(/^v1:/, ''), 'base64')
      const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12))
      decipher.setAuthTag(raw.subarray(12, 28))
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
    } catch {
      return null
    }
  }
}
