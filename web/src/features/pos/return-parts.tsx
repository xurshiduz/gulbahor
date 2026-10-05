import {
  formatMoney,
  PAYMENT_METHOD_LABELS,
  paymentLabel,
  returnShare,
  type ReturnableDto,
  type ReturnDto,
  type SaleLineDto,
} from '@gulbahor/core'
import { useQuery } from '@tanstack/react-query'
import { Printer, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Badge, Spinner } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { controlClass, Input } from '@/components/ui/input'
import { NumberInput } from '@/components/ui/number-input'
import { useSession } from '@/features/auth/session'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatDateTime, formatNumber } from '@/lib/format'
import { printElement } from '@/lib/print'
import { useScanner } from '@/lib/scanner'
import { toast } from '@/lib/toast'

import type { Returning } from './pos-state'

const money = (minor: number, currency: 'UZS' | 'USD' = 'UZS') => formatMoney(minor, currency, { minor: 'auto' })

const leftOf = (line: SaleLineDto) => Math.round((line.qty - line.returnedQty) * 1000) / 1000

/** The lines a tag or a one-thing receipt already points at: one of that, nothing of the rest. */
function preset(found: ReturnableDto): Record<string, number> {
  const open = found.sale.lines.filter((line) => leftOf(line) > 0)
  const line = open.find((item) => item.id === found.lineId) ?? (open.length === 1 ? open[0] : null)
  return line ? { [line.id]: Math.min(1, leftOf(line)) } : {}
}

interface ReturnPickerProps {
  /** A receipt's number or a tag to look up at once. */
  code?: string
  /** What was picked before, to change it. */
  current?: Returning | null
  /** Someone at the shop can allow what this cashier may not: late goods are then picked, and asked for at the till. */
  mayAsk?: boolean
  onPick: (returning: Returning) => void
  onClose: () => void
}

/**
 * Bringing goods back starts here: the receipt is found by its number or by
 * the tag of a piece it sold, and the cashier says how many of which lines
 * have come back. The money, or the goods taken instead, are dealt with on
 * the till itself.
 */
export function ReturnPicker({ code, current, mayAsk, onPick, onClose }: ReturnPickerProps) {
  const { t } = useTranslation()
  const [text, setText] = useState(code ?? '')
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState<ReturnableDto | null>(current?.found ?? null)
  const [qty, setQty] = useState<Record<string, number>>(current?.qty ?? {})
  const [reason, setReason] = useState(current?.reason ?? '')
  const bodyRef = useRef<HTMLDivElement>(null)

  const lookup = (value: string) => {
    if (!value.trim() || busy) {
      return
    }
    setBusy(true)
    api
      .get<ReturnableDto>('/returns/lookup', { code: value.trim() })
      .then((result) => {
        setFound(result)
        setQty(preset(result))
        setText('')
      })
      .catch((error: unknown) => toast.error(error instanceof ApiError ? error.message : String(error)))
      .finally(() => setBusy(false))
  }

  // A receipt found: on to the quantities.
  const foundId = found?.sale.id
  useEffect(() => {
    if (foundId) {
      const field = bodyRef.current?.querySelector<HTMLInputElement>('table input:not(:disabled)')
      field?.focus()
      field?.select()
    }
  }, [foundId])

  // A receipt or a tag scanned while the dialog is open is the one to bring back.
  useScanner(lookup)
  useEffect(() => {
    if (code) {
      lookup(code)
    }
    // Once: the code the dialog was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lines = found?.sale.lines ?? []
  const total = lines.reduce((sum, line) => sum + (qty[line.id] ? returnShare(line, qty[line.id]) : 0), 0)
  const picked = lines.some((line) => qty[line.id])
  const asks = !!found && found.late && !found.free
  const refused = asks && !mayAsk

  const confirm = () => {
    if (!found || !picked) {
      toast.error(t('pos.returnNothing'))
      return
    }
    if (refused) {
      toast.error(t('pos.returnLateDenied'))
      return
    }
    onPick({ found, qty, reason: reason.trim() })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={found ? `${t('pos.returnTitle')} · ${found.sale.number}` : t('pos.returnTitle')}
      description={
        found
          ? [formatDateTime(found.sale.soldAt), found.sale.locationName, found.sale.cashierName]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
      footer={
        <>
          {found ? (
            <span className="tabular mr-auto text-sm font-semibold">
              {t('pos.returnValue')}: {money(total)}
            </span>
          ) : null}
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="return-pick" variant="primary" disabled={!picked || refused}>
            {t('pos.returnToTill')}
          </Button>
        </>
      }
    >
      <div ref={bodyRef} className="flex flex-col gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" />
          <input
            value={text}
            autoFocus={!found}
            autoComplete="off"
            spellCheck={false}
            placeholder={t('pos.returnFind')}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !(event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                lookup(text)
              }
            }}
            className={cn(controlClass, 'pl-8')}
          />
          {busy ? <Spinner className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2" /> : null}
        </div>

        {found ? (
          <Form id="return-pick" onSubmit={confirm}>
            {found.late ? (
              <p
                className={cn(
                  'rounded-md px-3 py-2 text-xs',
                  refused ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn',
                )}
              >
                {t('pos.returnLate', { days: found.returnDays })}
                {refused ? `. ${t('pos.returnLateDenied')}` : asks ? `. ${t('pos.returnLateAsk')}` : ''}
              </p>
            ) : null}
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] font-semibold tracking-[0.04em] text-ink-3 uppercase">
                <tr>
                  <th className="py-1.5 pr-2">{t('products.name')}</th>
                  <th className="w-20 px-2 py-1.5 text-right">{t('pos.returnSold')}</th>
                  <th className="w-24 px-2 py-1.5 text-right">{t('pos.returnQty')}</th>
                  <th className="w-32 py-1.5 pl-2 text-right">{t('pos.returnValue')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const left = leftOf(line)
                  return (
                    <tr key={line.id} className={cn('border-t border-line align-middle', !left && 'text-ink-3')}>
                      <td className="py-1.5 pr-2">
                        <p className="font-medium">
                          {line.productName}
                          {line.label ? <span className="font-normal text-ink-2"> · {line.label}</span> : null}
                        </p>
                        <p className="text-xs text-ink-3">
                          <span className="font-code">{line.sku}</span>
                          {line.returnedQty
                            ? ` · ${t('sales.returnedMark', { qty: formatNumber(line.returnedQty) })}`
                            : ''}
                        </p>
                      </td>
                      <td className="tabular px-2 py-1.5 text-right">{formatNumber(line.qty)}</td>
                      <td className="px-2 py-1.5">
                        <NumberInput
                          value={qty[line.id] ?? null}
                          onChange={(value) => setQty((current) => ({ ...current, [line.id]: value ?? 0 }))}
                          // Cloth sold by the metre comes back by the metre; a piece comes back whole.
                          decimals={Number.isInteger(line.qty) ? 0 : 3}
                          max={left}
                          disabled={!left}
                          placeholder="0"
                          className="[&_input]:text-right"
                        />
                      </td>
                      <td className="tabular py-1.5 pl-2 text-right font-medium">
                        {qty[line.id] ? money(returnShare(line, qty[line.id])) : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Field label={t('pos.returnReason')}>
              {(id) => (
                <Input id={id} value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} />
              )}
            </Field>
          </Form>
        ) : null}
      </div>
    </Dialog>
  )
}

/** A return as its slip: what came back, on which receipt, and where its worth went. */
export function ReturnDialog({ returnId, onClose }: { returnId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const { me } = useSession()
  const slipRef = useRef<HTMLDivElement>(null)
  const query = useQuery({
    queryKey: ['returns', 'one', returnId],
    queryFn: ({ signal }) => api.get<ReturnDto>(`/returns/${returnId}`, undefined, signal),
  })
  const data = query.data

  return (
    <Dialog
      open
      onClose={onClose}
      title={data ? `${t('sales.returnOne')} ${data.number}` : t('sales.returnOne')}
      description={data ? `${data.locationName} · ${data.registerName} · ${data.shiftNumber}` : undefined}
      footer={
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button
            variant="primary"
            onClick={() => (slipRef.current ? printElement(slipRef.current) : undefined)}
            disabled={!data}
          >
            <Printer />
            {t('sales.print')}
          </Button>
        </>
      }
    >
      {!data ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      ) : (
        <div ref={slipRef} className="text-[13px]">
          <div className="text-center">
            <p className="text-sm font-semibold">{me.org.name}</p>
            <p className="text-xs text-ink-3">{data.locationName}</p>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-ink-2">
            <span className="font-code">
              {data.number} · {data.saleNumber}
            </span>
            <span className="tabular">{formatDateTime(data.returnedAt)}</span>
          </div>
          <p className="text-xs text-ink-3">
            {t('sales.cashier')}: {data.cashierName}
          </p>
          {data.late || data.reason || data.approvedByName ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {data.late ? <Badge tone="warn">{t('sales.late')}</Badge> : null}
              {data.reason ? <span className="text-xs text-ink-2">{data.reason}</span> : null}
              {data.approvedByName ? (
                <span className="text-xs text-ink-3">
                  {t('pos.approvedBy')}: {data.approvedByName}
                </span>
              ) : null}
            </div>
          ) : null}

          <table className="mt-3 w-full border-t border-dashed border-line-strong">
            <tbody>
              {data.lines.map((line) => (
                <tr key={line.id} className="border-b border-dashed border-line align-top">
                  <td className="py-1.5 pr-2">
                    {line.productName}
                    {line.label ? <span className="text-ink-2">, {line.label}</span> : null}
                    <span className="tabular text-xs text-ink-3"> × {formatNumber(line.qty)}</span>
                  </td>
                  <td className="tabular py-1.5 text-right font-medium whitespace-nowrap">{money(line.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-2 flex flex-col gap-0.5">
            <Row label={t('pos.returnedGoods')} value={money(data.total)} strong />
            {data.exchangeTotal ? (
              <Row
                label={`${PAYMENT_METHOD_LABELS.exchange} · ${data.exchangeSaleNumber ?? ''}`}
                value={money(data.exchangeTotal)}
              />
            ) : null}
            {data.refunds.map((refund, index) => (
              <Row
                key={index}
                // What came off a debt was never money: it is not said to have been handed back.
                label={refund.method === 'debt' ? t('pos.offDebt') : `${t('sales.refunded')}: ${paymentLabel(refund)}`}
                value={
                  refund.currency === 'USD'
                    ? `${money(refund.amount, 'USD')} = ${money(refund.base)}`
                    : money(refund.amount)
                }
              />
            ))}
            {data.rounding ? (
              <Row label={t('pos.rounding')} value={`${data.rounding > 0 ? '+' : ''}${money(data.rounding)}`} />
            ) : null}
          </div>
        </div>
      )}
    </Dialog>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={strong ? 'flex justify-between gap-4 text-sm font-semibold' : 'flex justify-between gap-4 text-ink-2'}
    >
      <span>{label}</span>
      <span className="tabular whitespace-nowrap">{value}</span>
    </div>
  )
}
