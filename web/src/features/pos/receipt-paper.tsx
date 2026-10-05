import { formatMoney, PAYMENT_METHOD_LABELS, receiptColumnMm, type ReceiptTemplate, type SaleDto } from '@gulbahor/core'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDateTime, formatNumber, formatPhone } from '@/lib/format'

import { changeText } from './pos-state'

const money = (minor: number, currency: 'UZS' | 'USD' = 'UZS') => formatMoney(minor, currency, { minor: 'auto' })

interface ReceiptPaperProps {
  sale: SaleDto
  template: ReceiptTemplate
  /** The business's name: what stands at the top when the template names nothing else. */
  orgName: string
}

/**
 * A receipt as it goes onto paper, laid out the way the business set its
 * template: a narrow column, black on white, nothing that a thermal printer
 * cannot print. The same component is what the settings show while the
 * template is being changed.
 */
export const ReceiptPaper = forwardRef<HTMLDivElement, ReceiptPaperProps>(function ReceiptPaper(
  { sale, template, orgName },
  ref,
) {
  const { t } = useTranslation()
  const given = sale.discount - sale.autoDiscount
  const lines = (text: string | null) => (text ?? '').split('\n').filter((line) => line.trim())

  return (
    <div
      ref={ref}
      data-receipt-paper
      style={{ width: `${receiptColumnMm(template.width)}mm` }}
      className="bg-white font-sans text-[11px] leading-snug text-black"
    >
      <div className="text-center">
        <p className="text-[13px] font-semibold">{template.title || orgName}</p>
        {template.showShop ? <p>{sale.locationName}</p> : null}
        {template.showAddress && sale.locationAddress ? <p>{sale.locationAddress}</p> : null}
        {template.showAddress && sale.locationPhone ? (
          <p className="tabular">{formatPhone(sale.locationPhone)}</p>
        ) : null}
      </div>

      <div className="mt-2 flex justify-between gap-2 border-t border-dashed border-black pt-1.5">
        <span className="font-code">{sale.number}</span>
        <span className="tabular">{formatDateTime(sale.soldAt)}</span>
      </div>
      {template.showCashier && sale.cashierName ? (
        <p>
          {t('sales.cashier')}: {sale.cashierName}
        </p>
      ) : null}
      {template.showSeller && sale.sellerName ? (
        <p>
          {t('sales.seller')}: {sale.sellerName}
        </p>
      ) : null}
      {template.showCustomer && sale.customerName ? (
        <p>
          {t('pos.customer')}: {sale.customerName}
        </p>
      ) : null}

      <table className="mt-1.5 w-full border-t border-dashed border-black">
        <tbody>
          {sale.lines.map((line) => (
            <tr key={line.id} className="border-b border-dashed border-black/40 align-top">
              <td className="py-1 pr-1.5">
                <p>
                  {line.productName}
                  {line.label ? `, ${line.label}` : ''}
                </p>
                {/* On a line of its own: on narrow paper it would otherwise be broken in two. */}
                {template.showSku ? <p className="font-code whitespace-nowrap">{line.sku}</p> : null}
                <p className="tabular">
                  {formatNumber(line.qty)} × {money(line.price)}
                  {template.showLineDiscount && line.discount ? ` − ${money(line.discount)}` : ''}
                </p>
                {template.showLineDiscount && line.promotionName ? <p>{line.promotionName}</p> : null}
              </td>
              <td className="tabular py-1 text-right font-medium whitespace-nowrap">{money(line.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-1.5 flex flex-col gap-0.5">
        {sale.discount ? (
          <>
            <Row label={t('pos.subtotal')} value={money(sale.subtotal)} />
            {sale.autoDiscount ? (
              <Row label={sale.autoReason ?? t('pos.customerDiscount')} value={`−${money(sale.autoDiscount)}`} />
            ) : null}
            {given ? <Row label={t('pos.discount')} value={`−${money(given)}`} /> : null}
          </>
        ) : null}
        <Row label={t('pos.total')} value={money(sale.total)} strong />
        {sale.payments.map((payment, index) => (
          <Row
            key={index}
            label={`${PAYMENT_METHOD_LABELS[payment.method]}${payment.method === 'cash' ? '' : ` · ${payment.accountName}`}`}
            value={
              payment.currency === 'USD'
                ? `${money(payment.amount, 'USD')} = ${money(payment.base)}`
                : money(payment.amount)
            }
          />
        ))}
        {sale.changeUzs || sale.changeUsd ? (
          <Row label={t('pos.change')} value={changeText(sale.changeUzs, sale.changeUsd)} />
        ) : null}
        {template.showSavings && sale.discount ? (
          <p className="mt-1 text-center font-medium">{t('receipt.saved', { amount: money(sale.discount) })}</p>
        ) : null}
      </div>

      {lines(template.footer).length || lines(template.socials).length ? (
        <div className="mt-2 border-t border-dashed border-black pt-1.5 text-center">
          {lines(template.footer).map((line, index) => (
            <p key={`f${index}`}>{line}</p>
          ))}
          {lines(template.socials).map((line, index) => (
            <p key={`s${index}`}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  )
})

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'flex justify-between gap-3 text-[13px] font-semibold' : 'flex justify-between gap-3'}>
      <span>{label}</span>
      <span className="tabular whitespace-nowrap">{value}</span>
    </div>
  )
}
