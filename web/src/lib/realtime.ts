import type { QueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

import { renewSession } from './api'

/**
 * Things that happen in the shop and are over at once: a gate went off, a piece was laid on a till's
 * reader, money or goods set off for someone. There is nothing to refetch, so whoever cares is simply
 * told (`useShopEvent`).
 */
const SHOP_EVENTS = ['reader.tag', 'gate.alarm', 'money.sent', 'goods.sent'] as const
export type ShopEventName = (typeof SHOP_EVENTS)[number]

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

    for (const name of SHOP_EVENTS) {
      socket.on(name, (detail: unknown) => window.dispatchEvent(new CustomEvent(`shop:${name}`, { detail })))
    }

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

/** Hears what happened in the shop just now, for as long as the screen that asked is open. */
export function useShopEvent<T>(name: ShopEventName, handler: (payload: T) => void, enabled = true) {
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => {
    if (!enabled) {
      return
    }
    const listen = (event: Event) => latest.current((event as CustomEvent<T>).detail)
    window.addEventListener(`shop:${name}`, listen)
    return () => window.removeEventListener(`shop:${name}`, listen)
  }, [name, enabled])
}
