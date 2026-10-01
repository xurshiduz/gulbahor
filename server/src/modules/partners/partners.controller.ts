import {
  idSchema,
  partnerInputSchema,
  partnerListQuerySchema,
  type Page,
  type PartnerDto,
  type PartnerInput,
  type PartnerListQuery,
} from '@gulbahor/core'
import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { PartnersService } from './partners.service'

@Controller('partners')
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  @Can('partners.view')
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(partnerListQuerySchema)) query: PartnerListQuery,
  ): Promise<Page<PartnerDto>> {
    return this.partners.list(actor, query)
  }

  @Get(':id')
  @Can('partners.view')
  get(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<PartnerDto> {
    return this.partners.get(actor, id)
  }

  @Post()
  @Can('partners.manage')
  create(@CurrentActor() actor: Actor, @Body(zod(partnerInputSchema)) input: PartnerInput): Promise<PartnerDto> {
    return this.partners.create(actor, input)
  }

  @Put(':id')
  @Can('partners.manage')
  update(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Body(zod(partnerInputSchema)) input: PartnerInput,
  ): Promise<PartnerDto> {
    return this.partners.update(actor, id, input)
  }

  @Post(':id/archive')
  @Can('partners.manage')
  archive(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<PartnerDto> {
    return this.partners.setActive(actor, id, false)
  }

  @Post(':id/restore')
  @Can('partners.manage')
  restore(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<PartnerDto> {
    return this.partners.setActive(actor, id, true)
  }
}
