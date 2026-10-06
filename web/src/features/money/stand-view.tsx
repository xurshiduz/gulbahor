import {
  dayPairRate,
  formatMoney,
  ratesOf,
  type AccountDto,
  type AnyCurrency,
  type MoneyTransferDto,
  type Rates,
  type RegisterDto,
} from '@gulbahor/core'
import { ArrowRight, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/controls'
import { Badge, EmptyState } from '@/components/ui/feedback'
import { currencyShort, placeName, rateText } from '@/features/partners/payment-lines'
import { Stat } from '@/features/reports/parts'
import { cn } from '@/lib/cn'

import { transferSums } from './exchange'
import { moneyStand, standWorth, type StandCurrency, type StandHalf, type StandPlace } from './stand'

const EVERYWHERE = 'all'

const money = (minor: number, currency: AnyCurrency) => formatMoney(minor, currency, { minor: 'auto' })

export interface StandShop {
  id: string
  name: string
}

interface MoneyStandViewProps {
  accounts: AccountDto[]
  registers: Pick<RegisterDto, 'id' | 'name'>[]
  /** Transfers sent and not yet confirmed. */
  waiting: MoneyTransferDto[]
  /** The day's rates: all of them, or the dollar's alone. */
  rates: Rates
  /** The places that hold money of their own: the choice above the figures. */
  shops: StandShop[]
  shopId: string | null
  onShop: (shopId: string | null) => void
}

/**
 * Where the money is. Each currency by itself; in it what is in hand and what
 * is a figure on a card or in a bank; in those, every place — a card by its
 * number, a drawer by its till. Seen without a session, so that a test and a
 * page thrown together to look at it can show it.
 */
export function MoneyStandView({ accounts, registers, waiting, rates, shops, shopId, onShop }: MoneyStandViewProps) {
  const { t } = useTranslation()
  const book = ratesOf(rates)
  const stand = moneyStand(accounts, registers, waiting, shopId)
  const worth = standWorth(stand, book)
  // With one currency beside the base its rate is said; with several there is no one rate to say.
  const foreign = stand.filter((item) => item.currency !== book.base)
  const single = foreign.length === 1 ? dayPairRate(foreign[0].currency, book.base, book) : null

  return (
    <div className="flex flex-col gap-4" data-stand>
      {shops.length > 1 ? (
        <div className="flex">
          <Select
            className="w-56"
            value={shopId ?? EVERYWHERE}
            onChange={(value) => onShop(value === EVERYWHERE ? null : value)}
            options={[
              { value: EVERYWHERE, label: t('stand.everywhere') },
              ...shops.map((shop) => ({ value: shop.id, label: shop.name })),
            ]}
          />
        </div>
      ) : null}

      {stand.length ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stand.map((item) => (
              <Stat
                key={item.currency}
                label={currencyShort(item.currency, t)}
                value={money(item.total, item.currency)}
                // What the sum is made of, so that the parts add up to it: money on its way is said when there is any.
                note={t(item.transit.total ? 'stand.splitTransit' : 'stand.split', {
                  cash: money(item.cash.total, item.currency),
                  cashless: money(item.cashless.total, item.currency),
                  transit: money(item.transit.total, item.currency),
                })}
                tone={item.total < 0 ? 'bad' : undefined}
              />
            ))}
            {/* Several currencies read as one sum: what the business holds, were it all so'm today. */}
            {stand.length > 1 ? (
              <Stat
                label={t('stand.allInSom')}
                value={worth === null ? '—' : money(worth, 'UZS')}
                note={
                  worth === null
                    ? t('stand.noRate')
                    : single
                      ? t('stand.atRate', { rate: rateText(single.value) })
                      : t('stand.atRates')
                }
              />
            ) : null}
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {stand.map((item) => (
              <CurrencyCard key={item.currency} item={item} whole={shopId === null} />
            ))}
          </div>
        </>
      ) : (
        <EmptyState icon={Wallet} title={t('stand.empty')} />
      )}
    </div>
  )
}

function CurrencyCard({ item, whole }: { item: StandCurrency; whole: boolean }) {
  const { t } = useTranslation()
  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-card"
      data-currency={item.currency}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{currencyShort(item.currency, t)}</h2>
        <p className={cn('tabular text-base font-semibold', item.total < 0 && 'text-bad')}>
          {money(item.total, item.currency)}
        </p>
      </header>
      <Half title={t('stand.cash')} half={item.cash} currency={item.currency} whole={whole} />
      <Half title={t('stand.cashless')} half={item.cashless} currency={item.currency} whole={whole} />
      {item.transit.transfers.length ? (
        <section data-half="transit">
          <HalfHead
            title={t('stand.transit')}
            hint={t('stand.transitHint')}
            total={money(item.transit.total, item.currency)}
          />
          <ul>
            {item.transit.transfers.map((transfer) => (
              <li key={transfer.id} className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
                <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                  <span className="font-code text-xs text-ink-3">{transfer.number}</span>
                  <span className="truncate">{transfer.fromAccountName}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-ink-3" />
                  <span className="truncate">{transfer.toAccountName}</span>
                </span>
                <span className="tabular whitespace-nowrap text-warn">{transferSums(transfer)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  )
}

function HalfHead({ title, hint, total }: { title: string; hint?: string; total: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
      <h3 className="eyebrow">
        {title}
        {hint ? <span className="font-normal tracking-normal normal-case"> · {hint}</span> : null}
      </h3>
      <span className="tabular text-[13px] font-semibold">{total}</span>
    </div>
  )
}

function Half({
  title,
  half,
  currency,
  whole,
}: {
  title: string
  half: StandHalf
  currency: AnyCurrency
  whole: boolean
}) {
  const { t } = useTranslation()
  return (
    <section data-half={title}>
      <HalfHead title={title} total={money(half.total, currency)} />
      {half.places.length ? (
        <ul>
          {half.places.map((place) => (
            <PlaceLine key={place.account.id} place={place} whole={whole} />
          ))}
        </ul>
      ) : (
        <p className="py-1.5 text-xs text-ink-3">{t('stand.none')}</p>
      )}
    </section>
  )
}

/**
 * What stands beside a place's name to tell it from another like it: a
 * drawer's till, a card's own name and bank, and — with the whole business in
 * view — the shop.
 */
function hintOf({ account, till }: StandPlace, whole: boolean): string {
  const parts: (string | null)[] = []
  if (account.kind === 'cash') {
    parts.push(till ?? account.name)
  } else {
    // A card known by its number is named by it; what the people call it follows.
    parts.push(account.kind === 'card' && account.cardNumber ? account.name : null, account.bank)
  }
  if (whole) {
    // A till named after its shop has said the shop already.
    parts.push(...account.locationNames.filter((shop) => !parts.some((part) => part?.includes(shop))))
  }
  return parts.filter(Boolean).join(' · ')
}

function PlaceLine({ place, whole }: { place: StandPlace; whole: boolean }) {
  const { t } = useTranslation()
  const { account, balance } = place
  const hint = hintOf(place, whole)
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]" data-place={account.id}>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        <span className="font-medium">{placeName(account, t)}</span>
        {hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
        {place.shared ? <Badge>{t('stand.shared')}</Badge> : null}
        {account.isActive ? null : <Badge>{t('common.archived')}</Badge>}
      </span>
      <span className={cn('tabular whitespace-nowrap', balance < 0 ? 'text-bad' : balance === 0 && 'text-ink-3')}>
        {money(balance, account.currency)}
      </span>
    </li>
  )
}
