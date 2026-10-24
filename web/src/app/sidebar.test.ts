import { describe, expect, it } from 'vitest'

import { mayOpen, NAVIGATION, type NavItem } from './navigation'
import { isActive } from './sidebar'

const all = NAVIGATION.flatMap((group) => group.items)
const item = (to: string, tab?: string) => all.find((entry) => entry.to === to && entry.search?.tab === tab) as NavItem
const here = (entry: NavItem, pathname: string, search: Record<string, unknown> = {}) =>
  isActive(entry, all, pathname, search)

describe('the menu', () => {
  it('names every screen once, each tab of a shared screen apart', () => {
    const keys = all.map((entry) => `${entry.to}:${entry.search?.tab ?? ''}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(NAVIGATION.map((group) => group.key)).toEqual([
      'main',
      'sales',
      // Goods and stock are one section, as in Billz.
      'catalog',
      'customers',
      'marketing',
      'money',
      'reports',
      'manage',
      'settings',
    ])
  })

  it('marks the screen in view, and the documents opened from it', () => {
    expect(here(item('/'), '/')).toBe(true)
    expect(here(item('/'), '/pos')).toBe(false)
    expect(here(item('/receipts'), '/receipts')).toBe(true)
    expect(here(item('/receipts'), '/receipts/42')).toBe(true)
    // "/payments" is not under "/pos", whatever their first letters.
    expect(here(item('/pos'), '/payments')).toBe(false)
  })

  it('tells the tabs of one screen apart, the first standing for an address without one', () => {
    expect(here(item('/money', 'ops'), '/money', { tab: 'ops' })).toBe(true)
    expect(here(item('/money', 'accounts'), '/money', { tab: 'ops' })).toBe(false)
    expect(here(item('/money', 'registers'), '/money')).toBe(true)
    expect(here(item('/money', 'ops'), '/money')).toBe(false)
  })
})

describe('who may open a page', () => {
  /** Someone who keeps the till and takes customers' payments, and nothing more. */
  const cashier = (entry: NavItem) =>
    !entry.permission || [entry.permission].flat().some((key) => ['pos.sell', 'money.ops'].includes(key))

  it('sends someone signed in where another left off home from a page that is not theirs', () => {
    expect(mayOpen('/users', undefined, cashier)).toBe(false)
    expect(mayOpen('/settings', undefined, cashier)).toBe(false)
    expect(mayOpen('/customers/0b6f4f0e', undefined, cashier)).toBe(false)
    expect(mayOpen('/pos', undefined, cashier)).toBe(true)
    expect(mayOpen('/sales', undefined, cashier)).toBe(true)
  })

  it('lets a page the menu does not name be, and home always', () => {
    expect(mayOpen('/', undefined, cashier)).toBe(true)
    expect(mayOpen('/profile', undefined, cashier)).toBe(true)
  })

  it('reads a tab named in the address by its own entry', () => {
    expect(mayOpen('/money', 'ops', cashier)).toBe(true)
    expect(mayOpen('/money', 'stand', cashier)).toBe(false)
    // No tab, or one the menu does not name: the page itself says which of its tabs is theirs.
    expect(mayOpen('/money', undefined, cashier)).toBe(true)
  })
})
