import {
  labelTemplateSchema,
  modulesSchema,
  orgUpdateSchema,
  receiptTemplateSchema,
  setupSchema,
  type LabelTemplate,
  type ModulesInput,
  type OrgDto,
  type OrgUpdateInput,
  type ReceiptTemplate,
  type SetupInput,
} from '@erp/core'
import { Body, Controller, Get, Post, Put } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { OrgsService } from './orgs.service'

@Controller('org')
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Get()
  get(@CurrentActor() actor: Actor): Promise<OrgDto> {
    return this.orgs.get(actor)
  }

  @Put()
  @Can('settings.manage')
  update(@CurrentActor() actor: Actor, @Body(zod(orgUpdateSchema)) input: OrgUpdateInput): Promise<OrgDto> {
    return this.orgs.update(actor, input)
  }

  /** How the receipts look on paper. */
  @Put('receipt')
  @Can('settings.manage')
  setReceipt(@CurrentActor() actor: Actor, @Body(zod(receiptTemplateSchema)) input: ReceiptTemplate): Promise<OrgDto> {
    return this.orgs.setReceipt(actor, input)
  }

  /** What goes on the labels. */
  @Put('label')
  @Can('settings.manage')
  setLabel(@CurrentActor() actor: Actor, @Body(zod(labelTemplateSchema)) input: LabelTemplate): Promise<OrgDto> {
    return this.orgs.setLabel(actor, input)
  }

  @Put('modules')
  @Can('settings.manage')
  setModules(@CurrentActor() actor: Actor, @Body(zod(modulesSchema)) input: ModulesInput): Promise<OrgDto> {
    return this.orgs.setModules(actor, input)
  }

  @Post('setup')
  setup(@CurrentActor() actor: Actor, @Body(zod(setupSchema)) input: SetupInput): Promise<OrgDto> {
    return this.orgs.setup(actor, input)
  }
}
