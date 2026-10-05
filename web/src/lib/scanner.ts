import { useEffect, useRef } from 'react'

import { useCovered } from './hotkeys'

/**
 * Barcode and RFID readers type like a keyboard, only much faster, and end
 * with Enter. This hook tells a scan from a person typing by the gaps
 * between keys, wherever the cursor happens to be.
 *
 * If the scan landed in a text field, the field is put back as it was before
 * the scan, so a code never ends up inside a name or an amount.
 */

export interface ScannerOptions {
  enabled?: boolean
  /** Shorter codes are treated as typing. */
  minLength?: number
  /** Longest gap between two keys of one scan, in milliseconds. */
  maxGapMs?: number
}

interface Burst {
  text: string
  startedAt: number
  lastAt: number
  field: HTMLInputElement | HTMLTextAreaElement | null
  fieldValue: string
}

export function useScanner(onScan: (code: string) => void, options: ScannerOptions = {}) {
  const { minLength = 4, maxGapMs = 35 } = options
  // A window open over the screen takes what is scanned as typing; the screen under it does not act on it.
  const covered = useCovered()
  const enabled = (options.enabled ?? true) && !covered
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (!enabled) {
      return
    }
    let burst: Burst | null = null

    const handle = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) {
        burst = null
        return
      }
      const now = performance.now()

      if (event.key === 'Enter') {
        const finished = burst
        burst = null
        if (finished && finished.text.length >= minLength && now - finished.lastAt <= maxGapMs * 3) {
          const average = (finished.lastAt - finished.startedAt) / Math.max(1, finished.text.length - 1)
          if (average <= maxGapMs) {
            event.preventDefault()
            event.stopPropagation()
            restoreField(finished)
            onScanRef.current(finished.text)
          }
        }
        return
      }

      if (event.key.length !== 1) {
        return
      }

      if (!burst || now - burst.lastAt > maxGapMs * 3) {
        const field = textField(event.target)
        burst = { text: '', startedAt: now, lastAt: now, field, fieldValue: field?.value ?? '' }
      }
      burst.text += event.key
      burst.lastAt = now
    }

    // Capture phase: the scan is recognised before any field or form reacts to its Enter.
    window.addEventListener('keydown', handle, true)
    return () => window.removeEventListener('keydown', handle, true)
  }, [enabled, minLength, maxGapMs])
}

function textField(target: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | null {
  if (target instanceof HTMLTextAreaElement) {
    return target
  }
  if (target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit'].includes(target.type)) {
    return target
  }
  return null
}

/** Sets the value the way React expects, so controlled inputs see the change. */
function restoreField(burst: Burst) {
  const field = burst.field
  if (!field || field.value === burst.fieldValue) {
    return
  }
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, burst.fieldValue)
  field.dispatchEvent(new Event('input', { bubbles: true }))
}
