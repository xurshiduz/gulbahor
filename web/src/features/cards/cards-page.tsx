import {
  CARD_NOTICE_STATES,
  cardNoticePasteSchema,
  formatMoney,
  type AccountDto,
  type CardNoticeDto,
  type CardNoticeState,
  type CardNoticeSummary,
  type Page as PageOf,
  type TelegramAccountDto,
  type TelegramAccountStatus,
  type TelegramSetupDto,
} from '@erp/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import {
  ArrowRightLeft,
  Ban,
  CreditCard,
  Eye,
  Link2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  Undo2,
  Unplug,
  UserRound,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilterCombo, FilterDates, FilterSelect } from '@/components/ui/column-filters'
import { Menu, TabPanel, Tabs, type MenuItem } from '@/components/ui/controls'
import { DataTable } from '@/components/ui/data-table'
import { Dialog, useConfirm } from '@/components/ui/dialog'
import { Badge, EmptyState } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Textarea } from '@/components/ui/input'
import { Card, Page, PageActions, SearchInput } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { PaymentDialog } from '@/features/customers/payments'
import { MoneyOpDialog } from '@/features/money/ops'
import { TransferDialog } from '@/features/money/transfers'
import { api, ApiError } from '@/lib/api'
import { fetchAll, moneyCell, timeCell } from '@/lib/excel'
import { formatDateTime, formatPhone } from '@/lib/format'
import { toast } from '@/lib/toast'

import type { NoticeStart } from './notice-picks'
import { bankClock, noticeCard, NoticeStanding, NoticeSum, TelegramConnectDialog } from './notice-parts'
import { DismissDialog, MatchDialog, StandTab } from './settle'

const route = getRouteApi('/cards')

type Notices = PageOf<CardNoticeDto> & { summary: CardNoticeSummary }

const STATUS_TONES: Record<TelegramAccountStatus, 'ok' | 'warn' | 'bad' | 'neutral'> = {
  connected: 'ok',
  offline: 'warn',
  signed_out: 'bad',
  off: 'neutral',
}

/**
 * Card control (KEYINGI-REJA, 18-bo'lim): what the banks' bots wrote about the business's cards, and the
 * Telegram accounts it is read from. Nothing here moves money: a notice is evidence that money moved on a card.
 */
export function CardsPage() {
  const { t } = useTranslation()
  const { can } = useSession()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const manages = can('cards.manage')
  const tab = search.tab === 'accounts' && !manages ? 'notices' : search.tab

  return (
    <Page title={t('cards.title')} flow={tab === 'accounts'}>
      <Tabs
        value={tab}
        onChange={(value) =>
          void navigate({ search: { tab: value as typeof tab, page: 1, size: 20, direction: 'all', state: 'all' } })
        }
        tabs={[
          { value: 'notices', label: t('cards.tabNotices') },
          { value: 'stand', label: t('cards.tabStand') },
          ...(manages ? [{ value: 'accounts', label: t('cards.tabAccounts') }] : []),
        ]}
      >
        <TabPanel value="notices">
          <NoticesTab />
        </TabPanel>
        <TabPanel value="stand">
          <StandTab />
        </TabPanel>
        {manages ? (
          <TabPanel value="accounts">
            <AccountsTab />
          </TabPanel>
        ) : null}
      </Tabs>
    </Page>
  )
}

/** A window opened to write the document a notice's money was. */
type Making = { kind: 'payment' | 'op' | 'transfer'; notice: NoticeStart }

function NoticesTab() {
  const { t } = useTranslation()
  const { can, me } = useSession()
  const queryClient = useQueryClient()
  const { tab: _tab, ...search } = route.useSearch()
  const navigate = route.useNavigate()
  const [shown, setShown] = useState<CardNoticeDto | null>(null)
  const [pasting, setPasting] = useState(false)
  const [making, setMaking] = useState<Making | null>(null)
  const [matching, setMatching] = useState<CardNoticeDto | null>(null)
  const [dismissing, setDismissing] = useState<CardNoticeDto | null>(null)
  const reopen = useMutation({
    mutationFn: (id: string) => api.post<CardNoticeDto>(`/card-notices/${id}/reopen`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['card-notices'] })
      toast.success(t('cards.reopened'))
    },
  })
  const settles = can('cards.settle')
  /** What may be done with a notice by this person: write its document, say it is in the books, leave it off. */
  const actionsOf = (notice: CardNoticeDto): MenuItem[] => {
    const items: MenuItem[] = [{ label: t('cards.showText'), icon: <Eye />, onSelect: () => setShown(notice) }]
    if (notice.standing === 'open' && notice.accountId && notice.amount && notice.direction) {
      const start: NoticeStart = {
        id: notice.id,
        accountId: notice.accountId,
        amount: notice.amount,
        direction: notice.direction,
      }
      const incoming = notice.direction === 'in'
      if (can(incoming ? 'customers.receive' : 'customers.pay_out')) {
        items.push({
          label: t(incoming ? 'cards.makeReceive' : 'cards.makePayOut'),
          icon: <UserRound />,
          onSelect: () => setMaking({ kind: 'payment', notice: start }),
        })
      }
      if (can('money.ops')) {
        items.push({
          label: t(incoming ? 'cards.makeIncome' : 'cards.makeExpense'),
          icon: <Wallet />,
          onSelect: () => setMaking({ kind: 'op', notice: start }),
        })
      }
      if (can('money.manage')) {
        items.push({
          label: t(incoming ? 'cards.makeTransferIn' : 'cards.makeTransferOut'),
          icon: <ArrowRightLeft />,
          onSelect: () => setMaking({ kind: 'transfer', notice: start }),
        })
      }
      if (settles) {
        items.push({ label: t('cards.inBooks'), icon: <Link2 />, onSelect: () => setMatching(notice) })
      }
    }
    if (settles && notice.standing === 'open') {
      items.push({ label: t('cards.dismiss'), icon: <Ban />, onSelect: () => setDismissing(notice) })
    }
    if (settles && (notice.standing === 'linked' || notice.standing === 'dismissed')) {
      items.push({
        label: t(notice.standing === 'linked' ? 'cards.unlink' : 'cards.reopen'),
        icon: <Undo2 />,
        onSelect: () => reopen.mutate(notice.id),
      })
    }
    return items
  }
  const doneMaking = () => {
    setMaking(null)
    void queryClient.invalidateQueries({ queryKey: ['card-notices'] })
  }
  // A transfer is made between the business's own places: they are listed for whoever may move money.
  const places = useQuery({
    queryKey: ['money', 'accounts'],
    queryFn: ({ signal }) => api.get<AccountDto[]>('/money/accounts', undefined, signal),
    enabled: making?.kind === 'transfer',
  })

  const list = useQuery({
    queryKey: ['card-notices', 'list', search],
    queryFn: ({ signal }) => api.get<Notices>('/card-notices', search, signal),
    placeholderData: keepPreviousData,
  })
  // The cards to look by: only for someone who may see the accounts at all.
  const cards = useQuery({
    queryKey: ['money', 'accounts'],
    queryFn: ({ signal }) => api.get<AccountDto[]>('/money/accounts', undefined, signal),
    enabled: can('money.view'),
  })
  const filter = (patch: Partial<typeof search>, replace = false) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace })

  const columns = useMemo<ColumnDef<CardNoticeDto>[]>(
    () => [
      {
        id: 'at',
        header: t('cards.at'),
        meta: { export: (row) => timeCell(row.receivedAt), fixed: true, className: 'tabular w-px whitespace-nowrap' },
        // The bank's own clock where it wrote one: that is the minute the money moved.
        cell: ({ row }) => (row.original.at ? bankClock(row.original.at) : formatDateTime(row.original.receivedAt)),
      },
      {
        id: 'card',
        header: t('cards.card'),
        meta: { export: (row) => noticeCard(row), className: 'whitespace-nowrap' },
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5">
            <span className="font-medium">{noticeCard(row.original)}</span>
            {row.original.cardTail && !row.original.accountId ? (
              <Badge tone="warn">{t('cards.unknownCard')}</Badge>
            ) : null}
          </span>
        ),
      },
      {
        id: 'sum',
        header: t('cards.sum'),
        meta: {
          export: (row) =>
            row.amount !== null && row.currency
              ? moneyCell(row.direction === 'out' ? -row.amount : row.amount, row.currency)
              : null,
          className: 'text-right whitespace-nowrap',
        },
        cell: ({ row }) => <NoticeSum notice={row.original} />,
      },
      {
        id: 'what',
        header: t('cards.what'),
        meta: { export: (row) => [row.heading, row.place].filter(Boolean).join(' · ') || row.text },
        cell: ({ row }) =>
          row.original.kind === 'unread' ? (
            <span className="flex items-center gap-1.5">
              <Badge tone="bad">{t('cards.unread')}</Badge>
              <span className="truncate text-ink-3">{row.original.text.slice(0, 80)}</span>
            </span>
          ) : (
            <span>
              {row.original.kind === 'balance' ? t('cards.balanceAsked') : row.original.heading}
              {row.original.place ? <span className="text-ink-3"> · {row.original.place}</span> : null}
            </span>
          ),
      },
      {
        id: 'standing',
        header: t('cards.standingTitle'),
        meta: {
          export: (row) =>
            row.standing === 'linked'
              ? [row.document?.number, row.document?.who].filter(Boolean).join(' · ')
              : row.standing === 'dismissed'
                ? `${t('cards.standing.dismissed')}: ${row.reason ?? ''}`
                : row.standing
                  ? t('cards.standing.open')
                  : null,
          className: 'max-w-64',
        },
        cell: ({ row }) => <NoticeStanding notice={row.original} />,
      },
      {
        id: 'balance',
        header: t('cards.left'),
        meta: {
          export: (row) => (row.balance !== null && row.currency ? moneyCell(row.balance, row.currency) : null),
          className: 'text-right whitespace-nowrap',
        },
        cell: ({ row }) => (
          <span className="flex items-center justify-end gap-1.5">
            {row.original.gap ? <Badge tone="warn">{t('cards.gap')}</Badge> : null}
            <span className="tabular text-ink-2">
              {row.original.balance !== null && row.original.currency
                ? formatMoney(row.original.balance, row.original.currency)
                : ''}
            </span>
          </span>
        ),
      },
      {
        id: 'source',
        header: t('cards.source'),
        meta: { export: (row) => row.bot ?? row.addedByName, className: 'text-ink-3 whitespace-nowrap' },
        cell: ({ row }) => row.original.bot ?? t('cards.byHand', { name: row.original.addedByName ?? '' }),
      },
      {
        id: 'open',
        header: '',
        meta: { fixed: true, className: 'w-px' },
        cell: ({ row }) => (
          <Menu
            trigger={
              <Button variant="ghost" size="icon" aria-label={t('common.actions')}>
                <MoreHorizontal />
              </Button>
            }
            items={actionsOf(row.original)}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, settles, can],
  )

  const summary = list.data?.summary
  const filtered = !!(search.q || search.accountId || search.from || search.to) || search.state !== 'all'
  const states: readonly CardNoticeState[] = CARD_NOTICE_STATES

  return (
    <>
      {can('cards.manage') ? (
        <PageActions>
          <Button onClick={() => setPasting(true)}>
            <Plus />
            {t('cards.paste')}
          </Button>
        </PageActions>
      ) : null}
      <DataTable
        columns={columns}
        data={list.data?.items}
        loading={list.isFetching}
        rowId={(row) => row.id}
        exportAs={{ fileName: t('cards.title'), rows: () => fetchAll<CardNoticeDto>('/card-notices', search) }}
        preferenceKey="card-notices"
        pagination={{
          page: search.page,
          size: search.size,
          total: list.data?.total ?? 0,
          onPageChange: (page) => void navigate({ search: (previous) => ({ ...previous, page }) }),
          onSizeChange: (size) => filter({ size }),
        }}
        filters={{
          at: <FilterDates from={search.from} to={search.to} onChange={(range) => filter(range)} />,
          card: cards.data ? (
            <FilterCombo
              options={cards.data
                .filter((account) => account.kind === 'card')
                .map((account) => ({ value: account.id, label: account.name }))}
              value={search.accountId ?? null}
              onChange={(accountId) => filter({ accountId: accountId ?? undefined })}
            />
          ) : undefined,
          standing: (
            <FilterSelect
              value={search.state}
              onChange={(state) => filter({ state: state as CardNoticeState })}
              options={states.map((state) => ({ value: state, label: t(`cards.state.${state}`) }))}
            />
          ),
          sum: (
            <FilterSelect
              value={search.direction}
              onChange={(direction) => filter({ direction: direction as typeof search.direction })}
              options={[
                { value: 'all', label: t('common.all') },
                { value: 'in', label: t('cards.in') },
                { value: 'out', label: t('cards.out') },
              ]}
            />
          ),
        }}
        toolbar={
          <>
            <SearchInput value={search.q ?? ''} onChange={(q) => filter({ q: q || undefined }, true)} />
            {/* What wants looking at, whatever the list is filtered by: each takes the list to its own. */}
            {summary?.open ? (
              <button type="button" data-notice-flag="open" onClick={() => filter({ state: 'open' })}>
                <Badge tone="warn">{t('cards.flagOpen', { count: summary.open })}</Badge>
              </button>
            ) : null}
            {summary?.unread ? (
              <button type="button" data-notice-flag="unread" onClick={() => filter({ state: 'unread' })}>
                <Badge tone="bad">{t('cards.flagUnread', { count: summary.unread })}</Badge>
              </button>
            ) : null}
            {summary?.gaps ? (
              <button type="button" data-notice-flag="gap" onClick={() => filter({ state: 'gap' })}>
                <Badge tone="warn">{t('cards.flagGaps', { count: summary.gaps })}</Badge>
              </button>
            ) : null}
            {summary?.unknownCards.length ? (
              <button type="button" data-notice-flag="unknown" onClick={() => filter({ state: 'unknown_card' })}>
                <Badge tone="warn">
                  {t('cards.flagUnknown', { cards: summary.unknownCards.map((tail) => `*${tail}`).join(', ') })}
                </Badge>
              </button>
            ) : null}
          </>
        }
        empty={
          <EmptyState
            icon={CreditCard}
            title={filtered ? t('common.nothingFound') : t('cards.empty')}
            hint={filtered ? undefined : t('cards.emptyHint')}
          />
        }
      />
      {shown ? (
        <Dialog open onClose={() => setShown(null)} title={t('cards.showText')}>
          <pre
            data-notice-text
            className="rounded-md bg-sunken p-3 font-sans text-[13px] break-words whitespace-pre-wrap text-ink"
          >
            {shown.text}
          </pre>
          <p className="mt-2 text-xs text-ink-3">
            {t('cards.received', { at: formatDateTime(shown.receivedAt) })}
            {shown.gap ? ` · ${t('cards.gapHint')}` : ''}
          </p>
        </Dialog>
      ) : null}
      {pasting ? <PasteDialog onClose={() => setPasting(false)} /> : null}
      {matching ? <MatchDialog notice={matching} onClose={() => setMatching(null)} /> : null}
      {dismissing ? <DismissDialog notice={dismissing} onClose={() => setDismissing(null)} /> : null}
      {making?.kind === 'payment' ? <PaymentDialog notice={making.notice} onClose={doneMaking} /> : null}
      {making?.kind === 'op' ? <MoneyOpDialog notice={making.notice} onClose={doneMaking} /> : null}
      {making?.kind === 'transfer' && places.data ? (
        <TransferDialog
          accounts={places.data}
          limit={me.org.settings.maxRateLossPercent}
          setsRates={can('money.rates')}
          notice={making.notice}
          onClose={doneMaking}
        />
      ) : null}
    </>
  )
}

/** A bot's message put in by hand: for a notice the reader did not see, and for trying the reader out. */
function PasteDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | undefined>()

  const paste = useMutation({
    mutationFn: () => api.post<CardNoticeDto>('/card-notices', cardNoticePasteSchema.parse({ text })),
    meta: { silent: true },
    onSuccess: (notice) => {
      void queryClient.invalidateQueries({ queryKey: ['card-notices'] })
      toast[notice.kind === 'unread' ? 'error' : 'success'](
        notice.kind === 'unread' ? t('cards.pastedUnread') : t('cards.pasted'),
      )
      onClose()
    },
    onError: (problem) =>
      setError(problem instanceof ApiError ? (problem.fields?.text ?? problem.message) : String(problem)),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('cards.paste')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="card-notice-paste" variant="primary" loading={paste.isPending}>
            {t('common.add')}
          </Button>
        </>
      }
    >
      <Form id="card-notice-paste" onSubmit={() => (text.trim() ? paste.mutate() : setError(t('cards.pasteEmpty')))}>
        <Field label={t('cards.pasteText')} error={error} hint={t('cards.pasteHint')} required>
          {(id) => (
            <Textarea
              id={id}
              autoFocus
              rows={8}
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setError(undefined)
              }}
              invalid={!!error}
            />
          )}
        </Field>
      </Form>
    </Dialog>
  )
}

function AccountsTab() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [connecting, setConnecting] = useState(false)

  const setup = useQuery({
    queryKey: ['telegram-accounts', 'list'],
    queryFn: ({ signal }) => api.get<TelegramSetupDto>('/telegram-accounts', undefined, signal),
  })
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'reconnect' | 'read' | 'off' }) =>
      api.post<TelegramAccountDto>(`/telegram-accounts/${id}/${action}`),
    onSuccess: (account, { action }) => {
      void queryClient.invalidateQueries({ queryKey: ['telegram-accounts'] })
      void queryClient.invalidateQueries({ queryKey: ['card-notices'] })
      if (action !== 'off' && account.status !== 'connected') {
        toast.error(account.error ?? t(`cards.status.${account.status}`))
      } else {
        toast.success(t(`cards.done.${action}`))
      }
    },
  })

  const accounts = setup.data?.accounts ?? []
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <PageActions>
        <Button variant="primary" onClick={() => setConnecting(true)} disabled={!setup.data?.configured}>
          <Send />
          {t('cards.connect')}
        </Button>
      </PageActions>
      {setup.data && !setup.data.configured ? (
        <p data-telegram-keys className="rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn">
          {t('cards.noKeys')}
        </p>
      ) : null}
      {accounts.map((account) => (
        <Card key={account.id}>
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2" data-telegram-account={account.id}>
            <div className="mr-auto min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold">
                {account.name ?? formatPhone(account.phone)}
                <Badge tone={STATUS_TONES[account.status]}>{t(`cards.status.${account.status}`)}</Badge>
              </p>
              <p className="tabular text-xs text-ink-3">{formatPhone(account.phone)}</p>
              <p className="mt-1.5 text-[13px] text-ink-2">
                {account.chats.length
                  ? t('cards.reads', { chats: account.chats.map((chat) => chat.title).join(', ') })
                  : t('cards.readsNothing')}
              </p>
              <p className="text-xs text-ink-3">
                {account.lastNoticeAt
                  ? t('cards.lastNotice', { at: formatDateTime(account.lastNoticeAt) })
                  : t('cards.noNotice')}
                {account.lastSeenAt ? ` · ${t('cards.lastSeen', { at: formatDateTime(account.lastSeenAt) })}` : ''}
              </p>
              {account.error ? <p className="mt-1 text-xs text-bad">{account.error}</p> : null}
            </div>
            {account.status === 'signed_out' || account.status === 'off' ? (
              <Button variant="soft" onClick={() => setConnecting(true)}>
                <Send />
                {t('cards.signInAgain')}
              </Button>
            ) : (
              <>
                <Button
                  variant="soft"
                  loading={act.isPending && act.variables?.id === account.id && act.variables.action === 'read'}
                  onClick={() => act.mutate({ id: account.id, action: 'read' })}
                >
                  <RefreshCw />
                  {t('cards.readNow')}
                </Button>
                <Button variant="soft" onClick={() => act.mutate({ id: account.id, action: 'reconnect' })}>
                  {t('cards.reconnect')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: t('cards.offConfirm', { name: account.name ?? formatPhone(account.phone) }),
                        description: t('cards.offHint'),
                        confirmLabel: t('cards.off'),
                        tone: 'danger',
                      })
                    ) {
                      act.mutate({ id: account.id, action: 'off' })
                    }
                  }}
                >
                  <Unplug />
                  {t('cards.off')}
                </Button>
              </>
            )}
          </div>
        </Card>
      ))}
      {setup.data && !accounts.length ? (
        <EmptyState icon={Send} title={t('cards.noAccounts')} hint={t('cards.noAccountsHint')} />
      ) : null}
      {connecting ? (
        <TelegramConnectDialog
          onClose={() => setConnecting(false)}
          onDone={(account) => {
            setConnecting(false)
            void queryClient.invalidateQueries({ queryKey: ['telegram-accounts'] })
            void queryClient.invalidateQueries({ queryKey: ['card-notices'] })
            toast.success(t('cards.connected', { name: account.name ?? formatPhone(account.phone) }))
          }}
        />
      ) : null}
    </div>
  )
}
