import {
  CURRENCIES,
  DEFAULT_RECEIPT_TEMPLATE,
  formatMoney,
  paymentLabel,
  SALE_STATUS_LABELS,
  type SaleDto,
  type AnyCurrency,
} from '@erp/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Ban, Printer, Undo2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Badge, Spinner } from '@/components/ui/feedback'
import { Field } from '@/components/ui/field'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { base } from '@/lib/base'
import { formatDateTime, formatDay, formatNumber } from '@/lib/format'
import { printElement } from '@/lib/print'

import { paidText, ReceiptPaper } from './receipt-paper'
import { toast } from '@/lib/toast'

import { changeText } from './pos-state'

const money = (minor: number, currency: AnyCurrency = base()) => formatMoney(minor, currency, { minor: 'auto' })

/**
 * One sale as its receipt: what was sold, what was taken off, how it was
 * paid and what was handed back. From here it is printed, and, while its
 * shift is open, voided.
 */
export function SaleDialog({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const { can, me } = useSession()
  const queryClient = useQueryClient()
  const go = useNavigate()
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  /** The receipt as it goes onto paper, laid out by the business's template: kept off the screen. */
  const paperRef = useRef<HTMLDivElement>(null)

  const query = useQuery({
    queryKey: ['sales', 'one', saleId],
    queryFn: ({ signal }) => api.get<SaleDto>(`/sales/${saleId}`, undefined, signal),
  })
  const sale = query.data
  /** What dollars taken for an agreed worth left the shop with (+) or cost it (−). */
  const rateDiff = sale ? sale.payments.reduce((sum, payment) => sum + payment.fx, 0) : 0

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
          {sale?.status === 'completed' &&
          can('pos.return') &&
          sale.lines.some((line) => line.returnedQty < line.qty) ? (
            <Button
              onClick={() => {
                onClose()
                void go({ to: '/pos', search: { return: sale.number } })
              }}
            >
              <Undo2 />
              {t('pos.returnTitle')}
            </Button>
          ) : null}
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button
            variant="primary"
            onClick={() => (paperRef.current ? printElement(paperRef.current) : undefined)}
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

          <div className="hidden">
            <ReceiptPaper
              ref={paperRef}
              sale={sale}
              template={{ ...DEFAULT_RECEIPT_TEMPLATE, ...me.org.settings.receipt }}
              orgName={me.org.name}
            />
          </div>

          {/* The receipt as the till keeps it, with what is nobody's business outside the shop. */}
          <div className="text-[13px]">
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

            {sale.customerName ? (
              <p className="mt-1 text-xs text-ink-2">
                {t('pos.customer')}: {sale.customerName}
              </p>
            ) : null}
            {sale.partnerName ? (
              <p className="mt-1 text-xs text-ink-2">
                {t('pos.partner')}: {sale.partnerName}
              </p>
            ) : null}
            {sale.promoCode ? (
              <p className="mt-1 text-xs text-ink-3">
                {t('pos.promoCode')}: <span className="font-code">{sale.promoCode}</span>
              </p>
            ) : null}
            {sale.priceTypeName ? (
              <p className="mt-1 text-xs text-ink-3">
                {t('pos.priceType')}: {sale.priceTypeName}
              </p>
            ) : null}
            {sale.approvedByName ? (
              <p className="mt-1 text-xs text-ink-3">
                {t('pos.approvedBy')}: {sale.approvedByName}
              </p>
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
                        {line.returnedQty ? (
                          <span className="text-warn">
                            {' · '}
                            {t('sales.returnedMark', { qty: formatNumber(line.returnedQty) })}
                          </span>
                        ) : null}
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
                  {sale.autoDiscount ? (
                    <Line label={sale.autoReason ?? t('pos.customerDiscount')} value={`−${money(sale.autoDiscount)}`} />
                  ) : null}
                  {sale.discount - sale.autoDiscount ? (
                    <Line label={t('pos.discount')} value={`−${money(sale.discount - sale.autoDiscount)}`} />
                  ) : null}
                </>
              ) : null}
              <Line label={t('pos.total')} value={money(sale.total)} strong />
              {sale.payments.map((payment, index) => (
                <Line
                  key={index}
                  label={`${paymentLabel(payment)}${payment.reference ? ` (${payment.reference})` : ''}`}
                  value={paidText(payment)}
                />
              ))}
              {sale.debt ? (
                <>
                  <Line label={t('pos.debtDue')} value={formatDay(sale.debt.dueDate)} />
                  {/* How it stands now, not how it stood at the till: nothing for the paper. */}
                  {sale.debt.left !== sale.debt.amount ? (
                    <div className="print:hidden">
                      <Line
                        label={t('sales.debtLeft')}
                        value={sale.debt.left ? money(sale.debt.left) : t('debts.state_closed')}
                      />
                    </div>
                  ) : null}
                </>
              ) : null}
              {/* The day's rate of each other currency it was paid in, as the books took the money. */}
              {[...new Set(sale.payments.filter((payment) => payment.currency !== base()).map((p) => p.currency))].map(
                (code) => {
                  const paid = sale.payments.filter((payment) => payment.currency === code && payment.amount)
                  const amount = paid.reduce((sum, payment) => sum + payment.amount, 0)
                  const worth = paid.reduce((sum, payment) => sum + payment.base + payment.fx, 0)
                  return amount ? (
                    <Line
                      key={code}
                      label={t('pos.rate')}
                      value={`1 ${CURRENCIES[code].symbol} = ${money(Math.round((worth * 100) / amount))}`}
                    />
                  ) : null
                },
              )}
              {/* Between the shop and its books, not the customer's business: it stays off the paper. */}
              {rateDiff ? (
                <div className="print:hidden">
                  <Line label={t('pos.rateDiff')} value={`${rateDiff > 0 ? '+' : '−'}${money(Math.abs(rateDiff))}`} />
                </div>
              ) : null}
              {sale.changeUzs || sale.changeOther ? (
                <Line
                  label={t('pos.change')}
                  value={changeText(sale.changeUzs, sale.changeOther, sale.changeCurrency)}
                  strong
                />
              ) : null}
            </div>
            {sale.note ? <p className="mt-2 text-xs text-ink-2">{sale.note}</p> : null}
            {sale.returns.length ? (
              <div className="mt-2 flex flex-col gap-0.5 border-t border-dashed border-line-strong pt-2">
                {sale.returns.map((item) => (
                  <Line
                    key={item.id}
                    label={`${t('sales.returnOne')} ${item.number} · ${formatDateTime(item.returnedAt)}`}
                    value={`−${money(item.total)}`}
                  />
                ))}
              </div>
            ) : null}
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
