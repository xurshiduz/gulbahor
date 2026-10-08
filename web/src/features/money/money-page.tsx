import {
  ACCOUNT_KIND_LABELS,
  CURRENCIES,
  formatCardNumber,
  isRateJump,
  rateJump,
  accountInputSchema,
  formatMoney,
  PAYMENT_ACCOUNT_KINDS,
  registerInputSchema,
  SHARED_ACCOUNT_KINDS,
  type AccountDto,
  type AccountInput,
  type AnyCurrency,
  type CurrenciesDto,
  type CurrencyDto,
  type MoneyCategoryDto,
  type MoneyTransferDto,
  type Page as Paged,
  type PaymentAccountKind,
  type RateForm,
  type RegisterDto,
  type RegisterInput,
} from '@erp/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Archive, ArchiveRestore, Landmark, MoreHorizontal, Pencil, Plus, Star, Store } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { CardNumberInput } from '@/components/ui/card-number-input'
import { Combobox } from '@/components/ui/combobox'
import { Menu, Select, TabPanel, Tabs } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog, useConfirm } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut, Skeleton } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, zodCheck, zodSubmit } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Page } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { rateText } from '@/features/partners/payment-lines'
import { api } from '@/lib/api'
import { base as baseCurrency } from '@/lib/base'
import { useHotkey } from '@/lib/hotkeys'
import { LIST_DEFAULTS } from '@/lib/list-search'
import { toast } from '@/lib/toast'

import { CurrenciesView, currencyName } from './currencies-view'
import { useCurrencies, useRateBook } from './rates'
import { MoneyCategoriesTab, MoneyCategoryDialog, MoneyOpDialog, MoneyOpsTab } from './ops'
import { MoneyStandView } from './stand-view'
import { TransferDialog, TransfersTab } from './transfers'

const route = getRouteApi('/money')

interface LocationOption {
  id: string
  name: string
  kind: string
}

const useLocations = () =>
  useQuery({
    queryKey: ['locations', 'options'],
    queryFn: ({ signal }) => api.get<LocationOption[]>('/locations/options', undefined, signal),
  })

export const useRegisters = () =>
  useQuery({
    queryKey: ['money', 'registers'],
    queryFn: ({ signal }) => api.get<RegisterDto[]>('/money/registers', undefined, signal),
  })

const useAccounts = (enabled = true) =>
  useQuery({
    queryKey: ['money', 'accounts'],
    queryFn: ({ signal }) => api.get<AccountDto[]>('/money/accounts', undefined, signal),
    enabled,
  })

/**
 * What a business sets up before it can sell: its tills, the cards and
 * terminals money can be paid to, and the day's dollar rate.
 */
export function MoneyPage() {
  const { t } = useTranslation()
  const { can, me } = useSession()
  const { tab } = route.useSearch()
  const navigate = route.useNavigate()
  const canManage = can('money.manage')
  const canMove = canManage || can('money.collect')
  const seesAccounts = canMove || can('money.view')
  // Where the money stands is figures and nothing else: for those who may see balances.
  const seesStand = can('money.view')
  const [registerForm, setRegisterForm] = useState<RegisterDto | null | undefined>()
  const [accountForm, setAccountForm] = useState<AccountDto | null | undefined>()
  const [moving, setMoving] = useState(false)
  const [spending, setSpending] = useState(false)
  const [categoryForm, setCategoryForm] = useState<MoneyCategoryDto | null | undefined>()
  const accounts = useAccounts(seesAccounts)
  const canSpend = can('money.ops')
  const seesOps = canSpend || can('money.view')
  const canName = can('money.categories')

  const add = () =>
    tab === 'registers'
      ? setRegisterForm(null)
      : tab === 'transfers' || tab === 'stand'
        ? setMoving(true)
        : tab === 'ops'
          ? setSpending(true)
          : tab === 'categories'
            ? setCategoryForm(null)
            : setAccountForm(null)
  const addLabel =
    tab === 'registers'
      ? t('money.addRegister')
      : tab === 'transfers' || tab === 'stand'
        ? t('money.addTransfer')
        : tab === 'ops'
          ? t('ops.expense')
          : tab === 'categories'
            ? t('ops.addCategory')
            : t('money.addAccount')
  const adding =
    tab === 'transfers' || tab === 'stand'
      ? canMove
      : tab === 'ops'
        ? canSpend
        : tab === 'categories'
          ? canName
          : canManage && tab !== 'rates'
  useHotkey('n', add, {
    label: addLabel,
    group: t('shortcuts.groupList'),
    enabled:
      adding &&
      registerForm === undefined &&
      accountForm === undefined &&
      categoryForm === undefined &&
      !moving &&
      !spending,
  })

  return (
    <Page
      title={t('money.title')}
      // The day's rate and where the money stands are read down; the other sheets are lists that fill the window.
      flow={tab === 'rates' || tab === 'stand'}
      actions={
        adding ? (
          <Button variant="primary" onClick={add}>
            <Plus />
            {addLabel}
            <Shortcut combo="n" className="ml-1 opacity-70" />
          </Button>
        ) : null
      }
    >
      <Tabs
        value={tab}
        // Each tab starts as itself: the filters of the transfers are theirs alone.
        onChange={(value) => void navigate({ search: { ...LIST_DEFAULTS, status: 'all', tab: value as typeof tab } })}
        tabs={[
          { value: 'registers', label: t('money.tabRegisters') },
          ...(seesStand ? [{ value: 'stand', label: t('stand.tab') }] : []),
          ...(seesAccounts ? [{ value: 'accounts', label: t('money.tabAccounts') }] : []),
          ...(seesAccounts ? [{ value: 'transfers', label: t('money.tabTransfers') }] : []),
          ...(seesOps ? [{ value: 'ops', label: t('ops.title') }] : []),
          ...(seesOps || canName ? [{ value: 'categories', label: t('ops.categories') }] : []),
          { value: 'rates', label: t('money.tabRates') },
        ]}
      >
        <TabPanel value="registers">
          <RegistersTab canManage={canManage} onEdit={setRegisterForm} />
        </TabPanel>
        <TabPanel value="stand">{seesStand ? <StandTab /> : null}</TabPanel>
        <TabPanel value="accounts">
          <AccountsTab canManage={canManage} onEdit={setAccountForm} />
        </TabPanel>
        <TabPanel value="transfers">
          <TransfersTab />
        </TabPanel>
        <TabPanel value="ops">
          <MoneyOpsTab />
        </TabPanel>
        <TabPanel value="categories">
          <MoneyCategoriesTab onEdit={setCategoryForm} />
        </TabPanel>
        <TabPanel value="rates">
          <RatesTab />
        </TabPanel>
      </Tabs>

      {registerForm !== undefined ? (
        <RegisterDialog register={registerForm} onClose={() => setRegisterForm(undefined)} />
      ) : null}
      {accountForm !== undefined ? (
        <AccountDialog account={accountForm} onClose={() => setAccountForm(undefined)} />
      ) : null}
      {moving ? (
        <TransferDialog
          accounts={accounts.data ?? []}
          limit={me.org.settings.maxRateLossPercent}
          setsRates={can('money.rates')}
          onClose={() => setMoving(false)}
        />
      ) : null}
      {spending ? <MoneyOpDialog onClose={() => setSpending(false)} /> : null}
      {categoryForm !== undefined ? (
        <MoneyCategoryDialog category={categoryForm} onClose={() => setCategoryForm(undefined)} />
      ) : null}
    </Page>
  )
}

// ───────────────────────────── Where the money stands ─────────────────────────────

/** The stand as the business has it now; every sale, payment and transfer refreshes it. */
function StandTab() {
  const [shopId, setShopId] = useState<string | null>(null)
  const accounts = useAccounts()
  const registers = useRegisters()
  const places = useLocations()
  const waiting = useQuery({
    queryKey: ['money', 'transfers', 'waiting'],
    queryFn: ({ signal }) =>
      api.get<Paged<MoneyTransferDto>>('/money/transfers', { status: 'sent', size: 200 }, signal),
  })
  const rates = useRateBook()

  if (!accounts.data || !registers.data || !waiting.data) {
    return <Skeleton className="h-64" />
  }
  // Only a place that has money of its own to show is offered.
  const holding = new Set(accounts.data.flatMap((account) => account.locationIds))
  const shops = (places.data ?? []).filter((place) => holding.has(place.id))
  return (
    <MoneyStandView
      accounts={accounts.data}
      registers={registers.data}
      waiting={waiting.data.items}
      rates={rates}
      shops={shops}
      shopId={shops.some((shop) => shop.id === shopId) ? shopId : null}
      onShop={setShopId}
    />
  )
}

// ───────────────────────────── Tills ─────────────────────────────

function RegistersTab({ canManage, onEdit }: { canManage: boolean; onEdit: (register: RegisterDto) => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const registers = useRegisters()

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post(`/money/registers/${id}/${active ? 'restore' : 'archive'}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['money'] }),
  })

  const makeMain = useMutation({
    mutationFn: (id: string) => api.post(`/money/registers/${id}/main`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['money'] }),
  })

  const columns = useMemo<ColumnDef<RegisterDto>[]>(
    () => [
      {
        id: 'name',
        header: t('money.name'),
        meta: { fixed: true },
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            {row.original.isMain ? <Badge tone="info">{t('money.mainTill')}</Badge> : null}
          </span>
        ),
      },
      { id: 'location', header: t('money.shop'), cell: ({ row }) => row.original.locationName },
      {
        id: 'shift',
        header: t('money.shift'),
        cell: ({ row }) =>
          row.original.shift ? (
            <span className="flex items-center gap-2">
              <Badge tone="ok">{row.original.shift.number}</Badge>
              <span className="text-xs text-ink-3">{row.original.shift.openedByName}</span>
            </span>
          ) : (
            <span className="text-ink-3">{t('money.noShift')}</span>
          ),
      },
      {
        id: 'status',
        header: t('common.status'),
        meta: { className: 'w-px' },
        cell: ({ row }) =>
          row.original.isActive ? <Badge tone="ok">{t('common.active')}</Badge> : <Badge>{t('common.archived')}</Badge>,
      },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px' },
        cell: ({ row }) =>
          canManage ? (
            <span onClick={(event) => event.stopPropagation()}>
              <Menu
                trigger={
                  <Button variant="ghost" size="iconSm" tabIndex={-1} aria-label={t('common.actions')}>
                    <MoreHorizontal />
                  </Button>
                }
                items={[
                  { label: t('common.edit'), icon: <Pencil />, onSelect: () => onEdit(row.original) },
                  ...(row.original.isActive && !row.original.isMain
                    ? [
                        {
                          label: t('money.makeMain'),
                          icon: <Star />,
                          onSelect: () => makeMain.mutate(row.original.id),
                        },
                      ]
                    : []),
                  row.original.isActive
                    ? {
                        label: t('common.archive'),
                        icon: <Archive />,
                        onSelect: () => setActive.mutate({ id: row.original.id, active: false }),
                      }
                    : {
                        label: t('common.restore'),
                        icon: <ArchiveRestore />,
                        onSelect: () => setActive.mutate({ id: row.original.id, active: true }),
                      },
                ]}
              />
            </span>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage],
  )

  return (
    <DataTable
      columns={columns}
      data={registers.data}
      loading={registers.isPending}
      rowId={(row) => row.id}
      onRowOpen={canManage ? onEdit : undefined}
      rowClassName={(row) => (row.isActive ? undefined : 'text-ink-3')}
      empty={<EmptyState icon={Store} title={t('money.noRegisters')} hint={t('money.noRegistersHint')} />}
    />
  )
}

function RegisterDialog({ register, onClose }: { register: RegisterDto | null; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const locations = useLocations()
  // A warehouse has no till: only places that sell are offered.
  const shops = (locations.data ?? []).filter((location) => location.kind !== 'warehouse' && location.kind !== 'zone')
  const form = useForm<{ name: string; locationId: string | null }>({
    defaultValues: {
      name: register?.name ?? '',
      locationId: register?.locationId ?? (shops.length === 1 ? shops[0].id : null),
    },
  })
  const errors = form.formState.errors

  const mutation = useMutation({
    mutationFn: (input: RegisterInput) =>
      register ? api.put(`/money/registers/${register.id}`, input) : api.post('/money/registers', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['money'] })
      toast.success(t('common.saved'))
      onClose()
    },
    onError: (error) => void applyServerErrors(error, form),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={register ? t('money.editRegister') : t('money.addRegister')}
      dirty={form.formState.isDirty && !mutation.isSuccess}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="register-form" variant="primary" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form
        id="register-form"
        onSubmit={() => void zodSubmit(form, registerInputSchema, (input) => mutation.mutate(input))()}
      >
        <Field label={t('money.name')} error={errors.name?.message} required>
          {(id) => <Input id={id} autoFocus placeholder="Kassa 1" invalid={!!errors.name} {...form.register('name')} />}
        </Field>
        <Field label={t('money.shop')} error={errors.locationId?.message} required>
          {(id) => (
            <Controller
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <Combobox
                  id={id}
                  options={shops.map((shop) => ({ value: shop.id, label: shop.name }))}
                  value={field.value}
                  onChange={field.onChange}
                  invalid={!!errors.locationId}
                />
              )}
            />
          )}
        </Field>
      </Form>
    </Dialog>
  )
}

// ───────────────────────────── Accounts ─────────────────────────────

function AccountsTab({ canManage, onEdit }: { canManage: boolean; onEdit: (account: AccountDto) => void }) {
  const { t } = useTranslation()
  const base = useSession().me.org.baseCurrency
  const queryClient = useQueryClient()
  const accounts = useQuery({
    queryKey: ['money', 'accounts'],
    queryFn: ({ signal }) => api.get<AccountDto[]>('/money/accounts', undefined, signal),
  })

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post(`/money/accounts/${id}/${active ? 'restore' : 'archive'}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['money'] }),
  })

  const columns = useMemo<ColumnDef<AccountDto>[]>(
    () => [
      {
        id: 'name',
        header: t('money.name'),
        meta: { fixed: true },
        cell: ({ row }) => (
          <span>
            <span className="font-medium">{row.original.name}</span>
            {row.original.currency !== base && row.original.kind !== 'cash' ? (
              <span className="text-ink-3"> · {CURRENCIES[row.original.currency].symbol}</span>
            ) : null}
            {/* A card is told from another by its number: the whole of it where it is known. */}
            {row.original.cardNumber ? (
              <span className="font-code text-xs text-ink-3"> {formatCardNumber(row.original.cardNumber)}</span>
            ) : row.original.last4 ? (
              <span className="font-code text-xs text-ink-3"> *{row.original.last4}</span>
            ) : null}
            {row.original.bank ? <span className="text-ink-3"> · {row.original.bank}</span> : null}
          </span>
        ),
      },
      {
        id: 'kind',
        header: t('money.kind'),
        cell: ({ row }) => (
          <Badge tone={row.original.kind === 'cash' ? 'accent' : 'neutral'}>
            {ACCOUNT_KIND_LABELS[row.original.kind]}
          </Badge>
        ),
      },
      {
        id: 'location',
        header: t('money.shop'),
        cell: ({ row }) =>
          row.original.locationNames.length ? (
            row.original.locationNames.join(', ')
          ) : (
            <span className="text-ink-3">{t('money.everyShop')}</span>
          ),
      },
      {
        id: 'balance',
        header: t('money.balance'),
        meta: { className: 'tabular text-right whitespace-nowrap font-medium', headerClassName: 'text-right' },
        cell: ({ row }) =>
          row.original.balance === null
            ? ''
            : formatMoney(row.original.balance, row.original.currency, { minor: 'auto' }),
      },
      {
        id: 'status',
        header: t('common.status'),
        meta: { className: 'w-px' },
        cell: ({ row }) =>
          row.original.isActive ? <Badge tone="ok">{t('common.active')}</Badge> : <Badge>{t('common.archived')}</Badge>,
      },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px' },
        cell: ({ row }) =>
          // A till's drawer belongs to its till: it is renamed and put away with it.
          canManage && row.original.kind !== 'cash' ? (
            <span onClick={(event) => event.stopPropagation()}>
              <Menu
                trigger={
                  <Button variant="ghost" size="iconSm" tabIndex={-1} aria-label={t('common.actions')}>
                    <MoreHorizontal />
                  </Button>
                }
                items={[
                  { label: t('common.edit'), icon: <Pencil />, onSelect: () => onEdit(row.original) },
                  row.original.isActive
                    ? {
                        label: t('common.archive'),
                        icon: <Archive />,
                        onSelect: () => setActive.mutate({ id: row.original.id, active: false }),
                      }
                    : {
                        label: t('common.restore'),
                        icon: <ArchiveRestore />,
                        onSelect: () => setActive.mutate({ id: row.original.id, active: true }),
                      },
                ]}
              />
            </span>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage, base],
  )

  return (
    <DataTable
      columns={columns}
      data={accounts.data}
      loading={accounts.isPending}
      rowId={(row) => row.id}
      onRowOpen={canManage ? (row) => (row.kind === 'cash' ? undefined : onEdit(row)) : undefined}
      rowClassName={(row) => (row.isActive ? undefined : 'text-ink-3')}
      empty={<EmptyState icon={Landmark} title={t('money.noAccounts')} hint={t('money.noAccountsHint')} />}
    />
  )
}

interface AccountValues {
  kind: PaymentAccountKind
  name: string
  currency: AnyCurrency
  /** The shops it serves; none for every shop. A terminal or a safe has at most one. */
  locationIds: string[]
  cardNumber: string
  bank: string
}

function AccountDialog({ account, onClose }: { account: AccountDto | null; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const locations = useLocations()
  const form = useForm<AccountValues>({
    defaultValues: {
      kind: (account?.kind as PaymentAccountKind | undefined) ?? 'card',
      name: account?.name ?? '',
      currency: account?.currency ?? baseCurrency(),
      locationIds: account?.locationIds ?? [],
      cardNumber: account?.cardNumber ? formatCardNumber(account.cardNumber) : '',
      bank: account?.bank ?? '',
    },
  })
  const errors = form.formState.errors
  const kind = form.watch('kind')
  // Money is kept in any currency the business has switched on; a terminal takes what the tills sell in.
  const currencies = useCurrencies()
  const base = currencies.data?.base ?? baseCurrency()
  const kept = currencies.data?.active.map((currency) => currency.code) ?? [base]
  const choosesCurrency = kind !== 'terminal' && kept.length > 1
  const shared = SHARED_ACCOUNT_KINDS.includes(kind)

  const mutation = useMutation({
    mutationFn: (input: AccountInput) =>
      account ? api.put(`/money/accounts/${account.id}`, input) : api.post('/money/accounts', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['money'] })
      toast.success(t('common.saved'))
      onClose()
    },
    onError: (error) => void applyServerErrors(error, form),
  })
  const submit = form.handleSubmit((values) => {
    const input = zodCheck(form, accountInputSchema, {
      ...values,
      currency: choosesCurrency ? values.currency : base,
      // What was a card with several shops and is now a terminal keeps the first of them.
      locationIds: shared ? values.locationIds : values.locationIds.slice(0, 1),
      cardNumber: values.cardNumber || null,
      // A card set up before whole numbers were kept is still known by its last four.
      last4: account?.last4 ?? null,
    })
    if (input) {
      mutation.mutate(input)
    }
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={account ? t('money.editAccount') : t('money.addAccount')}
      dirty={form.formState.isDirty && !mutation.isSuccess}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="account-form" variant="primary" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form id="account-form" onSubmit={() => void submit()}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('money.kind')} error={errors.kind?.message}>
            {(id) => (
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <Select
                    id={id}
                    value={field.value}
                    onChange={field.onChange}
                    options={PAYMENT_ACCOUNT_KINDS.map((item) => ({ value: item, label: ACCOUNT_KIND_LABELS[item] }))}
                  />
                )}
              />
            )}
          </Field>
          <Field label={t('money.name')} error={errors.name?.message} required>
            {(id) => (
              <Input
                id={id}
                autoFocus
                placeholder={kind === 'card' ? 'Humo' : kind === 'terminal' ? 'Terminal 1' : ''}
                invalid={!!errors.name}
                {...form.register('name')}
              />
            )}
          </Field>
        </div>
        <Field
          label={shared ? t('money.shops') : t('money.shop')}
          hint={shared ? t('money.shopsHint') : t('money.shopHint')}
          error={errors.locationIds?.message}
        >
          {(id) => (
            <Controller
              control={form.control}
              name="locationIds"
              render={({ field }) => {
                const options = (locations.data ?? []).map((location) => ({ value: location.id, label: location.name }))
                // A card goes wherever its owner does; a terminal and a safe stand in one place.
                return shared ? (
                  <Combobox
                    id={id}
                    multiple
                    options={options}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={t('money.everyShop')}
                  />
                ) : (
                  <Combobox
                    id={id}
                    options={options}
                    value={field.value[0] ?? null}
                    onChange={(value) => field.onChange(value ? [value] : [])}
                    placeholder={t('money.everyShop')}
                  />
                )
              }}
            />
          )}
        </Field>
        {choosesCurrency ? (
          <Field label={t('money.currency')} error={errors.currency?.message}>
            {(id) => (
              <Controller
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <Select
                    id={id}
                    value={field.value}
                    onChange={field.onChange}
                    options={kept.map((code) => ({ value: code, label: currencyName(code, t) }))}
                    className="w-56"
                  />
                )}
              />
            )}
          </Field>
        ) : null}
        {kind === 'card' || kind === 'bank' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {kind === 'card' ? (
              <Field
                label={t('money.cardNumber')}
                hint={
                  account?.last4 && !account.cardNumber
                    ? t('money.cardNumberOld', { last4: account.last4 })
                    : t('money.cardNumberHint')
                }
                error={errors.cardNumber?.message}
              >
                {(id) => (
                  <Controller
                    control={form.control}
                    name="cardNumber"
                    render={({ field }) => (
                      <CardNumberInput
                        id={id}
                        ref={field.ref}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        invalid={!!errors.cardNumber}
                      />
                    )}
                  />
                )}
              </Field>
            ) : null}
            <Field label={t('money.bank')} error={errors.bank?.message}>
              {(id) => <Input id={id} invalid={!!errors.bank} {...form.register('bank')} />}
            </Field>
          </div>
        ) : null}
      </Form>
    </Dialog>
  )
}

// ───────────────────────────── Rates ─────────────────────────────

function RatesTab() {
  const { t } = useTranslation()
  const { can } = useSession()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const currencies = useQuery({
    queryKey: ['money', 'currencies'],
    queryFn: ({ signal }) => api.get<CurrenciesDto>('/currencies', undefined, signal),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['money'] })
    void queryClient.invalidateQueries({ queryKey: ['pos'] })
  }
  const setRate = useMutation({
    mutationFn: ({ code, value, confirmed }: { code: AnyCurrency; value: number; confirmed: boolean }) =>
      api.put(`/currencies/${code}/rate`, { value, confirmed }),
    onSuccess: () => {
      refresh()
      toast.success(t('common.saved'))
    },
  })
  const enable = useMutation({
    mutationFn: (input: { code: AnyCurrency; form?: RateForm }) => api.post('/currencies', input),
    onSuccess: refresh,
  })
  const disable = useMutation({
    mutationFn: (code: AnyCurrency) => api.post(`/currencies/${code}/archive`),
    onSuccess: refresh,
  })

  const rate = async (currency: CurrencyDto, value: number) => {
    const { rate: last, form } = currency
    // Only a rate written the same way is a number to hold the new one against.
    const before = last && form && last.against === form.against && last.way === form.way ? last.value : null
    let confirmed = false
    if (before !== null && isRateJump(before, value)) {
      confirmed = await confirm({
        title: t('currencies.jumpConfirm', {
          percent: Math.round(rateJump(before, value)),
          before: rateText(before),
          next: rateText(value),
        }),
        confirmLabel: t('currencies.jumpYes'),
      })
      if (!confirmed) {
        return
      }
    }
    setRate.mutate({ code: currency.code, value, confirmed })
  }
  const putAway = async (currency: CurrencyDto) => {
    const name = currencyName(currency.code, t)
    if (await confirm({ title: t('currencies.putAwayConfirm', { name }), confirmLabel: t('currencies.putAway') })) {
      disable.mutate(currency.code)
    }
  }

  if (!currencies.data) {
    return <Skeleton className="h-48" />
  }
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <CurrenciesView
        currencies={currencies.data}
        canManage={can('money.manage')}
        canRate={can('money.rates')}
        saving={setRate.isPending ? setRate.variables.code : null}
        onRate={(currency, value) => void rate(currency, value)}
        onEnable={(code, form) => enable.mutate({ code, form })}
        onDisable={(currency) => void putAway(currency)}
      />
    </div>
  )
}
