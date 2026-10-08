import { tierPercent, type LoyaltyTier, type PosCustomerDto } from '@erp/core'
import type { EntityManager } from 'typeorm'

import { LoyaltyTierRow, type Customer } from '../../database/entities'
import { debtsOf, NO_DEBT } from './debts'

interface GroupRow {
  customer_id: string
  id: string
  name: string
  discount_percent: number
  price_type_id: string | null
  price_type_name: string | null
  reminder: string | null
  no_debt: boolean
  no_layaway: boolean
  no_exchange: boolean
}

/** The steps of the business's loyalty programme, lowest first. */
export async function loyaltyTiers(em: EntityManager): Promise<LoyaltyTier[]> {
  const rows = await em.find(LoyaltyTierRow, { order: { fromAmount: 'ASC' } })
  return rows.map((row) => ({ from: row.fromAmount, percent: row.percent }))
}

/** A percentage as it is said: "7%", "7,5%". */
const said = (percent: number) => `${String(percent).replace('.', ',')}%`

/**
 * The rules a customer's groups give, put together: what the till is told
 * when it picks them, and what the server goes by when they buy. Groups that
 * were archived give nothing; a price type that was archived prices nothing.
 *
 * Their own discount is the most any of their groups gives, or what their
 * purchases so far have earned in the loyalty programme, whichever is more:
 * the two are never added together.
 */
export async function rulesOf(em: EntityManager, customers: Customer[]): Promise<Map<string, PosCustomerDto>> {
  if (!customers.length) {
    return new Map()
  }
  const ids = customers.map((customer) => customer.id)
  const rows: GroupRow[] = await em.query(
    `SELECT m.customer_id, g.id, g.name, g.discount_percent::float8 AS discount_percent,
            t.id AS price_type_id, t.name AS price_type_name, g.reminder, g.no_debt, g.no_layaway, g.no_exchange
     FROM customer_group_members m
     JOIN customer_groups g ON g.id = m.group_id AND g.is_active
     LEFT JOIN price_types t ON t.id = g.price_type_id AND t.is_active
     WHERE m.customer_id = ANY($1)
     ORDER BY g.sort_order, g.name`,
    [ids],
  )
  const tiers = await loyaltyTiers(em)
  const bought: { customer_id: string; purchases: number }[] = tiers.length
    ? await em.query(
        `SELECT customer_id, sum(total - returned_total)::float8 AS purchases
         FROM sales WHERE customer_id = ANY($1) AND status = 'completed' GROUP BY customer_id`,
        [ids],
      )
    : []
  const boughtBy = new Map(bought.map((row) => [row.customer_id, row.purchases]))
  const debts = await debtsOf(em, ids)

  return new Map(
    customers.map((customer) => {
      const groups = rows.filter((row) => row.customer_id === customer.id)
      const priced = groups.find((group) => group.price_type_id)
      const generous = groups.reduce<GroupRow | null>(
        (best, group) => (group.discount_percent > (best?.discount_percent ?? 0) ? group : best),
        null,
      )
      const earned = tierPercent(tiers, boughtBy.get(customer.id) ?? 0)
      const byGroup = generous?.discount_percent ?? 0
      const discountPercent = Math.max(byGroup, earned)
      return [
        customer.id,
        {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          groups: groups.map((group) => group.name),
          reminders: groups.flatMap((group) => group.reminder ?? []),
          discountPercent,
          discountReason: !discountPercent
            ? null
            : byGroup >= earned
              ? `${generous?.name} ${said(byGroup)}`
              : `Sodiqlik ${said(earned)}`,
          priceType: priced ? { id: priced.price_type_id as string, name: priced.price_type_name as string } : null,
          noDebt: groups.some((group) => group.no_debt),
          noLayaway: groups.some((group) => group.no_layaway),
          noExchange: groups.some((group) => group.no_exchange),
          debt: debts.get(customer.id) ?? NO_DEBT,
        },
      ]
    }),
  )
}
