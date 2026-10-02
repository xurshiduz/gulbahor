import {
  idSchema,
  posItemsSchema,
  posLookupSchema,
  posSearchSchema,
  returnInputSchema,
  returnListQuerySchema,
  returnLookupSchema,
  saleInputSchema,
  saleListQuerySchema,
  saleVoidSchema,
  type Page,
  type PosContextDto,
  type PosItemDto,
  type ReturnableDto,
  type ReturnDto,
  type ReturnInput,
  type ReturnListItemDto,
  type ReturnListQuery,
  type SaleDto,
  type SaleInput,
  type SaleListItemDto,
  type SaleListQuery,
  type SaleVoidInput,
} from '@gulbahor/core'
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'

import { AppError } from '../../common/errors'
import { zod } from '../../common/zod.pipe'
import { Actor, Can, can, CurrentActor } from '../auth/actor'
import { PosService } from './pos.service'
import { ReturnsService } from './returns.service'
import { SalesService } from './sales.service'

const id = () => Param('id', zod(idSchema))

/** What the till screen asks while a sale is rung up. */
@Controller('pos')
@Can('pos.sell')
export class PosController {
  constructor(private readonly pos: PosService) {}

  @Get('context/:id')
  context(@CurrentActor() actor: Actor, @id() registerId: string): Promise<PosContextDto> {
    return this.pos.context(actor, registerId)
  }

  @Get('search')
  search(
    @CurrentActor() actor: Actor,
    @Query(zod(posSearchSchema)) query: { registerId: string; q: string },
  ): Promise<PosItemDto[]> {
    return this.pos.search(actor, query.registerId, query.q)
  }

  @Get('lookup')
  lookup(
    @CurrentActor() actor: Actor,
    @Query(zod(posLookupSchema)) query: { registerId: string; code: string },
  ): Promise<PosItemDto> {
    return this.pos.lookup(actor, query.registerId, query.code)
  }

  @Post('items')
  @HttpCode(200)
  items(
    @CurrentActor() actor: Actor,
    @Body(zod(posItemsSchema)) input: { registerId: string; variantIds: string[] },
  ): Promise<PosItemDto[]> {
    return this.pos.items(actor, input.registerId, input.variantIds)
  }
}

/** Sales are seen by those who make them (their own) and by those allowed to see them all. */
function seesSales(actor: Actor) {
  if (!can(actor, 'pos.sell') && !can(actor, 'sales.view')) {
    throw AppError.forbidden()
  }
}

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(saleListQuerySchema)) query: SaleListQuery,
  ): Promise<Page<SaleListItemDto>> {
    seesSales(actor)
    return this.sales.list(actor, query)
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @id() saleId: string): Promise<SaleDto> {
    seesSales(actor)
    return this.sales.get(actor, saleId)
  }

  @Post()
  @Can('pos.sell')
  create(@CurrentActor() actor: Actor, @Body(zod(saleInputSchema)) input: SaleInput): Promise<SaleDto> {
    return this.sales.create(actor, input)
  }

  @Post(':id/void')
  @HttpCode(200)
  @Can('pos.void')
  void(
    @CurrentActor() actor: Actor,
    @id() saleId: string,
    @Body(zod(saleVoidSchema)) input: SaleVoidInput,
  ): Promise<SaleDto> {
    return this.sales.void(actor, saleId, input)
  }
}

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(returnListQuerySchema)) query: ReturnListQuery,
  ): Promise<Page<ReturnListItemDto>> {
    seesSales(actor)
    return this.returns.list(actor, query)
  }

  /** The receipt goods are brought back on, by its number or by the tag of a piece it sold. */
  @Get('lookup')
  @Can('pos.return')
  lookup(
    @CurrentActor() actor: Actor,
    @Query(zod(returnLookupSchema)) query: { code: string },
  ): Promise<ReturnableDto> {
    return this.returns.lookup(actor, query.code)
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @id() returnId: string): Promise<ReturnDto> {
    seesSales(actor)
    return this.returns.get(actor, returnId)
  }

  @Post()
  @Can('pos.return')
  create(@CurrentActor() actor: Actor, @Body(zod(returnInputSchema)) input: ReturnInput): Promise<ReturnDto> {
    return this.returns.create(actor, input)
  }
}
