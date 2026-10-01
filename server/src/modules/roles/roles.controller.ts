import { idSchema, roleInputSchema, type RoleDto, type RoleInput } from '@gulbahor/core'
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { RolesService } from './roles.service'

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** Needed to pick roles for a person as well as to manage them. */
  @Get()
  @Can('users.view')
  list(@CurrentActor() actor: Actor): Promise<RoleDto[]> {
    return this.roles.list(actor)
  }

  @Post()
  @Can('roles.manage')
  create(@CurrentActor() actor: Actor, @Body(zod(roleInputSchema)) input: RoleInput): Promise<RoleDto> {
    return this.roles.create(actor, input)
  }

  @Put(':id')
  @Can('roles.manage')
  update(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Body(zod(roleInputSchema)) input: RoleInput,
  ): Promise<RoleDto> {
    return this.roles.update(actor, id, input)
  }

  @Delete(':id')
  @Can('roles.manage')
  @HttpCode(204)
  remove(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<void> {
    return this.roles.remove(actor, id)
  }
}
