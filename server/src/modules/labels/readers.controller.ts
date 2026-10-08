import {
  gateEventListQuerySchema,
  idSchema,
  readerInputSchema,
  type GateEventDto,
  type GateEventListQuery,
  type Page,
  type ReaderDto,
  type ReaderInput,
} from '@erp/core'
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { ReadersService } from './readers.service'

const id = () => Param('id', zod(idSchema))

@Controller('devices/readers')
@Can('devices.manage')
export class ReadersController {
  constructor(private readonly readers: ReadersService) {}

  @Get()
  list(@CurrentActor() actor: Actor): Promise<ReaderDto[]> {
    return this.readers.list(actor)
  }

  @Post()
  create(@CurrentActor() actor: Actor, @Body(zod(readerInputSchema)) input: ReaderInput): Promise<ReaderDto> {
    return this.readers.create(actor, input)
  }

  @Put(':id')
  update(
    @CurrentActor() actor: Actor,
    @id() readerId: string,
    @Body(zod(readerInputSchema)) input: ReaderInput,
  ): Promise<ReaderDto> {
    return this.readers.update(actor, readerId, input)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentActor() actor: Actor, @id() readerId: string): Promise<void> {
    return this.readers.remove(actor, readerId)
  }
}

/** The log of pieces that went through a gate unsold. */
@Controller('gate-events')
@Can('devices.alarms')
export class GateEventsController {
  constructor(private readonly readers: ReadersService) {}

  @Get()
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(gateEventListQuerySchema)) query: GateEventListQuery,
  ): Promise<Page<GateEventDto>> {
    return this.readers.events(actor, query)
  }
}
