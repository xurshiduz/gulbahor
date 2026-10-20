import { formatMoney, type HoldDto } from '@erp/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Dialog, useConfirm } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api'
import { base } from '@/lib/base'
import { formatDateTime, formatDay, formatNumber, formatPhone } from '@/lib/format'
import { toast } from '@/lib/toast'

const money = (minor: number) => formatMoney(minor, base(), { minor: 'auto' })

/** What a hold is of, in a line: the first thing, and how many more there are. */
export function holdGoods(hold: Pick<HoldDto, 'lines'>, more: (n: number) => string): string {
  const [first, ...rest] = hold.lines
  if (!first) {
    return ''
  }
  const name = first.label ? `${first.name} · ${first.label}` : first.name
  return rest.length ? `${name} ${more(rest.length)}` : name
}

/** How a hold stands, in a word: one past its day is said to be, since that is what wants a decision. */
export function HoldBadge({ hold }: { hold: Pick<HoldDto, 'status' | 'overdue'> }) {
  const { t } = useTranslation()
  if (hold.status === 'active') {
    return hold.overdue ? (
      <Badge tone="bad">{t('holds.state_overdue')}</Badge>
    ) : (
      <Badge tone="accent">{t('holds.state_active')}</Badge>
    )
  }
  return <Badge tone={hold.status === 'taken' ? 'ok' : 'neutral'}>{t(`holds.state_${hold.status}`)}</Badge>
}

interface HoldCardProps {
  hold: HoldDto
  today: string
  /** This person sells: may sell these, move their day and let them go. */
  mayAct: boolean
  onClose: () => void
  /** The customer has come: the till is opened with these goods. */
  onSell: (hold: HoldDto) => void
  onChanged: (hold: HoldDto) => void
}

/**
 * One hold: for whom, until when, and which goods. While it stands, the three things done to it are here — the
 * customer came (sell), asked for more time (the day), or is not coming (let go).
 */
export function HoldCard({ hold, today, mayAct, onClose, onSell, onChanged }: HoldCardProps) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const [dueDate, setDueDate] = useState(hold.dueDate)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'due' | 'release' | null>(null)
  const standing = hold.status === 'active'

  const act = async (what: 'due' | 'release', run: () => Promise<HoldDto>, done: (after: HoldDto) => string) => {
    setBusy(what)
    setError('')
    try {
      const after = await run()
      toast.success(done(after))
      onChanged(after)
    } catch (problem) {
      const failed = problem instanceof ApiError ? problem : null
      setError(failed?.fields?.dueDate ?? failed?.message ?? String(problem))
    } finally {
      setBusy(null)
    }
  }

  const moveDay = () =>
    act(
      'due',
      () => api.put<HoldDto>(`/holds/${hold.id}/due`, { dueDate }),
      (after) => t('holds.dueMoved', { number: after.number, due: formatDay(after.dueDate) }),
    )

  const release = async () => {
    const sure = await confirm({
      title: t('holds.releaseAsk', { number: hold.number }),
      description: t('holds.releaseHint'),
      confirmLabel: t('holds.release'),
      tone: 'danger',
    })
    if (sure) {
      await act(
        'release',
        () => api.post<HoldDto>(`/holds/${hold.id}/release`),
        (after) => t('holds.released', { number: after.number }),
      )
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`${hold.number} · ${hold.customerName}`}
      footer={
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          {standing && mayAct ? (
            <>
              <Button loading={busy === 'release'} disabled={busy === 'due'} onClick={() => void release()}>
                {t('holds.release')}
              </Button>
              <Button variant="primary" disabled={!!busy} onClick={() => onSell(hold)}>
                {t('holds.sell')}
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13px]">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <HoldBadge hold={hold} />
          <span>
            {t('holds.until')}: <span className="tabular font-medium">{formatDay(hold.dueDate)}</span>
          </span>
          <span className="text-ink-2">{hold.locationName}</span>
          {hold.customerPhone ? <span className="tabular text-ink-2">{formatPhone(hold.customerPhone)}</span> : null}
        </p>
        {hold.note ? <p className="rounded-md bg-sunken px-3 py-2 text-ink-2">{hold.note}</p> : null}

        <div className="overflow-hidden rounded-md border border-line">
          <table className="w-full">
            <thead className="bg-sunken text-left text-xs text-ink-3">
              <tr>
                <th className="px-3 py-1.5 font-medium">{t('holds.item')}</th>
                <th className="px-3 py-1.5 text-right font-medium">{t('receipts.totalQty')}</th>
                <th className="px-3 py-1.5 text-right font-medium">{t('holds.price')}</th>
                <th className="px-3 py-1.5 text-right font-medium">{t('pos.total')}</th>
              </tr>
            </thead>
            <tbody>
              {hold.lines.map((line) => (
                <tr key={line.id} className="border-t border-line">
                  <td className="px-3 py-1.5">
                    <span className="font-medium">{line.name}</span>
                    {line.label ? <span className="text-ink-2"> · {line.label}</span> : null}
                    <span className="block font-code text-xs text-ink-3">{line.sku}</span>
                  </td>
                  <td className="tabular px-3 py-1.5 text-right">{formatNumber(line.qty)}</td>
                  <td className="tabular px-3 py-1.5 text-right whitespace-nowrap">{money(line.price)}</td>
                  <td className="tabular px-3 py-1.5 text-right whitespace-nowrap">
                    {money(Math.round(line.price * line.qty))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line font-medium">
                <td className="px-3 py-1.5">{t('pos.total')}</td>
                <td className="tabular px-3 py-1.5 text-right">{formatNumber(hold.qty)}</td>
                <td />
                <td data-hold-total className="tabular px-3 py-1.5 text-right whitespace-nowrap">
                  {money(hold.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {standing ? <p className="text-xs text-ink-3">{t('holds.priceHint')}</p> : null}

        {standing && mayAct ? (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="hold-due" className="text-ink-2">
              {t('holds.due')}
            </label>
            <DateInput
              id="hold-due"
              className="w-40"
              value={dueDate}
              onChange={(value) => {
                setDueDate(value)
                setError('')
              }}
              min={today}
              invalid={!!error}
            />
            <Button
              variant="soft"
              loading={busy === 'due'}
              disabled={!dueDate || dueDate === hold.dueDate || dueDate < today || busy === 'release'}
              onClick={() => void moveDay()}
            >
              {t('holds.moveDue')}
            </Button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-bad">
            {error}
          </p>
        ) : null}

        <p className="text-xs text-ink-3">
          {t('holds.madeBy', { who: hold.createdByName ?? '—', at: formatDateTime(hold.createdAt) })}
          {hold.closedAt ? (
            <>
              {' · '}
              {t(hold.status === 'taken' ? 'holds.takenBy' : 'holds.releasedBy', {
                who: hold.closedByName ?? '—',
                at: formatDateTime(hold.closedAt),
              })}
              {hold.saleNumber ? ` · ${t('holds.sale', { number: hold.saleNumber })}` : ''}
            </>
          ) : null}
        </p>
      </div>
    </Dialog>
  )
}
