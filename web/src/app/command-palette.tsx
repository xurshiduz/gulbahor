import { matchScore, queryKeys, searchKey } from '@gulbahor/core'
import { useNavigate } from '@tanstack/react-router'
import { Keyboard, Lock, LogOut, Search, SunMoon, type LucideIcon } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Kbd, Shortcut } from '@/components/ui/feedback'
import { useSession } from '@/features/auth/session'
import { cn } from '@/lib/cn'

import type { NavItem } from './navigation'
import { toggleTheme } from './theme'

interface Command {
  id: string
  label: string
  group: string
  icon: LucideIcon
  shortcut?: string
  run: () => void
}

interface Props {
  open: boolean
  onClose: () => void
  pages: (NavItem & { shortcut?: string })[]
  onShowShortcuts: () => void
}

/**
 * Ctrl+K: go to any screen or run any action by typing a few letters of its
 * name, in either script and either keyboard layout.
 */
export function CommandPalette({ open, onClose, pages, onShowShortcuts }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { me, lock, logout } = useSession()
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)

  const commands = useMemo<Command[]>(() => {
    const pageCommands = pages.map((page) => ({
      id: `page:${page.to}`,
      label: t(page.label),
      group: t('command.pages'),
      icon: page.icon,
      shortcut: page.shortcut,
      run: () => void navigate({ to: page.to }),
    }))
    const actions: Command[] = [
      { id: 'theme', label: t('command.toggleTheme'), group: t('command.actions'), icon: SunMoon, run: toggleTheme },
      { id: 'shortcuts', label: t('command.shortcuts'), group: t('command.actions'), icon: Keyboard, shortcut: 'f1', run: onShowShortcuts },
      ...(me.user.hasPin
        ? [{ id: 'lock', label: t('command.lock'), group: t('command.actions'), icon: Lock, shortcut: 'alt+l', run: lock }]
        : []),
      { id: 'logout', label: t('command.logout'), group: t('command.actions'), icon: LogOut, run: () => void logout() },
    ]
    return [...pageCommands, ...actions]
  }, [pages, t, navigate, me.user.hasPin, lock, logout, onShowShortcuts])

  const shown = useMemo(() => {
    if (!query.trim()) {
      return commands
    }
    const keys = queryKeys(query)
    return commands
      .map((command, index) => ({ command, score: matchScore(keys, searchKey(command.label)), index }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((item) => item.command)
  }, [commands, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlight(0)
    }
  }, [open])

  useEffect(() => {
    setHighlight(0)
  }, [query])

  useEffect(() => {
    listRef.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  const run = (command: Command | undefined) => {
    if (!command) {
      return
    }
    onClose()
    command.run()
  }

  let lastGroup = ''

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-float outline-none data-[state=open]:animate-pop-in">
          <Dialog.Title className="sr-only">{t('command.open')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('command.placeholder')}</Dialog.Description>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="size-4 shrink-0 text-ink-3" />
            <input
              autoFocus
              value={query}
              placeholder={t('command.placeholder')}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  const delta = event.key === 'ArrowDown' ? 1 : -1
                  setHighlight((current) => (shown.length ? (current + delta + shown.length) % shown.length : 0))
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  run(shown[highlight])
                }
              }}
              className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-ink-3"
            />
            <Kbd>Esc</Kbd>
          </div>
          <div ref={listRef} className="max-h-[56vh] overflow-y-auto p-2">
            {shown.length === 0 ? <p className="px-3 py-8 text-center text-sm text-ink-3">{t('common.nothingFound')}</p> : null}
            {shown.map((command, index) => {
              const heading = command.group !== lastGroup ? command.group : null
              lastGroup = command.group
              return (
                <div key={command.id}>
                  {heading ? <p className="eyebrow px-2 pt-2 pb-1">{heading}</p> : null}
                  <button
                    type="button"
                    tabIndex={-1}
                    data-highlighted={index === highlight}
                    onMouseMove={() => setHighlight(index)}
                    onClick={() => run(command)}
                    className={cn(
                      'flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[13px] data-[highlighted=true]:bg-sunken',
                    )}
                  >
                    <command.icon className="size-4 shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate">{command.label}</span>
                    {command.shortcut ? <Shortcut combo={command.shortcut} /> : null}
                  </button>
                </div>
              )
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
