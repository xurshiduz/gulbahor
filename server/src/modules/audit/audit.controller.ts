import { auditListQuerySchema, type AuditDto, type AuditListQuery, type Page } from '@gulbahor/core'
import { Controller, Get, Query } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { AuditService } from './audit.service'

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Can('audit.view')
  list(@CurrentActor() actor: Actor, @Query(zod(auditListQuerySchema)) query: AuditListQuery): Promise<Page<AuditDto>> {
    return this.audit.list(actor, query)
  }
}
