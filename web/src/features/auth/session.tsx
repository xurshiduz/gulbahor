import { hasPermission, type MeDto } from '@erp/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Spinner } from '@/components/ui/feedback'
import { setLanguage } from '@/i18n'
import { api, ApiError, setSignedOutHandler } from '@/lib/api'
import { setBase } from '@/lib/base'
import { useRealtime } from '@/lib/realtime'
import { toast } from '@/lib/toast'

import { ChangePasswordPage } from './change-password-page'
import { LoginPage } from './login-page'
import { ScreenLock, useScreenLock } from './screen-lock'

interface Session {
  me: MeDto
  can: (permission: string) => boolean
  hasModule: (key: string) => boolean
  logout: () => Promise<void>
  lock: () => void
  /** Whether live updates are arriving. */
  connected: boolean
}

const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) {
    throw new Error('useSession must be used inside SessionGate')
  }
  return session
}

const ME_KEY = ['me']

/**
 * Stands in front of the whole app. Until someone is signed in there is only
 * the sign-in page; a person with a temporary password must replace it; a
 * new business is taken through its first setup. Only then does the app
 * itself render.
 */
export function SessionGate({ setup, children }: { setup: ReactNode; children: ReactNode }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: me, isPending } = useQuery({
    queryKey: ME_KEY,
    queryFn: async ({ signal }) => {
      try {
        return await api.get<MeDto>('/auth/me', undefined, signal)
      } catch (error) {
        if (error instanceof ApiError && error.isAuth) {
          return null
        }
        throw error
      }
    },
    staleTime: Infinity,
    meta: { silent: true },
  })

  const signedOut = useCallback(() => {
    queryClient.setQueryData(ME_KEY, null)
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' })
  }, [queryClient])

  useEffect(() => {
    setSignedOutHandler(signedOut)
  }, [signedOut])

  useEffect(() => {
    if (me) {
      setLanguage(me.user.language)
    }
  }, [me?.user.language]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSessionEnded = useCallback(() => {
    toast.error(t('auth.sessionEnded'))
    signedOut()
  }, [signedOut, t])

  const connected = useRealtime(queryClient, !!me, onSessionEnded)

  const autoLockMinutes = me?.user.hasPin ? me.org.settings.autoLockMinutes : 0
  const { locked, lock, unlock } = useScreenLock(!!me && me.user.hasPin, autoLockMinutes)

  const session = useMemo<Session | null>(() => {
    if (!me) {
      return null
    }
    return {
      me,
      can: (permission) => hasPermission(me.user.permissions, permission),
      hasModule: (key) => me.org.modules.includes(key),
      logout: async () => {
        try {
          await api.post('/auth/logout')
        } finally {
          signedOut()
        }
      },
      lock,
      connected,
    }
  }, [me, connected, lock, signedOut])

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (!me || !session) {
    return <LoginPage onSignedIn={() => queryClient.invalidateQueries({ queryKey: ME_KEY })} />
  }
  // Before anything below renders a sum: every sum without a currency of its own is in the base.
  setBase(me.org.baseCurrency)

  let content = children
  if (me.user.mustChangePassword) {
    content = <ChangePasswordPage />
  } else if (!me.org.setupCompleted) {
    content = me.user.isOwner ? setup : <NotSetUp />
  }

  return (
    <SessionContext.Provider value={session}>
      <div inert={locked} className="h-full">
        {content}
      </div>
      {locked ? <ScreenLock onUnlocked={unlock} /> : null}
    </SessionContext.Provider>
  )
}

function NotSetUp() {
  const { logout } = useSession()
  const { t } = useTranslation()
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="max-w-sm text-sm text-ink-2">{t('setup.notReady')}</p>
      <button type="button" className="text-sm font-medium text-accent-ink hover:underline" onClick={() => void logout()}>
        {t('auth.signOut')}
      </button>
    </div>
  )
}
