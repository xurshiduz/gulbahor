import {
  formatMoney,
  MONEY_OP_KINDS,
  MONEY_OP_STATUS_LABELS,
  MONEY_OP_STATUSES,
  moneyCategoryInputSchema,
  moneyOpInputSchema,
  type MoneyCategoryDto,
  type MoneyOpDto,
  type MoneyOpKind,
  type MoneyOpSums,
  type Page as PageOf,
  type PaymentAccountDto,
  type RateDto,
} from '@gulbahor/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Archive, ArchiveRestore, Pencil, Receipt, Tags, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterDates, FilterSelect } from '@/components/ui/column-filters'
import { Combobox } from '@/components/ui/combobox'
import { Select } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog } from '@/components/ui/dialog'
import { Badge, EmptyState, Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import {
  addRow,
  clearRows,
  keepAccounts,
  keptAccounts,
  patchRow,
  PaymentLines,
  removeRow,
  spreadTotal,
  startRows,
  tillHere,
  totalOf,
  valueLines,
  type PaymentRow,
} from '@/features/partners/payment-lines'
import { api, ApiError } from '@/lib/api'
import { fetchAll, moneyCell, timeCell } from '@/lib/excel'
import { formatDateTime } from '@/lib/format'
import { useHotkey } from '@/lib/hotkeys'
import { toast } from '@/lib/toast'
import { uuid } from '@/lib/uuid'

const route = getRouteApi('/money')

const money = (minor: number) => formatMoney(minor, 'UZS', { minor: 'auto' })

const KIND_KEYS: Record<MoneyOpKind, string> = { expense: 'ops.expense', income: 'ops.income' }

/** The kind chosen last on this computer, for each side: most expenses of a shop are of a few kinds. */
const lastKey = (kind: MoneyOpKind) => `gb.ops.category.${kind}`
function lastCategory(kind: MoneyOpKind): string | null {
  try {
    return localStorage.getItem(lastKey(kind))
  } catch {
    return null
  }
}
function keepCategory(kind: MoneyOpKind, id: string) {
  try {
    localStorage.setItem(lastKey(kind), id)
  } catch {
    // Chosen again next time.
  }
}

function refresh(queryClient: QueryClient) {
  for (const key of ['money', 'money-ops', 'pos', 'shifts']) {
    void queryClient.invalidateQueries({ queryKey: [key] })
  }
}

export function useMoneyCategories(enabled = true) {
  return useQuery({
    queryKey: ['money-categories'],
    queryFn: ({ signal }) => api.get<MoneyCategoryDto[]>('/money/categories', undefined, signal),
    enabled,
  })
}

// ───────────────────────────── Writing one ─────────────────────────────

interface MoneyOpDialogProps {
  kind?: MoneyOpKind
  onClose: () => void
}

/**
 * An expense, or other money in, from whatever screen is in view. What it
 * was for is picked; where the money came from is typed into the rows that
 * stand ready, the same ones a partner's payment uses.
 */
export function MoneyOpDialog({ kind: startKind = 'expense', onClose }: MoneyOpDialogProps) {
  const { t } = useTranslation()
  const { can } = useSession()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<MoneyOpKind>(startKind)
  const [categoryId, setCategoryId] = useState<string | null>(() => lastCategory(startKind))
  // Until a line is touched they are the ones this computer usually pays through.
  const [rows, setRows] = useState<PaymentRow[] | null>(null)
  const [added, setAdded] = useState<string | null>(null)
  const [note, setNote] = useState('')
  // One document, one key: sent twice, it is still made once.
  const [clientKey, setClientKey] = useState(uuid)
  // Written one after another: each starts with the cursor where the first did.
  const [round, setRound] = useState(0)

  const categories = useMoneyCategories()
  const accounts = useQuery({
    queryKey: ['money-ops', 'accounts'],
    queryFn: ({ signal }) => api.get<PaymentAccountDto[]>('/money/ops/accounts', undefined, signal),
  })
  const rates = useQuery({
    queryKey: ['money', 'rates'],
    queryFn: ({ signal }) => api.get<{ current: RateDto | null }>('/money/rates', undefined, signal),
  })
  const dayRate = rates.data?.current?.uzsPerUsd ?? null
  const setsRates = can('money.rates')
  const places = useMemo(() => accounts.data ?? [], [accounts.data])
  const kinds = (categories.data ?? []).filter((item) => item.kind === kind && item.isActive)
  const category = kinds.find((item) => item.id === categoryId) ?? null

  const shown = useMemo(() => rows ?? startRows(places, keptAccounts(), tillHere()), [rows, places])
  // Everything is counted in so'm: dollars are worth what the rate makes them.
  const valued = valueLines(shown, places, 'UZS', dayRate)
  const total = totalOf(valued)
  const noRate = valued.some((line) => line.changes && !line.rate && line.row.amount)

  /** What the server would not take, under the line it is about. */
  const [problems, setProblems] = useState<Record<string, string>>({})

  const patch = (accountId: string, change: Partial<PaymentRow>) => {
    setRows(patchRow(shown, accountId, change))
    setProblems((current) => {
      if (!(accountId in current)) {
        return current
      }
      const { [accountId]: _fixed, ...rest } = current
      return rest
    })
  }
  // Which places have a line is this computer's habit: it is kept for the next time.
  const lay = (next: PaymentRow[]) => {
    setRows(next)
    keepAccounts(next)
  }

  // Ctrl+Shift+Enter saves and stays for the next one; Ctrl+Enter saves and closes.
  const again = useRef(false)
  useEffect(() => {
    const mark = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        again.current = event.shiftKey
      }
    }
    window.addEventListener('keydown', mark, true)
    return () => window.removeEventListener('keydown', mark, true)
  }, [])
  // Listed in the help sheet; the form itself answers the key.
  useHotkey('mod+shift+enter', () => false, { label: t('payments.saveMore'), group: t('ops.title') })

  const save = useMutation({
    // `keys`: the lines in the order they were sent, to put the server's answer under the right one.
    mutationFn: ({ input }: { input: unknown; keys: string[]; more: boolean }) =>
      api.post<MoneyOpDto>('/money/ops', input),
    onSuccess: (op, { more }) => {
      refresh(queryClient)
      keepCategory(op.kind, op.categoryId)
      toast.success(t('ops.saved', { number: op.number }))
      if (!more) {
        onClose()
        return
      }
      setRows(clearRows(shown))
      setNote('')
      setProblems({})
      setAdded(null)
      setClientKey(uuid())
      setRound((count) => count + 1)
    },
    onError: (error, { keys }) => {
      if (!(error instanceof ApiError)) {
        return
      }
      if (error.code === 'RATE_CHANGED') {
        // The rate moved while the dialog was open: the sums are worked out again from the new one.
        void queryClient.invalidateQueries({ queryKey: ['money'] })
      }
      const found: Record<string, string> = {}
      const other: string[] = []
      for (const [path, message] of Object.entries(error.fields ?? {})) {
        const index = /^lines\.(\d+)\./.exec(path)?.[1]
        const key = index === undefined ? undefined : keys[Number(index)]
        if (key) {
          found[key] = message
        } else {
          other.push(message)
        }
      }
      setProblems(found)
      if (other[0]) {
        toast.error(other[0])
      }
    },
  })

  const submit = () => {
    const more = again.current
    again.current = false
    if (!category) {
      toast.error(t('ops.pickCategory'))
      return
    }
    const filled = valued.filter((line) => line.row.amount)
    if (!filled.length) {
      toast.error(t('payments.nothing'))
      return
    }
    if (noRate) {
      toast.error(t('payments.noRate'))
      return
    }
    const parsed = moneyOpInputSchema.safeParse({
      clientKey,
      kind,
      categoryId: category.id,
      lines: filled.map((line) => ({
        accountId: line.row.accountId,
        amount: line.row.amount,
        rate: line.changes ? line.row.rate : null,
      })),
      total,
      note,
    })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? t('payments.nothing'))
      return
    }
    save.mutate({ input: parsed.data, keys: filled.map((line) => line.row.accountId), more })
  }

  const typeTotal = (wanted: number) => {
    const taken = spreadTotal(valued, wanted, 'UZS')
    if (!taken) {
      toast.error(t(valued.some((line) => line.account.open) ? 'payments.totalTooSmall' : 'payments.pickAccount'))
      return false
    }
    patch(taken.accountId, { amount: taken.amount })
    return true
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={t(KIND_KEYS[kind])}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={save.isPending && save.variables?.more}
            disabled={save.isPending}
            onClick={() => {
              again.current = true
              document.querySelector<HTMLFormElement>('#money-op-form')?.requestSubmit()
            }}
          >
            {t('payments.saveMore')}
            <Shortcut combo="mod+shift+enter" className="ml-1 opacity-70" />
          </Button>
          <Button
            type="submit"
            form="money-op-form"
            variant="primary"
            loading={save.isPending && !save.variables?.more}
            disabled={save.isPending}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form key={round} id="money-op-form" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <Field label={t('payments.kind')}>
            {(id) => (
              <div data-enter-skip>
                <Select
                  id={id}
                  value={kind}
                  onChange={(value) => {
                    setKind(value as MoneyOpKind)
                    setCategoryId(lastCategory(value as MoneyOpKind))
                  }}
                  options={MONEY_OP_KINDS.map((value) => ({ value, label: t(KIND_KEYS[value]) }))}
                />
              </div>
            )}
          </Field>
          <Field
            label={t(kind === 'expense' ? 'ops.forWhat' : 'ops.fromWhat')}
            hint={category && !category.inProfit ? t('ops.notInProfit') : undefined}
            required
          >
            {(id) => (
              <Combobox
                id={id}
                // The kind chosen last is already there: the cursor starts at the money.
                autoFocus={!category}
                options={kinds.map((item) => ({ value: item.id, label: item.name }))}
                value={category?.id ?? null}
                onChange={setCategoryId}
              />
            )}
          </Field>
        </div>

        {accounts.data && !places.length ? (
          <p className="text-[13px] text-ink-3">{t('payments.noAccounts')}</p>
        ) : (
          <PaymentLines
            kind={kind === 'income' ? 'in' : 'out'}
            lines={valued}
            spare={places.filter((account) => !shown.some((row) => row.accountId === account.id))}
            currency="UZS"
            owed={null}
            onPatch={patch}
            onAdd={(accountId) => {
              lay(addRow(shown, accountId))
              setAdded(accountId)
            }}
            onRemove={(accountId) => lay(removeRow(shown, accountId))}
            onTotal={typeTotal}
            setsRates={setsRates}
            problems={problems}
            autoFocus={!!category}
            focusId={added}
            headings={{
              ours: t(kind === 'income' ? 'ops.cameIn' : 'ops.wentOut'),
              theirs: t('ops.inSom'),
            }}
          />
        )}

        <Field label={t('receipts.note')}>
          {(id) => <Input id={id} value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />}
        </Field>
      </Form>
    </Dialog>
  )
}

// ───────────────────────────── The list ─────────────────────────────

/** Every expense and every other sum that came in, newest first, with what the ones shown come to. */
export function MoneyOpsTab() {
  const { t } = useTranslation()
  const { can } = useSession()
  const queryClient = useQueryClient()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [cancelling, setCancelling] = useState<MoneyOpDto | null>(null)
  const categories = useMoneyCategories()
  const filters = {
    page: search.page,
    size: search.size,
    q: search.q,
    status: search.status === 'posted' || search.status === 'cancelled' ? search.status : 'all',
    kind: search.kind,
    categoryId: search.categoryId,
    from: search.from,
    to: search.to,
  }

  const list = useQuery({
    queryKey: ['money-ops', 'list', filters],
    queryFn: ({ signal }) => api.get<PageOf<MoneyOpDto> & { sums: MoneyOpSums }>('/money/ops', filters, signal),
    placeholderData: keepPreviousData,
  })

  const filter = (patch: Partial<typeof search>, replace = false) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace })

  const columns = useMemo<ColumnDef<MoneyOpDto>[]>(
    () => [
      {
        id: 'number',
        header: t('receipts.number'),
        meta: { export: (row) => row.number, fixed: true, className: 'w-px font-code text-xs whitespace-nowrap' },
        cell: ({ row }) => row.original.number,
      },
      {
        id: 'doneAt',
        header: t('payments.paidAt'),
        meta: { export: (row) => timeCell(row.doneAt), className: 'tabular w-px whitespace-nowrap' },
        cell: ({ row }) => formatDateTime(row.original.doneAt),
      },
      {
        id: 'kind',
        header: t('payments.kind'),
        meta: { export: (row) => t(KIND_KEYS[row.kind]), className: 'w-px whitespace-nowrap' },
        cell: ({ row }) => (
          <Badge tone={row.original.kind === 'expense' ? 'warn' : 'ok'}>{t(KIND_KEYS[row.original.kind])}</Badge>
        ),
      },
      {
        id: 'category',
        header: t('ops.category'),
        meta: { export: (row) => row.categoryName },
        cell: ({ row }) => (
          <span>
            {row.original.categoryName}
            {row.original.inProfit ? null : <span className="text-xs text-ink-3"> · {t('ops.owner')}</span>}
          </span>
        ),
      },
      {
        id: 'total',
        header: t('money.amount'),
        meta: {
          export: (row) => moneyCell(row.kind === 'expense' ? -row.total : row.total, 'UZS'),
          className: 'tabular text-right font-medium whitespace-nowrap',
          headerClassName: 'text-right',
        },
        cell: ({ row }) => (
          <span className={row.original.kind === 'income' ? 'text-ok' : undefined}>
            {row.original.kind === 'expense' ? '−' : '+'}
            {money(row.original.total)}
          </span>
        ),
      },
      {
        id: 'paidBy',
        header: t('payments.account'),
        meta: { export: (row) => row.paidBy, className: 'text-ink-2' },
        cell: ({ row }) => row.original.paidBy,
      },
      {
        id: 'author',
        header: t('payments.author'),
        meta: { export: (row) => row.createdByName, className: 'text-ink-2' },
        cell: ({ row }) => row.original.createdByName ?? '',
      },
      {
        id: 'note',
        header: t('receipts.note'),
        meta: { export: (row) => row.cancelReason ?? row.note, className: 'text-ink-2' },
        cell: ({ row }) => row.original.cancelReason ?? row.original.note ?? '',
      },
      {
        id: 'status',
        header: t('common.status'),
        meta: { export: (row) => MONEY_OP_STATUS_LABELS[row.status], className: 'w-px whitespace-nowrap' },
        cell: ({ row }) => (
          <Badge tone={row.original.status === 'posted' ? 'ok' : 'neutral'}>
            {MONEY_OP_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px whitespace-nowrap' },
        cell: ({ row }) =>
          row.original.status === 'posted' && can('money.ops') ? (
            <Button variant="ghost" size="sm" onClick={() => setCancelling(row.original)}>
              <Undo2 />
              {t('payments.cancel')}
            </Button>
          ) : null,
      },
    ],
    [t, can],
  )

  const filtered =
    !!(search.q || search.from || search.to || search.kind || search.categoryId) || filters.status !== 'all'
  const sums = list.data?.sums

  return (
    <>
      <DataTable
        columns={columns}
        data={list.data?.items}
        loading={list.isFetching}
        rowId={(row) => row.id}
        exportAs={{ fileName: t('ops.title'), rows: () => fetchAll<MoneyOpDto>('/money/ops', filters) }}
        preferenceKey="money-ops"
        rowClassName={(row) => (row.status === 'cancelled' ? 'text-ink-3' : undefined)}
        pagination={{
          page: search.page,
          size: search.size,
          total: list.data?.total ?? 0,
          onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
          onSizeChange: (size) => filter({ size }),
        }}
        filters={{
          kind: (
            <FilterSelect
              value={search.kind ?? 'all'}
              onChange={(kind) =>
                filter({ kind: kind === 'all' ? undefined : (kind as MoneyOpKind), categoryId: undefined })
              }
              options={[
                { value: 'all', label: t('common.all') },
                ...MONEY_OP_KINDS.map((kind) => ({ value: kind, label: t(KIND_KEYS[kind]) })),
              ]}
            />
          ),
          category: (
            <FilterSelect
              value={search.categoryId ?? 'all'}
              onChange={(categoryId) => filter({ categoryId: categoryId === 'all' ? undefined : categoryId })}
              options={[
                { value: 'all', label: t('common.all') },
                ...(categories.data ?? [])
                  .filter((item) => !search.kind || item.kind === search.kind)
                  .map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
          ),
          status: (
            <FilterSelect
              value={filters.status}
              onChange={(status) => filter({ status: status as typeof search.status })}
              options={[
                { value: 'all', label: t('common.all') },
                ...MONEY_OP_STATUSES.map((status) => ({ value: status, label: MONEY_OP_STATUS_LABELS[status] })),
              ]}
            />
          ),
          doneAt: <FilterDates from={search.from} to={search.to} onChange={(range) => filter(range)} />,
        }}
        toolbar={
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
            <SearchInput value={search.q ?? ''} onChange={(q) => filter({ q: q || undefined }, true)} />
            {/* What the ones in the list come to: those taken back are not counted. */}
            {sums && (sums.expense || sums.income) ? (
              <p className="tabular text-[13px] text-ink-2">
                {sums.expense ? (
                  <span>
                    {t('ops.expense')}: <span className="font-semibold text-ink">{money(sums.expense)}</span>
                  </span>
                ) : null}
                {sums.expense && sums.income ? <span className="text-ink-3"> · </span> : null}
                {sums.income ? (
                  <span>
                    {t('ops.income')}: <span className="font-semibold text-ok">{money(sums.income)}</span>
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        }
        empty={<EmptyState icon={Receipt} title={filtered ? t('common.nothingFound') : t('ops.empty')} />}
      />
      {cancelling ? (
        <CancelDialog
          op={cancelling}
          onClose={() => setCancelling(null)}
          onDone={() => {
            refresh(queryClient)
            setCancelling(null)
          }}
        />
      ) : null}
    </>
  )
}

function CancelDialog({ op, onClose, onDone }: { op: MoneyOpDto; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const cancel = useMutation({
    mutationFn: () => api.post<MoneyOpDto>(`/money/ops/${op.id}/cancel`, { reason }),
    onSuccess: (cancelled) => {
      toast.success(t('ops.cancelled', { number: cancelled.number }))
      onDone()
    },
  })
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${t('payments.cancel')} · ${op.number}`}
      footer={
        <>
          <Button onClick={onClose}>{t('common.no')}</Button>
          <Button type="submit" form="money-op-cancel" variant="danger" loading={cancel.isPending}>
            {t('payments.cancel')}
          </Button>
        </>
      }
    >
      <Form
        id="money-op-cancel"
        onSubmit={() => (reason.trim() ? cancel.mutate() : toast.error(t('sales.voidReasonNeeded')))}
      >
        <p className="text-[13px] text-ink-2">
          {op.categoryName} · {money(op.total)} · {op.paidBy}
        </p>
        <Field label={t('payments.cancelReason')} hint={t('ops.cancelHint')} required>
          {(id) => (
            <Input
              id={id}
              autoFocus
              value={reason}
              maxLength={200}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>
      </Form>
    </Dialog>
  )
}

// ───────────────────────────── What the money was for ─────────────────────────────

/** The kinds of expense and of other income: named by the business, archived when no longer used. */
export function MoneyCategoriesTab({ onEdit }: { onEdit: (category: MoneyCategoryDto) => void }) {
  const { t } = useTranslation()
  const { can } = useSession()
  const queryClient = useQueryClient()
  const categories = useMoneyCategories()
  const mayManage = can('money.categories')

  const setActive = useMutation({
    mutationFn: (category: MoneyCategoryDto) =>
      api.post<MoneyCategoryDto>(`/money/categories/${category.id}/${category.isActive ? 'archive' : 'restore'}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['money-categories'] }),
  })

  const columns = useMemo<ColumnDef<MoneyCategoryDto>[]>(
    () => [
      {
        id: 'name',
        header: t('products.name'),
        meta: { export: (row) => row.name, fixed: true },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'kind',
        header: t('payments.kind'),
        meta: { export: (row) => t(KIND_KEYS[row.kind]), className: 'w-px whitespace-nowrap' },
        cell: ({ row }) => (
          <Badge tone={row.original.kind === 'expense' ? 'warn' : 'ok'}>{t(KIND_KEYS[row.original.kind])}</Badge>
        ),
      },
      {
        id: 'inProfit',
        header: t('ops.inProfit'),
        meta: { export: (row) => (row.inProfit ? t('common.yes') : t('common.no')), className: 'text-ink-2' },
        cell: ({ row }) => (row.original.inProfit ? t('common.yes') : t('ops.owner')),
      },
      {
        id: 'status',
        header: t('common.status'),
        meta: {
          export: (row) => (row.isActive ? t('common.active') : t('common.archived')),
          className: 'w-px whitespace-nowrap',
        },
        cell: ({ row }) => (row.original.isActive ? null : <Badge tone="neutral">{t('common.archived')}</Badge>),
      },
      {
        id: 'actions',
        header: '',
        meta: { fixed: true, className: 'w-px whitespace-nowrap' },
        cell: ({ row }) =>
          mayManage ? (
            <span className="flex justify-end gap-1">
              <Button variant="ghost" size="iconSm" aria-label={t('common.edit')} onClick={() => onEdit(row.original)}>
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={row.original.isActive ? t('common.archive') : t('common.restore')}
                onClick={() => setActive.mutate(row.original)}
              >
                {row.original.isActive ? <Archive /> : <ArchiveRestore />}
              </Button>
            </span>
          ) : null,
      },
    ],
    [t, mayManage, onEdit, setActive],
  )

  return (
    <DataTable
      columns={columns}
      data={categories.data}
      loading={categories.isFetching}
      rowId={(row) => row.id}
      preferenceKey="money-categories"
      rowClassName={(row) => (row.isActive ? undefined : 'text-ink-3')}
      empty={<EmptyState icon={Tags} title={t('ops.noCategories')} />}
    />
  )
}

export function MoneyCategoryDialog({ category, onClose }: { category: MoneyCategoryDto | null; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<MoneyOpKind>(category?.kind ?? 'expense')
  const [name, setName] = useState(category?.name ?? '')
  const [inProfit, setInProfit] = useState(category?.inProfit ?? true)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: (input: unknown) =>
      category
        ? api.put<MoneyCategoryDto>(`/money/categories/${category.id}`, input)
        : api.post<MoneyCategoryDto>('/money/categories', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['money-categories'] })
      toast.success(t('common.saved'))
      onClose()
    },
    onError: (error) => setErrors(error instanceof ApiError ? (error.fields ?? {}) : {}),
  })
  const submit = () => {
    const parsed = moneyCategoryInputSchema.safeParse({ kind, name, inProfit })
    if (!parsed.success) {
      setErrors({ name: parsed.error.issues[0]?.message ?? '' })
      return
    }
    save.mutate(parsed.data)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={category ? t('ops.editCategory') : t('ops.addCategory')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="money-category-form" variant="primary" loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Form id="money-category-form" onSubmit={submit}>
        <Field label={t('payments.kind')} error={errors.kind}>
          {(id) => (
            <Select
              id={id}
              value={kind}
              onChange={(value) => setKind(value as MoneyOpKind)}
              options={MONEY_OP_KINDS.map((value) => ({ value, label: t(KIND_KEYS[value]) }))}
            />
          )}
        </Field>
        <Field label={t('products.name')} error={errors.name} required>
          {(id) => (
            <Input
              id={id}
              autoFocus
              value={name}
              maxLength={80}
              invalid={!!errors.name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('ops.inProfit')} hint={t('ops.inProfitHint')} error={errors.inProfit}>
          {(id) => (
            <Select
              id={id}
              value={inProfit ? 'yes' : 'no'}
              onChange={(value) => setInProfit(value === 'yes')}
              options={[
                { value: 'yes', label: t(kind === 'expense' ? 'ops.isSpent' : 'ops.isEarned') },
                { value: 'no', label: t(kind === 'expense' ? 'ops.ownerTook' : 'ops.ownerBrought') },
              ]}
            />
          )}
        </Field>
      </Form>
    </Dialog>
  )
}
