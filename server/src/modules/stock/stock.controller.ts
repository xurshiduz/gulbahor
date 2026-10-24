import {
  stockHistoryQuerySchema,
  type StockHistoryItemDto,
  type StockHistoryQuery,
  type StockListDto,
  idSchema,
  stockListQuerySchema,
  stockUnitsQuerySchema,
  type Page,
  type StockListQuery,
  type StockLocationDto,
  type StockProductDto,
  type StockUnitDto,
  type StockUnitsQuery,
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
  ): Promise<StockListDto> {
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

  /** What happened to a model's pieces, newest first: receipts, sales, transfers, counts. */
  @Get('products/:id/history')
  @Can('stock.view')
  history(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Query(zod(stockHistoryQuerySchema)) query: StockHistoryQuery,
  ): Promise<Page<StockHistoryItemDto>> {
    return this.stock.history(actor, id, query)
  }

  @Get('products/:id/units')
  @Can('stock.view')
  units(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Query(zod(stockUnitsQuerySchema)) query: StockUnitsQuery,
  ): Promise<StockUnitDto[]> {
    return this.stock.units(actor, id, query)
  }
}
