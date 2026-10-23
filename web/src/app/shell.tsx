import {
  formatMoney,
  LANGUAGE_NAMES,
  LANGUAGES,
  type AnyCurrency,
  type CardInEvent,
  type GateAlarmEvent,
  type GoodsSentEvent,
  type MoneyOpKind,
  type MoneySentEvent,
} from '@erp/core'
import { Navigate, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Check,
  Languages,
  Store,
  Lock,
  LogOut,
  Coffee,
  Monitor,
  Moon,
  Keyboard,
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  UserRound,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Menu } from '@/components/ui/controls'
import { Tooltip } from '@/components/ui/feedback'
import { PageChrome } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { setLanguage } from '@/i18n'
import { api } from '@/lib/api'
import { queryClient } from '@/lib/query'
import { useGlobalShop, useMyShops } from '@/lib/shop'
import { tillHere } from '@/features/money/payment-lines'
import { MoneyOpDialog } from '@/features/money/ops'
import { PaymentDialog } from '@/features/customers/payments'
import { cn } from '@/lib/cn'
import { HotkeyScope, useHotkey } from '@/lib/hotkeys'
import { announce, useFocusBeacon } from '@/lib/notify'
import { useShopEvent } from '@/lib/realtime'
import { isTouch, toggleSoftKeyboard, useSoftKeyboard } from '@/lib/soft-keyboard'

import { CommandPalette } from './command-palette'
import { mayOpen, NAVIGATION, type NavItem } from './navigation'
import { Sidebar } from './sidebar'
import { NotificationPrompt } from './notification-prompt'
import { ShortcutsHelp } from './shortcuts-help'
import { setTheme, useTheme } from './theme'

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

const NARROW = '(max-width: 767px)'

/** A phone's width: the menu gives the screen its room and comes over it when asked for. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return
    }
    const media = window.matchMedia(NARROW)
    const changed = () => setNarrow(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  return narrow
}

/** The frame around every screen: the menu on the left, a slim bar on top, the screen itself in the rest. */
export function Shell() {
  const { t } = useTranslation()
  const theme = useTheme()
  const navigate = useNavigate()
  const { me, can, hasModule, lock, logout, connected } = useSession()
  const [collapsed, setCollapsed] = useCollapsed()
  const narrow = useNarrow()
  const [drawer, setDrawer] = useState(false)
  const touch = useMemo(isTouch, [])
  const myShops = useMyShops()
  const [globalShop, setGlobalShop] = useGlobalShop()
  const keyboardUp = useSoftKeyboard()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // Money taken from or paid to a customer, from whatever screen is in view.
  const [paying, setPaying] = useState<'in' | 'out' | null>(null)
  const canTake = can('customers.receive')
  const canPayOut = can('customers.pay_out')
  const canPay = canTake || canPayOut
  // An expense, or other money in, the same way.
  const [spending, setSpending] = useState<MoneyOpKind | null>(null)
  const canSpend = can('money.ops')
  // The screen in view puts its name into the top bar.
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null)
  const chrome = useMemo(() => ({ title: titleSlot }), [titleSlot])

  // What this person may open, numbered in menu order for Alt+1…9.
  const sees = useCallback(
    (item: NavItem) =>
      (!item.permission || [item.permission].flat().some(can)) &&
      (!item.module || hasModule(item.module)) &&
      (!item.devOnly || import.meta.env.DEV),
    [can, hasModule],
  )
  const groups = useMemo(() => {
    let position = 0
    return NAVIGATION.map((group) => ({
      ...group,
      items: group.items
        .filter(sees)
        .map((item) => ({ ...item, shortcut: ++position <= 9 ? `alt+${position}` : undefined })),
    })).filter((group) => group.items.length > 0)
  }, [sees])
  // A page that is not this person's is never opened, whatever the address says: home instead.
  const where = useRouterState({ select: (state) => state.location })
  // Gone to another screen, the menu that came over the last one goes.
  useEffect(() => setDrawer(false), [where.pathname, where.searchStr])

  const pages = useMemo(() => groups.flatMap((group) => group.items), [groups])

  const openHelp = useCallback(() => setHelpOpen(true), [])

  // Opened from the keyboard alone: the top bar has no box for it.
  useHotkey('mod+q', () => setPaletteOpen((open) => !open), {
    label: t('command.open'),
    group: t('shortcuts.groupGlobal'),
  })
  useHotkey('f1', openHelp, { label: t('shortcuts.help'), group: t('shortcuts.groupGlobal'), everywhere: true })
  // As Windows locks with Win+L. Ctrl is the key here: the browser's own use of it (the address bar) gives way inside the app.
  useHotkey('mod+l', lock, {
    label: t('command.lock'),
    group: t('shortcuts.groupGlobal'),
    enabled: me.user.hasPin,
    everywhere: true,
  })
  // The key it had before: hands that learnt it still find it.
  useHotkey('alt+l', lock, { enabled: me.user.hasPin, everywhere: true })
  // Not over a window that is already open: one thing is finished before the next is begun.
  const pay = (kind: 'in' | 'out') => (document.querySelector('[role="dialog"]') ? false : setPaying(kind))
  useHotkey('mod+k', () => pay('in'), {
    label: t('payments.takeIn'),
    group: t('shortcuts.groupGlobal'),
    enabled: canTake,
  })
  // The key it had while Ctrl+K was the search.
  useHotkey('alt+k', () => pay('in'), { enabled: canTake })
  useHotkey('alt+c', () => pay('out'), {
    label: t('payments.payOut'),
    group: t('shortcuts.groupGlobal'),
    enabled: canPayOut,
  })
  const spend = (kind: MoneyOpKind) => (document.querySelector('[role="dialog"]') ? false : setSpending(kind))
  useHotkey('alt+x', () => spend('expense'), {
    label: t('ops.expense'),
    group: t('shortcuts.groupGlobal'),
    enabled: canSpend,
  })

  // What needs this person, wherever they are: on the screen while they work in the system, on the desktop when they do not.
  useFocusBeacon()
  const worksAt = (locationId: string | null) =>
    !locationId || me.user.allLocations || me.user.locationIds.includes(locationId)
  const hearsGate = can('devices.alarms') && hasModule('rfid')
  const collects = can('money.collect') || can('money.manage')
  const hearsMoney = collects || can('pos.sell')
  const hearsGoods = can('transfers.manage')
  const hearsCards = hasModule('cards') && (can('pos.sell') || can('cards.view') || collects)

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
        open: {
          label: t('notify.open'),
          go: () => void navigate({ to: '/transfers/$docId', params: { docId: sent.id } }),
        },
      })
    },
    hearsGoods,
  )

  // Money has landed on a card: those who work where the card is taken are told how much, so that a customer's
  // transfer is seen to have come.
  useShopEvent<CardInEvent>(
    'card.in',
    (came) => {
      if (came.locationIds.length && !came.locationIds.some(worksAt)) {
        return
      }
      announce({
        tone: 'ok',
        title: t('notify.cardIn', { card: came.card, sum: formatMoney(came.amount, came.currency as AnyCurrency) }),
        body: came.at ? came.at.slice(11, 16) : undefined,
        tag: came.id,
        duration: 30_000,
        open: can('cards.view') ? { label: t('notify.open'), go: () => void navigate({ to: '/cards' }) } : undefined,
      })
    },
    hearsCards,
  )

  return (
    <div className="flex h-full bg-canvas">
      {touch ? (
        // Pressed without taking the cursor out of the field it is for.
        <button
          type="button"
          aria-label={t('nav.keyboard')}
          aria-pressed={keyboardUp}
          onPointerDown={(event) => event.preventDefault()}
          onClick={toggleSoftKeyboard}
          className={cn(
            'fixed right-3 bottom-3 z-30 flex size-11 items-center justify-center rounded-full border border-line shadow-float',
            keyboardUp ? 'bg-accent text-white' : 'bg-surface text-ink-2',
          )}
        >
          <Keyboard className="size-5" />
        </button>
      ) : null}
      {narrow ? (
        drawer ? (
          <>
            <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setDrawer(false)} />
            <div className="fixed inset-y-0 left-0 z-50 flex shadow-float">
              <Sidebar business={me.org.name} groups={groups} collapsed={false} />
            </div>
          </>
        ) : null
      ) : (
        <Sidebar business={me.org.name} groups={groups} collapsed={collapsed} />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
          {/* Folds the menu to a rail of icons and back: at the head of the bar, beside what it folds. */}
          <Tooltip content={narrow ? t('nav.expand') : collapsed ? t('nav.expand') : t('nav.collapse')}>
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 shrink-0"
              onClick={() => (narrow ? setDrawer(!drawer) : setCollapsed(!collapsed))}
              aria-label={narrow ? t('nav.expand') : collapsed ? t('nav.expand') : t('nav.collapse')}
            >
              {narrow ? <MenuIcon /> : collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </Tooltip>
          {/* The name of the screen in view. */}
          <div ref={setTitleSlot} className="flex min-w-0 flex-1 items-baseline gap-2" />

          <div className="flex shrink-0 items-center gap-1">
            {/* The shop the whole system shows, for whoever works in more than one place: each page's own filter starts from it. */}
            {(myShops.data?.length ?? 0) > 1 ? (
              <Menu
                trigger={
                  <Button variant="ghost" aria-label={t('nav.shopPicker')}>
                    <Store />
                    <span className="hidden max-w-36 truncate sm:inline">
                      {myShops.data?.find((shop) => shop.id === globalShop)?.name ?? t('nav.everyShop')}
                    </span>
                  </Button>
                }
                items={[
                  {
                    label: t('nav.everyShop'),
                    icon: globalShop ? <span className="size-4" /> : <Check />,
                    onSelect: () => setGlobalShop(null),
                  },
                  ...(myShops.data ?? []).map((shop) => ({
                    label: shop.name,
                    icon: shop.id === globalShop ? <Check /> : <span className="size-4" />,
                    onSelect: () => setGlobalShop(shop.id),
                  })),
                ]}
              />
            ) : null}
            {/* The language, for this person: kept with them, so the next sign-in speaks it too. */}
            <Menu
              trigger={
                <Button variant="ghost" aria-label={t('profile.language')}>
                  <Languages />
                  <span className="hidden sm:inline">{LANGUAGE_NAMES[me.user.language]}</span>
                </Button>
              }
              items={LANGUAGES.map((language) => ({
                label: LANGUAGE_NAMES[language],
                icon: language === me.user.language ? <Check /> : <span className="size-4" />,
                onSelect: () => {
                  setLanguage(language)
                  void api
                    .patch('/auth/profile', { fullName: me.user.fullName, language })
                    .then(() => queryClient.invalidateQueries({ queryKey: ['me'] }))
                },
              }))}
            />
            <Tooltip content={connected ? t('common.online') : t('common.offline')}>
              <span
                className="flex size-8 items-center justify-center"
                role="status"
                aria-label={connected ? t('common.online') : t('common.offline')}
              >
                <span className={cn('size-2 rounded-full', connected ? 'bg-ok' : 'animate-pulse bg-warn')} />
              </span>
            </Tooltip>
            {/* Each theme picked by name; the button shows the one in use. */}
            <Menu
              trigger={
                <Button variant="ghost" size="icon" aria-label={t('profile.theme')} title={t('profile.theme')}>
                  {theme === 'dark' ? (
                    <Moon />
                  ) : theme === 'sepia' ? (
                    <Coffee />
                  ) : theme === 'system' ? (
                    <Monitor />
                  ) : (
                    <Sun />
                  )}
                </Button>
              }
              items={(
                [
                  ['light', Sun, 'profile.themeLight'],
                  ['dark', Moon, 'profile.themeDark'],
                  ['sepia', Coffee, 'profile.themeSepia'],
                  ['system', Monitor, 'profile.themeSystem'],
                ] as const
              ).map(([value, Icon, label]) => ({
                label: t(label),
                icon: theme === value ? <Check /> : <Icon />,
                onSelect: () => setTheme(value),
              }))}
            />
            <Menu
              trigger={
                <button
                  type="button"
                  className="flex h-8.5 items-center gap-2 rounded-md px-2 text-[13px] font-medium hover:bg-sunken"
                >
                  <Avatar name={me.user.fullName} src={me.user.avatar} />
                  <span className="hidden max-w-40 truncate sm:block">{me.user.fullName}</span>
                </button>
              }
              items={[
                { label: t('nav.profile'), icon: <UserRound />, onSelect: () => void navigate({ to: '/profile' }) },
                ...(me.user.hasPin
                  ? [{ label: t('command.lock'), icon: <Lock />, shortcut: 'mod+l', onSelect: lock }]
                  : []),
                'separator' as const,
                { label: t('auth.signOut'), icon: <LogOut />, onSelect: () => void logout() },
              ]}
            />
          </div>
        </header>

        {/* Positioned, so that what a screen places absolutely is held and scrolled here, never by the window. */}
        <main className="relative min-h-0 flex-1 overflow-y-auto">
          <PageChrome.Provider value={chrome}>
            {mayOpen(where.pathname, (where.search as { tab?: unknown }).tab, sees) ? (
              <Outlet />
            ) : (
              <Navigate to="/" replace />
            )}
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
