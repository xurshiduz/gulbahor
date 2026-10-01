import type { QueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

import { renewSession } from './api'

/** Writes land together; one refetch a moment later covers all of them. */
const REFETCH_DELAY_MS = 300

/**
 * Keeps every open screen current. The server only names what changed
 * ("users", "locations"); queries whose key starts with that name refetch.
 * Returns whether the live connection is up.
 */
export function useRealtime(queryClient: QueryClient, enabled: boolean, onSessionEnded: () => void): boolean {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!enabled) {
      return
    }
    const socket = io('/realtime', { withCredentials: true, transports: ['websocket', 'polling'] })
    const pending = new Set<string>()
    let timer: number | undefined

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('changed', ({ resources }: { resources: string[] }) => {
      resources.forEach((resource) => pending.add(resource))
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const names = new Set(pending)
        pending.clear()
        void queryClient.invalidateQueries({ predicate: (query) => names.has(String(query.queryKey[0])) })
      }, REFETCH_DELAY_MS)
    })

    socket.on('session.ended', onSessionEnded)

    // The access cookie is short-lived; renew it over HTTP and come back.
    socket.on('auth.expired', () => {
      void renewSession().then((ok) => {
        if (ok) {
          window.setTimeout(() => socket.connect(), 500)
        }
      })
    })

    // After a dropped connection, whatever was missed is fetched again.
    socket.io.on('reconnect', () => void queryClient.invalidateQueries())

    return () => {
      window.clearTimeout(timer)
      socket.disconnect()
      setConnected(false)
    }
  }, [queryClient, enabled, onSessionEnded])

  return connected
}
