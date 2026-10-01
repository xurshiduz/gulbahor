import type { LinkProps } from '@tanstack/react-router'
import {
  BookMarked,
  Boxes,
  Building2,
  FlaskConical,
  Handshake,
  History,
  Home,
  KeyRound,
  PackagePlus,
  Settings,
  Shirt,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: NonNullable<LinkProps['to']>
  /** Translation key. */
  label: string
  icon: LucideIcon
  /** Shown only to people who hold this permission. */
  permission?: string
  /** Shown only when the business has this module on. */
  module?: string
  /** Only in development builds. */
  devOnly?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/**
 * The whole menu. A screen appears here once; the sidebar, the command
 * palette and the Alt+number shortcuts are all built from this list.
 */
export const NAVIGATION: NavGroup[] = [
  {
    label: 'nav.groupMain',
    items: [{ to: '/', label: 'nav.home', icon: Home }],
  },
  {
    label: 'nav.groupCatalog',
    items: [
      { to: '/products', label: 'nav.products', icon: Shirt, permission: 'products.view' },
      { to: '/references', label: 'nav.references', icon: BookMarked, permission: 'products.view' },
    ],
  },
  {
    label: 'nav.groupStock',
    items: [
      { to: '/stock', label: 'nav.stock', icon: Boxes, permission: 'stock.view' },
      { to: '/receipts', label: 'nav.receipts', icon: PackagePlus, permission: 'receipts.view' },
      { to: '/partners', label: 'nav.partners', icon: Handshake, permission: 'partners.view' },
    ],
  },
  {
    label: 'nav.groupManage',
    items: [
      { to: '/locations', label: 'nav.locations', icon: Building2, permission: 'locations.view' },
      { to: '/users', label: 'nav.users', icon: Users, permission: 'users.view' },
      { to: '/roles', label: 'nav.roles', icon: KeyRound, permission: 'roles.manage' },
      { to: '/audit', label: 'nav.audit', icon: History, permission: 'audit.view' },
      { to: '/settings', label: 'nav.settings', icon: Settings, permission: 'settings.manage' },
      { to: '/dev/inputs', label: 'nav.inputs', icon: FlaskConical, devOnly: true },
    ],
  },
]
