import { Lock } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { suspendHotkeys } from '@/lib/hotkeys'

import { useSession } from './session'

const LOCK_KEY = 'gb.locked'
const ACTIVITY_KEY = 'gb.activity'

const now = () => Date.now()

function readNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0
  } catch {
    return 0
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // Without storage each tab keeps its own lock.
  }
}

/**
 * Locks the screen after a stretch of no activity. Activity and the lock are
 * shared between tabs, so working in one tab keeps the others awake and
 * locking one locks them all. A reload does not get around the lock.
 */
export function useScreenLock(enabled: boolean, minutes: number) {
  const [locked, setLocked] = useState(() => enabled && readNumber(LOCK_KEY) === 1)

  const lock = useCallback(() => {
    if (enabled) {
      write(LOCK_KEY, '1')
      setLocked(true)
    }
  }, [enabled])

  const unlock = useCallback(() => {
    write(LOCK_KEY, null)
    write(ACTIVITY_KEY, String(now()))
    setLocked(false)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setLocked(false)
      return
    }
    setLocked(readNumber(LOCK_KEY) === 1)

    const onStorage = (event: StorageEvent) => {
      if (event.key === LOCK_KEY) {
        setLocked(event.newValue === '1')
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [enabled])

  useEffect(() => {
    if (!enabled || !minutes || locked) {
      return
    }
    let last = 0
    const touch = () => {
      // Writing on every mouse move would be wasteful; a few seconds of precision is plenty.
      if (now() - last > 5_000) {
        last = now()
        write(ACTIVITY_KEY, String(last))
      }
    }
    touch()
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }))

    const timer = window.setInterval(() => {
      if (now() - readNumber(ACTIVITY_KEY) > minutes * 60_000) {
        lock()
      }
    }, 10_000)

    return () => {
      events.forEach((name) => window.removeEventListener(name, touch))
      window.clearInterval(timer)
    }
  }, [enabled, minutes, locked, lock])

  useEffect(() => {
    suspendHotkeys(locked)
    return () => suspendHotkeys(false)
  }, [locked])

  return { locked, lock, unlock }
}

export function ScreenLock({ onUnlocked }: { onUnlocked: () => void }) {
  const { t } = useTranslation()
  const { me, logout } = useSession()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pin.length < 4 || busy) {
      return
    }
    setBusy(true)
    try {
      await api.post('/auth/unlock', { pin })
      onUnlocked()
    } catch (failure) {
      if (failure instanceof ApiError && failure.isAuth) {
        // Too many wrong tries: the session is over and the sign-in page takes it from here.
        onUnlocked()
        await logout()
        return
      }
      setError(failure instanceof ApiError ? (failure.fields?.pin ?? failure.message) : String(failure))
      setPin('')
      inputRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-canvas/95 p-6 backdrop-blur-sm">
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col items-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
          <Lock className="size-5" />
        </div>
        <div>
          <p className="text-base font-semibold">{me.user.fullName}</p>
          <p className="mt-1 text-xs text-ink-3">{t('auth.lockHint')}</p>
        </div>
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          aria-label={t('auth.pin')}
          aria-invalid={!!error || undefined}
          value={pin}
          onChange={(event) => {
            setError(null)
            setPin(event.target.value.replace(/\D/g, ''))
          }}
          className="h-11 w-40 rounded-md border border-line-strong bg-surface text-center text-xl tracking-[0.4em] outline-none focus:border-accent focus:outline-2 focus:outline-accent/25 aria-invalid:border-bad"
        />
        {error ? (
          <p role="alert" className="text-xs text-bad">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-40" loading={busy} disabled={pin.length < 4}>
          {t('auth.unlock')}
        </Button>
        <button type="button" className="text-xs text-ink-3 hover:text-ink hover:underline" onClick={() => void logout().finally(onUnlocked)}>
          {t('auth.otherUser')}
        </button>
      </form>
    </div>
  )
}
