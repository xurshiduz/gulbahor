import { MODULES } from '@erp/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ModuleList, switched } from './module-list'

const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')
const group = (state: string) => document.querySelector(`[data-module-group="${state}"]`) as HTMLElement
const keys = (state: string) =>
  [...group(state).querySelectorAll('[data-module]')].map((row) => row.getAttribute('data-module'))

describe('what the system can do', () => {
  it('is said in three lists: what is switched, what every business has, what is still to come', () => {
    render(<ModuleList enabled={new Set(['rfid', 'consignment'])} onToggle={vi.fn()} />)
    expect(keys('optional')).toEqual(['rfid'])
    // Built, and part of every business: said, with nothing to switch.
    expect(keys('included')).toEqual(['partners', 'retail_credit', 'terminal', 'landed_cost'])
    expect(group('included').querySelector('[role="switch"]')).toBeNull()
    expect(plain(group('included').textContent)).toContain('Tizimning o‘zida bor')
    expect(keys('planned')).toEqual(['consignment', 'cards', 'loyalty', 'payroll', 'shareholders', 'fiscal'])
    expect(plain(group('planned').textContent)).toContain('Hali qurilmagan')
    // Every module is in one of the three, once.
    expect([...keys('optional'), ...keys('included'), ...keys('planned')].sort()).toEqual(
      MODULES.map((module) => module.key).sort(),
    )
    const on = (key: string) =>
      document.querySelector(`[data-module="${key}"] [role="switch"]`)?.getAttribute('aria-checked')
    expect(on('rfid')).toBe('true')
    expect(on('consignment')).toBe('true')
    expect(on('fiscal')).toBe('false')
  })

  it('tells whoever holds it which module was switched, and which way', async () => {
    const onToggle = vi.fn()
    render(<ModuleList enabled={new Set()} onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('switch', { name: /RFID/ }))
    expect(onToggle).toHaveBeenLastCalledWith('rfid', true)
  })

  it('switches one module and leaves the others as they were', () => {
    expect(switched(['partners', 'rfid'], 'fiscal', true).sort()).toEqual(['fiscal', 'partners', 'rfid'])
    expect(switched(['partners', 'rfid'], 'rfid', false)).toEqual(['partners'])
  })
})
