import { formatMoney, type CardPickDto } from '@erp/core'
import { useQuery } from '@tanstack/react-query'
import { Check, Landmark } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { cn } from '@/lib/cn'

/**
 * What the banks wrote of the cards this person may use, still said of by nobody: offered beside a card's line in
 * a payment window, so the money is picked from what came rather than typed (KEYINGI-REJA, 18-bo'lim, T2).
 */
export function useCardPicks(direction: 'in' | 'out', enabled: boolean): CardPickDto[] {
  const picks = useQuery({
    queryKey: ['card-notices', 'picks', direction],
    queryFn: ({ signal }) => api.get<CardPickDto[]>('/card-notices/picks', { direction }, signal),
    enabled,
  })
  return picks.data ?? []
}

/** A notice a window is opened for, to write the document its money was: its card, its sum, its way. */
export interface NoticeStart {
  id: string
  accountId: string
  amount: number
  direction: 'in' | 'out'
}

/** The bank's minute, short: today's by the clock alone. */
export function pickTime(pick: Pick<CardPickDto, 'at' | 'receivedAt'>, today = new Date()): string {
  const at = pick.at ?? localMinute(new Date(pick.receivedAt))
  const [day, time] = at.split('T')
  const [, month, date] = day.split('-')
  return day === localMinute(today).slice(0, 10) ? time : `${date}.${month} ${time}`
}

const localMinute = (when: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `T${pad(when.getHours())}:${pad(when.getMinutes())}`
  )
}

/** How many a line offers: the newest. Older ones are on the card notices page. */
const SHOWN = 6

/**
 * The notices of one card beside its line: each a button with when and how much. Picked, the line's sum is theirs;
 * typing another sum lets them go. Enter passes them by — they are a click, or a Tab, away.
 */
export function NoticePicks({
  picks,
  chosen,
  onChange,
  className,
}: {
  /** This card's, newest first. */
  picks: CardPickDto[]
  chosen: string[]
  onChange: (ids: string[], sum: number) => void
  className?: string
}) {
  const { t } = useTranslation()
  // What is picked stays in sight even when newer ones would push it out.
  const shown = [
    ...picks.filter((pick) => chosen.includes(pick.id)),
    ...picks.filter((pick) => !chosen.includes(pick.id)),
  ].slice(0, Math.max(SHOWN, chosen.length))
  if (!shown.length) {
    return null
  }
  const toggle = (id: string) => {
    const ids = chosen.includes(id) ? chosen.filter((item) => item !== id) : [...chosen, id]
    onChange(
      ids,
      picks.filter((pick) => ids.includes(pick.id)).reduce((sum, pick) => sum + pick.amount, 0),
    )
  }
  return (
    <div data-enter-skip data-card-picks className={cn('flex flex-wrap items-center justify-end gap-1', className)}>
      <span className="flex items-center gap-1 text-xs text-ink-3" title={t('cards.picksHint')}>
        <Landmark className="size-3.5" />
        {t('cards.fromBank')}
      </span>
      {shown.map((pick) => {
        const on = chosen.includes(pick.id)
        return (
          <button
            key={pick.id}
            type="button"
            data-pick={pick.id}
            aria-pressed={on}
            title={[pick.heading, pick.place].filter(Boolean).join(' · ')}
            onClick={() => toggle(pick.id)}
            className={cn(
              'tabular flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors',
              on
                ? 'border-ok bg-ok-soft text-ok'
                : 'border-line text-ink-2 hover:border-line-strong hover:bg-sunken hover:text-ink',
            )}
          >
            {on ? <Check className="size-3" /> : null}
            <span className="text-ink-3">{pickTime(pick)}</span>
            {formatMoney(pick.amount, pick.currency, { minor: 'auto' })}
          </button>
        )
      })}
    </div>
  )
}
