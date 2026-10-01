import { LOCATION_KINDS } from '@gulbahor/core'
import { createRootRoute, createRoute, createRouter, redirect, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'

import { AuditPage } from '@/features/audit/audit-page'
import { HomePage } from '@/features/dashboard/home-page'
import { InputsDemoPage } from '@/features/dev/inputs-demo-page'
import { LocationsPage } from '@/features/locations/locations-page'
import { ProfilePage } from '@/features/profile/profile-page'
import { SettingsPage } from '@/features/settings/settings-page'
import { RolesPage } from '@/features/users/roles-page'
import { UsersPage } from '@/features/users/users-page'
import { LIST_DEFAULTS, listSearch } from '@/lib/list-search'

import { Shell } from './shell'

/**
 * Every screen and what it keeps in the address bar. Search values are
 * validated on the way in; defaults are left out of the URL so links stay
 * short.
 */

const rootRoute = createRootRoute({ component: Shell })

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })

const locationsSearch = z.object({
  ...listSearch,
  kind: z.enum(LOCATION_KINDS).optional().catch(undefined),
  status: z.enum(['active', 'archived', 'all']).default('active').catch('active'),
})
const locationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/locations',
  component: LocationsPage,
  validateSearch: locationsSearch,
  search: { middlewares: [stripSearchParams({ ...LIST_DEFAULTS, status: 'active' })] },
})

const usersSearch = z.object({
  ...listSearch,
  status: z.enum(['active', 'blocked', 'all']).default('all').catch('all'),
  roleId: z.string().optional().catch(undefined),
  locationId: z.string().optional().catch(undefined),
})
const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/users',
  component: UsersPage,
  validateSearch: usersSearch,
  search: { middlewares: [stripSearchParams({ ...LIST_DEFAULTS, status: 'all' })] },
})

const rolesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/roles',
  component: RolesPage,
  validateSearch: z.object({ edit: listSearch.edit }),
})

const auditSearch = z.object({
  page: listSearch.page,
  size: z.number().int().min(1).max(200).default(50).catch(50),
  entity: z.string().optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
})
const auditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/audit',
  component: AuditPage,
  validateSearch: auditSearch,
  search: { middlewares: [stripSearchParams({ page: 1, size: 50 })] },
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
  validateSearch: z.object({ tab: z.enum(['business', 'modules']).default('business').catch('business') }),
  search: { middlewares: [stripSearchParams({ tab: 'business' })] },
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: ProfilePage,
  validateSearch: z.object({ tab: z.enum(['profile', 'security', 'sessions']).default('profile').catch('profile') }),
  search: { middlewares: [stripSearchParams({ tab: 'profile' })] },
})

const inputsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dev/inputs',
  component: InputsDemoPage,
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: '/' })
    }
  },
})

const routeTree = rootRoute.addChildren([homeRoute, locationsRoute, usersRoute, rolesRoute, auditRoute, settingsRoute, profileRoute, inputsRoute])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultNotFoundComponent: () => (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-3xl font-semibold text-ink-3">404</p>
      <p className="text-sm text-ink-2">Sahifa topilmadi</p>
    </div>
  ),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
