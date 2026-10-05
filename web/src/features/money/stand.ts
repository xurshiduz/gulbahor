import {
  CURRENCY_CODES,
  toBase,
  type AccountDto,
  type AccountKind,
  type CurrencyCode,
  type MoneyTransferDto,
  type RegisterDto,
} from '@gulbahor/core'

/** The two halves every currency is read in: money in hand, and money that is a figure somewhere. */
export type Holding = 'cash' | 'cashless'

/** A till's drawer and a safe hold notes; a card, a terminal and a bank account hold a figure. */
export const holdingOf = (kind: AccountKind): Holding => (kind === 'cash' || kind === 'safe' ? 'cash' : 'cashless')

export interface StandPlace {
  account: AccountDto
  /** The till a drawer belongs to. */
  till: string | null
  /** It serves more shops than the one asked about: what it holds is not that shop's alone. */
  shared: boolean
  balance: number
}

export interface StandHalf {
  total: number
  places: StandPlace[]
}

export interface StandCurrency {
  currency: CurrencyCode
  /** Everything of this currency the business holds: in hand, in figures and on its way. */
  total: number
  cash: StandHalf
  cashless: StandHalf
  /** Sent from one place and not yet confirmed at the other: in neither, and still the business's. */
  transit: { total: number; transfers: MoneyTransferDto[] }
}

/** Whether an account's money is this shop's to use: its own, or shared with it. */
const serves = (account: AccountDto, shopId: string | null) =>
  shopId === null || !account.locationIds.length || account.locationIds.includes(shopId)

/**
 * Where the business's money stands: each currency apart, in it the cash and
 * the cashless, in those every place by itself — the whole business, or what
 * one shop has to hand. A place put away is still shown while money is in it.
 */
export function moneyStand(
  accounts: AccountDto[],
  registers: Pick<RegisterDto, 'id' | 'name'>[],
  waiting: MoneyTransferDto[],
  shopId: string | null = null,
): StandCurrency[] {
  const tillOf = new Map(registers.map((register) => [register.id, register.name]))
  const shown = accounts.filter(
    (account) => account.balance !== null && (account.isActive || account.balance !== 0) && serves(account, shopId),
  )
  const ids = new Set(shown.map((account) => account.id))
  // Money on its way is counted where either end of it is.
  const moving = waiting.filter(
    (transfer) => transfer.status === 'sent' && (ids.has(transfer.fromAccountId) || ids.has(transfer.toAccountId)),
  )

  const currencies = [...new Set([...shown.map((account) => account.currency), ...moving.map((item) => item.currency)])]
  const place = (code: CurrencyCode) => (CURRENCY_CODES.includes(code) ? CURRENCY_CODES.indexOf(code) : Infinity)
  currencies.sort((a, b) => place(a) - place(b))

  return currencies.map((currency) => {
    const half = (holding: Holding): StandHalf => {
      const places = shown
        .filter((account) => account.currency === currency && holdingOf(account.kind) === holding)
        .map((account) => ({
          account,
          till: account.registerId ? (tillOf.get(account.registerId) ?? null) : null,
          shared: shopId !== null && account.locationIds.length !== 1,
          balance: account.balance as number,
        }))
      return { total: places.reduce((sum, item) => sum + item.balance, 0), places }
    }
    const cash = half('cash')
    const cashless = half('cashless')
    const transfers = moving.filter((transfer) => transfer.currency === currency)
    const transit = { total: transfers.reduce((sum, transfer) => sum + transfer.amount, 0), transfers }
    return { currency, total: cash.total + cashless.total + transit.total, cash, cashless, transit }
  })
}

/** Every currency counted as so'm at the day's rate; null while there are dollars and no rate to value them by. */
export function standWorth(stand: StandCurrency[], uzsPerUsd: number | null): number | null {
  if (stand.some((item) => item.currency !== 'UZS') && !uzsPerUsd) {
    return null
  }
  return stand.reduce((sum, item) => sum + toBase(item.total, item.currency, uzsPerUsd), 0)
}
