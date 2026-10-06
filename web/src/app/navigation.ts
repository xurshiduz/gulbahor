import type { LinkProps } from '@tanstack/react-router'
import {
  ArrowRightLeft,
  BadgePercent,
  BarChart3,
  BookMarked,
  Boxes,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Coins,
  FlaskConical,
  Group,
  HandCoins,
  Handshake,
  History,
  Home,
  KeyRound,
  Landmark,
  ListTree,
  Megaphone,
  MonitorSmartphone,
  PackageMinus,
  PackagePlus,
  ReceiptText,
  ScanBarcode,
  Settings,
  PiggyBank,
  Shirt,
  ShoppingBag,
  Siren,
  SlidersHorizontal,
  Store,
  Tags,
  Truck,
  Users,
  UsersRound,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: NonNullable<LinkProps['to']>
  /** For a screen that is one tab of several under the same address. */
  search?: { tab: string }
  /** Translation key. */
  label: string
  icon: LucideIcon
  /** Shown only to people who hold this permission, or any one of several. */
  permission?: string | string[]
  /** Shown only when the business has this module on. */
  module?: string
  /** Only in development builds. */
  devOnly?: boolean
}

/** A section of the menu and the screens in it. One with a single screen is shown as that screen. */
export interface NavGroup {
  key: string
  label: string
  icon: LucideIcon
  items: NavItem[]
}

const MONEY = ['money.view', 'money.manage', 'money.collect']

/**
 * The whole menu. A screen appears here once; the sidebar, the command
 * palette and the Alt+number shortcuts are all built from this list.
 */
export const NAVIGATION: NavGroup[] = [
  {
    key: 'main',
    label: 'nav.home',
    icon: Home,
    items: [{ to: '/', label: 'nav.home', icon: Home }],
  },
  {
    key: 'sales',
    label: 'nav.groupSales',
    icon: ShoppingBag,
    items: [
      { to: '/pos', label: 'nav.pos', icon: ScanBarcode, permission: 'pos.sell' },
      { to: '/sales', label: 'nav.sales', icon: ReceiptText, permission: ['pos.sell', 'sales.view'] },
      { to: '/shifts', label: 'nav.shifts', icon: CalendarClock, permission: ['pos.sell', 'sales.shifts'] },
    ],
  },
  {
    key: 'catalog',
    label: 'nav.groupCatalog',
    icon: Shirt,
    items: [
      { to: '/products', label: 'nav.products', icon: Shirt, permission: 'products.view' },
      { to: '/prices', label: 'nav.prices', icon: BadgePercent, permission: 'products.view' },
      { to: '/labels', label: 'nav.labels', icon: Tags, permission: 'labels.print' },
      { to: '/references', label: 'nav.references', icon: BookMarked, permission: 'products.view' },
    ],
  },
  {
    key: 'stock',
    label: 'nav.groupStock',
    icon: Warehouse,
    items: [
      { to: '/stock', label: 'nav.stock', icon: Boxes, permission: 'stock.view' },
      { to: '/receipts', label: 'nav.receipts', icon: PackagePlus, permission: 'receipts.view' },
      { to: '/transfers', label: 'nav.transfers', icon: Truck, permission: 'transfers.view' },
      { to: '/counts', label: 'nav.counts', icon: ClipboardCheck, permission: 'counts.view' },
      { to: '/writeoffs', label: 'nav.writeoffs', icon: PackageMinus, permission: 'writeoffs.view' },
    ],
  },
  {
    key: 'customers',
    label: 'nav.customers',
    icon: UsersRound,
    items: [
      {
        to: '/customers',
        search: { tab: 'list' },
        label: 'nav.customers',
        icon: UsersRound,
        permission: 'customers.view',
      },
      {
        to: '/customers',
        search: { tab: 'groups' },
        label: 'nav.customerGroups',
        icon: Group,
        permission: 'customers.view',
      },
      {
        to: '/customers',
        search: { tab: 'loyalty' },
        label: 'nav.loyalty',
        icon: BadgePercent,
        permission: 'customers.view',
      },
      {
        to: '/customers',
        search: { tab: 'debts' },
        label: 'nav.customerDebts',
        icon: HandCoins,
        permission: 'customers.debts',
      },
    ],
  },
  {
    key: 'marketing',
    label: 'nav.promotions',
    icon: Megaphone,
    items: [{ to: '/promotions', label: 'nav.promotions', icon: Megaphone, permission: 'promotions.view' }],
  },
  {
    key: 'money',
    label: 'nav.groupMoney',
    icon: Wallet,
    // One screen with a tab for each: the menu opens it at the tab asked for.
    items: [
      { to: '/money', search: { tab: 'registers' }, label: 'nav.moneyRegisters', icon: Store, permission: MONEY },
      // After the tills: the first line of a screen stands for its address with no tab, and that is the tills.
      { to: '/money', search: { tab: 'stand' }, label: 'nav.moneyStand', icon: PiggyBank, permission: 'money.view' },
      { to: '/money', search: { tab: 'accounts' }, label: 'nav.moneyAccounts', icon: Landmark, permission: MONEY },
      {
        to: '/money',
        search: { tab: 'transfers' },
        label: 'nav.moneyTransfers',
        icon: ArrowRightLeft,
        permission: MONEY,
      },
      {
        to: '/money',
        search: { tab: 'ops' },
        label: 'nav.moneyOps',
        icon: ReceiptText,
        permission: ['money.view', 'money.ops'],
      },
      {
        to: '/money',
        search: { tab: 'categories' },
        label: 'nav.moneyCategories',
        icon: ListTree,
        permission: ['money.view', 'money.ops', 'money.categories'],
      },
      {
        to: '/money',
        search: { tab: 'rates' },
        label: 'nav.moneyRates',
        icon: Coins,
        permission: [...MONEY, 'money.rates'],
      },
    ],
  },
  {
    key: 'partners',
    label: 'nav.groupPartners',
    icon: Handshake,
    items: [
      { to: '/partners', label: 'nav.partners', icon: Handshake, permission: 'partners.view' },
      { to: '/payments', label: 'nav.payments', icon: HandCoins, permission: ['partners.pay', 'partners.debts'] },
    ],
  },
  {
    key: 'reports',
    label: 'nav.reports',
    icon: BarChart3,
    items: [{ to: '/reports/sales', label: 'nav.reportSales', icon: BarChart3, permission: 'reports.sales' }],
  },
  {
    key: 'manage',
    label: 'nav.groupManage',
    icon: SlidersHorizontal,
    items: [
      { to: '/users', label: 'nav.users', icon: Users, permission: 'users.view' },
      { to: '/roles', label: 'nav.roles', icon: KeyRound, permission: 'roles.manage' },
      { to: '/locations', label: 'nav.locations', icon: Building2, permission: 'locations.view' },
      { to: '/devices', label: 'nav.devices', icon: MonitorSmartphone, permission: 'devices.manage' },
      { to: '/gate', label: 'nav.gate', icon: Siren, permission: 'devices.alarms', module: 'rfid' },
      { to: '/audit', label: 'nav.audit', icon: History, permission: 'audit.view' },
    ],
  },
  {
    key: 'settings',
    label: 'nav.settings',
    icon: Settings,
    items: [
      { to: '/settings', label: 'nav.settings', icon: Settings, permission: 'settings.manage' },
      { to: '/dev/inputs', label: 'nav.inputs', icon: FlaskConical, devOnly: true },
    ],
  },
]
