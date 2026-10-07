import { matchScore, queryKeys, searchKey } from '@gulbahor/core'
import { Check, ChevronDown, Plus, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

import { Shortcut } from './feedback'

export interface ComboOption {
  value: string
  label: string
  /** Secondary text on the right: a code, a phone number. */
  hint?: string
  /** Extra words to find the option by, not shown. */
  keywords?: string
  /** A colour dot before the label, as "#RRGGBB". */
  color?: string | null
}

interface BaseProps {
  id?: string
  options: ComboOption[]
  placeholder?: string
  invalid?: boolean
  disabled?: boolean
  autoFocus?: boolean
  /** Remember what was picked here and list it first next time. */
  recentKey?: string
  /** Offer to create what was typed when nothing matches it exactly. Return the new option's value to select it. */
  onCreate?: (text: string) => void | string | Promise<void | string>
  className?: string
}

interface SingleProps extends BaseProps {
  multiple?: false
  value: string | null
  onChange: (value: string | null) => void
}

interface MultiProps extends BaseProps {
  multiple: true
  value: string[]
  onChange: (value: string[]) => void
}

const CREATE = '\u0000create'
const MAX_SHOWN = 60
const MAX_RECENT = 8

/**
 * Pick one or several from a list by typing. The search forgives: Latin or
 * Cyrillic, any spelling of "o'", words in any order, even the wrong
 * keyboard layout. Everything works from the keyboard: type to open,
 * ↑↓ to move, Enter to pick, Esc to close.
 */
export function Combobox(props: SingleProps | MultiProps) {
  const { id, options, placeholder, invalid, disabled, autoFocus, recentKey, onCreate, className } = props
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)

  const selectedValues = props.multiple ? props.value : props.value ? [props.value] : []
  const selectedOptions = selectedValues
    .map((value) => options.find((option) => option.value === value))
    .filter((option): option is ComboOption => !!option)
  const single = props.multiple ? null : (selectedOptions[0] ?? null)

  const keyed = useMemo(
    () =>
      options.map((option) => ({
        option,
        key: searchKey(`${option.label} ${option.hint ?? ''} ${option.keywords ?? ''}`),
      })),
    [options],
  )

  const shown = useMemo(() => {
    const text = query.trim()
    if (!text) {
      const recent = readRecent(recentKey)
      return [...keyed]
        .sort((a, b) => rank(recent, a.option.value) - rank(recent, b.option.value))
        .slice(0, MAX_SHOWN)
        .map((item) => item.option)
    }
    const keys = queryKeys(text)
    return keyed
      .map((item, index) => ({ option: item.option, score: matchScore(keys, item.key), index }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, MAX_SHOWN)
      .map((item) => item.option)
  }, [keyed, query, recentKey])

  const canCreate =
    !!onCreate && !!query.trim() && !options.some((option) => option.label.toLowerCase() === query.trim().toLowerCase())
  const rows = canCreate ? [...shown.map((option) => option.value), CREATE] : shown.map((option) => option.value)

  // The first match is ready for Enter. "Create" never is: a typo or a scanned
  // barcode followed by Enter must not add a new entry; ↓ reaches it on purpose.
  // Nor is anything in a list of several once a pick is made and the text is
  // empty again: there the next Enter means "done", not "toggle the first one".
  const ready = shown.length > 0 && (!props.multiple || !!query.trim())
  useEffect(() => {
    setHighlight(ready ? 0 : -1)
  }, [query, open, ready])

  useEffect(() => {
    listRef.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const pick = async (value: string) => {
    if (value === CREATE) {
      const created = await onCreate?.(query.trim())
      if (typeof created === 'string') {
        choose(created)
      } else {
        close()
      }
      return
    }
    choose(value)
  }

  const choose = (value: string) => {
    writeRecent(recentKey, value)
    if (props.multiple) {
      props.onChange(
        props.value.includes(value) ? props.value.filter((item) => item !== value) : [...props.value, value],
      )
      setQuery('')
      inputRef.current?.focus()
      return
    }
    props.onChange(value)
    close()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setHighlight((current) => (rows.length ? (current + delta + rows.length) % rows.length : 0))
      return
    }
    if (event.key === 'Enter' && open) {
      // Ctrl+Enter saves the form, and Enter in an untouched field moves on: both are the form's to handle.
      if (event.ctrlKey || event.metaKey || (!rows[highlight] && !query.trim())) {
        close()
        return
      }
      // Otherwise Enter picks here; it must not also move the form on to the next field.
      event.preventDefault()
      event.stopPropagation()
      if (rows[highlight]) {
        void pick(rows[highlight])
      }
      return
    }
    if (event.key === 'Tab' && open) {
      close()
      return
    }
    if (event.key === 'Backspace' && !query) {
      if (props.multiple && props.value.length) {
        props.onChange(props.value.slice(0, -1))
      } else if (!props.multiple && props.value) {
        props.onChange(null)
      }
    }
  }

  const inputValue = open || props.multiple ? query : (single?.label ?? '')

  return (
    <Popover.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <Popover.Anchor asChild>
        <div
          ref={anchorRef}
          onMouseDown={(event) => {
            if (disabled) return
            // Clicking anywhere in the box, not just on the text, puts the cursor in it and opens the list.
            if (event.target !== inputRef.current) {
              event.preventDefault()
              inputRef.current?.focus()
            }
            setOpen(true)
          }}
          className={cn(
            'flex min-h-8.5 w-full cursor-text flex-wrap items-center gap-1 rounded-md border border-line-strong bg-surface py-0.75 pr-1.5 pl-2.5 transition-colors hover:border-control',
            'focus-within:border-accent focus-within:outline-2 focus-within:outline-accent/25',
            invalid && 'border-bad focus-within:border-bad focus-within:outline-bad/25',
            disabled && 'cursor-not-allowed bg-sunken',
            className,
          )}
        >
          {props.multiple
            ? selectedOptions.map((option) => (
                <span
                  key={option.value}
                  className="flex h-6 items-center gap-1 rounded bg-accent-soft pr-0.5 pl-1.5 text-xs font-medium text-accent-ink"
                >
                  {option.color ? <ColorDot color={option.color} /> : null}
                  {option.label}
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`${t('common.delete')}: ${option.label}`}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      props.onChange(props.value.filter((item) => item !== option.value))
                    }}
                    className="flex size-4 items-center justify-center rounded hover:bg-accent/15"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))
            : null}
          <input
            ref={inputRef}
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-invalid={invalid || undefined}
            autoComplete="off"
            spellCheck={false}
            autoFocus={autoFocus}
            disabled={disabled}
            placeholder={selectedOptions.length && props.multiple ? '' : (placeholder ?? t('common.select'))}
            value={inputValue}
            onChange={(event) => {
              setQuery(event.target.value)
              setOpen(true)
            }}
            onFocus={(event) => event.target.select()}
            onKeyDown={handleKeyDown}
            className="h-6.5 min-w-16 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
          />
          {!props.multiple && props.value && !disabled ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('common.delete')}
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                props.onChange(null)
                inputRef.current?.focus()
              }}
              className="flex size-5 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-sunken hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
          <ChevronDown className="size-4 shrink-0 text-ink-3" />
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (anchorRef.current?.contains(event.target as Node)) {
              event.preventDefault()
            }
          }}
          // As wide as the field at least, wider when a name and its hint need it — a place's name cut to "So‘m naqd …"
          // beside its balance could not be told from the next one.
          className="z-50 w-max max-w-[min(28rem,calc(100vw-2rem))] min-w-[max(13rem,var(--radix-popover-trigger-width))] rounded-lg border border-line bg-surface p-1 shadow-float data-[state=open]:animate-pop-in"
        >
          <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto">
            {rows.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-ink-3">{t('common.nothingFound')}</p>
            ) : null}
            {shown.map((option, index) => {
              const isSelected = selectedValues.includes(option.value)
              return (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  data-highlighted={index === highlight}
                  onMouseMove={() => setHighlight(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void pick(option.value)}
                  className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[13px] data-[highlighted=true]:bg-sunken"
                >
                  {option.color ? <ColorDot color={option.color} /> : null}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.hint ? <span className="tabular shrink-0 text-xs text-ink-3">{option.hint}</span> : null}
                  <Check className={cn('size-3.5 shrink-0 text-accent', !isSelected && 'invisible')} />
                </div>
              )
            })}
            {canCreate ? (
              <div
                role="option"
                aria-selected={false}
                data-highlighted={highlight === rows.length - 1}
                onMouseMove={() => setHighlight(rows.length - 1)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void pick(CREATE)}
                className={cn(
                  'flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[13px] font-medium text-accent-ink data-[highlighted=true]:bg-accent-soft',
                  shown.length > 0 && 'mt-1 border-t border-line pt-1.5',
                )}
              >
                <Plus className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t('input.createNew', { text: query.trim() })}</span>
                {highlight !== rows.length - 1 ? <Shortcut combo="arrowdown+enter" className="shrink-0" /> : null}
              </div>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** A small swatch; the ring keeps white visible on a white page and black on a dark one. */
export function ColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-3 shrink-0 rounded-full ring-1 ring-line-strong', className)}
      style={{ backgroundColor: color }}
    />
  )
}

function rank(recent: string[], value: string): number {
  const index = recent.indexOf(value)
  return index === -1 ? MAX_RECENT : index
}

function readRecent(key: string | undefined): string[] {
  if (!key) {
    return []
  }
  try {
    return JSON.parse(localStorage.getItem(`gb.recent.${key}`) ?? '[]') as string[]
  } catch {
    return []
  }
}

function writeRecent(key: string | undefined, value: string) {
  if (!key) {
    return
  }
  try {
    const next = [value, ...readRecent(key).filter((item) => item !== value)].slice(0, MAX_RECENT)
    localStorage.setItem(`gb.recent.${key}`, JSON.stringify(next))
  } catch {
    // Storage may be unavailable; the list still works, just without the shortcut.
  }
}
