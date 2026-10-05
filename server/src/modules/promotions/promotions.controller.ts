import {
  idSchema,
  promotionInputSchema,
  promotionListQuerySchema,
  type Page,
  type PromotionDto,
  type PromotionInput,
  type PromotionListQuery,
} from '@gulbahor/core'
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { PromotionsService } from './promotions.service'

const id = () => Param('id', zod(idSchema))

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  @Can('promotions.view')
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(promotionListQuerySchema)) query: PromotionListQuery,
  ): Promise<Page<PromotionDto>> {
    return this.promotions.list(actor, query)
  }

  @Get(':id')
  @Can('promotions.view')
  get(@CurrentActor() actor: Actor, @id() promotionId: string): Promise<PromotionDto> {
    return this.promotions.get(actor, promotionId)
  }

  @Post()
  @Can('promotions.manage')
  create(@CurrentActor() actor: Actor, @Body(zod(promotionInputSchema)) input: PromotionInput): Promise<PromotionDto> {
    return this.promotions.create(actor, input)
  }

  @Put(':id')
  @Can('promotions.manage')
  update(
    @CurrentActor() actor: Actor,
    @id() promotionId: string,
    @Body(zod(promotionInputSchema)) input: PromotionInput,
  ): Promise<PromotionDto> {
    return this.promotions.update(actor, promotionId, input)
  }

  @Post(':id/stop')
  @HttpCode(200)
  @Can('promotions.manage')
  stop(@CurrentActor() actor: Actor, @id() promotionId: string): Promise<PromotionDto> {
    return this.promotions.setActive(actor, promotionId, false)
  }

  @Post(':id/resume')
  @HttpCode(200)
  @Can('promotions.manage')
  resume(@CurrentActor() actor: Actor, @id() promotionId: string): Promise<PromotionDto> {
    return this.promotions.setActive(actor, promotionId, true)
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('promotions.manage')
  remove(@CurrentActor() actor: Actor, @id() promotionId: string): Promise<void> {
    return this.promotions.remove(actor, promotionId)
  }
}
