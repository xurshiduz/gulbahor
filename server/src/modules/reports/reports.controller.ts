import { reportQuerySchema, type ReportQuery, type SalesReportDto } from '@gulbahor/core'
import { Controller, Get, Query } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { ReportsService } from './reports.service'

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  @Can('reports.sales')
  sales(@CurrentActor() actor: Actor, @Query(zod(reportQuerySchema)) query: ReportQuery): Promise<SalesReportDto> {
    return this.reports.sales(actor, query)
  }
}
