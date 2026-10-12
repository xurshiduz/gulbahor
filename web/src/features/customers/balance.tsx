import { formatMoney, type AnyCurrency } from '@erp/core'

import { cn } from '@/lib/cn'

/**
 * A customer's balance as one number, the way the owner reads it (2026-10-12): what they owe with a minus,
 * what is theirs as it stands. The books keep it the other way round — what they owe is positive — so the sign
 * turns here, and nowhere else.
 */
export const balanceText = (balance: number, currency: AnyCurrency) =>
  `${balance > 0 ? '−' : ''}${formatMoney(Math.abs(balance), currency, { minor: 'auto' })}`

/** Red when they owe, green when something is theirs. */
export const balanceTone = (balance: number) => (balance > 0 ? 'text-bad' : balance < 0 ? 'text-ok' : 'text-ink-3')

export function Balance({
  balance,
  currency,
  className,
}: {
  balance: number
  currency: AnyCurrency
  className?: string
}) {
  return (
    <span data-balance className={cn('tabular whitespace-nowrap', balanceTone(balance), className)}>
      {balanceText(balance, currency)}
    </span>
  )
}

/** Several of them, one per currency, side by side. */
export function Balances({ items }: { items: readonly { balance: number; currency: AnyCurrency }[] }) {
  return items.map((item, index) => (
    <span key={item.currency}>
      {index ? ', ' : null}
      <Balance balance={item.balance} currency={item.currency} />
    </span>
  ))
}
