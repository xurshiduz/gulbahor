import { describe, expect, it } from 'vitest'

import { NAVIGATION, type NavItem } from './navigation'
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
      'catalog',
      'stock',
      'customers',
      'money',
      'partners',
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
