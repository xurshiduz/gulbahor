import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { Env } from '../../config/env'

/** Lower-case names of letters, digits and dashes, in folders, with or without an extension: nothing that climbs out. */
const KEY = /^[a-z0-9-]+(\/[a-z0-9-]+)*(\.[a-z0-9]+)?$/

/**
 * Where files are kept: a folder on the server's own disk, apart from the
 * code. Everything goes through a key ("business/photograph/s.webp"), never
 * a path, so the same keys can be kept in a cloud bucket later.
 */
@Injectable()
export class FileStore {
  private readonly root: string

  constructor(config: ConfigService<Env, true>) {
    const fallback = config.get('NODE_ENV') === 'test' ? join(tmpdir(), 'erp-test-uploads') : 'uploads'
    this.root = resolve(config.get('UPLOADS_DIR') ?? fallback)
  }

  private pathOf(key: string): string {
    if (!KEY.test(key)) {
      throw new Error(`Bad file key: ${key}`)
    }
    return join(this.root, ...key.split('/'))
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.pathOf(key)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, data)
  }

  /** Removes a file, or a folder with everything in it. Nothing there is no error. */
  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { recursive: true, force: true })
  }

  /** The file on disk, to be sent as it is; null when there is none. */
  async find(key: string): Promise<string | null> {
    if (!KEY.test(key)) {
      return null
    }
    const file = this.pathOf(key)
    try {
      await access(file)
      return file
    } catch {
      return null
    }
  }
}
