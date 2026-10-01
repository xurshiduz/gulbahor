import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'
import { useHotkey } from '@/lib/hotkeys'

import { Shortcut } from './feedback'
import { controlClass } from './input'

interface PageProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  /** Narrow pages (forms, settings) read better at a limited width. */
  width?: 'full' | 'narrow'
}

/** A screen: its name, what it is for, its main action, and the content filling the rest. */
export function Page({ title, subtitle, actions, children, width = 'full' }: PageProps) {
  useEffect(() => {
    document.title = `${title} · Gulbahor`
  }, [title])

  return (
    <div className={cn('mx-auto flex h-full min-h-0 w-full flex-col gap-4 p-5', width === 'narrow' && 'max-w-3xl')}>
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-[1_1_16rem]">
          <h1 className="text-lg leading-tight font-semibold text-ink">{title}</h1>
          {subtitle ? <p className="mt-0.5 max-w-2xl text-xs text-ink-3">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

export function Card({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border border-line bg-surface p-4 shadow-card', className)}>
      {title ? <h2 className="eyebrow mb-3">{title}</h2> : null}
      {children}
    </section>
  )
}

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

/**
 * The search box above a list. "/" jumps into it from anywhere; typing
 * waits a moment before searching so each keystroke is not a request.
 */
export function SearchInput({ value, onChange, placeholder, className }: SearchInputProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(value)
  const lastSent = useRef(value)

  useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value
      setText(value)
    }
  }, [value])

  useEffect(() => {
    if (text === lastSent.current) {
      return
    }
    const timer = window.setTimeout(() => {
      lastSent.current = text
      onChange(text)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [text, onChange])

  useHotkey('/', () => ref.current?.focus(), { label: t('shortcuts.focusSearch'), group: t('shortcuts.groupList') })

  return (
    <div className={cn('relative w-64', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" />
      <input
        ref={ref}
        type="search"
        value={text}
        placeholder={placeholder ?? t('common.search')}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && text) {
            event.stopPropagation()
            setText('')
          }
        }}
        className={cn(controlClass, 'pr-9 pl-8 [&::-webkit-search-cancel-button]:hidden')}
      />
      {text ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            setText('')
            ref.current?.focus()
          }}
          aria-label={t('common.delete')}
          className="absolute top-1/2 right-1.5 flex size-5.5 -translate-y-1/2 items-center justify-center rounded text-ink-3 hover:bg-sunken hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      ) : (
        <Shortcut combo="/" className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2" />
      )}
    </div>
  )
}
