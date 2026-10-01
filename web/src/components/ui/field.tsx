import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

interface FieldProps {
  label: string
  hint?: ReactNode
  error?: string
  required?: boolean
  className?: string
  /** Receives the id to put on the control so the label points at it. */
  children: (id: string) => ReactNode
}

/** A label, its control, and the hint or error under it. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId()
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-ink-2">
        {label}
        {required ? <span className="ml-0.5 text-bad">*</span> : null}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="text-xs text-bad">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}
