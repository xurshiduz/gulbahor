import {
  idSchema,
  locationInputSchema,
  locationListQuerySchema,
  type LocationDto,
  type LocationInput,
  type LocationListQuery,
  type Page,
} from '@gulbahor/core'
import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { LocationsService } from './locations.service'

@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @Can('locations.view')
  list(@CurrentActor() actor: Actor, @Query(zod(locationListQuerySchema)) query: LocationListQuery): Promise<Page<LocationDto>> {
    return this.locations.list(actor, query)
  }

  /** Open to everyone signed in: each person gets only the places they work in. */
  @Get('options')
  options(@CurrentActor() actor: Actor) {
    return this.locations.options(actor)
  }

  @Get(':id')
  @Can('locations.view')
  get(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<LocationDto> {
    return this.locations.get(actor, id)
  }

  @Post()
  @Can('locations.manage')
  create(@CurrentActor() actor: Actor, @Body(zod(locationInputSchema)) input: LocationInput): Promise<LocationDto> {
    return this.locations.create(actor, input)
  }

  @Put(':id')
  @Can('locations.manage')
  update(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Body(zod(locationInputSchema)) input: LocationInput,
  ): Promise<LocationDto> {
    return this.locations.update(actor, id, input)
  }

  @Post(':id/archive')
  @Can('locations.manage')
  archive(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<LocationDto> {
    return this.locations.setActive(actor, id, false)
  }

  @Post(':id/restore')
  @Can('locations.manage')
  restore(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<LocationDto> {
    return this.locations.setActive(actor, id, true)
  }
}
