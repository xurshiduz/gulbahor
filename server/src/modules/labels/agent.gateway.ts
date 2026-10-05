import {
  agentAlarmSchema,
  agentReaderStateSchema,
  agentTagSchema,
  agentUnitsRequestSchema,
  type AgentUnitsReply,
} from '@gulbahor/core'
import { Logger } from '@nestjs/common'
import {
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets'
import type { Socket } from 'socket.io'

import { RealtimeService } from '../realtime/realtime.service'
import { AgentHub } from './agent.hub'
import { DevicesService, type KnownAgent } from './devices.service'
import { PrintQueueService } from './print-queue.service'
import { ReadersService } from './readers.service'

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : null)

/**
 * Where shop agents connect. An agent has no user and no cookie: it shows
 * the key it was given when it was set up. From then on it takes print jobs
 * and answers how they went, and says what its readers saw.
 */
@WebSocketGateway({ namespace: '/agent' })
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AgentGateway.name)

  constructor(
    private readonly devices: DevicesService,
    private readonly hub: AgentHub,
    private readonly queue: PrintQueueService,
    private readonly readers: ReadersService,
    private readonly realtime: RealtimeService,
  ) {}

  async handleConnection(socket: Socket) {
    // What the agent kept while the line was down arrives the moment it is back, before its key
    // has been checked. Those messages wait for this instead of being dropped.
    let known: (agent: KnownAgent | null) => void = () => undefined
    socket.data.known = new Promise<KnownAgent | null>((resolve) => (known = resolve))

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
      known(null)
      socket.emit('refused', { reason: "Kalit noto'g'ri yoki bekor qilingan" })
      socket.disconnect(true)
      return
    }

    socket.data.agent = agent
    // The line may have dropped while the key was being checked.
    if (!socket.connected) {
      known(null)
      return
    }
    this.hub.join(agent, socket)
    known(agent)
    socket.emit('welcome', { name: agent.name })
    socket.emit('readers', await this.readers.forAgent(agent).catch(() => []))
    this.realtime.changed(agent.orgId, ['devices', 'printjobs'])

    await this.queue.recover(agent.orgId, agent.id)
    void this.queue.dispatch(agent.orgId, agent.id)
  }

  async handleDisconnect(socket: Socket) {
    const agent = socket.data.agent as KnownAgent | undefined
    if (!agent || !this.hub.leave(agent.id, socket)) {
      return
    }
    this.readers.agentGone(agent.id)
    await this.devices.agentSeen(agent).catch(() => undefined)
    this.realtime.changed(agent.orgId, ['devices', 'printjobs'])
  }

  /** A piece laid on a till's reader. */
  @SubscribeMessage('tag')
  async tag(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<void> {
    const agent = await this.agentOf(socket)
    const tag = agentTagSchema.safeParse(body)
    if (agent && tag.success) {
      await this.readers.tag(agent, tag.data).catch((error: unknown) => this.failed(error))
    }
  }

  /** A gate went off. */
  @SubscribeMessage('alarm')
  async alarm(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<{ ok: boolean }> {
    const agent = await this.agentOf(socket)
    const alarm = agentAlarmSchema.safeParse(body)
    if (!agent || !alarm.success) {
      return { ok: false }
    }
    return this.readers.alarm(agent, alarm.data).catch((error: unknown) => {
      this.failed(error)
      return { ok: false }
    })
  }

  /** A reader came on the line, or dropped off it. */
  @SubscribeMessage('reader')
  async reader(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<void> {
    const agent = await this.agentOf(socket)
    const state = agentReaderStateSchema.safeParse(body)
    if (agent && state.success) {
      this.readers.linkChanged(agent, state.data.readerId, state.data.connected)
    }
  }

  /**
   * Which pieces may not leave. A question that makes no sense still gets an answer, one that says so:
   * an agent left waiting would keep an old list for no reason it could know.
   */
  @SubscribeMessage('units')
  async units(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<AgentUnitsReply | { failed: true }> {
    const agent = await this.agentOf(socket)
    const request = agentUnitsRequestSchema.safeParse(body ?? {})
    if (!agent || !request.success) {
      return { failed: true }
    }
    return this.readers.units(agent, request.data).catch((error: unknown) => {
      this.failed(error)
      return { failed: true as const }
    })
  }

  /** Who is on this line, once its key has been checked. */
  private agentOf(socket: Socket): Promise<KnownAgent | null> {
    return (socket.data.known as Promise<KnownAgent | null> | undefined) ?? Promise.resolve(null)
  }

  private failed(error: unknown) {
    this.logger.error(error instanceof Error ? error.stack : String(error))
  }
}
