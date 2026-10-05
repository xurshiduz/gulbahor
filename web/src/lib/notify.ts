import { useEffect } from 'react'

import { toast, type ToastOptions } from './toast'

/**
 * Telling a person that something needs them: a gate went off, money or
 * goods are on their way to them. Someone working in the system sees the
 * message on the screen; a desktop notification is for when they are
 * elsewhere: another program, another tab, the screen locked.
 */

const FOCUS_KEY = 'gb.focused-at'
const FOCUS_BEAT_MS = 2000
const FOCUS_FRESH_MS = 4500

const ASKED_KEY = 'gb.notify.asked-at'
/** Someone who says "later" is asked again the next day, not on every screen. */
const ASK_AGAIN_MS = 24 * 60 * 60 * 1000

const focusedHere = () => document.visibilityState === 'visible' && document.hasFocus()

function markFocus(focused: boolean) {
  try {
    localStorage.setItem(FOCUS_KEY, focused ? String(Date.now()) : '0')
  } catch {
    // Storage can be refused in a private window; each tab still judges its own focus.
  }
}

/** Every open tab counts: a tab in the background stays quiet while another tab of the system is being worked in. */
const watching = () => {
  if (focusedHere()) {
    return true
  }
  try {
    return Date.now() - Number(localStorage.getItem(FOCUS_KEY) ?? 0) < FOCUS_FRESH_MS
  } catch {
    return false
  }
}

/** Keeps saying, while this tab is being worked in, that someone is here. */
export function useFocusBeacon() {
  useEffect(() => {
    const beat = () => {
      if (focusedHere()) {
        markFocus(true)
      }
    }
    const leave = () => markFocus(false)
    beat()
    const timer = window.setInterval(beat, FOCUS_BEAT_MS)
    window.addEventListener('focus', beat)
    window.addEventListener('blur', leave)
    document.addEventListener('visibilitychange', beat)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', beat)
      window.removeEventListener('blur', leave)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [])
}

const supported = () => typeof Notification !== 'undefined'

/** Whether the browser has yet to be asked, and it is time to ask. */
export function shouldAskToNotify(): boolean {
  if (!supported() || Notification.permission !== 'default') {
    return false
  }
  try {
    return Date.now() - Number(localStorage.getItem(ASKED_KEY) ?? 0) > ASK_AGAIN_MS
  } catch {
    return true
  }
}

export function askToNotifyLater() {
  try {
    localStorage.setItem(ASKED_KEY, String(Date.now()))
  } catch {
    // Without storage the question simply comes back on the next visit.
  }
}

/** The browser's own question. It may only be put when a person clicks, so this is called from a button. */
export async function allowNotifications(): Promise<boolean> {
  if (!supported()) {
    return false
  }
  const answer = await Notification.requestPermission()
  if (answer !== 'granted') {
    askToNotifyLater()
  }
  return answer === 'granted'
}

function desktop(title: string, body: string | undefined, tag: string | undefined, onOpen?: () => void) {
  try {
    const notification = new Notification(title, { body, tag, icon: '/icon-192.png' })
    notification.onclick = () => {
      window.focus()
      onOpen?.()
      notification.close()
    }
  } catch {
    // Some mobile browsers only let a service worker show notifications; the message on the screen still lands.
  }
}

/** Shown once permission is given, so the person sees what a notification will look like. */
export const greet = (title: string, body: string) => desktop(title, body, 'gb.hello')

export interface Notice {
  tone?: 'bad' | 'warn' | 'info'
  title: string
  body?: string
  /** One notice per thing: told twice, it is shown once. */
  tag: string
  /** How long the message stays on the screen, in milliseconds. */
  duration?: number
  /** Where to go to deal with it: the button on the message, and a click on the desktop notification. */
  open?: { label: string; go: () => void }
}

export function announce({ tone = 'warn', title, body, tag, duration, open }: Notice) {
  const options: ToastOptions = {
    description: body,
    id: tag,
    duration,
    action: open ? { label: open.label, onClick: open.go } : undefined,
  }
  toast[tone === 'bad' ? 'error' : tone === 'info' ? 'info' : 'warning'](title, options)
  if (supported() && Notification.permission === 'granted' && !watching()) {
    desktop(title, body, tag, open?.go)
  }
}
