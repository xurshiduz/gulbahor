/**
 * A row of the payment panel, as a row of the payment window: what is paid with, the sum, and — where the sum is in
 * another currency than what it pays — the rate and the second sum of the pair. In a panel too narrow for
 * four columns the second sum goes under the first.
 */
export const ROW =
  'grid grid-cols-[minmax(0,1fr)_11rem] items-center gap-2 @xl:grid-cols-[minmax(0,1fr)_11rem_6.5rem_11rem]'
export const RATE = 'tabular hidden pr-2.5 text-right text-xs text-ink-3 @xl:block'
/** Says what the second sum is where there is no heading over it. */
export const UNDER = 'text-right text-xs text-ink-3 @xl:hidden'
