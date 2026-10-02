import { Search, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'
import { useHotkey } from '@/lib/hotkeys'

import { Shortcut } from './feedback'
import { controlClass } from './input'

interface PageProps {
  title: string
  /** A few words beside the title that say which one this is: a document's shop and author, the till in use. */
  note?: ReactNode
  actions?: ReactNode
  children: ReactNode
  /** Narrow pages (forms, settings) read better at a limited width. */
  width?: 'full' | 'narrow'
}

/** Where the frame around the screens shows a screen's name: in its own top bar, so the screen starts with its content. */
export const PageChrome = createContext<{ title: HTMLElement | null } | null>(null)

type BarKind = 'tabs' | 'toolbar'

interface PageBarValue {
  /** The place the screen's buttons go: the right end of its first row. */
  slot: HTMLElement | null
  claim: (kind: BarKind, element: HTMLElement | null) => void
}

const PageBar = createContext<PageBarValue | null>(null)

/**
 * A row that can hold the screen's buttons at its right end (the tabs, a
 * list's filters) offers the place through this ref, so the buttons take no
 * row of their own. Null outside a screen.
 */
export function usePageBarSlot(kind: BarKind): ((element: HTMLElement | null) => void) | null {
  const claim = useContext(PageBar)?.claim
  return useMemo(() => (claim ? (element: HTMLElement | null) => claim(kind, element) : null), [claim, kind])
}

/** What floats above a screen (a dialog) is not part of its rows. */
export function PageBarBoundary({ children }: { children: ReactNode }) {
  return <PageBar.Provider value={null}>{children}</PageBar.Provider>
}

/**
 * Buttons that act on the screen, or on the tab in view. They go to the
 * right end of the screen's first row; where there is no such row, they
 * stay where they are written, on the right.
 */
export function PageActions({ children }: { children: ReactNode }) {
  const slot = useContext(PageBar)?.slot
  if (slot) {
    return createPortal(children, slot)
  }
  return <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{children}</div>
}

/**
 * A screen: its name, its main actions, and the content filling the rest.
 * Inside the app's frame the name sits in the top bar; on its own, a screen
 * shows it above its content.
 */
export function Page({ title, note, actions, children, width = 'full' }: PageProps) {
  const chrome = useContext(PageChrome)
  const [slots, setSlots] = useState<Record<BarKind, HTMLElement | null>>({ tabs: null, toolbar: null })
  const claim = useCallback(
    (kind: BarKind, element: HTMLElement | null) =>
      setSlots((current) => (current[kind] === element ? current : { ...current, [kind]: element })),
    [],
  )
  // Tabs are the screen's first row; a list's filters come after them.
  const slot = slots.tabs ?? slots.toolbar
  const bar = useMemo(() => ({ slot, claim }), [slot, claim])

  useEffect(() => {
    document.title = `${title} · Gulbahor`
  }, [title])

  const heading = (
    <>
      <h1 className="max-w-full shrink-0 truncate text-[15px] leading-tight font-semibold text-ink">{title}</h1>
      {/* Short of room, the note is cut before the name is. */}
      {note ? <span className="min-w-0 truncate text-xs text-ink-3">{note}</span> : null}
    </>
  )
  const ownRow = !!actions && !slot

  return (
    <PageBar.Provider value={bar}>
      <div className={cn('mx-auto flex h-full min-h-0 w-full flex-col gap-3 p-4', width === 'narrow' && 'max-w-3xl')}>
        {chrome?.title ? createPortal(heading, chrome.title) : null}
        {!chrome || ownRow ? (
          <header className="flex shrink-0 flex-wrap items-center gap-3">
            {!chrome ? <div className="flex min-w-0 flex-[1_1_12rem] items-baseline gap-2">{heading}</div> : null}
            {ownRow ? <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
          </header>
        ) : null}
        {actions && slot ? createPortal(actions, slot) : null}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </PageBar.Provider>
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
