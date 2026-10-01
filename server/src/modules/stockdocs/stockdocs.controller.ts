import {
  idSchema,
  stockDocInputSchema,
  stockDocListQuerySchema,
  stockDocReceiveSchema,
  type Page,
  type StockDocDto,
  type StockDocInput,
  type StockDocListItemDto,
  type StockDocListQuery,
  type StockDocReceiveInput,
} from '@gulbahor/core'
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, CurrentActor } from '../auth/actor'
import { StockDocsService } from './stockdocs.service'

const id = () => Param('id', zod(idSchema))

/**
 * Transfers, write-offs and counts share these routes. Which permission a
 * request needs depends on the kind of the document, so the service checks
 * it; a signed-in person without the right gets a 403 from there.
 */
@Controller('stock-documents')
export class StockDocsController {
  constructor(private readonly docs: StockDocsService) {}

  @Get()
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(stockDocListQuerySchema)) query: StockDocListQuery,
  ): Promise<Page<StockDocListItemDto>> {
    return this.docs.list(actor, query)
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @id() docId: string): Promise<StockDocDto> {
    return this.docs.get(actor, docId)
  }

  @Post()
  create(@CurrentActor() actor: Actor, @Body(zod(stockDocInputSchema)) input: StockDocInput): Promise<StockDocDto> {
    return this.docs.create(actor, input)
  }

  @Put(':id')
  update(
    @CurrentActor() actor: Actor,
    @id() docId: string,
    @Body(zod(stockDocInputSchema)) input: StockDocInput,
  ): Promise<StockDocDto> {
    return this.docs.update(actor, docId, input)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentActor() actor: Actor, @id() docId: string): Promise<void> {
    return this.docs.remove(actor, docId)
  }

  @Post(':id/send')
  send(@CurrentActor() actor: Actor, @id() docId: string): Promise<StockDocDto> {
    return this.docs.send(actor, docId)
  }

  @Post(':id/receive')
  receive(
    @CurrentActor() actor: Actor,
    @id() docId: string,
    @Body(zod(stockDocReceiveSchema)) input: StockDocReceiveInput,
  ): Promise<StockDocDto> {
    return this.docs.receive(actor, docId, input)
  }

  @Post(':id/post')
  post(@CurrentActor() actor: Actor, @id() docId: string): Promise<StockDocDto> {
    return this.docs.post(actor, docId)
  }

  @Post(':id/cancel')
  cancel(@CurrentActor() actor: Actor, @id() docId: string): Promise<StockDocDto> {
    return this.docs.cancel(actor, docId)
  }
}
