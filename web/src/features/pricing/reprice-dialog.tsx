import {
  formatMoney,
  marginPercent,
  REPRICE_KIND_LABELS,
  REPRICE_KINDS,
  REPRICE_PREVIEW_LINES,
  REPRICE_SKIP_LABELS,
  repriceSchema,
  type PriceListFilter,
  type PriceTypeDto,
  type RepriceKind,
  type RepriceResult,
} from '@gulbahor/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Calculator, Check, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox, Select } from '@/components/ui/controls'
import { Dialog, useConfirm } from '@/components/ui/dialog'
import { Shortcut } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { NumberInput } from '@/components/ui/number-input'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'

import { percentText } from './markup-rules-tab'

const FORM_ID = 'reprice-form'

interface Props {
  /** The models the price list is showing: the change covers exactly these. */
  filter: PriceListFilter
  /** The filter in words, for the person to check what is about to change. */
  scope: string
  priceTypes: PriceTypeDto[]
  /** So'm per dollar as set on the price list, offered when costing from cost. */
  uzsRate: number | null
  seesCost: boolean
  onClose: () => void
}

type Direction = 'up' | 'down'

/**
 * Changes the prices of everything the price list is filtered to. The change
 * is worked out first and shown, old price beside new; only then, and only
 * if nothing was altered since, can it be applied.
 */
export function RepriceDialog({ filter, scope, priceTypes, uzsRate, seesCost, onClose }: Props) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  const [priceTypeId, setPriceTypeId] = useState(
    () => (priceTypes.find((type) => type.kind === 'retail') ?? priceTypes[0]).id,
  )
  const type = priceTypes.find((item) => item.id === priceTypeId) as PriceTypeDto
  const others = priceTypes.filter((item) => item.id !== priceTypeId && item.currency === type.currency)

  const [kind, setKind] = useState<RepriceKind>('percent')
  const [direction, setDirection] = useState<Direction>('up')
  const [percent, setPercent] = useState<number | null>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [rate, setRate] = useState<number | null>(uzsRate)
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [round, setRound] = useState(true)
  const [note, setNote] = useState('')

  const sign = direction === 'up' ? 1 : -1
  const source = others.find((item) => item.id === sourceId) ?? others[0] ?? null

  /** The request as the fields now stand, or what is still missing. */
  const request = useMemo(() => {
    const operation =
      kind === 'percent'
        ? { kind, percent: percent === null ? undefined : sign * percent }
        : kind === 'amount'
          ? { kind, amount: amount === null ? undefined : sign * amount }
          : kind === 'markup'
            ? { kind, percent, uzsRate: type.currency === 'UZS' ? rate : null }
            : { kind, priceTypeId: source?.id, percent: percent === null ? undefined : sign * percent }
    return repriceSchema.safeParse({ priceTypeId, filter, operation, round, note })
  }, [kind, percent, amount, rate, sign, source, type.currency, priceTypeId, filter, round, note])

  // A preview belongs to the request it was worked out for; any change to the fields makes it stale.
  const key = request.success ? JSON.stringify({ ...request.data, note: undefined }) : null
  const [preview, setPreview] = useState<{ key: string; result: RepriceResult } | null>(null)
  const current = preview && preview.key === key ? preview.result : null

  const failed = (error: unknown) => toast.error(error instanceof ApiError ? error.message : String(error))

  const calculate = useMutation({
    mutationFn: (body: object) => api.post<RepriceResult>('/pricing/reprice', { ...body, dryRun: true }),
    meta: { silent: true },
    onSuccess: (result) => setPreview({ key: key as string, result }),
    onError: failed,
  })
  const apply = useMutation({
    mutationFn: (body: object) => api.post<RepriceResult>('/pricing/reprice', { ...body, dryRun: false }),
    meta: { silent: true },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['pricing'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(t('pricing.applied', { number: result.revision?.number, count: result.changed }))
      onClose()
    },
    onError: failed,
  })

  const submit = async () => {
    if (!request.success) {
      toast.error(t('pricing.fillIn'))
      return
    }
    if (!current) {
      calculate.mutate(request.data)
      return
    }
    if (!current.changed) {
      toast.error(t('pricing.nothing'))
      return
    }
    const ok = await confirm({
      title: t('pricing.applyConfirm', { count: current.changed, type: type.name }),
      description: current.belowCost
        ? t('pricing.belowCostWarning', { count: current.belowCost })
        : t('pricing.applyHint'),
      confirmLabel: t('pricing.apply'),
      tone: current.belowCost ? 'danger' : 'default',
    })
    if (ok) {
      apply.mutate(request.data)
    }
  }

  // A cost is an average and rarely a round sum; in so'm it is shown without tiyin.
  const money = (value: number, whole = false) =>
    formatMoney(value, type.currency, { symbol: false, minor: whole && type.currency === 'UZS' ? 'never' : 'auto' })
  const rounding =
    type.roundStep > 0
      ? type.roundEnding
        ? t('pricing.roundEnding', { ending: money(type.roundEnding) })
        : t('pricing.roundStep', { step: formatMoney(type.roundStep, type.currency) })
      : t('pricing.roundNone')

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('pricing.reprice')}
      description={`${t('pricing.scope')}: ${scope}`}
      size="xl"
      footer={
        <>
          {current ? (
            <span className="mr-auto flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-ink-3">
              <span>
                {t('pricing.willChange')}:{' '}
                <span className="tabular font-semibold text-ink">{formatNumber(current.changed)}</span> /{' '}
                {formatNumber(current.total)}
              </span>
              {current.skipped ? (
                <span>
                  {t('pricing.skipped')}: <span className="tabular font-semibold text-ink">{current.skipped}</span>
                </span>
              ) : null}
              {current.belowCost ? (
                <span className="flex items-center gap-1 text-bad">
                  <TriangleAlert className="size-3.5" />
                  {t('pricing.belowCost', { count: current.belowCost })}
                </span>
              ) : null}
            </span>
          ) : null}
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            loading={calculate.isPending || apply.isPending}
            disabled={!!current && !current.changed}
          >
            {current ? <Check /> : <Calculator />}
            {current ? t('pricing.apply') : t('pricing.calculate')}
            <Shortcut combo="mod+enter" className="ml-1 opacity-70" />
          </Button>
        </>
      }
    >
      <Form id={FORM_ID} onSubmit={() => void submit()} className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('pricing.priceType')}>
            {(id) => (
              <Select
                id={id}
                value={priceTypeId}
                onChange={setPriceTypeId}
                options={priceTypes.map((item) => ({ value: item.id, label: item.name }))}
              />
            )}
          </Field>
          <Field label={t('pricing.operation')}>
            {(id) => (
              <Select
                id={id}
                value={kind}
                onChange={(value) => setKind(value as RepriceKind)}
                options={REPRICE_KINDS.filter((item) => item !== 'from_type' || others.length).map((item) => ({
                  value: item,
                  label: REPRICE_KIND_LABELS[item],
                }))}
              />
            )}
          </Field>

          {kind === 'from_type' ? (
            <Field label={t('pricing.source')}>
              {(id) => (
                <Select
                  id={id}
                  value={source?.id ?? ''}
                  onChange={setSourceId}
                  options={others.map((item) => ({ value: item.id, label: item.name }))}
                />
              )}
            </Field>
          ) : null}
          {kind !== 'markup' ? (
            <Field label={t('pricing.direction')}>
              {(id) => (
                <Select
                  id={id}
                  value={direction}
                  onChange={(value) => setDirection(value as Direction)}
                  options={[
                    { value: 'up', label: kind === 'from_type' ? t('pricing.dearer') : t('pricing.raise') },
                    { value: 'down', label: kind === 'from_type' ? t('pricing.cheaper') : t('pricing.lower') },
                  ]}
                />
              )}
            </Field>
          ) : null}
          {kind === 'amount' ? (
            <Field label={t('pricing.amount')} required>
              {(id) => <MoneyInput id={id} autoFocus value={amount} onChange={setAmount} currency={type.currency} />}
            </Field>
          ) : (
            <Field
              label={kind === 'markup' ? t('pricing.markup') : t('pricing.percent')}
              hint={kind === 'markup' ? t('pricing.markupEmpty') : undefined}
              required={kind !== 'markup'}
            >
              {(id) => (
                <NumberInput
                  id={id}
                  autoFocus
                  value={percent}
                  onChange={setPercent}
                  decimals={2}
                  max={direction === 'down' && kind !== 'markup' ? 99 : 10_000}
                  suffix="%"
                  placeholder={kind === 'markup' ? t('pricing.byRule') : undefined}
                />
              )}
            </Field>
          )}
          {kind === 'markup' && type.currency === 'UZS' ? (
            <Field label={t('pricing.rate')} hint={t('pricing.rateHint')}>
              {(id) => <NumberInput id={id} value={rate} onChange={setRate} decimals={2} max={1_000_000} />}
            </Field>
          ) : null}
        </div>

        <div className="grid items-start gap-4 sm:grid-cols-[auto_1fr]">
          <div data-enter-skip className="pt-1">
            <Checkbox
              checked={round && type.roundStep > 0}
              onChange={setRound}
              disabled={type.roundStep === 0}
              label={t('pricing.round')}
              hint={rounding}
            />
          </div>
          <Field label={t('receipts.note')}>
            {(id) => <Input id={id} value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />}
          </Field>
        </div>

        {current ? (
          <Preview result={current} money={money} seesCost={seesCost} />
        ) : (
          <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-3">
            {t('pricing.previewHint')}
          </p>
        )}
      </Form>
    </Dialog>
  )
}

function Preview({
  result,
  money,
  seesCost,
}: {
  result: RepriceResult
  money: (value: number, whole?: boolean) => string
  seesCost: boolean
}) {
  const { t } = useTranslation()
  if (!result.lines.length) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-3">
        {t('pricing.nothing')}
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-sunken text-left text-xs text-ink-3">
          <tr>
            <th className="px-3 py-2 font-medium">{t('products.sku')}</th>
            <th className="px-3 py-2 font-medium">{t('products.name')}</th>
            {seesCost ? <th className="px-3 py-2 text-right font-medium">{t('pricing.cost')}</th> : null}
            <th className="px-3 py-2 text-right font-medium">{t('pricing.old')}</th>
            <th className="w-px" />
            <th className="px-3 py-2 text-right font-medium">{t('pricing.next')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('pricing.change')}</th>
            {seesCost ? <th className="px-3 py-2 text-right font-medium">{t('pricing.margin')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {result.lines.map((line) => {
            const change = line.old && line.next !== null ? marginPercent(line.next, line.old) : null
            const margin = line.next !== null ? marginPercent(line.next, line.unitCost) : null
            return (
              <tr key={line.productId} className={cn('border-t border-line', line.skip && 'text-ink-3')}>
                <td className="font-code px-3 py-1.5 text-xs text-ink-3">{line.sku}</td>
                <td className="px-3 py-1.5">{line.name}</td>
                {seesCost ? (
                  <td className="tabular px-3 py-1.5 text-right text-ink-2">
                    {line.unitCost === null ? '—' : money(line.unitCost, true)}
                  </td>
                ) : null}
                <td className="tabular px-3 py-1.5 text-right">{line.old === null ? '—' : money(line.old)}</td>
                <td className="text-ink-3">{line.skip ? null : <ArrowRight className="size-3.5" />}</td>
                <td className="tabular px-3 py-1.5 text-right font-semibold">
                  {line.skip ? (
                    <span className="font-normal">{REPRICE_SKIP_LABELS[line.skip]}</span>
                  ) : (
                    money(line.next as number)
                  )}
                </td>
                <td
                  className={cn(
                    'tabular px-3 py-1.5 text-right',
                    change === null ? 'text-ink-3' : change < 0 ? 'text-bad' : 'text-ok',
                  )}
                >
                  {change === null ? '' : percentText(change)}
                </td>
                {seesCost ? (
                  <td className={cn('tabular px-3 py-1.5 text-right', margin !== null && margin < 0 && 'text-bad')}>
                    {margin === null ? '' : percentText(margin)}
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
      {result.changed + result.skipped > REPRICE_PREVIEW_LINES ? (
        <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
          {t('pricing.previewCut', { shown: REPRICE_PREVIEW_LINES })}
        </p>
      ) : null}
    </div>
  )
}
