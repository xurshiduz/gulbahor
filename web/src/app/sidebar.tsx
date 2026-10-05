import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Shortcut, Tooltip } from '@/components/ui/feedback'
import { cn } from '@/lib/cn'
import { useHotkey } from '@/lib/hotkeys'

import type { NavGroup, NavItem } from './navigation'

export type ShownItem = NavItem & { shortcut?: string }
export type ShownGroup = Omit<NavGroup, 'items'> & { items: ShownItem[] }

const OPEN_KEY = 'gb.nav.open'

function storedOpen(): string[] {
  try {
    const raw = localStorage.getItem(OPEN_KEY)
    // One section at a time: a list kept from when several stood open is cut to its first.
    return raw ? (JSON.parse(raw) as string[]).slice(0, 1) : []
  } catch {
    return []
  }
}

/** One of several screens under the same address: which tab of it this entry is. */
const tabOf = (item: NavItem) => item.search?.tab

/**
 * Whether the screen in view is this entry's. An address of its own is
 * enough; entries that share one (the tabs of "Pul") are told apart by
 * their tab, the first of them standing for an address with none.
 */
export function isActive(item: NavItem, items: NavItem[], pathname: string, search: Record<string, unknown>): boolean {
  if (item.to === '/') {
    return pathname === '/'
  }
  if (pathname !== item.to && !pathname.startsWith(`${item.to}/`)) {
    return false
  }
  const tab = tabOf(item)
  if (!tab) {
    return true
  }
  const first = items.find((other) => other.to === item.to)
  return (search.tab ?? (first ? tabOf(first) : undefined)) === tab
}

interface SidebarProps {
  name: string
  groups: ShownGroup[]
  collapsed: boolean
}

/**
 * The menu, two levels deep: a section and the screens in it. Opened wide,
 * a section unfolds under its name and stays as it was left; folded to a
 * rail of icons, a section's screens come out beside it when it is pressed.
 * A section with one screen is that screen.
 */
export function Sidebar({ name, groups, collapsed }: SidebarProps) {
  const { t } = useTranslation()
  const location = useRouterState({ select: (state) => state.location })
  const search = location.search as Record<string, unknown>
  const all = groups.flatMap((group) => group.items)
  const activeOf = (group: ShownGroup) => group.items.some((item) => isActive(item, all, location.pathname, search))
  const current = groups.find(activeOf)?.key ?? null

  const [open, setOpen] = useState<string[]>(storedOpen)
  // An accordion: unfolding one section folds the one that was open.
  const toggle = (key: string) => {
    const next = open.includes(key) ? [] : [key]
    setOpen(next)
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next))
    } catch {
      // The menu still unfolds for this visit.
    }
  }
  // Wherever the person went (a key, the search, a link), the section they are in is the one unfolded.
  useEffect(() => {
    if (current) {
      setOpen((now) => (now.length === 1 && now[0] === current ? now : [current]))
    }
  }, [current])

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200',
        collapsed ? 'w-13' : 'w-56',
      )}
    >
      <div
        className={cn(
          'flex h-12 shrink-0 items-center gap-2.5 border-b border-line',
          collapsed ? 'justify-center' : 'px-3.5',
        )}
      >
        <img src="/favicon.svg" alt="" className="size-6 shrink-0" />
        {!collapsed ? <span className="truncate text-sm font-semibold">{name}</span> : null}
      </div>

      {/* A short window scrolls the menu: rows squeezed to fit would each come out a different height. */}
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 [&>*]:shrink-0">
        {groups.map((group) => {
          const active = group.key === current
          if (group.items.length === 1) {
            return (
              <ScreenLink
                key={group.key}
                item={group.items[0]}
                icon={group.icon}
                label={t(group.label)}
                active={active}
                collapsed={collapsed}
              />
            )
          }
          return collapsed ? (
            <Flyout
              key={group.key}
              group={group}
              active={active}
              isActive={(item) => isActive(item, all, location.pathname, search)}
            />
          ) : (
            <Section
              key={group.key}
              group={group}
              active={active}
              open={open.includes(group.key)}
              onToggle={() => toggle(group.key)}
              isActive={(item) => isActive(item, all, location.pathname, search)}
            />
          )
        })}
      </nav>
      {/* The keys work whether or not the section they belong to is unfolded. */}
      {all.map((item) => (item.shortcut ? <NavHotkey key={item.shortcut} item={item} /> : null))}
    </aside>
  )
}

const ROW = 'flex h-8.5 items-center gap-2.5 rounded-md text-[13px] transition-colors'
const IDLE = 'text-ink-2 hover:bg-sunken hover:text-ink'
const ACTIVE = 'bg-accent-soft font-medium text-accent-ink'

/** Alt+1…9 for the first nine screens a person may open. */
function NavHotkey({ item }: { item: ShownItem }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  useHotkey(item.shortcut ?? '', () => void navigate({ to: item.to, search: item.search as never }), {
    label: t(item.label),
    group: t('shortcuts.groupNav'),
    enabled: !!item.shortcut,
  })
  return null
}

/** A section that is one screen: the row is the link. */
function ScreenLink({
  item,
  icon: Icon,
  label,
  active,
  collapsed,
}: {
  item: ShownItem
  icon: NavGroup['icon']
  label: string
  active: boolean
  collapsed: boolean
}) {
  const link = (
    <Link
      to={item.to}
      search={item.search as never}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn('group', ROW, active ? ACTIVE : IDLE, collapsed ? 'justify-center' : 'px-2')}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{label}</span> : null}
      {/* Takes no room until hovered, so long names are not cut short for a hint nobody is looking at. */}
      {!collapsed && item.shortcut ? (
        <Shortcut combo={item.shortcut} className="hidden group-hover:inline-flex" />
      ) : null}
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

interface SectionProps {
  group: ShownGroup
  /** The screen in view is one of this section's. */
  active: boolean
  isActive: (item: ShownItem) => boolean
}

/** Opened wide: the section's name, and under it, when unfolded, its screens. */
function Section({ group, active, open, onToggle, isActive }: SectionProps & { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(ROW, 'w-full px-2 text-left', active && !open ? ACTIVE : cn(IDLE, active && 'text-ink'))}
      >
        <group.icon className="size-4 shrink-0" />
        <span className={cn('min-w-0 flex-1 truncate', active && 'font-medium')}>{t(group.label)}</span>
        <ChevronRight className={cn('size-3.5 shrink-0 text-ink-3 transition-transform', open && 'rotate-90')} />
      </button>
      {open ? (
        <div className="relative mt-0.5 mb-1 ml-4 flex flex-col gap-0.5 border-l border-line pl-2.5">
          {group.items.map((item) => {
            const here = isActive(item)
            return (
              <Link
                key={`${item.to}:${item.search?.tab ?? ''}`}
                to={item.to}
                search={item.search as never}
                aria-current={here ? 'page' : undefined}
                className={cn('group', ROW, 'h-8 px-2', here ? ACTIVE : IDLE)}
              >
                <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>
                {item.shortcut ? <Shortcut combo={item.shortcut} className="hidden group-hover:inline-flex" /> : null}
              </Link>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/** Folded to a rail: the section's icon, and its screens beside it when it is pressed. */
function Flyout({ group, active, isActive }: SectionProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const label = t(group.label)
  return (
    <DropdownMenu.Root>
      <Tooltip side="right" content={label}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(ROW, 'w-full justify-center data-[state=open]:bg-sunken', active ? ACTIVE : IDLE)}
          >
            <group.icon className="size-4 shrink-0" />
          </button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="right"
          align="start"
          sideOffset={10}
          className="z-50 min-w-48 rounded-lg border border-line bg-surface p-1 shadow-float data-[state=open]:animate-pop-in"
        >
          <DropdownMenu.Label className="eyebrow px-2 pt-1.5 pb-1">{label}</DropdownMenu.Label>
          {group.items.map((item) => {
            const here = isActive(item)
            return (
              <DropdownMenu.Item
                key={`${item.to}:${item.search?.tab ?? ''}`}
                onSelect={() => void navigate({ to: item.to, search: item.search as never })}
                className={cn(
                  'flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-[13px] outline-none select-none',
                  'data-highlighted:bg-sunken [&_svg]:size-4',
                  here ? 'font-medium text-accent-ink' : 'text-ink-2 [&_svg]:text-ink-3',
                )}
              >
                <item.icon />
                {t(item.label)}
                {item.shortcut ? <Shortcut combo={item.shortcut} className="ml-auto pl-3" /> : null}
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
