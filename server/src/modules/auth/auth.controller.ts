import {
  changePasswordSchema,
  idSchema,
  loginSchema,
  profileSchema,
  removePinSchema,
  setPinSchema,
  unlockSchema,
  type ChangePasswordInput,
  type LoginInput,
  type MeDto,
  type ProfileInput,
  type RemovePinInput,
  type SessionDto,
  type SetPinInput,
} from '@gulbahor/core'
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Throttle } from '@nestjs/throttler'
import type { CookieOptions, Request, Response } from 'express'

import type { Env } from '../../config/env'
import { zod } from '../../common/zod.pipe'
import { Actor, clientIp, CurrentActor, describeDevice, Public } from './actor'
import { ACCESS_COOKIE, REFRESH_COOKIE, REFRESH_TTL_DAYS } from './actor.service'
import { AuthService, ClientMeta, Tokens } from './auth.service'

const REFRESH_PATH = '/api/auth'

@Controller('auth')
export class AuthController {
  private readonly secure: boolean

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.secure = config.get('NODE_ENV') === 'production'
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(204)
  async login(
    @Body(zod(loginSchema)) input: LoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.setCookies(response, await this.auth.login(input, this.meta(request)))
  }

  @Public()
  @Post('refresh')
  @HttpCode(204)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    try {
      this.setCookies(response, await this.auth.refresh(request.cookies?.[REFRESH_COOKIE], this.meta(request)))
    } catch (error) {
      this.clearCookies(response)
      throw error
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentActor() actor: Actor, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.auth.logout(actor)
    this.clearCookies(response)
  }

  @Get('me')
  me(@CurrentActor() actor: Actor): Promise<MeDto> {
    return this.auth.me(actor)
  }

  @Patch('profile')
  @HttpCode(204)
  updateProfile(@CurrentActor() actor: Actor, @Body(zod(profileSchema)) input: ProfileInput): Promise<void> {
    return this.auth.updateProfile(actor, input)
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password')
  @HttpCode(204)
  changePassword(@CurrentActor() actor: Actor, @Body(zod(changePasswordSchema)) input: ChangePasswordInput): Promise<void> {
    return this.auth.changePassword(actor, input)
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('pin')
  @HttpCode(204)
  setPin(@CurrentActor() actor: Actor, @Body(zod(setPinSchema)) input: SetPinInput): Promise<void> {
    return this.auth.setPin(actor, input)
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('pin/remove')
  @HttpCode(204)
  removePin(@CurrentActor() actor: Actor, @Body(zod(removePinSchema)) input: RemovePinInput): Promise<void> {
    return this.auth.removePin(actor, input)
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('unlock')
  @HttpCode(204)
  async unlock(
    @CurrentActor() actor: Actor,
    @Body(zod(unlockSchema)) input: { pin: string },
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    try {
      await this.auth.unlock(actor, input.pin)
    } catch (error) {
      if ((error as { getStatus?: () => number }).getStatus?.() === 401) {
        this.clearCookies(response)
      }
      throw error
    }
  }

  @Get('sessions')
  sessions(@CurrentActor() actor: Actor): Promise<SessionDto[]> {
    return this.auth.sessions(actor)
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  revokeSession(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<void> {
    return this.auth.revokeSession(actor, id)
  }

  private meta(request: Request): ClientMeta {
    const userAgent = request.headers['user-agent']
    return { ip: clientIp(request), userAgent, device: describeDevice(userAgent) }
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.secure }
  }

  private setCookies(response: Response, tokens: Tokens) {
    response.cookie(ACCESS_COOKIE, tokens.access, {
      ...this.cookieOptions(),
      path: '/',
      // Kept past the token's own life so an expired token is still sent and answered with TOKEN_EXPIRED.
      maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    })
    if (tokens.refresh) {
      response.cookie(REFRESH_COOKIE, tokens.refresh, {
        ...this.cookieOptions(),
        path: REFRESH_PATH,
        maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
      })
    }
  }

  private clearCookies(response: Response) {
    response.clearCookie(ACCESS_COOKIE, { ...this.cookieOptions(), path: '/' })
    response.clearCookie(REFRESH_COOKIE, { ...this.cookieOptions(), path: REFRESH_PATH })
  }
}
