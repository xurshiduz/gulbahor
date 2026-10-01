import { X } from 'lucide-react'
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

interface TagInputProps {
  id?: string
  value: string[]
  onChange: (value: string[]) => void
  /** Cleans up one entry, or returns null to refuse it. */
  parse?: (text: string) => string | null
  max?: number
  placeholder?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
}

const SEPARATORS = /[\s,;]+/

/**
 * A list of short codes typed or scanned one after another. Enter, a comma
 * or a space ends an entry, so a barcode scanner fills it without help;
 * pasting several codes at once adds them all.
 */
export function TagInput({
  id,
  value,
  onChange,
  parse = (text) => text,
  max,
  placeholder,
  invalid,
  disabled,
  className,
}: TagInputProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [refused, setRefused] = useState(false)

  const add = (raw: string): boolean => {
    const next = [...value]
    let ok = true
    for (const piece of raw.split(SEPARATORS).filter(Boolean)) {
      const parsed = parse(piece)
      if (parsed === null || (max !== undefined && next.length >= max && !next.includes(parsed))) {
        ok = false
        continue
      }
      if (!next.includes(parsed)) {
        next.push(parsed)
      }
    }
    if (next.length !== value.length) {
      onChange(next)
    }
    setRefused(!ok)
    return ok
  }

  const commit = () => {
    if (!text.trim()) {
      return true
    }
    const ok = add(text)
    if (ok) {
      setText('')
    }
    return ok
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && text.trim() && !(event.ctrlKey || event.metaKey)) {
      // This Enter ends the entry; the next one, in the empty field, moves on.
      event.preventDefault()
      commit()
      return
    }
    if ((event.key === ',' || event.key === ' ' || event.key === ';') && text.trim()) {
      event.preventDefault()
      commit()
      return
    }
    if (event.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text')
    if (SEPARATORS.test(pasted.trim())) {
      event.preventDefault()
      add(pasted)
    }
  }

  return (
    <div
      onMouseDown={(event) => {
        if (event.target !== ref.current && !disabled) {
          event.preventDefault()
          ref.current?.focus()
        }
      }}
      className={cn(
        'flex min-h-8.5 w-full cursor-text flex-wrap items-center gap-1 rounded-md border border-line-strong bg-surface px-1.5 py-0.75 transition-colors hover:border-control',
        'focus-within:border-accent focus-within:outline-2 focus-within:outline-accent/25',
        (invalid || refused) && 'border-bad focus-within:border-bad focus-within:outline-bad/25',
        disabled && 'cursor-not-allowed bg-sunken',
        className,
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="font-code flex h-6 items-center gap-0.5 rounded bg-sunken pr-0.5 pl-1.5 text-xs text-ink"
        >
          {tag}
          {!disabled ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`${t('common.delete')}: ${tag}`}
              onClick={() => onChange(value.filter((item) => item !== tag))}
              className="flex size-4 items-center justify-center rounded text-ink-3 hover:bg-line hover:text-ink"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </span>
      ))}
      <input
        ref={ref}
        id={id}
        value={text}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid || refused || undefined}
        placeholder={value.length ? '' : placeholder}
        onChange={(event) => {
          setRefused(false)
          setText(event.target.value)
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={commit}
        className="font-code h-6.5 min-w-20 flex-1 bg-transparent px-1 text-xs text-ink outline-none placeholder:font-sans placeholder:text-[13px] placeholder:text-ink-3"
      />
    </div>
  )
}
