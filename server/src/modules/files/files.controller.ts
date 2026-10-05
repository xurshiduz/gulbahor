import { Controller, Get, Param, Res } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import type { Response } from 'express'

import { AppError } from '../../common/errors'
import { Public } from '../auth/actor'
import { FileStore } from './file-store'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const NAME = /^[sml]\.(webp|jpg)$/

@Controller('files')
export class FilesController {
  constructor(private readonly files: FileStore) {}

  /**
   * A photograph. An `<img>` asks for it with no more than its address, so
   * the address is the key: two ids nobody can guess. The file behind an
   * address never changes — a changed photograph is a new one — so a browser
   * may keep it for good.
   */
  @Get(':orgId/:imageId/:name')
  @Public()
  @SkipThrottle()
  async image(
    @Param('orgId') orgId: string,
    @Param('imageId') imageId: string,
    @Param('name') name: string,
    @Res() response: Response,
  ): Promise<void> {
    const known = UUID.test(orgId) && UUID.test(imageId) && NAME.test(name)
    const file = known ? await this.files.find(`${orgId}/${imageId}/${name}`) : null
    if (!file) {
      throw AppError.notFound('Rasm topilmadi')
    }
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    // The web app may be served from another address than the API.
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    response.type(name.endsWith('.jpg') ? 'image/jpeg' : 'image/webp')
    response.sendFile(file)
  }
}
