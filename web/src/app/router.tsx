import { GENDERS, LOCATION_KINDS, PRINT_JOB_STATUSES, SEASONS } from '@gulbahor/core'
import { createRootRoute, createRoute, createRouter, redirect, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'

import { AuditPage } from '@/features/audit/audit-page'
import { ProductPage } from '@/features/catalog/product-page'
import { ProductsPage } from '@/features/catalog/products-page'
import { ReferencesPage } from '@/features/catalog/references-page'
import { HomePage } from '@/features/dashboard/home-page'
import { InputsDemoPage } from '@/features/dev/inputs-demo-page'
import { DevicesPage } from '@/features/devices/devices-page'
import { LabelsPage } from '@/features/labels/labels-page'
import { LocationsPage } from '@/features/locations/locations-page'
import { PartnersPage } from '@/features/partners/partners-page'
import { ProfilePage } from '@/features/profile/profile-page'
import { ReceiptPage } from '@/features/receipts/receipt-page'
import { ReceiptsPage } from '@/features/receipts/receipts-page'
import { SettingsPage } from '@/features/settings/settings-page'
import { StockPage } from '@/features/stock/stock-page'
import { CountPage, TransferPage, WriteoffPage } from '@/features/stockdocs/stockdoc-page'
import { CountsPage, TransfersPage, WriteoffsPage } from '@/features/stockdocs/stockdocs-page'
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

const { edit: _edit, ...plainList } = listSearch
const productsSearch = z.object({
  ...plainList,
  status: z.enum(['active', 'archived', 'all']).default('active').catch('active'),
  categoryId: z.string().optional().catch(undefined),
  brandId: z.string().optional().catch(undefined),
  season: z.enum(SEASONS).optional().catch(undefined),
  gender: z.enum(GENDERS).optional().catch(undefined),
})
const productsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/products',
  component: ProductsPage,
  validateSearch: productsSearch,
  search: { middlewares: [stripSearchParams({ ...LIST_DEFAULTS, status: 'active' })] },
})

/** `new`, or the id of the model being edited. */
const productRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/products/$productId',
  component: ProductPage,
})

const referencesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/references',
  component: ReferencesPage,
  validateSearch: z.object({
    tab: z.enum(['categories', 'brands', 'attributes', 'prices']).default('categories').catch('categories'),
  }),
  search: { middlewares: [stripSearchParams({ tab: 'categories' })] },
})

const receiptsSearch = z.object({
  ...plainList,
  status: z.enum(['draft', 'posted', 'cancelled', 'all']).default('all').catch('all'),
  locationId: z.string().optional().catch(undefined),
  supplierId: z.string().optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
})
const receiptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/receipts',
  component: ReceiptsPage,
  validateSearch: receiptsSearch,
  search: { middlewares: [stripSearchParams({ ...LIST_DEFAULTS, status: 'all' })] },
})

/** `new`, or the id of the receipt. */
const receiptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/receipts/$receiptId',
  component: ReceiptPage,
})

const stockSearch = z.object({
  ...plainList,
  locationId: z.string().optional().catch(undefined),
  categoryId: z.string().optional().catch(undefined),
  brandId: z.string().optional().catch(undefined),
  presence: z.enum(['in', 'out', 'all']).default('in').catch('in'),
  /** The model whose colours and sizes are open. */
  open: z.string().optional().catch(undefined),
})
const stockRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stock',
  component: StockPage,
  validateSearch: stockSearch,
  search: { middlewares: [stripSearchParams({ ...LIST_DEFAULTS, presence: 'in' })] },
})

const stockDocsSearch = z.object({
  ...plainList,
  status: z.enum(['draft', 'sent', 'posted', 'cancelled', 'all']).default('all').catch('all'),
  locationId: z.string().optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
})

const transfersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/transfers',
  component: TransfersPage,
  validateSearch: stockDocsSearch,
  search: { middlewares: [stripSearchParams({ ...LIST_DEFAULTS, status: 'all' })] },
})
const transferRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/transfers/$docId',
  component: TransferPage,
})

const writeoffsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/writeoffs',
  component: WriteoffsPage,
  validateSearch: stockDocsSearch,
  search: { middlewares: [stripSearchParams({ ...LIST_DEFAULTS, status: 'all' })] },
})
const writeoffRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/writeoffs/$docId',
  component: WriteoffPage,
})

const countsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/counts',
  component: CountsPage,
  validateSearch: stockDocsSearch,
  search: { middlewares: [stripSearchParams({ ...LIST_DEFAULTS, status: 'all' })] },
})
const countRoute = createRoute({ getParentRoute: () => rootRoute, path: '/counts/$docId', component: CountPage })

const partnersSearch = z.object({
  ...listSearch,
  status: z.enum(['active', 'archived', 'all']).default('active').catch('active'),
  role: z.enum(['supplier', 'buyer']).optional().catch(undefined),
})
const partnersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/partners',
  component: PartnersPage,
  validateSearch: partnersSearch,
  search: { middlewares: [stripSearchParams({ ...LIST_DEFAULTS, status: 'active' })] },
})

const labelsSearch = z.object({
  page: listSearch.page,
  size: listSearch.size,
  q: listSearch.q,
  status: z
    .enum(['all', ...PRINT_JOB_STATUSES])
    .default('all')
    .catch('all'),
})
const labelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/labels',
  component: LabelsPage,
  validateSearch: labelsSearch,
  search: { middlewares: [stripSearchParams({ page: LIST_DEFAULTS.page, size: LIST_DEFAULTS.size, status: 'all' })] },
})

const devicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/devices',
  component: DevicesPage,
  validateSearch: z.object({ tab: z.enum(['printers', 'agents']).default('printers').catch('printers') }),
  search: { middlewares: [stripSearchParams({ tab: 'printers' })] },
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

const routeTree = rootRoute.addChildren([
  homeRoute,
  productsRoute,
  productRoute,
  referencesRoute,
  stockRoute,
  receiptsRoute,
  receiptRoute,
  transfersRoute,
  transferRoute,
  writeoffsRoute,
  writeoffRoute,
  countsRoute,
  countRoute,
  labelsRoute,
  partnersRoute,
  locationsRoute,
  devicesRoute,
  usersRoute,
  rolesRoute,
  auditRoute,
  settingsRoute,
  profileRoute,
  inputsRoute,
])

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
