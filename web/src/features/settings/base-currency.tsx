import { ALL_CURRENCY_CODES, CURRENCIES, type AnyCurrency, type BaseCurrencyDto, type CostCurrencyDto } from '@erp/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { useConfirm } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Card } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api, ApiError } from '@/lib/api'
import { toast } from '@/lib/toast'

/** "Qozog‘iston tengesi (KZT)": a currency as the list of them names it. */
const named = (code: AnyCurrency, t: (key: string) => string) => `${t(`currencies.names.${code}`)} (${code})`

/**
 * What the business keeps its books, prices and receipts in. The owner may
 * choose another until the first money is written or the first goods come
 * in; from then on it is only shown, with what fixed it.
 */
export function BaseCurrencyCard() {
  const { t } = useTranslation()
  const { me } = useSession()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [next, setNext] = useState<AnyCurrency | null>(null)
  const [error, setError] = useState<string | null>(null)

  const state = useQuery({
    queryKey: ['money', 'base'],
    queryFn: ({ signal }) => api.get<BaseCurrencyDto>('/currencies/base', undefined, signal),
  })
  const current = state.data?.base ?? me.org.baseCurrency
  const mayChange = me.user.isOwner && state.data?.locked === null

  const change = useMutation({
    mutationFn: (currency: AnyCurrency) => api.put<BaseCurrencyDto>('/currencies/base', { currency }),
    onSuccess: () => {
      // Every sum on every screen is in it: everything is asked for afresh.
      void queryClient.invalidateQueries()
      setNext(null)
      toast.success(t('baseCurrency.changed'))
    },
    onError: (failure) => {
      setError(failure instanceof ApiError ? (failure.fields?.currency ?? failure.message) : String(failure))
    },
  })

  const ask = async () => {
    if (!next || next === current) {
      return
    }
    setError(null)
    const ok = await confirm({
      title: t('baseCurrency.confirm', { from: named(current, t), to: named(next, t) }),
      description: [
        state.data?.prices ? t('baseCurrency.confirmPrices', { count: state.data.prices }) : null,
        t('baseCurrency.confirmFixed'),
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: t('baseCurrency.change'),
    })
    if (ok) {
      change.mutate(next)
    }
  }

  return (
    <Card title={t('baseCurrency.title')}>
      {mayChange ? (
        <div className="flex flex-col gap-3">
          <Field label={t('baseCurrency.label')} hint={t('baseCurrency.hint')} error={error ?? undefined}>
            {(id) => (
              <div className="flex flex-wrap items-center gap-2">
                <Combobox
                  id={id}
                  className="w-72"
                  options={ALL_CURRENCY_CODES.map((code) => ({
                    value: code,
                    label: named(code, t),
                    hint: CURRENCIES[code].symbol,
                  }))}
                  value={next ?? current}
                  onChange={(value) => {
                    setNext((value as AnyCurrency | null) ?? null)
                    setError(null)
                  }}
                  invalid={!!error}
                />
                <Button
                  variant="primary"
                  disabled={!next || next === current}
                  loading={change.isPending}
                  onClick={() => void ask()}
                >
                  {t('baseCurrency.change')}
                </Button>
              </div>
            )}
          </Field>
        </div>
      ) : (
        <div className="flex items-start gap-3 text-[13px]">
          <span className="font-medium text-ink">{named(current, t)}</span>
          {state.data?.locked ? (
            <span className="inline-flex items-center gap-1.5 text-ink-3">
              <Lock className="size-3.5" />
              {t(`baseCurrency.locked.${state.data.locked}`)}
            </span>
          ) : !me.user.isOwner ? (
            <span className="text-ink-3">{t('baseCurrency.ownerOnly')}</span>
          ) : null}
        </div>
      )}
    </Card>
  )
}

/**
 * What the business keeps its costs in beside its base: dollars where it
 * buys in them and wants its stock in them too, or the base alone. The owner
 * chooses it from the currencies switched on, until goods are costed.
 */
export function CostCurrencyCard() {
  const { t } = useTranslation()
  const { me } = useSession()
  const queryClient = useQueryClient()
  const [next, setNext] = useState<AnyCurrency | null>(null)
  const [error, setError] = useState<string | null>(null)

  const state = useQuery({
    queryKey: ['money', 'cost'],
    queryFn: ({ signal }) => api.get<CostCurrencyDto>('/currencies/cost', undefined, signal),
  })
  const base = me.org.baseCurrency
  const current = state.data?.cost ?? me.org.costCurrency
  const mayChange = me.user.isOwner && state.data?.locked === null
  const label = (code: AnyCurrency) =>
    code === base ? t('costCurrency.none', { base: named(base, t) }) : named(code, t)

  const change = useMutation({
    mutationFn: (currency: AnyCurrency) => api.put<CostCurrencyDto>('/currencies/cost', { currency }),
    onSuccess: () => {
      void queryClient.invalidateQueries()
      setNext(null)
      toast.success(t('costCurrency.changed'))
    },
    onError: (failure) => {
      setError(failure instanceof ApiError ? (failure.fields?.currency ?? failure.message) : String(failure))
    },
  })

  return (
    <Card title={t('costCurrency.title')}>
      {mayChange ? (
        <Field label={t('costCurrency.label')} hint={t('costCurrency.hint')} error={error ?? undefined}>
          {(id) => (
            <div className="flex flex-wrap items-center gap-2">
              <Combobox
                id={id}
                className="w-72"
                options={[base, ...me.org.currencies].map((code) => ({
                  value: code,
                  label: label(code),
                  hint: CURRENCIES[code].symbol,
                }))}
                value={next ?? current}
                onChange={(value) => {
                  setNext((value as AnyCurrency | null) ?? null)
                  setError(null)
                }}
                invalid={!!error}
              />
              <Button
                variant="primary"
                disabled={!next || next === current}
                loading={change.isPending}
                onClick={() => (next ? change.mutate(next) : undefined)}
              >
                {t('baseCurrency.change')}
              </Button>
            </div>
          )}
        </Field>
      ) : (
        <div className="flex items-start gap-3 text-[13px]">
          <span className="font-medium text-ink">{label(current)}</span>
          {state.data?.locked ? (
            <span className="inline-flex items-center gap-1.5 text-ink-3">
              <Lock className="size-3.5" />
              {t(`costCurrency.locked.${state.data.locked}`)}
            </span>
          ) : !me.user.isOwner ? (
            <span className="text-ink-3">{t('baseCurrency.ownerOnly')}</span>
          ) : null}
        </div>
      )}
    </Card>
  )
}
