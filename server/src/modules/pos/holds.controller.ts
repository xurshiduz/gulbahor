import {
  holdDueSchema,
  holdInputSchema,
  holdListQuerySchema,
  idSchema,
  type HoldDto,
  type HoldDueInput,
  type HoldInput,
  type HoldListQuery,
  type HoldSummary,
  type Page,
} from '@erp/core'
import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { HoldsService } from './holds.service'

const id = () => Param('id', zod(idSchema))

/**
 * Goods set aside for customers. Made, moved and let go by those who sell; seen by them and by those who may see
 * what is sold — the service says who.
 */
@Controller('holds')
export class HoldsController {
  constructor(private readonly holds: HoldsService) {}

  @Get()
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(holdListQuerySchema)) query: HoldListQuery,
  ): Promise<Page<HoldDto> & { summary: HoldSummary }> {
    return this.holds.list(actor, query)
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @id() holdId: string): Promise<HoldDto> {
    return this.holds.get(actor, holdId)
  }

  @Post()
  @Can('pos.sell')
  create(@CurrentActor() actor: Actor, @Body(zod(holdInputSchema)) input: HoldInput): Promise<HoldDto> {
    return this.holds.create(actor, input)
  }

  @Put(':id/due')
  @Can('pos.sell')
  extend(
    @CurrentActor() actor: Actor,
    @id() holdId: string,
    @Body(zod(holdDueSchema)) input: HoldDueInput,
  ): Promise<HoldDto> {
    return this.holds.extend(actor, holdId, input)
  }

  @Post(':id/release')
  @HttpCode(200)
  @Can('pos.sell')
  release(@CurrentActor() actor: Actor, @id() holdId: string): Promise<HoldDto> {
    return this.holds.release(actor, holdId)
  }
}
