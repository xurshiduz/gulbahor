import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { AppError } from '../../common/errors'
import { AuthedRequest, can, clientIp, MODULE_KEY, PERMISSIONS_KEY, PUBLIC_KEY } from './actor'
import { ACCESS_COOKIE, ActorService } from './actor.service'

/**
 * Applied to every route. A route is closed unless it is marked `@Public()`;
 * `@Can(...)` and `@RequireModule(...)` narrow it further.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly actors: ActorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) {
      return true
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>()
    const claims = this.actors.verifyAccess(request.cookies?.[ACCESS_COOKIE])
    if (!claims) {
      throw AppError.unauthorized('TOKEN_EXPIRED', 'Sessiya muddati tugadi')
    }

    const actor = await this.actors.resolve(claims)
    if (!actor) {
      throw AppError.unauthorized('SESSION_ENDED', 'Sessiya yakunlangan. Qayta kiring')
    }
    request.actor = { ...actor, ip: clientIp(request) }

    const module = this.reflector.getAllAndOverride<string | undefined>(MODULE_KEY, targets)
    if (module && !actor.modules.includes(module)) {
      throw AppError.forbidden('Bu bo‘lim sizning biznesingizda yoqilmagan', 'MODULE_OFF')
    }

    const permissions = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, targets) ?? []
    if (!permissions.every((permission) => can(request.actor!, permission))) {
      throw AppError.forbidden()
    }
    return true
  }
}
