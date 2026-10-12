import {
  CUSTOMER_PAYMENT_KIND_LABELS,
  formatMoney,
  type AnyCurrency,
  type CustomerStatementDto,
  type CustomerStatementLine,
} from '@erp/core'
import type { TFunction } from 'i18next'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'

import { dayCell, moneyCell, type ExportColumn } from '@/lib/excel'
import { formatDay, formatNumber } from '@/lib/format'

const money = (minor: number, currency: AnyCurrency) => formatMoney(minor, currency, { minor: 'auto' })

/** What a line of the account is, in words: "Tovar kirimi", "Kassadan sotuv", "Bekor qilindi". */
export function statementLineLabel(line: Pick<CustomerStatementLine, 'kind' | 'source'>, t: TFunction): string {
  if (line.kind === 'cancel') {
    return t(
      line.source === 'receipt'
        ? 'payments.receiptCancelled'
        : line.source === 'sale'
          ? 'payments.saleVoided'
          : line.source === 'supplier_return'
            ? 'payments.supplierReturnCancelled'
            : 'payments.cancelLine',
    )
  }
  return line.kind === 'receipt'
    ? t('payments.receiptLine')
    : line.kind === 'sale'
      ? t('payments.saleLine')
      : line.kind === 'sale_return'
        ? t('payments.saleReturnLine')
        : line.kind === 'supplier_return'
          ? t('payments.supplierReturnLine')
          : CUSTOMER_PAYMENT_KIND_LABELS[line.kind]
}

/** The days a statement covers, in words; the whole account when neither end was asked for. */
export function periodText(data: Pick<CustomerStatementDto, 'from' | 'to'>, t: TFunction): string {
  return data.from && data.to
    ? `${formatDay(data.from)} – ${formatDay(data.to)}`
    : data.from
      ? t('payments.aktSince', { day: formatDay(data.from) })
      : data.to
        ? t('payments.aktUntil', { day: formatDay(data.to) })
        : t('payments.aktWhole')
}

/** What they owe, or are owed, as a sum that says which: for a paper both sides read. */
const standing = (balance: number, currency: AnyCurrency, t: TFunction) =>
  balance > 0
    ? t('payments.owes', { amount: money(balance, currency) })
    : balance < 0
      ? t('payments.owed', { amount: money(-balance, currency) })
      : t('payments.even')

/** A row of the reconciliation as a sheet holds it: what stood before the days, each document, what stands after. */
export interface StatementRow {
  on: string | null
  label: string
  number: string | null
  qty: number | null
  /** What made the debt more, and what made it less. */
  up: number | null
  down: number | null
  balance: number
  due: string | null
  note: string | null
}

export function statementRows(data: CustomerStatementDto, t: TFunction): StatementRow[] {
  const edge = (label: string, on: string | null, balance: number): StatementRow => ({
    on,
    label,
    number: null,
    qty: null,
    up: null,
    down: null,
    balance,
    due: null,
    note: null,
  })
  return [
    edge(t('payments.aktOpening'), data.from, data.opening),
    ...data.lines.map((line) => ({
      on: line.on,
      label: statementLineLabel(line, t),
      number: line.number,
      qty: line.qty,
      up: line.change > 0 ? line.change : null,
      down: line.change < 0 ? -line.change : null,
      balance: line.balance,
      due: line.due?.dueDate ?? null,
      note: line.note,
    })),
    edge(t('payments.aktClosing'), data.to, data.closing),
  ]
}

/** The same rows as a spreadsheet's columns. */
export function statementColumns(currency: AnyCurrency, t: TFunction): ExportColumn<StatementRow>[] {
  return [
    { title: t('payments.aktDay'), value: (row) => dayCell(row.on) },
    { title: t('payments.document'), value: (row) => row.label },
    { title: t('payments.aktNumber'), value: (row) => row.number },
    { title: t('payments.aktQty'), value: (row) => row.qty },
    { title: t('payments.aktUp'), value: (row) => moneyCell(row.up, currency) },
    { title: t('payments.aktDown'), value: (row) => moneyCell(row.down, currency) },
    { title: t('payments.balance'), value: (row) => moneyCell(row.balance, currency) },
    { title: t('pos.debtDue'), value: (row) => dayCell(row.due) },
    { title: t('receipts.note'), value: (row) => row.note },
  ]
}

export interface StatementPaperProps {
  /** The business the paper is from. */
  business: string
  data: CustomerStatementDto
  /** What all of their accounts come to today in the base, where they have more than one; null where it is not said. */
  totalBase: number | null
  base: AnyCurrency
}

/**
 * The reconciliation as it goes on paper: who with, for which days and in what currency; what stood before, every
 * document with the goods it moved, what stands after — and a line for each side to sign.
 */
export const StatementPaper = forwardRef<HTMLDivElement, StatementPaperProps>(function StatementPaper(
  { business, data, totalBase, base },
  ref,
) {
  const { t } = useTranslation()
  const { currency } = data
  const rows = statementRows(data, t)
  const turned = (key: 'up' | 'down') => rows.reduce((sum, row) => sum + (row[key] ?? 0), 0)
  const others = (data.customer.balances ?? []).filter((item) => item.balance && item.currency !== currency)
  const cell = 'border border-black px-1.5 py-1 align-top'

  return (
    <div ref={ref} data-statement-paper className="text-[12px] leading-snug text-black">
      <h1 className="text-center text-[15px] font-semibold">{t('payments.akt')}</h1>
      <p className="text-center">
        {periodText(data, t)} · {currency}
      </p>
      <p className="mt-3">
        {business} — {data.customer.name}
      </p>
      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="text-left font-semibold">
            <th className={cell}>{t('payments.aktDay')}</th>
            <th className={cell}>{t('payments.document')}</th>
            <th className={`${cell} text-right`}>{t('payments.aktQty')}</th>
            <th className={`${cell} text-right`}>{t('payments.aktUp')}</th>
            <th className={`${cell} text-right`}>{t('payments.aktDown')}</th>
            <th className={`${cell} text-right`}>{t('payments.balance')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const edge = index === 0 || index === rows.length - 1
            return (
              <tr key={index} className={edge ? 'font-semibold' : undefined}>
                <td className={`${cell} whitespace-nowrap`}>{row.on ? formatDay(row.on) : ''}</td>
                <td className={cell}>
                  {row.label}
                  {row.number ? ` ${row.number}` : ''}
                  {row.note ? <span className="block text-[11px]">{row.note}</span> : null}
                </td>
                <td className={`${cell} text-right`}>{row.qty ? formatNumber(row.qty) : ''}</td>
                <td className={`${cell} text-right whitespace-nowrap`}>{row.up ? money(row.up, currency) : ''}</td>
                <td className={`${cell} text-right whitespace-nowrap`}>{row.down ? money(row.down, currency) : ''}</td>
                <td className={`${cell} text-right whitespace-nowrap`}>{money(row.balance, currency)}</td>
              </tr>
            )
          })}
          <tr className="font-semibold">
            <td className={cell} colSpan={3}>
              {t('payments.aktTurnover')}
            </td>
            <td className={`${cell} text-right whitespace-nowrap`}>{money(turned('up'), currency)}</td>
            <td className={`${cell} text-right whitespace-nowrap`}>{money(turned('down'), currency)}</td>
            <td className={cell} />
          </tr>
        </tbody>
      </table>
      <p data-akt-result className="mt-3 font-semibold">
        {t('payments.aktResult', { name: data.customer.name })}: {standing(data.closing, currency, t)}
      </p>
      {/* Their other accounts are not part of these lines, and are never added in: said beside them, as of today. */}
      {others.length ? (
        <p data-akt-others className="mt-1">
          {t('payments.aktOthers')}: {others.map((item) => standing(item.balance, item.currency, t)).join('; ')}
          {totalBase !== null ? ` · ${t('payments.aktTotal')}: ${standing(totalBase, base, t)}` : ''}
        </p>
      ) : null}
      <div className="mt-10 grid grid-cols-2 gap-10">
        {[business, data.customer.name].map((side) => (
          <p key={side} data-signature className="flex items-end gap-1">
            <span className="shrink-0">{side}:</span>
            <span className="h-4 flex-1 border-b border-current" />
          </p>
        ))}
      </div>
    </div>
  )
})
