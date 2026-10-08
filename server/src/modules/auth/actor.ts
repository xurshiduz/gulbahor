import { hasPermission, type AnyCurrency } from '@erp/core'
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common'
import type { Request } from 'express'

/** Who is making the request, resolved once by the guard. */
export interface Actor {
  userId: string
  orgId: string
  sessionId: string
  name: string
  isOwner: boolean
  permissions: string[]
  modules: string[]
  /** What the business keeps its books, prices and receipts in: every "so'm" in the code is this. */
  base: AnyCurrency
  allLocations: boolean
  locationIds: string[]
  ip: string | null
}

export function can(actor: Actor, permission: string): boolean {
  return hasPermission(actor.permissions, permission)
}

export type AuthedRequest = Request & { actor?: Actor }

export const PUBLIC_KEY = 'auth:public'
export const PERMISSIONS_KEY = 'auth:permissions'
export const MODULE_KEY = 'auth:module'

/** No sign-in needed. */
export const Public = () => SetMetadata(PUBLIC_KEY, true)

/** The actor must hold every listed permission. */
export const Can = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions)

/** The business must have this module switched on. */
export const RequireModule = (module: string) => SetMetadata(MODULE_KEY, module)

export const CurrentActor = createParamDecorator((_: unknown, context: ExecutionContext): Actor => {
  const request = context.switchToHttp().getRequest<AuthedRequest>()
  return request.actor as Actor
})

export function clientIp(request: Request): string | null {
  return request.ip ?? request.socket.remoteAddress ?? null
}

/** "Chrome · Windows" from a user-agent string; enough to tell sessions apart. */
export function describeDevice(userAgent: string | undefined): string {
  if (!userAgent) {
    return 'Noma’lum qurilma'
  }
  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\/|Opera/.test(userAgent) ? 'Opera'
    : /YaBrowser/.test(userAgent) ? 'Yandex'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : 'Brauzer'
  const system =
    /Windows/.test(userAgent) ? 'Windows'
    : /Android/.test(userAgent) ? 'Android'
    : /iPhone|iPad|iOS/.test(userAgent) ? 'iOS'
    : /Mac OS X/.test(userAgent) ? 'macOS'
    : /Linux/.test(userAgent) ? 'Linux'
    : ''
  return system ? `${browser} · ${system}` : browser
}
