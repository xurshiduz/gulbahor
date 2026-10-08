import {
  CURRENCIES,
  formatMoney,
  RATE_DECIMALS,
  rateFormChoices,
  rateWording,
  type AnyCurrency,
  type CurrenciesDto,
  type CurrencyDto,
  type RateForm,
} from '@erp/core'
import type { TFunction } from 'i18next'
import { Check, MoreHorizontal, PowerOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Menu, type MenuItem } from '@/components/ui/controls'
import { Badge } from '@/components/ui/feedback'
import { Form } from '@/components/ui/form'
import { NumberInput } from '@/components/ui/number-input'
import { rateText } from '@/features/partners/payment-lines'
import { cn } from '@/lib/cn'
import { formatDay } from '@/lib/format'

/** A currency by its name in the language of the screen. */
export const currencyName = (code: AnyCurrency, t: TFunction) =>
  t(`currencies.names.${code}`, { defaultValue: CURRENCIES[code].name })

const sign = (code: AnyCurrency) => CURRENCIES[code].symbol

/** A rate as it is read: "1 $ = 7,25 ¥"; with no number, the shape of it: "1 $ = … ¥". */
export function rateSentence(code: AnyCurrency, form: RateForm, value?: number): string {
  const { one, of } = rateWording(code, form)
  return `1 ${sign(one)} = ${value === undefined ? '…' : rateText(value)} ${sign(of)}`
}

const sameForm = (a: RateForm, b: RateForm) => a.against === b.against && a.way === b.way

/** The ways a currency's rate may be written: against the base or any other currency it does not carry. */
function formsFor(code: AnyCurrency, currencies: CurrenciesDto): RateForm[] {
  const forms: Partial<Record<AnyCurrency, RateForm>> = {}
  for (const currency of currencies.active) {
    if (currency.form) {
      forms[currency.code] = currency.form
    }
  }
  return rateFormChoices(code, currencies.base, forms)
}

interface CurrenciesViewProps {
  currencies: CurrenciesDto
  /** May switch currencies on and off, and say how a rate is written. */
  canManage: boolean
  /** May set rates. */
  canRate: boolean
  /** The currency whose rate is on its way to the server. */
  saving?: AnyCurrency | null
  onRate: (currency: CurrencyDto, value: number) => void
  onEnable: (code: AnyCurrency, form?: RateForm) => void
  onDisable: (currency: CurrencyDto) => void
}

/**
 * The currencies of a business, a line each: the base, which has no rate,
 * and under it every other with its one number, written as a sentence —
 * "1 $ = 7,25 ¥". What that makes one of it worth in the base stands beside
 * it, worked out, never typed. Seen without a session, so that a test and a
 * page thrown together to look at it can show it.
 */
export function CurrenciesView({
  currencies,
  canManage,
  canRate,
  saving,
  onRate,
  onEnable,
  onDisable,
}: CurrenciesViewProps) {
  const { t } = useTranslation()
  return (
    <section className="rounded-lg border border-line bg-surface shadow-card" data-currencies>
      <ul className="divide-y divide-line">
        {currencies.active.map((currency) => (
          <CurrencyRow
            // What the server holds is what the field starts from: a rate set elsewhere is not left behind a stale one.
            key={`${currency.code}:${currency.rate?.value ?? ''}:${currency.form?.against ?? ''}:${currency.form?.way ?? ''}`}
            currency={currency}
            currencies={currencies}
            canManage={canManage}
            canRate={canRate}
            saving={saving === currency.code}
            onRate={onRate}
            onEnable={onEnable}
            onDisable={onDisable}
          />
        ))}
      </ul>
      {canManage && currencies.available.length ? (
        <div className="border-t border-line p-3" data-enter-skip>
          <Combobox
            className="w-72"
            placeholder={t('currencies.add')}
            options={currencies.available.map((code) => ({
              value: code,
              label: currencyName(code, t),
              hint: code,
            }))}
            value={null}
            onChange={(code) => (code ? onEnable(code as AnyCurrency) : undefined)}
          />
        </div>
      ) : null}
    </section>
  )
}

interface CurrencyRowProps extends Omit<CurrenciesViewProps, 'saving'> {
  currency: CurrencyDto
  saving: boolean
}

function CurrencyRow({
  currency,
  currencies,
  canManage,
  canRate,
  saving,
  onRate,
  onEnable,
  onDisable,
}: CurrencyRowProps) {
  const { t } = useTranslation()
  const { code, form, rate } = currency
  // A rate written another way than it is now asked for is not a number to start from.
  const current = rate && form && sameForm(rate, form) ? rate.value : null
  const [value, setValue] = useState<number | null>(current)

  if (currency.base || !form) {
    return (
      <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3" data-currency={code}>
        <span className="font-medium">{currencyName(code, t)}</span>
        <span className="font-code text-xs text-ink-3">{code}</span>
        <Badge tone="accent">{t('currencies.base')}</Badge>
        <span className="text-xs text-ink-3">{t('currencies.baseNote')}</span>
      </li>
    )
  }

  const { one, of } = rateWording(code, form)
  const others = formsFor(code, currencies)
  const menu: (MenuItem | 'separator')[] = [
    ...(canManage
      ? [
          ...others.map((option) => ({
            label: rateSentence(code, option),
            icon: sameForm(option, form) ? <Check /> : <span className="size-4" />,
            onSelect: () => (sameForm(option, form) ? undefined : onEnable(code, option)),
          })),
          'separator' as const,
        ]
      : []),
    ...(canManage
      ? [
          {
            label: t('currencies.putAway'),
            icon: <PowerOff />,
            tone: 'danger' as const,
            onSelect: () => onDisable(currency),
          },
        ]
      : []),
  ]

  // What stands under the rate: who set it and when, or why the currency cannot be counted yet.
  const wanting = !rate
    ? t('currencies.noRate')
    : currency.missing && currency.missing !== code
      ? t('currencies.needs', { name: currencyName(currency.missing, t) })
      : null
  const stamp = rate
    ? [
        current === null ? t('currencies.oldForm', { rate: rateSentence(code, rate, rate.value) }) : null,
        `${formatDay(rate.date)}${rate.setByName ? ` · ${rate.setByName}` : ''}`,
        currency.stale ? t('currencies.stale') : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <li
      className="grid items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto]"
      data-currency={code}
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{currencyName(code, t)}</p>
        <p className="font-code text-xs text-ink-3">{code}</p>
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        {canRate ? (
          <Form
            className="flex-row flex-wrap items-center gap-2"
            onSubmit={() => (value !== null && value !== current ? onRate(currency, value) : undefined)}
          >
            <span className="tabular text-sm whitespace-nowrap">1 {sign(one)} =</span>
            <NumberInput
              className="w-32"
              value={value}
              onChange={setValue}
              decimals={RATE_DECIMALS}
              max={1_000_000_000}
              placeholder={current === null ? '' : rateText(current)}
            />
            <span className="text-sm whitespace-nowrap">{sign(of)}</span>
            <Button
              type="submit"
              size="sm"
              variant="soft"
              loading={saving}
              disabled={value === null || value === current}
            >
              {t('common.save')}
            </Button>
          </Form>
        ) : (
          <p className="tabular text-sm">{rate ? rateSentence(code, rate, rate.value) : '—'}</p>
        )}
        <p className={cn('text-xs', wanting || currency.stale ? 'text-warn' : 'text-ink-3')} data-note>
          {[wanting, stamp].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="flex items-center gap-2 justify-self-end">
        {/* Written in the base, the rate is its own worth; written against another currency, the worth is worked out. */}
        {currency.worth && form.against !== currencies.base ? (
          <span className="tabular text-xs whitespace-nowrap text-ink-2" data-worth>
            1 {sign(code)} ≈ {formatMoney(Math.round(Number(currency.worth) * 100), currencies.base, { minor: 'auto' })}
          </span>
        ) : null}
        {menu.length ? (
          <Menu
            trigger={
              <Button variant="ghost" size="iconSm" tabIndex={-1} aria-label={t('common.actions')}>
                <MoreHorizontal />
              </Button>
            }
            items={menu}
          />
        ) : null}
      </div>
    </li>
  )
}
