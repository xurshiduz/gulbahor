import { Keyboard } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'
import { isTouch, toggleSoftKeyboard, useSoftKeyboard } from '@/lib/soft-keyboard'

/**
 * On a touch screen fields take the cursor with the keyboard kept down; this brings it up for the field in use.
 * The sign-in screens need none: their fields bring the keyboard up by themselves (`data-keyboard-free`).
 */
export function SoftKeyboardButton() {
  const { t } = useTranslation()
  const touch = useMemo(isTouch, [])
  const up = useSoftKeyboard()
  if (!touch) {
    return null
  }
  return (
    // Pressed without taking the cursor out of the field it is for.
    <button
      type="button"
      aria-label={t('nav.keyboard')}
      aria-pressed={up}
      onPointerDown={(event) => event.preventDefault()}
      onClick={toggleSoftKeyboard}
      className={cn(
        'fixed right-3 bottom-3 z-30 flex size-11 items-center justify-center rounded-full border border-line shadow-float',
        up ? 'bg-accent text-white' : 'bg-surface text-ink-2',
      )}
    >
      <Keyboard className="size-5" />
    </button>
  )
}
