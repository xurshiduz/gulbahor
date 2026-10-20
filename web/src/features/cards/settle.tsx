import { formatMoney, type CardEntryDto, type CardNoticeDto, type CardStandDto } from '@erp/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Check, CreditCard } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api, ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/cn'

import { bankClock, DocumentName, noticeCard } from './notice-parts'

const signed = (amount: number, currency: CardEntryDto['currency']) =>
  `${amount < 0 ? '−' : '+'}${formatMoney(Math.abs(amount), currency)}`

/**
 * "It is in the books already": the documents of this card's money going the notice's way, with room left for its
 * sum, the likeliest first. One is chosen; the notice stands for it from then on.
 */
export function MatchDialog({ notice, onClose }: { notice: CardNoticeDto; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [chosen, setChosen] = useState<CardEntryDto | null>(null)
  const candidates = useQuery({
    queryKey: ['card-notices', 'candidates', notice.id],
    queryFn: ({ signal }) => api.get<CardEntryDto[]>(`/card-notices/${notice.id}/candidates`, undefined, signal),
  })
  const match = useMutation({
    mutationFn: (entry: CardEntryDto) =>
      api.post<CardNoticeDto>(`/card-notices/${notice.id}/match`, {
        documentType: entry.document.type,
        documentId: entry.document.id,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['card-notices'] })
      toast.success(t('cards.matched'))
      onClose()
    },
  })
  const rows = candidates.data ?? []
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={t('cards.matchTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="card-match" variant="primary" disabled={!chosen} loading={match.isPending}>
            {t('cards.match')}
          </Button>
        </>
      }
    >
      <Form id="card-match" onSubmit={() => (chosen ? match.mutate(chosen) : undefined)}>
        <p className="text-[13px] text-ink-2">
          {t('cards.matchFor', {
            card: noticeCard(notice),
            sum: notice.amount !== null && notice.currency ? formatMoney(notice.amount, notice.currency) : '',
            at: notice.at ? bankClock(notice.at) : formatDateTime(notice.receivedAt),
          })}
        </p>
        {candidates.isSuccess && !rows.length ? (
          <p className="rounded-md bg-sunken px-3 py-2 text-[13px] text-ink-3">{t('cards.noCandidates')}</p>
        ) : (
          <div className="flex flex-col gap-1" role="radiogroup">
            {rows.map((entry) => {
              const on = chosen?.document.id === entry.document.id
              return (
                <button
                  key={`${entry.document.type}:${entry.document.id}`}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-candidate={entry.document.id}
                  onClick={() => setChosen(entry)}
                  className={cn(
                    'flex items-center gap-3 rounded-md border px-3 py-2 text-left text-[13px] transition-colors',
                    on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunken',
                  )}
                >
                  <DocumentName document={entry.document} />
                  <span className="ml-auto shrink-0 text-xs text-ink-3">
                    {formatDateTime(entry.writtenAt)}
                    {entry.writtenByName ? ` · ${entry.writtenByName}` : ''}
                  </span>
                  <span className="tabular shrink-0">{signed(entry.amount, entry.currency)}</span>
                  {entry.left !== entry.amount ? (
                    <span className="tabular shrink-0 text-xs text-ink-3">
                      {t('cards.leftOf', { sum: formatMoney(Math.abs(entry.left), entry.currency) })}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </Form>
    </Dialog>
  )
}

/** Left off the books on purpose — the owner's own money, a mistake of the bank's — for a reason that is kept. */
export function DismissDialog({ notice, onClose }: { notice: CardNoticeDto; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>()
  const dismiss = useMutation({
    mutationFn: () => api.post<CardNoticeDto>(`/card-notices/${notice.id}/dismiss`, { reason: reason.trim() }),
    meta: { silent: true },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['card-notices'] })
      toast.success(t('cards.dismissed'))
      onClose()
    },
    onError: (problem) =>
      setError(problem instanceof ApiError ? (problem.fields?.reason ?? problem.message) : String(problem)),
  })
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('cards.dismissTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="card-dismiss" variant="primary" loading={dismiss.isPending}>
            {t('cards.dismiss')}
          </Button>
        </>
      }
    >
      <Form id="card-dismiss" onSubmit={() => (reason.trim() ? dismiss.mutate() : setError(t('cards.reasonEmpty')))}>
        <Field label={t('cards.reason')} error={error} hint={t('cards.reasonHint')} required>
          {(id) => (
            <Input
              id={id}
              autoFocus
              maxLength={200}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value)
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

/**
 * Each card under control beside its bank, and below, money in the books the bank never wrote of: what stands
 * between the two is in sight, and every part of it can be said of.
 */
export function StandTab() {
  const { t } = useTranslation()
  const { can } = useSession()
  const queryClient = useQueryClient()
  const stand = useQuery({
    queryKey: ['card-notices', 'stand'],
    queryFn: ({ signal }) => api.get<CardStandDto[]>('/card-notices/stand', undefined, signal),
  })
  const entries = useQuery({
    queryKey: ['card-notices', 'entries'],
    queryFn: ({ signal }) => api.get<CardEntryDto[]>('/card-entries', undefined, signal),
  })
  const check = useMutation({
    mutationFn: (entry: CardEntryDto) =>
      api.post('/card-entries/check', {
        documentType: entry.document.type,
        documentId: entry.document.id,
        accountId: entry.accountId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['card-notices'] })
      toast.success(t('cards.checked'))
    },
  })
  const settles = can('cards.settle')

  const columns = useMemo<ColumnDef<CardEntryDto>[]>(
    () => [
      {
        id: 'at',
        header: t('cards.writtenAt'),
        meta: { fixed: true, className: 'tabular w-px whitespace-nowrap' },
        cell: ({ row }) => formatDateTime(row.original.writtenAt),
      },
      { id: 'card', header: t('cards.card'), cell: ({ row }) => row.original.accountName },
      {
        id: 'document',
        header: t('cards.document'),
        cell: ({ row }) => <DocumentName document={row.original.document} />,
      },
      {
        id: 'sum',
        header: t('cards.sum'),
        meta: { className: 'text-right whitespace-nowrap' },
        cell: ({ row }) => (
          <span className={cn('tabular', row.original.amount < 0 ? 'text-bad' : 'text-ok')}>
            {signed(row.original.amount, row.original.currency)}
          </span>
        ),
      },
      {
        id: 'left',
        header: t('cards.noNoticeFor'),
        meta: { className: 'text-right whitespace-nowrap' },
        cell: ({ row }) => (
          <span className="tabular">{formatMoney(Math.abs(row.original.left), row.original.currency)}</span>
        ),
      },
      { id: 'by', header: t('cards.writtenBy'), cell: ({ row }) => row.original.writtenByName ?? '' },
      {
        id: 'act',
        header: '',
        meta: { fixed: true, className: 'w-px' },
        cell: ({ row }) =>
          settles ? (
            <Button
              variant="soft"
              size="sm"
              title={t('cards.checkHint')}
              loading={check.isPending && check.variables === row.original}
              onClick={() => check.mutate(row.original)}
            >
              <Check />
              {t('cards.check')}
            </Button>
          ) : null,
      },
    ],
    [t, settles, check],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {stand.data?.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {stand.data.map((card) => (
            <Card key={card.accountId}>
              <div data-card-stand={card.accountId} className="flex flex-col gap-1.5 text-[13px]">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <CreditCard className="size-4 text-ink-3" />
                  {card.name}
                </p>
                <Figure
                  label={t('cards.bankSays')}
                  value={card.bank ? formatMoney(card.bank.balance, card.currency) : '—'}
                  hint={card.bank ? formatDateTime(card.bank.at) : t('cards.bankSilent')}
                />
                <Figure
                  label={t('cards.booksSay')}
                  value={card.booksAtBank !== null ? formatMoney(card.booksAtBank, card.currency) : '—'}
                  hint={t('cards.booksNow', { sum: formatMoney(card.books, card.currency) })}
                />
                {card.difference !== null ? (
                  <Figure
                    label={t('cards.difference')}
                    value={signed(card.difference, card.currency)}
                    tone={card.difference === 0 ? 'ok' : 'bad'}
                  />
                ) : null}
                <p className="text-xs text-ink-3">
                  {card.open.in || card.open.out
                    ? t('cards.openNotices', {
                        in: card.open.in,
                        inSum: formatMoney(card.open.inSum, card.currency),
                        out: card.open.out,
                        outSum: formatMoney(card.open.outSum, card.currency),
                      })
                    : t('cards.allSaid')}
                  {card.unconfirmed ? ` · ${t('cards.unconfirmedCount', { count: card.unconfirmed })}` : ''}
                </p>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
      <DataTable
        columns={columns}
        data={entries.data}
        loading={entries.isFetching}
        rowId={(row) => `${row.document.type}:${row.document.id}:${row.accountId}`}
        preferenceKey="card-entries"
        toolbar={<span className="text-[13px] font-semibold">{t('cards.unconfirmed')}</span>}
        empty={<EmptyState icon={Check} title={t('cards.noUnconfirmed')} />}
      />
    </div>
  )
}

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-ink-3">{label}</span>
      <span className={cn('tabular ml-auto font-medium', tone === 'ok' && 'text-ok', tone === 'bad' && 'text-bad')}>
        {value}
      </span>
      {hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
    </div>
  )
}
