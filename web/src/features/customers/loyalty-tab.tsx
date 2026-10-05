import { formatMoney, loyaltyInputSchema, type LoyaltyTier } from '@gulbahor/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { MoneyInput } from '@/components/ui/money-input'
import { NumberInput } from '@/components/ui/number-input'
import { useSession } from '@/features/auth/session'
import { api, ApiError } from '@/lib/api'
import { toast } from '@/lib/toast'

interface Row {
  key: number
  from: number | null
  percent: number | null
}

let counter = 0
const row = (tier?: LoyaltyTier): Row => ({ key: ++counter, from: tier?.from ?? null, percent: tier?.percent ?? null })

/** The steps as they are sent: only the rows that are filled in, lowest sum first. */
export function tiersOf(rows: Row[]): LoyaltyTier[] {
  return rows
    .flatMap((item) => (item.from !== null && item.percent ? [{ from: item.from, percent: item.percent }] : []))
    .sort((a, b) => a.from - b.from)
}

const money = (minor: number) => formatMoney(minor, 'UZS', { minor: 'auto' })

/**
 * The loyalty programme: a ladder of sums, and what having bought for each
 * earns. What a customer has bought is read from their receipts, so nothing
 * is entered per customer; the step they have reached comes off their next
 * purchases by itself.
 */
export function LoyaltyTab() {
  const { t } = useTranslation()
  const { can } = useSession()
  const queryClient = useQueryClient()
  const canManage = can('customers.manage')
  const saved = useQuery({
    queryKey: ['customers', 'loyalty'],
    queryFn: ({ signal }) => api.get<LoyaltyTier[]>('/customers/loyalty', undefined, signal),
  })
  const [rows, setRows] = useState<Row[] | null>(null)
  const [dirty, setDirty] = useState(false)

  // What is saved fills the rows, until someone starts changing them.
  useEffect(() => {
    if (saved.data && !dirty) {
      setRows(saved.data.map((tier) => row(tier)))
    }
  }, [saved.data, dirty])

  const change = (next: Row[]) => {
    setRows(next)
    setDirty(true)
  }
  const patch = (key: number, part: Partial<Row>) =>
    change((rows ?? []).map((item) => (item.key === key ? { ...item, ...part } : item)))

  const save = useMutation({
    mutationFn: (input: unknown) => api.put<LoyaltyTier[]>('/customers/loyalty', input),
    onSuccess: (tiers) => {
      queryClient.setQueryData(['customers', 'loyalty'], tiers)
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      setRows(tiers.map((tier) => row(tier)))
      setDirty(false)
      toast.success(t('common.saved'))
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : String(error)),
  })
  const submit = () => {
    const parsed = loyaltyInputSchema.safeParse({ tiers: tiersOf(rows ?? []) })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? t('customers.loyaltyBad'))
      return
    }
    save.mutate(parsed.data)
  }

  if (!rows) {
    return null
  }
  if (!rows.length && !canManage) {
    return <EmptyState icon={Plus} title={t('customers.noLoyalty')} />
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <p className="text-[13px] text-ink-2">{t('customers.loyaltyHint')}</p>
      <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
        <div className="grid grid-cols-[minmax(0,1fr)_8rem_1.75rem] gap-2 text-[11px] font-semibold tracking-[0.04em] text-ink-3 uppercase">
          <span>{t('customers.boughtFor')}</span>
          <span className="text-right">{t('pos.discount')}</span>
          <span />
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {rows.map((item) =>
            canManage ? (
              <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_8rem_1.75rem] items-center gap-2">
                <MoneyInput value={item.from} onChange={(from) => patch(item.key, { from })} currency="UZS" />
                <NumberInput
                  value={item.percent}
                  onChange={(percent) => patch(item.key, { percent })}
                  decimals={2}
                  max={100}
                  suffix="%"
                  className="[&_input]:text-right"
                />
                <Button
                  variant="ghost"
                  size="iconSm"
                  tabIndex={-1}
                  aria-label={t('common.delete')}
                  onClick={() => change(rows.filter((other) => other.key !== item.key))}
                >
                  <X />
                </Button>
              </div>
            ) : (
              <div
                key={item.key}
                className="grid grid-cols-[minmax(0,1fr)_8rem_1.75rem] items-center gap-2 text-[13px]"
              >
                <span className="tabular">{money(item.from ?? 0)}</span>
                <span className="tabular text-right font-medium">{String(item.percent).replace('.', ',')}%</span>
                <span />
              </div>
            ),
          )}
          {!rows.length ? <p className="text-[13px] text-ink-3">{t('customers.noLoyalty')}</p> : null}
        </div>
        {canManage ? (
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
            <Button variant="soft" onClick={() => change([...rows, row()])}>
              <Plus />
              {t('customers.addTier')}
            </Button>
            <Button variant="primary" className="ml-auto" disabled={!dirty} loading={save.isPending} onClick={submit}>
              {t('common.save')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
