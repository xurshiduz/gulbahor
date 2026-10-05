import { Module } from '@nestjs/common'

import { AgentGateway } from './agent.gateway'
import { AgentHub } from './agent.hub'
import { DevicesController } from './devices.controller'
import { DevicesService } from './devices.service'
import { LabelsController } from './labels.controller'
import { LabelsService } from './labels.service'
import { PrintQueueService } from './print-queue.service'
import { GateEventsController, ReadersController } from './readers.controller'
import { ReadersService } from './readers.service'

@Module({
  controllers: [LabelsController, DevicesController, ReadersController, GateEventsController],
  providers: [AgentHub, PrintQueueService, DevicesService, ReadersService, LabelsService, AgentGateway],
})
export class LabelsModule {}
