import { formatMoney, gross } from '@gulbahor/core'
import { Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { formatNumber } from '@/lib/format'

import type { BackLine, Cart, CartTotals } from './pos-state'

const money = (minor: number) => formatMoney(minor, 'UZS', { minor: 'auto' })

interface ReceiptPreviewProps {
  /** The shop's name and the till's, as the receipt will head them. */
  shop: string
  register: string
  cart: Cart
  totals: CartTotals
  /** Goods coming back on this same receipt, and the receipt they were sold on. */
  back: BackLine[]
  backNumber: string | null
  /** The price type the goods are sold at, when it is not the retail one. */
  priceType: string | null
  /** Who is buying, when they are on the books. */
  customer: string | null
  /** Why money comes off by itself: "Kuzgi aksiya, Sodiqlik 7%". */
  ownReason: string | null
  /** What the goods coming back are worth. */
  credit: number
  /** What is left to take from the customer, or to hand back to them. */
  toPay: number
  toRefund: number
  seller: string | null
}

/**
 * The receipt as it will be, shown beside the money while it is being paid:
 * what is sold, what came off each line and the whole, what comes back, and
 * what it all comes to. Nothing here can be changed; the cart is one key away.
 */
export function ReceiptPreview({
  shop,
  register,
  cart,
  totals,
  back,
  backNumber,
  priceType,
  customer,
  ownReason,
  credit,
  toPay,
  toRefund,
  seller,
}: ReceiptPreviewProps) {
  const { t } = useTranslation()
  const refunding = toRefund > 0

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-surface shadow-card">
      <div className="mx-auto flex max-w-xl flex-col gap-3 p-5 text-[13px]">
        <div className="text-center">
          <p className="text-sm font-semibold">{shop}</p>
          <p className="text-xs text-ink-3">{register}</p>
          {priceType ? (
            <p className="mt-1 text-xs font-medium text-accent-ink">
              {t('pos.priceType')}: {priceType}
            </p>
          ) : null}
        </div>

        {cart.lines.length ? (
          <table className="w-full border-t border-dashed border-line-strong">
            <tbody>
              {cart.lines.map((line, index) => {
                const sums = totals.lines[index]
                return (
                  <tr key={line.key} className="border-b border-dashed border-line align-top">
                    <td className="py-1.5 pr-2">
                      <p>
                        {line.item.name}
                        {line.item.label ? <span className="text-ink-2">, {line.item.label}</span> : null}
                      </p>
                      <p className="tabular text-xs text-ink-3">
                        {formatNumber(line.qty)} × {money(line.item.price ?? 0)}
                        {sums?.discount ? ` − ${money(sums.discount)}` : ''}
                        {totals.autos[index]?.promoOff ? (
                          <span className="text-accent-ink"> · {totals.autos[index].promo?.name}</span>
                        ) : null}
                      </p>
                    </td>
                    <td className="tabular py-1.5 text-right font-medium whitespace-nowrap">
                      {money(sums?.total ?? gross(line.item.price ?? 0, line.qty))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : null}

        {back.length ? (
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-warn">
              <Undo2 className="size-3.5" />
              {t('pos.returnedGoods')}
              {backNumber ? <span className="font-code font-normal text-ink-3">{backNumber}</span> : null}
            </p>
            <table className="mt-1 w-full border-t border-dashed border-line-strong">
              <tbody>
                {back.map((item) => (
                  <tr key={item.line.id} className="border-b border-dashed border-line align-top">
                    <td className="py-1.5 pr-2">
                      <p>
                        {item.line.productName}
                        {item.line.label ? <span className="text-ink-2">, {item.line.label}</span> : null}
                      </p>
                      <p className="tabular text-xs text-ink-3">{formatNumber(item.qty)}</p>
                    </td>
                    <td className="tabular py-1.5 text-right font-medium whitespace-nowrap text-warn">
                      −{money(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="flex flex-col gap-0.5">
          {totals.discount ? (
            <>
              <Line label={t('pos.subtotal')} value={money(totals.subtotal)} />
              {/* What came off by itself and what the cashier gave are said apart: it is known later why. */}
              {totals.auto ? (
                <Line label={ownReason ?? t('pos.customerDiscount')} value={`−${money(totals.auto)}`} />
              ) : null}
              {totals.discount - totals.auto ? (
                <Line label={t('pos.discount')} value={`−${money(totals.discount - totals.auto)}`} />
              ) : null}
            </>
          ) : null}
          {credit ? (
            <>
              {cart.lines.length ? <Line label={t('pos.goodsTotal')} value={money(totals.total)} /> : null}
              <Line label={t('pos.returnedGoods')} value={`−${money(credit)}`} />
            </>
          ) : null}
          <Line
            label={refunding ? t('pos.toRefund') : t('pos.total')}
            value={money(refunding ? toRefund : toPay)}
            strong
          />
        </div>

        {customer ? (
          <p className="text-xs text-ink-3">
            {t('pos.customer')}: {customer}
          </p>
        ) : null}
        {seller ? (
          <p className="text-xs text-ink-3">
            {t('pos.seller')}: {seller}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={
        strong ? 'mt-1 flex justify-between gap-4 text-base font-semibold' : 'flex justify-between gap-4 text-ink-2'
      }
    >
      <span>{label}</span>
      <span className="tabular whitespace-nowrap">{value}</span>
    </div>
  )
}
