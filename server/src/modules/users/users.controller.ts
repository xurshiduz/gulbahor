import {
  idSchema,
  resetPasswordSchema,
  userCreateSchema,
  userListQuerySchema,
  userUpdateSchema,
  type Page,
  type SessionDto,
  type UserCreateInput,
  type UserDto,
  type UserListQuery,
  type UserUpdateInput,
} from '@erp/core'
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { UsersService } from './users.service'

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Can('users.view')
  list(@CurrentActor() actor: Actor, @Query(zod(userListQuerySchema)) query: UserListQuery): Promise<Page<UserDto>> {
    return this.users.list(actor, query)
  }

  @Get(':id')
  @Can('users.view')
  get(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<UserDto> {
    return this.users.get(actor, id)
  }

  @Post()
  @Can('users.manage')
  create(@CurrentActor() actor: Actor, @Body(zod(userCreateSchema)) input: UserCreateInput): Promise<UserDto> {
    return this.users.create(actor, input)
  }

  @Put(':id')
  @Can('users.manage')
  update(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Body(zod(userUpdateSchema)) input: UserUpdateInput,
  ): Promise<UserDto> {
    return this.users.update(actor, id, input)
  }

  @Post(':id/block')
  @Can('users.manage')
  block(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<UserDto> {
    return this.users.setActive(actor, id, false)
  }

  @Post(':id/unblock')
  @Can('users.manage')
  unblock(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<UserDto> {
    return this.users.setActive(actor, id, true)
  }

  @Post(':id/password')
  @Can('users.manage')
  @HttpCode(204)
  resetPassword(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Body(zod(resetPasswordSchema)) input: { password: string },
  ): Promise<void> {
    return this.users.resetPassword(actor, id, input.password)
  }

  @Get(':id/sessions')
  @Can('users.manage')
  sessions(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<SessionDto[]> {
    return this.users.sessions(actor, id)
  }

  @Delete(':id/sessions/:sessionId')
  @Can('users.manage')
  @HttpCode(204)
  revokeSession(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Param('sessionId', zod(idSchema)) sessionId: string,
  ): Promise<void> {
    return this.users.revokeSession(actor, id, sessionId)
  }
}
