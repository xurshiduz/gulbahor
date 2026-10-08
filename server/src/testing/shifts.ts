interface ShiftLike {
  counts: { currency: string }[]
  totals: { cash: { currency: string }[] } | null
}

/** One currency's drawer of a shift as a test reads it: its count and what moved through it, together. */
export const drawerOf = (shift: ShiftLike, currency: string): Record<string, unknown> => ({
  ...shift.counts.find((count) => count.currency === currency),
  ...shift.totals?.cash.find((moves) => moves.currency === currency),
})
