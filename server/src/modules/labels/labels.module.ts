import { Module } from '@nestjs/common'

import { AgentGateway } from './agent.gateway'
import { AgentHub } from './agent.hub'
import { DevicesController } from './devices.controller'
import { DevicesService } from './devices.service'
import { LabelsController } from './labels.controller'
import { LabelsService } from './labels.service'
import { PrintQueueService } from './print-queue.service'

@Module({
  controllers: [LabelsController, DevicesController],
  providers: [AgentHub, PrintQueueService, DevicesService, LabelsService, AgentGateway],
})
export class LabelsModule {}
