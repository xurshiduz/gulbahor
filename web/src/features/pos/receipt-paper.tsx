import {
  barRuns,
  code128,
  formatMoney,
  paymentLabel,
  receiptColumnMm,
  type AnyCurrency,
  type ReceiptTemplate,
  type SaleDto,
  type SalePaymentDto,
} from '@erp/core'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'

import { base } from '@/lib/base'
import { formatDateTime, formatDay, formatNumber, formatPhone } from '@/lib/format'

import { changeText } from './pos-state'

const money = (minor: number, currency: AnyCurrency = base()) => formatMoney(minor, currency, { minor: 'auto' })

/**
 * What a payment came to, as a receipt says it: dollars with what they paid
 * of the sum, and what went on a partner's account in so'm with what that is
 * in the partner's own currency — "1 265 000 so'm (100,00 $)".
 */
export function paidText(payment: Pick<SalePaymentDto, 'method' | 'currency' | 'amount' | 'base'>): string {
  if (payment.method === 'partner') {
    return payment.currency === base()
      ? money(payment.base)
      : `${money(payment.base)} (${money(payment.amount, payment.currency)})`
  }
  return payment.currency !== base()
    ? `${money(payment.amount, payment.currency)} = ${money(payment.base)}`
    : money(payment.amount, payment.currency)
}

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
        {template.logo ? (
          <img src={template.logo} alt="" style={{ width: `${template.logoWidth}%` }} className="mx-auto mb-1 block" />
        ) : null}
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
      {sale.partnerName ? (
        <p>
          {t('pos.partner')}: {sale.partnerName}
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
          <Row key={index} label={paymentLabel(payment)} value={paidText(payment)} />
        ))}
        {/* The day the customer has agreed to: on the paper they take away. */}
        {sale.debt ? <Row label={t('pos.debtDue')} value={formatDay(sale.debt.dueDate)} /> : null}
        {sale.changeUzs || sale.changeOther ? (
          <Row label={t('pos.change')} value={changeText(sale.changeUzs, sale.changeOther, sale.changeCurrency)} />
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

      {template.showBarcode ? <NumberBars number={sale.number} /> : null}
    </div>
  )
})

/** A bar two dots wide on the printers shops use: thin enough for narrow paper, wide enough to be read. */
const MODULE_MM = 0.25

/** The receipt's number as a barcode: scanned at the till, it brings the receipt up to be returned. */
function NumberBars({ number }: { number: string }) {
  const modules = code128(number)
  if (!modules) {
    return null
  }
  return (
    <svg
      data-receipt-barcode
      viewBox={`0 0 ${modules.length} 1`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      style={{ width: `${modules.length * MODULE_MM}mm`, height: '9mm' }}
      className="mx-auto mt-2 block"
      fill="black"
    >
      {barRuns(modules).map((bar) => (
        <rect key={bar.at} x={bar.at} y={0} width={bar.width} height={1} />
      ))}
    </svg>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'flex justify-between gap-3 text-[13px] font-semibold' : 'flex justify-between gap-3'}>
      <span>{label}</span>
      <span className="tabular whitespace-nowrap">{value}</span>
    </div>
  )
}
