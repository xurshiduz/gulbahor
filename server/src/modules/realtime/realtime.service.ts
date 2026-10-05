import { Injectable } from '@nestjs/common'
import type { Namespace } from 'socket.io'

/**
 * Tells open screens that something changed. Only resource names travel over
 * the socket; the screens then refetch through the API, so nothing sensitive
 * is pushed and nothing can drift from what the API returns.
 *
 * The one exception is `event`: something that happened in the shop just
 * now and is over (a gate went off, a piece was laid on a till's reader).
 * There is nothing to refetch, so the little there is to say is sent as it is.
 */
@Injectable()
export class RealtimeService {
  private namespace?: Namespace
  private readonly listeners: ((orgId: string, resources: string[]) => void)[] = []

  attach(namespace: Namespace) {
    this.namespace = namespace
  }

  /** Something in these resources changed for this business. */
  changed(orgId: string, resources: string[]) {
    this.namespace?.to(orgRoom(orgId)).emit('changed', { resources })
    for (const listener of this.listeners) {
      listener(orgId, resources)
    }
  }

  /** For parts of the server that must hear of changes too: the shop agents' lists follow them. */
  onChanged(listener: (orgId: string, resources: string[]) => void) {
    this.listeners.push(listener)
  }

  /** Something that happened just now, for every open screen of this business. */
  event<T extends object>(orgId: string, name: string, payload: T) {
    this.namespace?.to(orgRoom(orgId)).emit(name, payload)
  }

  /** This session was signed out elsewhere; the browser should leave now. */
  sessionEnded(sessionId: string) {
    this.namespace?.to(sessionRoom(sessionId)).emit('session.ended')
  }

  /** Every session of this person was ended (blocked, password reset). */
  userSignedOut(userId: string) {
    this.namespace?.to(userRoom(userId)).emit('session.ended')
  }
}

export const orgRoom = (orgId: string) => `org:${orgId}`
export const userRoom = (userId: string) => `user:${userId}`
export const sessionRoom = (sessionId: string) => `session:${sessionId}`
