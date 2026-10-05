import {
  GENDERS,
  LOCATION_KINDS,
  MONEY_OP_KINDS,
  MONEY_OP_STATUSES,
  MONEY_TRANSFER_STATUSES,
  PROMOTION_STATES,
  PARTNER_PAYMENT_KINDS,
  PARTNER_PAYMENT_STATUSES,
  PRINT_JOB_STATUSES,
  REPORT_PERIODS,
  SALE_STATUSES,
  SEASONS,
  SHIFT_STATUSES,
} from '@gulbahor/core'
import { createRootRoute, createRoute, createRouter, redirect, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'

import { AuditPage } from '@/features/audit/audit-page'
import { ProductPage } from '@/features/catalog/product-page'
import { ProductsPage } from '@/features/catalog/products-page'
import { ReferencesPage } from '@/features/catalog/references-page'
import { HomePage } from '@/features/dashboard/home-page'
import { InputsDemoPage } from '@/features/dev/inputs-demo-page'
import { DevicesPage } from '@/features/devices/devices-page'
import { GatePage } from '@/features/devices/readers'
import { LabelsPage } from '@/features/labels/labels-page'
import { LocationsPage } from '@/features/locations/locations-page'
import { MoneyPage } from '@/features/money/money-page'
import { CustomersPage } from '@/features/customers/customers-page'
import { PartnersPage } from '@/features/partners/partners-page'
import { PromotionsPage } from '@/features/promotions/promotions-page'
import { SalesReportPage } from '@/features/reports/sales-report-page'
import { PaymentsPage } from '@/features/partners/payments'
import { PosPage } from '@/features/pos/pos-page'
import { SalesPage } from '@/features/pos/sales-page'
import { ShiftsPage } from '@/features/pos/shifts-page'
import { PricesPage } from '@/features/pricing/prices-page'
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

const customersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/customers',
  component: CustomersPage,
  validateSearch: z.object({
    ...listSearch,
    tab: z.enum(['list', 'groups', 'loyalty', 'debts', 'payments']).default('list').catch('list'),
    status: z.enum(['active', 'archived', 'all']).default('active').catch('active'),
    debtState: z.enum(['owed', 'overdue', 'closed', 'all']).default('owed').catch('owed'),
    birthdayIn: z.number().int().min(0).max(366).optional().catch(undefined),
    groupId: z.string().optional().catch(undefined),
    tag: z.string().optional().catch(undefined),
  }),
  search: {
    middlewares: [stripSearchParams({ ...LIST_DEFAULTS, status: 'active', tab: 'list', debtState: 'owed' })],
  },
})

// The days are a named stretch (it stays "this month" tomorrow) or two dates picked by hand.
const salesReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reports/sales',
  component: SalesReportPage,
  validateSearch: z.object({
    period: z.enum(REPORT_PERIODS).default('today').catch('today'),
    from: z.iso.date().optional().catch(undefined),
    to: z.iso.date().optional().catch(undefined),
    shop: z.string().optional().catch(undefined),
  }),
  search: { middlewares: [stripSearchParams({ period: 'today' })] },
})

const promotionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/promotions',
  component: PromotionsPage,
  validateSearch: z.object({
    ...listSearch,
    state: z
      .enum(['all', ...PROMOTION_STATES])
      .default('all')
      .catch('all'),
  }),
  search: { middlewares: [stripSearchParams({ ...LIST_DEFAULTS, state: 'all' })] },
})

const partnersSearch = z.object({
  ...listSearch,
  status: z.enum(['active', 'archived', 'all']).default('active').catch('active'),
  role: z.enum(['supplier', 'buyer']).optional().catch(undefined),
  debt: z.enum(['owes', 'owed']).optional().catch(undefined),
})
const partnersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/partners',
  component: PartnersPage,
  validateSearch: partnersSearch,
  search: { middlewares: [stripSearchParams({ ...LIST_DEFAULTS, status: 'active' })] },
})

const paymentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/payments',
  component: PaymentsPage,
  validateSearch: z.object({
    page: listSearch.page,
    size: listSearch.size,
    q: listSearch.q,
    status: z
      .enum(['all', ...PARTNER_PAYMENT_STATUSES])
      .default('all')
      .catch('all'),
    kind: z.enum(PARTNER_PAYMENT_KINDS).optional().catch(undefined),
    partnerId: z.string().optional().catch(undefined),
    from: z.string().optional().catch(undefined),
    to: z.string().optional().catch(undefined),
    /** The payment that is open over the list. */
    open: z.string().optional().catch(undefined),
  }),
  search: {
    middlewares: [stripSearchParams({ page: LIST_DEFAULTS.page, size: LIST_DEFAULTS.size, status: 'all' })],
  },
})

const pricesSearch = z.object({
  ...plainList,
  categoryId: z.string().optional().catch(undefined),
  brandId: z.string().optional().catch(undefined),
  season: z.enum(SEASONS).optional().catch(undefined),
  presence: z.enum(['all', 'in']).default('all').catch('all'),
  tab: z.enum(['list', 'rules', 'history']).default('list').catch('list'),
})
const pricesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/prices',
  component: PricesPage,
  validateSearch: pricesSearch,
  search: { middlewares: [stripSearchParams({ ...LIST_DEFAULTS, presence: 'all', tab: 'list' })] },
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

const posRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pos',
  component: PosPage,
  // The receipt to bring goods back on, when the till is opened from the list of receipts.
  validateSearch: z.object({ return: z.string().optional().catch(undefined) }),
})

const tillList = {
  page: listSearch.page,
  size: listSearch.size,
  q: listSearch.q,
  locationId: z.string().optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  /** The receipt or the shift that is open over the list. */
  open: z.string().optional().catch(undefined),
}
const TILL_LIST_DEFAULTS = { page: LIST_DEFAULTS.page, size: LIST_DEFAULTS.size, status: 'all' as const }

const salesSearch = z.object({
  ...tillList,
  status: z
    .enum(['all', ...SALE_STATUSES])
    .default('all')
    .catch('all'),
  shiftId: z.string().optional().catch(undefined),
  tab: z.enum(['sales', 'returns']).default('sales').catch('sales'),
})
const salesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sales',
  component: SalesPage,
  validateSearch: salesSearch,
  search: { middlewares: [stripSearchParams({ ...TILL_LIST_DEFAULTS, tab: 'sales' })] },
})

const shiftsSearch = z.object({
  ...tillList,
  status: z
    .enum(['all', ...SHIFT_STATUSES])
    .default('all')
    .catch('all'),
})
const shiftsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shifts',
  component: ShiftsPage,
  validateSearch: shiftsSearch,
  search: { middlewares: [stripSearchParams(TILL_LIST_DEFAULTS)] },
})

const moneyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/money',
  component: MoneyPage,
  validateSearch: z.object({
    tab: z
      .enum(['registers', 'accounts', 'transfers', 'ops', 'categories', 'rates'])
      .default('registers')
      .catch('registers'),
    // The list of transfers, or of expenses: whichever tab is open.
    page: listSearch.page,
    size: listSearch.size,
    q: listSearch.q,
    status: z
      .enum(['all', ...MONEY_TRANSFER_STATUSES, ...MONEY_OP_STATUSES.filter((status) => status !== 'cancelled')])
      .default('all')
      .catch('all'),
    kind: z.enum(MONEY_OP_KINDS).optional().catch(undefined),
    categoryId: z.string().optional().catch(undefined),
    from: z.string().optional().catch(undefined),
    to: z.string().optional().catch(undefined),
  }),
  search: { middlewares: [stripSearchParams({ ...TILL_LIST_DEFAULTS, tab: 'registers' })] },
})

const devicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/devices',
  component: DevicesPage,
  validateSearch: z.object({
    tab: z.enum(['printers', 'readers', 'agents']).default('printers').catch('printers'),
  }),
  search: { middlewares: [stripSearchParams({ tab: 'printers' })] },
})

const gateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/gate',
  component: GatePage,
  validateSearch: z.object({
    page: listSearch.page,
    size: listSearch.size,
    q: listSearch.q,
    locationId: z.string().optional().catch(undefined),
    from: z.string().optional().catch(undefined),
    to: z.string().optional().catch(undefined),
  }),
  search: { middlewares: [stripSearchParams({ page: LIST_DEFAULTS.page, size: LIST_DEFAULTS.size })] },
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
  validateSearch: z.object({
    tab: z.enum(['business', 'receipt', 'label', 'modules']).default('business').catch('business'),
  }),
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
  posRoute,
  salesRoute,
  shiftsRoute,
  productsRoute,
  productRoute,
  pricesRoute,
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
  customersRoute,
  promotionsRoute,
  salesReportRoute,
  paymentsRoute,
  locationsRoute,
  moneyRoute,
  devicesRoute,
  gateRoute,
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
