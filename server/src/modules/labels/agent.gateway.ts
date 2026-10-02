import { Logger } from '@nestjs/common'
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets'
import type { Socket } from 'socket.io'

import { RealtimeService } from '../realtime/realtime.service'
import { AgentHub } from './agent.hub'
import { DevicesService, type KnownAgent } from './devices.service'
import { PrintQueueService } from './print-queue.service'

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : null)

/**
 * Where shop agents connect. An agent has no user and no cookie: it shows
 * the key it was given when it was set up, and from then on only listens
 * for work and answers how it went.
 */
@WebSocketGateway({ namespace: '/agent' })
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AgentGateway.name)

  constructor(
    private readonly devices: DevicesService,
    private readonly hub: AgentHub,
    private readonly queue: PrintQueueService,
    private readonly realtime: RealtimeService,
  ) {}

  async handleConnection(socket: Socket) {
    const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>
    const key = typeof auth.key === 'string' ? auth.key : ''
    const agent = key
      ? await this.devices
          .agentByKey(key, { hostname: text(auth.hostname), version: text(auth.version) })
          .catch((error: unknown) => {
            this.logger.error(error instanceof Error ? error.stack : String(error))
            return null
          })
      : null
    if (!agent) {
      socket.emit('refused', { reason: "Kalit noto'g'ri yoki bekor qilingan" })
      socket.disconnect(true)
      return
    }

    socket.data.agent = agent
    // The line may have dropped while the key was being checked.
    if (!socket.connected) {
      return
    }
    this.hub.join(agent.id, socket)
    socket.emit('welcome', { name: agent.name })
    this.realtime.changed(agent.orgId, ['devices', 'printjobs'])

    await this.queue.recover(agent.orgId, agent.id)
    void this.queue.dispatch(agent.orgId, agent.id)
  }

  async handleDisconnect(socket: Socket) {
    const agent = socket.data.agent as KnownAgent | undefined
    if (!agent || !this.hub.leave(agent.id, socket)) {
      return
    }
    await this.devices.agentSeen(agent).catch(() => undefined)
    this.realtime.changed(agent.orgId, ['devices', 'printjobs'])
  }
}
