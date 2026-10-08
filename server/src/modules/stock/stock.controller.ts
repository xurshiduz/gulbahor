import {
  idSchema,
  stockListQuerySchema,
  type Page,
  type StockListItemDto,
  type StockListQuery,
  type StockLocationDto,
  type StockProductDto,
} from '@erp/core'
import { Controller, Get, Param, Query } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { StockService } from './stock.service'

@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @Can('stock.view')
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(stockListQuerySchema)) query: StockListQuery,
  ): Promise<Page<StockListItemDto>> {
    return this.stock.list(actor, query)
  }

  @Get('locations')
  @Can('stock.view')
  locations(@CurrentActor() actor: Actor): Promise<StockLocationDto[]> {
    return this.stock.locations(actor)
  }

  @Get('products/:id')
  @Can('stock.view')
  product(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<StockProductDto> {
    return this.stock.product(actor, id)
  }
}
