import { Loader2, type LucideIcon } from 'lucide-react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn'
import { comboKeys } from '@/lib/hotkeys'

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-4.5 min-w-4.5 items-center justify-center rounded border border-line-strong bg-sunken px-1',
        'font-sans text-[10.5px] font-medium text-ink-3',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

/** "mod+k" drawn as keys: Ctrl K */
export function Shortcut({ combo, className }: { combo: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {comboKeys(combo).map((key, index) => (
        <Kbd key={index}>{key}</Kbd>
      ))}
    </span>
  )
}

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' | 'info'

const TONES: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2',
  accent: 'bg-accent-soft text-accent-ink',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
}

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn('inline-flex h-5 items-center rounded px-1.5 text-[11.5px] font-medium whitespace-nowrap', TONES[tone], className)}
      {...props}
    />
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-ink-3', className)} />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-sunken', className)} />
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-sunken text-ink-3">
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-ink-3">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function Tooltip({ content, children, side = 'bottom' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-60 flex items-center gap-2 rounded-md bg-ink px-2 py-1 text-xs text-surface shadow-float data-[state=delayed-open]:animate-fade-in"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export const TooltipProvider = TooltipPrimitive.Provider
