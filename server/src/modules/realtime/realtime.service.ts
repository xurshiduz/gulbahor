import { Injectable } from '@nestjs/common'
import type { Namespace } from 'socket.io'

/**
 * Tells open screens that something changed. Only resource names travel over
 * the socket; the screens then refetch through the API, so nothing sensitive
 * is pushed and nothing can drift from what the API returns.
 */
@Injectable()
export class RealtimeService {
  private namespace?: Namespace

  attach(namespace: Namespace) {
    this.namespace = namespace
  }

  /** Something in these resources changed for this business. */
  changed(orgId: string, resources: string[]) {
    this.namespace?.to(orgRoom(orgId)).emit('changed', { resources })
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
