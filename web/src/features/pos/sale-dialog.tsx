import { formatMoney, PAYMENT_METHOD_LABELS, SALE_STATUS_LABELS, type SaleDto } from '@gulbahor/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Printer } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Badge, Spinner } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { formatDateTime, formatNumber } from '@/lib/format'
import { printElement } from '@/lib/print'

import { changeText } from './pos-state'

const money = (minor: number, currency: 'UZS' | 'USD' = 'UZS') => formatMoney(minor, currency, { minor: 'auto' })

/**
 * One sale as its receipt: what was sold, what was taken off, how it was
 * paid and what was handed back. From here it is printed, and, while its
 * shift is open, voided.
 */
export function SaleDialog({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const { can, me } = useSession()
  const queryClient = useQueryClient()
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const receiptRef = useRef<HTMLDivElement>(null)

  const query = useQuery({
    queryKey: ['sales', 'one', saleId],
    queryFn: ({ signal }) => api.get<SaleDto>(`/sales/${saleId}`, undefined, signal),
  })
  const sale = query.data

  const voidSale = useMutation({
    mutationFn: () => api.post<SaleDto>(`/sales/${saleId}/void`, { reason }),
    onSuccess: (voided) => {
      queryClient.setQueryData(['sales', 'one', saleId], voided)
      for (const key of ['sales', 'pos', 'shifts', 'stock', 'money']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
      toast.success(t('sales.voided', { number: voided.number }))
      setVoiding(false)
    },
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={sale ? `${t('sales.one')} ${sale.number}` : t('sales.one')}
      description={sale ? `${sale.locationName} · ${sale.registerName} · ${sale.shiftNumber}` : undefined}
      footer={
        <>
          {sale?.status === 'completed' && can('pos.void') && !voiding ? (
            <Button variant="danger" className="mr-auto" onClick={() => setVoiding(true)}>
              <Ban />
              {t('sales.void')}
            </Button>
          ) : null}
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button
            variant="primary"
            onClick={() => (receiptRef.current ? printElement(receiptRef.current) : undefined)}
            disabled={!sale}
          >
            <Printer />
            {t('sales.print')}
          </Button>
        </>
      }
    >
      {!sale ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {voiding ? (
            <Form onSubmit={() => (reason.trim() ? voidSale.mutate() : toast.error(t('sales.voidReasonNeeded')))}>
              <Field label={t('sales.voidReason')} hint={t('sales.voidHint')} required>
                {(id) => (
                  <Input
                    id={id}
                    autoFocus
                    value={reason}
                    maxLength={200}
                    onChange={(event) => setReason(event.target.value)}
                  />
                )}
              </Field>
              <div className="flex gap-2">
                <Button type="submit" variant="danger" loading={voidSale.isPending}>
                  {t('sales.void')}
                </Button>
                <Button onClick={() => setVoiding(false)}>{t('common.no')}</Button>
              </div>
            </Form>
          ) : null}

          {/* The receipt: the part of the screen a printer is given. */}
          <div ref={receiptRef} className="text-[13px]">
            <div className="text-center">
              <p className="text-sm font-semibold">{me.org.name}</p>
              <p className="text-xs text-ink-3">{sale.locationName}</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-ink-2">
              <span className="font-code">{sale.number}</span>
              <span className="tabular">{formatDateTime(sale.soldAt)}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 text-xs text-ink-3">
              <span>
                {t('sales.cashier')}: {sale.cashierName}
              </span>
              {sale.sellerName ? (
                <span>
                  {t('sales.seller')}: {sale.sellerName}
                </span>
              ) : null}
            </div>
            {sale.status === 'voided' ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="bad">{SALE_STATUS_LABELS.voided}</Badge>
                <span className="text-xs text-ink-3">
                  {sale.voidedByName} · {formatDateTime(sale.voidedAt)} · {sale.voidReason}
                </span>
              </div>
            ) : null}

            <table className="mt-3 w-full border-t border-dashed border-line-strong">
              <tbody>
                {sale.lines.map((line) => (
                  <tr key={line.id} className="border-b border-dashed border-line align-top">
                    <td className="py-1.5 pr-2">
                      <p>
                        {line.productName}
                        {line.label ? <span className="text-ink-2">, {line.label}</span> : null}
                      </p>
                      <p className="tabular text-xs text-ink-3">
                        {formatNumber(line.qty)} × {money(line.price)}
                        {line.discount ? ` − ${money(line.discount)}` : ''}
                      </p>
                    </td>
                    <td className="tabular py-1.5 text-right font-medium whitespace-nowrap">{money(line.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-2 flex flex-col gap-0.5">
              {sale.discount ? (
                <>
                  <Line label={t('pos.subtotal')} value={money(sale.subtotal)} />
                  <Line label={t('pos.discount')} value={`−${money(sale.discount)}`} />
                </>
              ) : null}
              <Line label={t('pos.total')} value={money(sale.total)} strong />
              {sale.payments.map((payment, index) => (
                <Line
                  key={index}
                  label={`${PAYMENT_METHOD_LABELS[payment.method]}${
                    payment.method === 'cash' ? '' : ` · ${payment.accountName}`
                  }${payment.reference ? ` (${payment.reference})` : ''}`}
                  value={
                    payment.currency === 'USD'
                      ? `${money(payment.amount, 'USD')} = ${money(payment.base)}`
                      : money(payment.amount)
                  }
                />
              ))}
              {sale.uzsPerUsd && sale.payments.some((payment) => payment.currency === 'USD') ? (
                <Line label={t('pos.rate')} value={`1 $ = ${money(Math.round(sale.uzsPerUsd * 100))}`} />
              ) : null}
              {sale.changeUzs || sale.changeUsd ? (
                <Line label={t('pos.change')} value={changeText(sale.changeUzs, sale.changeUsd)} strong />
              ) : null}
            </div>
            {sale.note ? <p className="mt-2 text-xs text-ink-2">{sale.note}</p> : null}
          </div>
        </div>
      )}
    </Dialog>
  )
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={strong ? 'flex justify-between gap-4 text-sm font-semibold' : 'flex justify-between gap-4 text-ink-2'}
    >
      <span>{label}</span>
      <span className="tabular whitespace-nowrap">{value}</span>
    </div>
  )
}
