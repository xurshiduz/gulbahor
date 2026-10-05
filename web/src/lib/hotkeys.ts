import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

/**
 * Keyboard shortcuts. Each screen registers what it answers to; the registry
 * is also what the help sheet (F1) lists, so a shortcut that exists is a
 * shortcut that is shown.
 *
 * A combo is written like "mod+k", "alt+n", "f2", "escape", "/". "mod" is
 * Ctrl on Windows and Linux and ⌘ on a Mac.
 */

export interface HotkeyOptions {
  /** Shown in the help sheet. Without it the shortcut works but is not listed. */
  label?: string
  /** Heading it is listed under. */
  group?: string
  enabled?: boolean
  /** Fire even while typing in a field. Combos with Ctrl/Alt/F-keys always do. */
  inInputs?: boolean
  /** Fire even under a window opened over the screen (`HotkeyScope`): locking the screen. */
  everywhere?: boolean
}

type Handler = (event: KeyboardEvent) => void | boolean

interface Registration {
  id: number
  combo: string
  handler: Handler
  options: HotkeyOptions
  /** The scope it was registered in: 0 for the screen itself. */
  scope: number
}

const registrations: Registration[] = []
const listeners = new Set<() => void>()
let snapshot: Registration[] = []
let nextId = 1
let attached = false

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

function publish() {
  snapshot = [...registrations]
  listeners.forEach((listener) => listener())
}

function comboOf(event: KeyboardEvent): string {
  const parts: string[] = []
  if (isMac ? event.metaKey : event.ctrlKey) parts.push('mod')
  if (isMac && event.ctrlKey) parts.push('ctrl')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey && event.key.length > 1) parts.push('shift')
  parts.push(keyName(event))
  return parts.join('+')
}

/** The physical key where it matters, so shortcuts work on any keyboard layout. */
function keyName(event: KeyboardEvent): string {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3).toLowerCase()
  if (/^Digit\d$/.test(event.code)) return event.code.slice(5)
  if (event.code === 'Slash') return event.shiftKey ? '?' : '/'
  return event.key.toLowerCase()
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
}

// ───────────────────────────── Scopes ─────────────────────────────

const ScopeContext = createContext(0)
/** The scopes open now, the innermost last. */
let scopes: number[] = []
const scopeListeners = new Set<() => void>()
let nextScope = 1

const topScope = () => scopes.at(-1) ?? 0

function setScopes(next: number[]) {
  scopes = next
  scopeListeners.forEach((listener) => listener())
  publish()
}

/**
 * A window that can open over any screen (a payment taken from anywhere).
 * While it is open only the shortcuts registered inside it answer: the
 * screen under it must not sell, print or open something at a key meant
 * for the window.
 */
export function HotkeyScope({ children }: { children: ReactNode }) {
  const [id] = useState(() => nextScope++)
  useEffect(() => {
    setScopes([...scopes, id])
    return () => setScopes(scopes.filter((scope) => scope !== id))
  }, [id])
  return createElement(ScopeContext.Provider, { value: id }, children)
}

/** Whether such a window is open over whoever asks: scanners and readers hold their codes back too. */
export function useCovered(): boolean {
  const scope = useContext(ScopeContext)
  const top = useSyncExternalStore(
    (listener) => {
      scopeListeners.add(listener)
      return () => scopeListeners.delete(listener)
    },
    topScope,
  )
  return top !== scope
}

let suspended = false

/** Turns every shortcut off, for the locked screen. */
export function suspendHotkeys(value: boolean) {
  suspended = value
}

/** Whatever floats above the page: a dropdown, a menu, a dialog. */
const OVERLAYS = '[data-radix-popper-content-wrapper], [role="dialog"], [role="alertdialog"]'
let overlayOpen = false

/**
 * Esc belongs to whatever is open on top. By the time the key bubbles up
 * here the overlay has already closed itself, so whether one was open is
 * noted on the way down, before it reacts.
 */
function onKeyDownCapture(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    overlayOpen = !!document.querySelector(OVERLAYS)
  }
}

function onKeyDown(event: KeyboardEvent) {
  if (event.isComposing || suspended) {
    return
  }
  const combo = comboOf(event)
  if (combo === 'escape' && overlayOpen) {
    return
  }
  const plain = !combo.includes('+') && !/^f\d{1,2}$/.test(combo) && combo !== 'escape'
  // The most recently registered handler wins, so a dialog's shortcuts cover the page under it.
  for (let i = registrations.length - 1; i >= 0; i--) {
    const { combo: wanted, handler, options } = registrations[i]
    if (wanted !== combo || options.enabled === false) {
      continue
    }
    if (registrations[i].scope !== topScope() && !options.everywhere) {
      continue
    }
    if (plain && !options.inInputs && isTyping(event.target)) {
      continue
    }
    // A handler that returns false declines the key, and the next one is asked.
    if (handler(event) === false) {
      continue
    }
    event.preventDefault()
    return
  }
}

function attach() {
  if (!attached) {
    window.addEventListener('keydown', onKeyDownCapture, true)
    window.addEventListener('keydown', onKeyDown)
    attached = true
  }
}

export function useHotkey(combo: string, handler: Handler, options: HotkeyOptions = {}) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const { label, group, enabled = true, inInputs, everywhere } = options
  const scope = useContext(ScopeContext)

  useEffect(() => {
    attach()
    const registration: Registration = {
      id: nextId++,
      combo: combo.toLowerCase(),
      handler: (event) => handlerRef.current(event),
      options: { label, group, enabled, inInputs, everywhere },
      scope,
    }
    registrations.push(registration)
    publish()
    return () => {
      registrations.splice(registrations.indexOf(registration), 1)
      publish()
    }
  }, [combo, label, group, enabled, inInputs, everywhere, scope])
}

/** Every labelled shortcut active right now, for the help sheet. */
export function useRegisteredHotkeys(): { combo: string; label: string; group: string }[] {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => snapshot,
  )
  const seen = new Set<string>()
  const result: { combo: string; label: string; group: string }[] = []
  for (let i = current.length - 1; i >= 0; i--) {
    const { combo, options, scope } = current[i]
    if (!options.label || options.enabled === false || seen.has(combo)) {
      continue
    }
    if (scope !== topScope() && !options.everywhere) {
      continue
    }
    seen.add(combo)
    result.push({ combo, label: options.label, group: options.group ?? '' })
  }
  return result.reverse()
}

const KEY_LABELS: Record<string, string> = {
  mod: isMac ? '⌘' : 'Ctrl',
  ctrl: 'Ctrl',
  alt: isMac ? '⌥' : 'Alt',
  shift: 'Shift',
  enter: 'Enter',
  escape: 'Esc',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  backspace: '⌫',
  delete: 'Del',
  ' ': 'Space',
}

/** "mod+k" -> ["Ctrl", "K"] */
export function comboKeys(combo: string): string[] {
  return combo.split('+').map((part) => KEY_LABELS[part] ?? (part.length === 1 ? part.toUpperCase() : part.toUpperCase()))
}
