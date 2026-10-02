import {
  idSchema,
  labelPrintSchema,
  printJobListQuerySchema,
  type LabelPrintInput,
  type LabelPrintResult,
  type Page,
  type PrinterDto,
  type PrintJobDto,
  type PrintJobListQuery,
  type ReceiptLabelsDto,
} from '@gulbahor/core'
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { DevicesService } from './devices.service'
import { LabelsService } from './labels.service'
import { PrintQueueService } from './print-queue.service'

const id = () => Param('id', zod(idSchema))

@Controller('labels')
@Can('labels.print')
export class LabelsController {
  constructor(
    private readonly labels: LabelsService,
    private readonly devices: DevicesService,
    private readonly queue: PrintQueueService,
  ) {}

  /** The printers to choose from when printing. */
  @Get('printers')
  printers(@CurrentActor() actor: Actor): Promise<PrinterDto[]> {
    return this.devices.printers(actor)
  }

  @Get('receipts/:id')
  receipt(@CurrentActor() actor: Actor, @id() receiptId: string): Promise<ReceiptLabelsDto> {
    return this.labels.receiptLabels(actor, receiptId)
  }

  @Post('print')
  @HttpCode(200)
  print(@CurrentActor() actor: Actor, @Body(zod(labelPrintSchema)) input: LabelPrintInput): Promise<LabelPrintResult> {
    return this.labels.print(actor, input)
  }

  @Get('jobs')
  jobs(
    @CurrentActor() actor: Actor,
    @Query(zod(printJobListQuerySchema)) query: PrintJobListQuery,
  ): Promise<Page<PrintJobDto>> {
    return this.queue.list(actor, query)
  }

  @Post('jobs/:id/retry')
  @HttpCode(200)
  retry(@CurrentActor() actor: Actor, @id() jobId: string): Promise<PrintJobDto> {
    return this.queue.retry(actor, jobId)
  }

  @Post('jobs/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentActor() actor: Actor, @id() jobId: string): Promise<PrintJobDto> {
    return this.queue.cancel(actor, jobId)
  }
}
