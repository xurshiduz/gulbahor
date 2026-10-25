import { useSyncExternalStore } from 'react'

/**
 * On a touch screen (a handheld reader, a phone) the on-screen keyboard
 * comes up for every field the cursor lands in, and covers half of a small
 * screen — while a reader types its codes in without it. So a field takes
 * the cursor with the keyboard kept down (`inputmode="none"`), and the
 * keyboard comes up only when asked for, for that field alone.
 */
const TOUCH = '(pointer: coarse)'
const TYPED = new Set(['', 'text', 'search', 'tel', 'number', 'email', 'password', 'url'])

/** The field the keyboard was asked up for; any other one takes the cursor with it down. */
let askedFor: Element | null = null
const listeners = new Set<() => void>()
const tell = () => listeners.forEach((listener) => listener())

export const isTouch = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia(TOUCH).matches

function isField(element: unknown): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLTextAreaElement) {
    return !element.readOnly
  }
  return element instanceof HTMLInputElement && TYPED.has(element.type) && !element.readOnly
}

function keepDown(field: HTMLInputElement | HTMLTextAreaElement) {
  if (!('inputmodeWas' in field.dataset)) {
    field.dataset.inputmodeWas = field.getAttribute('inputmode') ?? ''
  }
  field.setAttribute('inputmode', 'none')
}

function letUp(field: HTMLInputElement | HTMLTextAreaElement) {
  if ('inputmodeWas' in field.dataset) {
    const was = field.dataset.inputmodeWas
    if (was) {
      field.setAttribute('inputmode', was)
    } else {
      field.removeAttribute('inputmode')
    }
    delete field.dataset.inputmodeWas
  }
}

/** Once, at start: on a touch screen every field takes the cursor without the keyboard. */
export function installSoftKeyboard(): void {
  if (!isTouch()) {
    return
  }
  document.addEventListener(
    'focusin',
    (event) => {
      // The sign-in screens have no reader to type for them: their fields bring the keyboard up as anywhere else.
      if (!isField(event.target) || event.target === askedFor || event.target.closest('[data-keyboard-free]')) {
        return
      }
      if (askedFor) {
        askedFor = null
        tell()
      }
      keepDown(event.target)
    },
    true,
  )
}

/** Brings the keyboard up for the field the cursor is in, or puts it away. */
export function toggleSoftKeyboard(): void {
  const field = document.activeElement
  if (!isField(field)) {
    return
  }
  if (askedFor === field) {
    askedFor = null
    keepDown(field)
  } else {
    askedFor = field
    letUp(field)
  }
  // The keyboard follows the field's mode when it takes the cursor anew.
  field.blur()
  field.focus({ preventScroll: true })
  tell()
}

export function useSoftKeyboard(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => askedFor !== null,
  )
}
