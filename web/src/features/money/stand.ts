import {
  ALL_CURRENCY_CODES,
  ratesOf,
  worthInBase,
  type AccountDto,
  type AccountKind,
  type AnyCurrency,
  type MoneyTransferDto,
  type Rates,
  type RegisterDto,
} from '@erp/core'

import { base } from '@/lib/base'

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
  currency: AnyCurrency
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
  // In the order the list of currencies is kept in: so'm, the dollar, then the rest.
  currencies.sort((a, b) => ALL_CURRENCY_CODES.indexOf(a) - ALL_CURRENCY_CODES.indexOf(b))

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

/**
 * Every currency counted in the base at the day's rates; null while one of them has no rate to be valued by —
 * a sum with a hole in it is not a sum.
 */
export function standWorth(stand: StandCurrency[], rates: Rates): number | null {
  const book = ratesOf(rates, base())
  let sum = 0
  for (const item of stand) {
    const worth = worthInBase(item.total, item.currency, book)
    if (worth === null) {
      return null
    }
    sum += worth
  }
  return sum
}
