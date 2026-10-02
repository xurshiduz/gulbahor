import type { AgentPrintAnswer, AgentPrintOrder } from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import type { Socket } from 'socket.io'

/** How long an agent has to hand a job to its printer and say so. */
const ANSWER_TIMEOUT_MS = 30_000

/**
 * The agents connected right now. An agent dials out from the shop and
 * stays on the line; this is how the server, which cannot see the shop's
 * network, gets a job to a printer there.
 */
@Injectable()
export class AgentHub {
  private readonly sockets = new Map<string, Socket>()

  isOnline(agentId: string | null): boolean {
    return !!agentId && this.sockets.has(agentId)
  }

  /** A key in use on two computers: the newer connection wins. */
  join(agentId: string, socket: Socket) {
    const previous = this.sockets.get(agentId)
    this.sockets.set(agentId, socket)
    if (previous && previous.id !== socket.id) {
      previous.emit('refused', { reason: 'Bu kalit bilan boshqa kompyuter ulandi' })
      previous.disconnect(true)
    }
  }

  /** False when the socket had already been replaced by a newer one. */
  leave(agentId: string, socket: Socket): boolean {
    if (this.sockets.get(agentId)?.id !== socket.id) {
      return false
    }
    this.sockets.delete(agentId)
    return true
  }

  drop(agentId: string) {
    const socket = this.sockets.get(agentId)
    this.sockets.delete(agentId)
    socket?.disconnect(true)
  }

  /** Never throws: an agent that is gone or silent is an answer too. */
  async send(agentId: string, order: AgentPrintOrder): Promise<AgentPrintAnswer> {
    const socket = this.sockets.get(agentId)
    if (!socket) {
      return { ok: false, error: 'Agent ulanmagan' }
    }
    try {
      const answer = (await socket.timeout(ANSWER_TIMEOUT_MS).emitWithAck('print', order)) as AgentPrintAnswer
      return answer?.ok ? { ok: true } : { ok: false, error: String(answer?.error ?? "Noma'lum xato") }
    } catch {
      return { ok: false, error: 'Agent javob bermadi' }
    }
  }
}
