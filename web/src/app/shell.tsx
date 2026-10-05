import type { GateAlarmEvent, GoodsSentEvent, MoneyOpKind, MoneySentEvent } from '@gulbahor/core'
import { Outlet, useNavigate } from '@tanstack/react-router'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, HandCoins, Lock, LogOut, Moon, PanelLeftClose, PanelLeftOpen, ReceiptText, Search, Sun, UserRound } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Menu } from '@/components/ui/controls'
import { Shortcut, Tooltip } from '@/components/ui/feedback'
import { PageChrome } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { tillHere } from '@/features/partners/payment-lines'
import { MoneyOpDialog } from '@/features/money/ops'
import { PaymentDialog } from '@/features/partners/payments'
import { cn } from '@/lib/cn'
import { HotkeyScope, useHotkey } from '@/lib/hotkeys'
import { announce, useFocusBeacon } from '@/lib/notify'
import { useShopEvent } from '@/lib/realtime'

import { CommandPalette } from './command-palette'
import { NAVIGATION } from './navigation'
import { Sidebar } from './sidebar'
import { NotificationPrompt } from './notification-prompt'
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
  // Money taken from or paid to a partner, from whatever screen is in view.
  const [paying, setPaying] = useState<'in' | 'out' | null>(null)
  const canPay = can('partners.pay')
  // An expense, or other money in, the same way.
  const [spending, setSpending] = useState<MoneyOpKind | null>(null)
  const canSpend = can('money.ops')
  // The screen in view puts its name into the top bar.
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null)
  const chrome = useMemo(() => ({ title: titleSlot }), [titleSlot])

  // What this person may open, numbered in menu order for Alt+1…9.
  const groups = useMemo(() => {
    let position = 0
    return NAVIGATION.map((group) => ({
      ...group,
      items: group.items
        .filter(
          (item) =>
            (!item.permission || [item.permission].flat().some(can)) &&
            (!item.module || hasModule(item.module)) &&
            (!item.devOnly || import.meta.env.DEV),
        )
        .map((item) => ({ ...item, shortcut: ++position <= 9 ? `alt+${position}` : undefined })),
    })).filter((group) => group.items.length > 0)
  }, [can, hasModule])

  const pages = useMemo(() => groups.flatMap((group) => group.items), [groups])

  const openHelp = useCallback(() => setHelpOpen(true), [])

  useHotkey('mod+k', () => setPaletteOpen((open) => !open), { label: t('command.open'), group: t('shortcuts.groupGlobal') })
  useHotkey('f1', openHelp, { label: t('shortcuts.help'), group: t('shortcuts.groupGlobal'), everywhere: true })
  useHotkey('alt+l', lock, { label: t('command.lock'), group: t('shortcuts.groupGlobal'), enabled: me.user.hasPin, everywhere: true })
  // Not over a window that is already open: one thing is finished before the next is begun.
  const pay = (kind: 'in' | 'out') => (document.querySelector('[role="dialog"]') ? false : setPaying(kind))
  useHotkey('alt+k', () => pay('in'), { label: t('payments.takeIn'), group: t('shortcuts.groupGlobal'), enabled: canPay })
  useHotkey('alt+c', () => pay('out'), { label: t('payments.payOut'), group: t('shortcuts.groupGlobal'), enabled: canPay })
  const spend = (kind: MoneyOpKind) => (document.querySelector('[role="dialog"]') ? false : setSpending(kind))
  useHotkey('alt+x', () => spend('expense'), { label: t('ops.expense'), group: t('shortcuts.groupGlobal'), enabled: canSpend })

  // What needs this person, wherever they are: on the screen while they work in the system, on the desktop when they do not.
  useFocusBeacon()
  const worksAt = (locationId: string | null) => !locationId || me.user.allLocations || me.user.locationIds.includes(locationId)
  const hearsGate = can('devices.alarms') && hasModule('rfid')
  const collects = can('money.collect') || can('money.manage')
  const hearsMoney = collects || can('pos.sell')
  const hearsGoods = can('transfers.manage')

  // A gate went off: those who work in that shop are told at once, whatever screen they are on.
  useShopEvent<GateAlarmEvent>(
    'gate.alarm',
    (alarm) => {
      if (!worksAt(alarm.locationId)) {
        return
      }
      announce({
        tone: 'bad',
        title: t('gate.alarm'),
        body: [alarm.title, alarm.locationName ?? alarm.readerName].join(' · '),
        tag: alarm.id,
        duration: 60_000,
        open: { label: t('gate.open'), go: () => void navigate({ to: '/gate' }) },
      })
    },
    hearsGate,
  )

  // Money is on its way: to a till, the till it is going to is told; to a safe or a bank account, those who collect.
  useShopEvent<MoneySentEvent>(
    'money.sent',
    (sent) => {
      const toTill = sent.toKind === 'cash'
      if (sent.sentBy === me.user.id || !worksAt(sent.toLocationId)) {
        return
      }
      if (toTill ? !can('pos.sell') || tillHere() !== sent.toRegisterId : !collects) {
        return
      }
      announce({
        title: t('notify.moneySent', { number: sent.number }),
        body: t('notify.route', { from: sent.fromName, to: sent.toName }),
        tag: sent.id,
        duration: 30_000,
        open: {
          label: t('notify.open'),
          go: () => void (toTill ? navigate({ to: '/pos' }) : navigate({ to: '/money', search: { tab: 'transfers' } })),
        },
      })
    },
    hearsMoney,
  )

  // Goods have left for a shop: those who take transfers in there are told.
  useShopEvent<GoodsSentEvent>(
    'goods.sent',
    (sent) => {
      if (sent.sentBy === me.user.id || !worksAt(sent.toLocationId)) {
        return
      }
      announce({
        title: t('notify.goodsSent', { number: sent.number }),
        body: t('notify.route', { from: sent.fromName, to: sent.toName }),
        tag: sent.id,
        duration: 30_000,
        open: { label: t('notify.open'), go: () => void navigate({ to: '/transfers/$docId', params: { docId: sent.id } }) },
      })
    },
    hearsGoods,
  )

  return (
    <div className="flex h-full bg-canvas">
      <Sidebar name={me.org.name} groups={groups} collapsed={collapsed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
          {/* Folds the menu to a rail of icons and back: at the head of the bar, beside what it folds. */}
          <Tooltip content={collapsed ? t('nav.expand') : t('nav.collapse')}>
            <Button variant="ghost" size="icon" className="-ml-2 shrink-0" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}>
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </Tooltip>
          {/* The name of the screen in view. */}
          <div ref={setTitleSlot} className="flex min-w-0 flex-1 items-baseline gap-2" />

          {/* On a narrow screen the search is only its icon, so the name is not cut short. */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label={t('command.open')}
            className="flex h-8 w-9 shrink-0 items-center justify-center gap-2 rounded-md border border-line bg-sunken px-2.5 text-[13px] text-ink-3 transition-colors hover:border-line-strong lg:w-64 lg:justify-start"
          >
            <Search className="size-4 shrink-0" />
            <span className="hidden flex-1 truncate text-left lg:block">{t('command.placeholder')}</span>
            <Shortcut combo="mod+k" className="hidden lg:inline-flex" />
          </button>

          <div className="flex shrink-0 items-center gap-1">
            {canPay || canSpend ? (
              <Menu
                trigger={
                  <Button variant="ghost" aria-label={t('payments.desk')}>
                    <ArrowLeftRight />
                    <span className="hidden xl:inline">{t('payments.desk')}</span>
                  </Button>
                }
                items={[
                  ...(canPay
                    ? [
                        { label: t('payments.takeIn'), icon: <ArrowDownLeft />, shortcut: 'alt+k', onSelect: () => setPaying('in') },
                        { label: t('payments.payOut'), icon: <ArrowUpRight />, shortcut: 'alt+c', onSelect: () => setPaying('out') },
                      ]
                    : []),
                  ...(canSpend
                    ? [
                        { label: t('ops.expense'), icon: <ReceiptText />, shortcut: 'alt+x', onSelect: () => setSpending('expense') },
                        { label: t('ops.income'), icon: <HandCoins />, onSelect: () => setSpending('income') },
                      ]
                    : []),
                ]}
              />
            ) : null}
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
                ...(me.user.hasPin ? [{ label: t('command.lock'), icon: <Lock />, shortcut: 'alt+l', onSelect: lock }] : []),
                'separator' as const,
                { label: t('auth.signOut'), icon: <LogOut />, onSelect: () => void logout() },
              ]}
            />
          </div>
        </header>

        {/* Positioned, so that what a screen places absolutely is held and scrolled here, never by the window. */}
        <main className="relative min-h-0 flex-1 overflow-y-auto">
          <PageChrome.Provider value={chrome}>
            <Outlet />
          </PageChrome.Provider>
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        pages={pages}
        onShowShortcuts={openHelp}
        onPay={canPay ? setPaying : undefined}
        onSpend={canSpend ? setSpending : undefined}
      />
      {hearsGate || hearsMoney || hearsGoods ? <NotificationPrompt /> : null}
      {paying ? (
        <HotkeyScope>
          <PaymentDialog kind={paying} onClose={() => setPaying(null)} />
        </HotkeyScope>
      ) : null}
      {spending ? (
        <HotkeyScope>
          <MoneyOpDialog kind={spending} onClose={() => setSpending(null)} />
        </HotkeyScope>
      ) : null}
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}
