import { PIN_LENGTH } from '@gulbahor/core'
import { Lock } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { PinInput } from '@/components/ui/pin-input'
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
  const [refused, setRefused] = useState(0)
  const [busy, setBusy] = useState(false)
  // The last digit and Enter may both ask: one PIN is tried once.
  const checking = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /** Asked as soon as the last digit is in: right, the screen opens; wrong, the boxes shake and empty. */
  const check = async (code: string) => {
    if (code.length < PIN_LENGTH || checking.current) {
      return
    }
    checking.current = true
    setBusy(true)
    try {
      await api.post('/auth/unlock', { pin: code })
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
      setRefused((count) => count + 1)
      inputRef.current?.focus()
    } finally {
      checking.current = false
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void check(pin)
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
        {/* The button is as wide as the boxes are. */}
        <div className="flex flex-col items-stretch gap-4">
          <PinInput
            ref={inputRef}
            size="lg"
            aria-label={t('auth.pin')}
            value={pin}
            invalid={!!error}
            refused={refused}
            onChange={(next) => {
              // What is typed while one PIN is being asked about is not the start of another.
              if (!checking.current) {
                setError(null)
                setPin(next)
              }
            }}
            onComplete={(code) => void check(code)}
          />
          {error ? (
            <p role="alert" className="max-w-56 self-center text-xs text-bad">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" loading={busy} disabled={pin.length < PIN_LENGTH}>
            {t('auth.unlock')}
          </Button>
        </div>
        <button
          type="button"
          className="text-xs text-ink-3 hover:text-ink hover:underline"
          onClick={() => void logout().finally(onUnlocked)}
        >
          {t('auth.otherUser')}
        </button>
      </form>
    </div>
  )
}
