import type { RoleDto } from '@erp/core'
import { describe, expect, it } from 'vitest'

import { extrasBeyond, permissionNames } from './permissions'

const role = (id: string, permissions: string[]) => ({ id, permissions }) as RoleDto

describe('permissions beside the roles', () => {
  const roles = [role('cashier', ['pos.sell', 'pos.return']), role('manager', ['pos.*', 'reports.*'])]

  it('sends only what the chosen roles do not give already', () => {
    expect(extrasBeyond(roles, ['cashier'], ['pos.sell', 'pos.debt', 'reports.sales'])).toEqual([
      'pos.debt',
      'reports.sales',
    ])
    // A role that gives a whole group covers each of its permissions.
    expect(extrasBeyond(roles, ['cashier', 'manager'], ['pos.debt', 'reports.sales'])).toEqual([])
  })

  it('names them as the screens do', () => {
    expect(permissionNames(['reports.sales'])).toMatch(/^Hisobotlar: /)
    expect(permissionNames([])).toBe('')
  })
})
