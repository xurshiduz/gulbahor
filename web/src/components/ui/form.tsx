import { useEffect, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form'
import type { ZodType } from 'zod'

import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'

const FIELDS = [
  'input:not([type="hidden"]):not(:disabled):not([tabindex="-1"])',
  'textarea:not(:disabled)',
  'button[role="combobox"]:not(:disabled)',
  'button[role="checkbox"]:not(:disabled)',
  'button[role="switch"]:not(:disabled)',
].join(', ')

interface FormProps {
  onSubmit: () => void
  children: ReactNode
  className?: string
  id?: string
}

/**
 * A form you fill in without leaving the keyboard: Enter moves to the next
 * field and submits from the last one, Ctrl+Enter submits from anywhere.
 * Controls inside a `data-enter-skip` element are passed over by Enter (Tab
 * still reaches them): settings that are rarely touched while entering data.
 */
export function Form({ onSubmit, children, className, id }: FormProps) {
  const ref = useRef<HTMLFormElement>(null)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onSubmit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.defaultPrevented) {
      return
    }
    const form = ref.current
    if (!form) {
      return
    }
    // A field that commits on Enter has only just reported its value. The form is read a moment later,
    // once whoever keeps that value has taken it in; read at once, it would be saved without it.
    const submit = () => window.setTimeout(() => form.requestSubmit())
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      submit()
      return
    }
    const target = event.target as HTMLElement
    // Multi-line text keeps Enter for new lines; buttons keep it for pressing.
    if (target.tagName !== 'INPUT') {
      return
    }
    event.preventDefault()
    const fields = [...form.querySelectorAll<HTMLElement>(FIELDS)].filter(
      (field) => field.offsetParent !== null && (field === target || !field.closest('[data-enter-skip]')),
    )
    const next = fields[fields.indexOf(target) + 1]
    if (next) {
      next.focus()
    } else {
      // Leaving the last field commits what was typed in it before the form is read.
      target.blur()
      submit()
    }
  }

  return (
    <form
      ref={ref}
      id={id}
      noValidate
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className={cn('flex flex-col gap-4', className)}
    >
      {children}
    </form>
  )
}

/**
 * Validates the form's values against a contract schema on submit and hands
 * the parsed result on. The same schema runs again on the server, so a form
 * never accepts what the server would reject.
 */
export function zodSubmit<TForm extends FieldValues, TOutput>(
  form: UseFormReturn<TForm>,
  schema: ZodType<TOutput>,
  onValid: (data: TOutput) => void,
) {
  return form.handleSubmit((values) => {
    const data = zodCheck(form, schema, values)
    if (data !== null) {
      onValid(data)
    }
  })
}

/**
 * Checks `data` against a contract schema. On failure each message goes
 * under its field and null comes back. For forms whose request is not
 * simply their field values.
 */
export function zodCheck<TForm extends FieldValues, TOutput>(
  form: UseFormReturn<TForm>,
  schema: ZodType<TOutput>,
  data: unknown,
): TOutput | null {
  const result = schema.safeParse(data)
  if (result.success) {
    return result.data
  }
  const seen = new Set<string>()
  for (const issue of result.error.issues) {
    const path = issue.path.join('.')
    if (seen.has(path)) {
      continue
    }
    form.setError(path as Path<TForm>, { type: 'validate', message: issue.message }, { shouldFocus: seen.size === 0 })
    seen.add(path)
  }
  return null
}

/** Puts the server's per-field messages under their fields. Returns false if the error was not a field error. */
export function applyServerErrors<T extends FieldValues>(error: unknown, form: UseFormReturn<T>): boolean {
  if (!(error instanceof ApiError) || !error.fields) {
    return false
  }
  let focused = false
  for (const [path, message] of Object.entries(error.fields)) {
    form.setError(path as Path<T>, { type: 'server', message }, { shouldFocus: !focused })
    focused = true
  }
  return true
}

/**
 * Keeps what has been typed into a form across a closed tab or a power cut.
 * The draft is restored when the form opens again and cleared once it is
 * saved. Secrets are never kept.
 */
export function useDraft<T extends FieldValues>(
  key: string | null,
  form: UseFormReturn<T>,
  omit: (keyof T & string)[] = [],
) {
  const storageKey = key ? `gb.draft.${key}` : null
  const restored = useRef(false)

  useEffect(() => {
    if (!storageKey || restored.current) {
      return
    }
    restored.current = true
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const draft = JSON.parse(stored) as Partial<T>
        for (const [name, value] of Object.entries(draft)) {
          form.setValue(name as Path<T>, value as never, { shouldDirty: true })
        }
      }
    } catch {
      // A broken draft is no draft.
    }
  }, [storageKey, form])

  useEffect(() => {
    if (!storageKey) {
      return
    }
    let timer: number | undefined
    const subscription = form.watch((values) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (!form.formState.isDirty) {
          return
        }
        const draft = { ...values } as Record<string, unknown>
        omit.forEach((name) => delete draft[name])
        try {
          localStorage.setItem(storageKey, JSON.stringify(draft))
        } catch {
          // Storage may be full or unavailable; the form still works.
        }
      }, 400)
    })
    return () => {
      window.clearTimeout(timer)
      subscription.unsubscribe()
    }
    // `omit` is a literal at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, form])

  return {
    clear: () => {
      if (storageKey) {
        try {
          localStorage.removeItem(storageKey)
        } catch {
          // Nothing to clear.
        }
      }
    },
  }
}
