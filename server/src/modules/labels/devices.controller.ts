import {
  agentInputSchema,
  idSchema,
  printerInputSchema,
  type AgentDto,
  type AgentInput,
  type AgentKeyDto,
  type PrinterDto,
  type PrinterInput,
  type PrintJobDto,
} from '@gulbahor/core'
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { DevicesService } from './devices.service'

const id = () => Param('id', zod(idSchema))

@Controller('devices')
@Can('devices.manage')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get('agents')
  agents(@CurrentActor() actor: Actor): Promise<AgentDto[]> {
    return this.devices.agents(actor)
  }

  @Post('agents')
  createAgent(@CurrentActor() actor: Actor, @Body(zod(agentInputSchema)) input: AgentInput): Promise<AgentKeyDto> {
    return this.devices.createAgent(actor, input)
  }

  @Put('agents/:id')
  updateAgent(
    @CurrentActor() actor: Actor,
    @id() agentId: string,
    @Body(zod(agentInputSchema)) input: AgentInput,
  ): Promise<AgentDto> {
    return this.devices.updateAgent(actor, agentId, input)
  }

  @Post('agents/:id/key')
  @HttpCode(200)
  renewAgentKey(@CurrentActor() actor: Actor, @id() agentId: string): Promise<AgentKeyDto> {
    return this.devices.renewAgentKey(actor, agentId)
  }

  @Delete('agents/:id')
  @HttpCode(204)
  removeAgent(@CurrentActor() actor: Actor, @id() agentId: string): Promise<void> {
    return this.devices.removeAgent(actor, agentId)
  }

  @Get('printers')
  printers(@CurrentActor() actor: Actor): Promise<PrinterDto[]> {
    return this.devices.printers(actor)
  }

  @Post('printers')
  createPrinter(@CurrentActor() actor: Actor, @Body(zod(printerInputSchema)) input: PrinterInput): Promise<PrinterDto> {
    return this.devices.createPrinter(actor, input)
  }

  @Put('printers/:id')
  updatePrinter(
    @CurrentActor() actor: Actor,
    @id() printerId: string,
    @Body(zod(printerInputSchema)) input: PrinterInput,
  ): Promise<PrinterDto> {
    return this.devices.updatePrinter(actor, printerId, input)
  }

  @Delete('printers/:id')
  @HttpCode(204)
  removePrinter(@CurrentActor() actor: Actor, @id() printerId: string): Promise<void> {
    return this.devices.removePrinter(actor, printerId)
  }

  @Post('printers/:id/test')
  @HttpCode(200)
  testPrinter(@CurrentActor() actor: Actor, @id() printerId: string): Promise<PrintJobDto> {
    return this.devices.testPrinter(actor, printerId)
  }
}
