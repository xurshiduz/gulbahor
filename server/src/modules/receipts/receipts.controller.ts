import {
  idSchema,
  receiptExpensesInputSchema,
  receiptImportSchema,
  receiptInputSchema,
  receiptListQuerySchema,
  type ImportResult,
  type Page,
  type ReceiptDto,
  type ReceiptExpensesInput,
  type ReceiptImportInput,
  type ReceiptInput,
  type ReceiptListItemDto,
  type ReceiptListQuery,
} from '@gulbahor/core'
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { ReceiptImportService } from './receipt-import.service'
import { ReceiptsService } from './receipts.service'

const id = () => Param('id', zod(idSchema))

@Controller('receipts')
export class ReceiptsController {
  constructor(
    private readonly receipts: ReceiptsService,
    private readonly imports: ReceiptImportService,
  ) {}

  @Get()
  @Can('receipts.view')
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(receiptListQuerySchema)) query: ReceiptListQuery,
  ): Promise<Page<ReceiptListItemDto>> {
    return this.receipts.list(actor, query)
  }

  @Get(':id')
  @Can('receipts.view')
  get(@CurrentActor() actor: Actor, @id() receiptId: string): Promise<ReceiptDto> {
    return this.receipts.get(actor, receiptId)
  }

  @Post()
  @Can('receipts.manage')
  create(@CurrentActor() actor: Actor, @Body(zod(receiptInputSchema)) input: ReceiptInput): Promise<ReceiptDto> {
    return this.receipts.create(actor, input)
  }

  /** A spreadsheet into a draft receipt. It adds models to the catalogue, so it needs that right too. */
  @Post('import')
  @HttpCode(200)
  @Can('receipts.manage', 'products.manage')
  import(
    @CurrentActor() actor: Actor,
    @Body(zod(receiptImportSchema)) input: ReceiptImportInput,
  ): Promise<ImportResult> {
    return this.imports.run(actor, input)
  }

  @Put(':id')
  @Can('receipts.manage')
  update(
    @CurrentActor() actor: Actor,
    @id() receiptId: string,
    @Body(zod(receiptInputSchema)) input: ReceiptInput,
  ): Promise<ReceiptDto> {
    return this.receipts.update(actor, receiptId, input)
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('receipts.manage')
  remove(@CurrentActor() actor: Actor, @id() receiptId: string): Promise<void> {
    return this.receipts.remove(actor, receiptId)
  }

  @Post(':id/copy')
  @Can('receipts.manage')
  copy(@CurrentActor() actor: Actor, @id() receiptId: string): Promise<ReceiptDto> {
    return this.receipts.copy(actor, receiptId)
  }

  @Post(':id/post')
  @Can('receipts.post')
  post(@CurrentActor() actor: Actor, @id() receiptId: string): Promise<ReceiptDto> {
    return this.receipts.post(actor, receiptId)
  }

  @Post(':id/cancel')
  @Can('receipts.post')
  cancel(@CurrentActor() actor: Actor, @id() receiptId: string): Promise<ReceiptDto> {
    return this.receipts.cancel(actor, receiptId)
  }

  @Put(':id/expenses')
  @Can('receipts.post')
  updateExpenses(
    @CurrentActor() actor: Actor,
    @id() receiptId: string,
    @Body(zod(receiptExpensesInputSchema)) input: ReceiptExpensesInput,
  ): Promise<ReceiptDto> {
    return this.receipts.updateExpenses(actor, receiptId, input)
  }
}
