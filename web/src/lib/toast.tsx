import { CircleCheck, CircleX, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast as sonner } from 'sonner'

import { cn } from './cn'

/**
 * The messages that come up in the top right corner: something was saved,
 * something was refused, something happened in the shop. Each is a small
 * card in the colour of its kind; a click anywhere on it puts it away, and
 * it shrinks out of sight (`gb-alert` in the stylesheet).
 */

type Tone = 'ok' | 'bad' | 'warn' | 'info'

export interface ToastOptions {
  /** A second line under the message. */
  description?: ReactNode
  /** A message with the same id takes the place of the one already shown. */
  id?: string | number
  /** How long it stays, in milliseconds. */
  duration?: number
  /** Something to do about it; doing it puts the message away. */
  action?: { label: string; onClick: () => void }
}

const ICONS: Record<Tone, LucideIcon> = { ok: CircleCheck, bad: CircleX, warn: TriangleAlert, info: Info }
const INK: Record<Tone, string> = { ok: 'text-ok', bad: 'text-bad', warn: 'text-warn', info: 'text-info' }
const BAR: Record<Tone, string> = { ok: 'bg-ok', bad: 'bg-bad', warn: 'bg-warn', info: 'bg-info' }

interface AlertProps extends ToastOptions {
  tone: Tone
  title: ReactNode
  onClose: () => void
}

function Alert({ tone, title, description, action, onClose }: AlertProps) {
  const Icon = ICONS[tone]
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      onClick={onClose}
      className={cn(
        'gb-alert relative flex w-fit max-w-[min(26rem,calc(100vw-2rem))] min-w-52 cursor-pointer items-start gap-2.5',
        'rounded-lg border border-line bg-surface py-2.5 pr-3.5 pl-4 shadow-float select-none',
        INK[tone],
      )}
    >
      <span className={cn('absolute top-2 bottom-2 left-0 w-1 rounded-r', BAR[tone])} />
      <Icon className="mt-px size-4.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug font-medium break-words">{title}</p>
        {description ? <p className="mt-0.5 text-xs leading-snug break-words text-ink-2">{description}</p> : null}
      </div>
      {action ? (
        <button
          type="button"
          // The click goes on to the card, which closes.
          onClick={action.onClick}
          className="-my-0.5 shrink-0 self-center rounded-md border border-line-strong px-2 py-1 text-xs font-medium text-ink hover:bg-sunken"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  )
}

const show = (tone: Tone, title: ReactNode, { id, duration, ...rest }: ToastOptions = {}) =>
  sonner.custom((shown) => <Alert tone={tone} title={title} {...rest} onClose={() => sonner.dismiss(shown)} />, {
    id,
    duration,
  })

export const toast = {
  success: (title: ReactNode, options?: ToastOptions) => show('ok', title, options),
  error: (title: ReactNode, options?: ToastOptions) => show('bad', title, options),
  warning: (title: ReactNode, options?: ToastOptions) => show('warn', title, options),
  info: (title: ReactNode, options?: ToastOptions) => show('info', title, options),
  dismiss: (id?: string | number) => sonner.dismiss(id),
}
