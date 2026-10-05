import {
  ACCOUNT_KIND_LABELS,
  accountInputSchema,
  formatMoney,
  PAYMENT_ACCOUNT_KINDS,
  rateInputSchema,
  registerInputSchema,
  todayIn,
  toIsoDate,
  type AccountDto,
  type AccountInput,
  type MoneyCategoryDto,
  type PaymentAccountKind,
  type RateDto,
  type RegisterDto,
  type RegisterInput,
} from '@gulbahor/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Archive, ArchiveRestore, Landmark, MoreHorizontal, Pencil, Plus, Store } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Menu, Select, TabPanel, Tabs } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { applyServerErrors, Form, zodCheck, zodSubmit } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NumberInput } from '@/components/ui/number-input'
import { Card, Page } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { formatDay } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { LIST_DEFAULTS } from '@/lib/list-search'
import { toast } from '@/lib/toast'

import { MoneyCategoriesTab, MoneyCategoryDialog, MoneyOpDialog, MoneyOpsTab } from './ops'
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

interface Rates {
  current: RateDto | null
  history: RateDto[]
}

/**
 * What a business sets up before it can sell: its tills, the cards and
 * terminals money can be paid to, and the day's dollar rate.
 */
export function MoneyPage() {
  const { t } = useTranslation()
  const { can, hasModule } = useSession()
  const { tab } = route.useSearch()
  const navigate = route.useNavigate()
  const canManage = can('money.manage')
  const canMove = canManage || can('money.collect')
  const seesAccounts = canMove || can('money.view')
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
      : tab === 'transfers'
        ? setMoving(true)
        : tab === 'ops'
          ? setSpending(true)
          : tab === 'categories'
            ? setCategoryForm(null)
            : setAccountForm(null)
  const addLabel =
    tab === 'registers'
      ? t('money.addRegister')
      : tab === 'transfers'
        ? t('money.addTransfer')
        : tab === 'ops'
          ? t('ops.expense')
          : tab === 'categories'
            ? t('ops.addCategory')
            : t('money.addAccount')
  const adding =
    tab === 'transfers'
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
          ...(seesAccounts ? [{ value: 'accounts', label: t('money.tabAccounts') }] : []),
          ...(seesAccounts ? [{ value: 'transfers', label: t('money.tabTransfers') }] : []),
          ...(seesOps ? [{ value: 'ops', label: t('ops.title') }] : []),
          ...(seesOps || canName ? [{ value: 'categories', label: t('ops.categories') }] : []),
          ...(hasModule('usd') ? [{ value: 'rates', label: t('money.tabRates') }] : []),
        ]}
      >
        <TabPanel value="registers">
          <RegistersTab canManage={canManage} onEdit={setRegisterForm} />
        </TabPanel>
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
      {moving ? <TransferDialog accounts={accounts.data ?? []} onClose={() => setMoving(false)} /> : null}
      {spending ? <MoneyOpDialog onClose={() => setSpending(false)} /> : null}
      {categoryForm !== undefined ? (
        <MoneyCategoryDialog category={categoryForm} onClose={() => setCategoryForm(undefined)} />
      ) : null}
    </Page>
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

  const columns = useMemo<ColumnDef<RegisterDto>[]>(
    () => [
      {
        id: 'name',
        header: t('money.name'),
        meta: { fixed: true },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
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
            {row.original.currency === 'USD' && row.original.kind !== 'cash' ? (
              <span className="text-ink-3"> · $</span>
            ) : null}
            {row.original.last4 ? <span className="font-code text-xs text-ink-3"> *{row.original.last4}</span> : null}
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
        cell: ({ row }) => row.original.locationName ?? <span className="text-ink-3">{t('money.everyShop')}</span>,
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
    [t, canManage],
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
  currency: 'UZS' | 'USD'
  locationId: string | null
  last4: string
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
      currency: account?.currency ?? 'UZS',
      locationId: account?.locationId ?? null,
      last4: account?.last4 ?? '',
      bank: account?.bank ?? '',
    },
  })
  const errors = form.formState.errors
  const kind = form.watch('kind')
  const { hasModule } = useSession()
  const holdsDollars = hasModule('usd') && (kind === 'safe' || kind === 'bank')

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
      // Only a safe or a bank account holds dollars.
      currency: holdsDollars ? values.currency : 'UZS',
      last4: values.last4 || null,
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
        <Field label={t('money.shop')} hint={t('money.shopHint')} error={errors.locationId?.message}>
          {(id) => (
            <Controller
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <Combobox
                  id={id}
                  options={(locations.data ?? []).map((location) => ({ value: location.id, label: location.name }))}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t('money.everyShop')}
                />
              )}
            />
          )}
        </Field>
        {holdsDollars ? (
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
                    options={[
                      { value: 'UZS', label: "So'm" },
                      { value: 'USD', label: 'AQSH dollari' },
                    ]}
                    className="w-48"
                  />
                )}
              />
            )}
          </Field>
        ) : null}
        {kind === 'card' || kind === 'bank' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {kind === 'card' ? (
              <Field label={t('money.last4')} hint={t('money.last4Hint')} error={errors.last4?.message}>
                {(id) => (
                  <Input
                    id={id}
                    className="font-code"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="3073"
                    invalid={!!errors.last4}
                    {...form.register('last4')}
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
  const { can, me } = useSession()
  const queryClient = useQueryClient()
  const today = toIsoDate(todayIn(me.org.timezone))
  const rates = useQuery({
    queryKey: ['money', 'rates'],
    queryFn: ({ signal }) => api.get<Rates>('/money/rates', undefined, signal),
  })
  const [value, setValue] = useState<number | null>(null)
  const current = rates.data?.current ?? null

  const save = useMutation({
    mutationFn: (uzsPerUsd: number) => api.put<RateDto>('/money/rates', { date: today, uzsPerUsd }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['money'] })
      void queryClient.invalidateQueries({ queryKey: ['pos'] })
      setValue(null)
      toast.success(t('common.saved'))
    },
  })

  const submit = () => {
    const parsed = rateInputSchema.safeParse({ date: today, uzsPerUsd: value })
    if (!parsed.success) {
      toast.error(t('money.rateInvalid'))
      return
    }
    save.mutate(parsed.data.uzsPerUsd)
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Card>
        <p className="text-xs text-ink-3">{t('money.rateToday')}</p>
        <p className="tabular mt-1 text-2xl font-semibold">
          {current ? `1 $ = ${formatMoney(Math.round(current.uzsPerUsd * 100), 'UZS', { minor: 'auto' })}` : '—'}
        </p>
        <p className="mt-1 text-xs text-ink-3">
          {current
            ? current.date === today
              ? t('money.rateSetToday', { name: current.setByName })
              : t('money.rateFrom', { date: formatDay(current.date) })
            : t('money.rateMissing')}
        </p>
        {can('money.rates') ? (
          <Form onSubmit={submit} className="mt-4 flex-row items-end gap-2">
            <Field label={t('money.rateNew')} className="w-44">
              {(id) => <NumberInput id={id} value={value} onChange={setValue} decimals={2} max={1_000_000} />}
            </Field>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {t('common.save')}
            </Button>
          </Form>
        ) : null}
      </Card>
      <Card title={t('money.rateHistory')}>
        {rates.data?.history.length ? (
          <table className="w-full text-[13px]">
            <tbody>
              {rates.data.history.map((rate) => (
                <tr key={rate.date} className="border-t border-line first:border-t-0">
                  <td className="tabular py-1.5 text-ink-2">{formatDay(rate.date)}</td>
                  <td className="tabular py-1.5 text-right font-medium">
                    {formatMoney(Math.round(rate.uzsPerUsd * 100), 'UZS', { minor: 'auto' })}
                  </td>
                  <td className="py-1.5 pl-4 text-right text-xs text-ink-3">{rate.setByName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[13px] text-ink-3">{t('money.rateMissing')}</p>
        )}
      </Card>
    </div>
  )
}
