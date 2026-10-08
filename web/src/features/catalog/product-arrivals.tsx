import { formatMoney, type ProductArrivalDto } from '@erp/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Card } from '@/components/ui/page'
import { api } from '@/lib/api'
import { base } from '@/lib/base'
import { formatDay, formatNumber } from '@/lib/format'

/**
 * The receipts that brought a model's goods, newest first: when, from whom,
 * and what a piece cost in the currency it was bought in — "45 ¥" — with
 * what it came to in the base, expenses and all, where costs may be seen.
 */
export function ProductArrivals({ productId }: { productId: string }) {
  const { t } = useTranslation()
  const arrivals = useQuery({
    queryKey: ['receipts', 'arrivals', productId],
    queryFn: ({ signal }) => api.get<ProductArrivalDto[]>(`/products/${productId}/arrivals`, undefined, signal),
  })
  const rows = arrivals.data ?? []
  const seesCost = rows.some((row) => row.unitCost !== null)

  return (
    <Card title={t('products.arrivals')}>
      {!rows.length ? (
        <p className="text-xs text-ink-3">{arrivals.isLoading ? t('common.loading') : t('products.noArrivals')}</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-xs text-ink-3">
                <th className="py-1.5 pr-3 font-medium">{t('products.arrivalDate')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('products.arrivalReceipt')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('products.arrivalSupplier')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('products.arrivalVariant')}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t('products.arrivalQty')}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t('products.arrivalPrice')}</th>
                {seesCost ? <th className="py-1.5 text-right font-medium">{t('products.arrivalCost')}</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row, index) => (
                <tr key={`${row.receiptId}:${index}`}>
                  <td className="tabular py-1.5 pr-3 whitespace-nowrap">{formatDay(row.docDate)}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    <Link
                      to="/receipts/$receiptId"
                      params={{ receiptId: row.receiptId }}
                      className="font-code text-xs hover:underline"
                    >
                      {row.number}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3">{row.supplierName ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-ink-2">{row.variantLabel || '—'}</td>
                  <td className="tabular py-1.5 pr-3 text-right">{formatNumber(row.qty)}</td>
                  <td className="tabular py-1.5 pr-3 text-right whitespace-nowrap">
                    {formatMoney(row.price, row.currency)}
                  </td>
                  {seesCost ? (
                    <td className="tabular py-1.5 text-right whitespace-nowrap text-ink-2">
                      {row.unitCost !== null ? formatMoney(row.unitCost, base(), { minor: 'never' }) : '—'}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
