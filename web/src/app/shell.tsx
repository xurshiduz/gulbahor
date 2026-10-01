import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { Lock, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun, UserRound } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Menu } from '@/components/ui/controls'
import { Shortcut, Tooltip } from '@/components/ui/feedback'
import { useSession } from '@/features/auth/session'
import { cn } from '@/lib/cn'
import { useHotkey } from '@/lib/hotkeys'

import { CommandPalette } from './command-palette'
import { NAVIGATION, type NavItem } from './navigation'
import { ShortcutsHelp } from './shortcuts-help'
import { toggleTheme } from './theme'

const COLLAPSED_KEY = 'gb.sidebar.collapsed'

function useCollapsed(): [boolean, (value: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const update = (value: boolean) => {
    setCollapsed(value)
    try {
      localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0')
    } catch {
      // The menu still collapses for this visit.
    }
  }
  return [collapsed, update]
}

/** The frame around every screen: the menu on the left, a slim bar on top, the screen itself in the rest. */
export function Shell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { me, can, hasModule, lock, logout, connected } = useSession()
  const [collapsed, setCollapsed] = useCollapsed()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  // What this person may open, numbered in menu order for Alt+1…9.
  const groups = useMemo(() => {
    let position = 0
    return NAVIGATION.map((group) => ({
      label: group.label,
      items: group.items
        .filter((item) => (!item.permission || can(item.permission)) && (!item.module || hasModule(item.module)) && (!item.devOnly || import.meta.env.DEV))
        .map((item) => ({ ...item, shortcut: ++position <= 9 ? `alt+${position}` : undefined })),
    })).filter((group) => group.items.length > 0)
  }, [can, hasModule])

  const pages = useMemo(() => groups.flatMap((group) => group.items), [groups])

  const openHelp = useCallback(() => setHelpOpen(true), [])

  useHotkey('mod+k', () => setPaletteOpen((open) => !open), { label: t('command.open'), group: t('shortcuts.groupGlobal') })
  useHotkey('f1', openHelp, { label: t('shortcuts.help'), group: t('shortcuts.groupGlobal') })
  useHotkey('alt+l', lock, { label: t('command.lock'), group: t('shortcuts.groupGlobal'), enabled: me.user.hasPin })

  return (
    <div className="flex h-full bg-canvas">
      <aside
        className={cn(
          'flex shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200',
          collapsed ? 'w-13' : 'w-56',
        )}
      >
        <div className={cn('flex h-12 shrink-0 items-center gap-2.5 border-b border-line', collapsed ? 'justify-center' : 'px-3.5')}>
          <img src="/favicon.svg" alt="" className="size-6 shrink-0" />
          {!collapsed ? <span className="truncate text-sm font-semibold">{me.org.name}</span> : null}
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto p-2">
          {groups.map((group) => (
            <div key={group.label} className="mb-3">
              {collapsed ? <div className="mx-auto mb-1.5 h-px w-5 bg-line" /> : <p className="eyebrow px-2 pb-1">{t(group.label)}</p>}
              {group.items.map((item) => (
                <NavLink key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
          ))}
        </nav>

        <div className={cn('flex shrink-0 border-t border-line p-2', collapsed ? 'justify-center' : 'justify-end')}>
          <Tooltip content={collapsed ? t('nav.expand') : t('nav.collapse')} side="right">
            <Button variant="ghost" size="iconSm" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}>
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </Tooltip>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 w-72 max-w-full items-center gap-2 rounded-md border border-line bg-sunken px-2.5 text-[13px] text-ink-3 transition-colors hover:border-line-strong"
          >
            <Search className="size-4" />
            <span className="flex-1 truncate text-left">{t('command.placeholder')}</span>
            <Shortcut combo="mod+k" />
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Tooltip content={connected ? t('common.online') : t('common.offline')}>
              <span className="flex size-8 items-center justify-center" role="status" aria-label={connected ? t('common.online') : t('common.offline')}>
                <span className={cn('size-2 rounded-full', connected ? 'bg-ok' : 'animate-pulse bg-warn')} />
              </span>
            </Tooltip>
            <Tooltip content={t('command.toggleTheme')}>
              <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={t('command.toggleTheme')}>
                <Sun className="hidden dark:block" />
                <Moon className="dark:hidden" />
              </Button>
            </Tooltip>
            <Menu
              trigger={
                <button type="button" className="flex h-8.5 items-center gap-2 rounded-md px-2 text-[13px] font-medium hover:bg-sunken">
                  <span className="flex size-6 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-ink">
                    {initials(me.user.fullName)}
                  </span>
                  <span className="hidden max-w-40 truncate sm:block">{me.user.fullName}</span>
                </button>
              }
              items={[
                { label: t('nav.profile'), icon: <UserRound />, onSelect: () => void navigate({ to: '/profile' }) },
                ...(me.user.hasPin ? [{ label: t('command.lock'), icon: <Lock />, onSelect: lock }] : []),
                'separator' as const,
                { label: t('auth.signOut'), icon: <LogOut />, onSelect: () => void logout() },
              ]}
            />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} pages={pages} onShowShortcuts={openHelp} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

function NavLink({ item, collapsed }: { item: NavItem & { shortcut?: string }; collapsed: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const label = t(item.label)

  useHotkey(item.shortcut ?? '', () => void navigate({ to: item.to }), {
    label,
    group: t('shortcuts.groupNav'),
    enabled: !!item.shortcut,
  })

  const link = (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === '/' }}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'group flex h-8.5 items-center gap-2.5 rounded-md text-[13px] text-ink-2 transition-colors hover:bg-sunken hover:text-ink',
        'data-[status=active]:bg-accent-soft data-[status=active]:font-medium data-[status=active]:text-accent-ink',
        collapsed ? 'justify-center' : 'px-2',
      )}
    >
      <item.icon className="size-4 shrink-0" />
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{label}</span> : null}
      {/* Takes no room until hovered, so long names are not cut short for a hint nobody is looking at. */}
      {!collapsed && item.shortcut ? <Shortcut combo={item.shortcut} className="hidden group-hover:inline-flex" /> : null}
    </Link>
  )

  if (!collapsed) {
    return link
  }
  return (
    <Tooltip
      side="right"
      content={
        <>
          {label}
          {item.shortcut ? <Shortcut combo={item.shortcut} /> : null}
        </>
      }
    >
      {link}
    </Tooltip>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}
