import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

export const controlClass = cn(
  'h-8.5 w-full rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-ink transition-colors',
  'placeholder:text-ink-3 hover:border-control',
  'focus:border-accent focus:outline-2 focus:outline-offset-0 focus:outline-accent/25',
  'disabled:bg-sunken disabled:text-ink-3',
  'aria-invalid:border-bad aria-invalid:focus:outline-bad/25',
)

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Shown inside the field, before or after the text. */
  prefix?: string
  suffix?: ReactNode
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, prefix, suffix, invalid, ...props },
  ref,
) {
  // Inside a frame the field fills what is within the frame's border, not its own height: a field one line
  // taller ran over the frame, and a filled-in field's colour covered it.
  const input = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      autoComplete="off"
      spellCheck={false}
      className={cn(controlClass, prefix && 'pl-0', suffix && 'pr-0', (prefix || suffix) && 'h-full border-0 bg-transparent focus:outline-0', className)}
      {...props}
    />
  )
  if (!prefix && !suffix) {
    return input
  }
  return (
    <div
      className={cn(
        'flex h-8.5 w-full items-center rounded-md border border-line-strong bg-surface transition-colors hover:border-control',
        'focus-within:border-accent focus-within:outline-2 focus-within:outline-accent/25',
        invalid && 'border-bad focus-within:border-bad focus-within:outline-bad/25',
        props.disabled && 'bg-sunken',
      )}
    >
      {prefix ? <span className="tabular pr-1.5 pl-2.5 text-ink-3 select-none">{prefix}</span> : null}
      {input}
      {suffix ? <span className="flex shrink-0 items-center pr-2 pl-1.5 text-ink-3 select-none">{suffix}</span> : null}
    </div>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(controlClass, 'h-auto min-h-18 py-1.5 leading-relaxed', className)}
        {...props}
      />
    )
  },
)
