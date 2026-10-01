import { Module } from '@nestjs/common'
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway } from '@nestjs/websockets'
import type { Namespace, Socket } from 'socket.io'

import { ACCESS_COOKIE, ActorService } from '../auth/actor.service'
import { orgRoom, RealtimeService, sessionRoom, userRoom } from './realtime.service'

/**
 * Sockets sign in with the same access cookie as the API and are put in
 * three rooms: their business, their person, their session. Clients never
 * send anything; they only listen.
 */
@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  constructor(
    private readonly actors: ActorService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(namespace: Namespace) {
    this.realtime.attach(namespace)
  }

  async handleConnection(socket: Socket) {
    const token = readCookie(socket.handshake.headers.cookie, ACCESS_COOKIE)
    const claims = this.actors.verifyAccess(token)
    const actor = claims ? await this.actors.resolve(claims) : null
    if (!actor) {
      // The browser renews its access cookie over HTTP and connects again.
      socket.emit('auth.expired')
      socket.disconnect(true)
      return
    }
    await socket.join([orgRoom(actor.orgId), userRoom(actor.userId), sessionRoom(actor.sessionId)])
  }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) {
      return decodeURIComponent(value.join('='))
    }
  }
  return undefined
}

@Module({ providers: [RealtimeGateway] })
export class RealtimeGatewayModule {}
