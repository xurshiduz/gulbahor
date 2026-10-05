import type { PosCustomerDto } from '@gulbahor/core'
import type { EntityManager } from 'typeorm'

import type { Customer } from '../../database/entities'

interface GroupRow {
  customer_id: string
  id: string
  name: string
  price_type_id: string | null
  price_type_name: string | null
  reminder: string | null
  no_debt: boolean
  no_layaway: boolean
  no_exchange: boolean
}

/**
 * The rules a customer's groups give, put together: what the till is told
 * when it picks them, and what the server goes by when they buy. Groups that
 * were archived give nothing; a price type that was archived prices nothing.
 */
export async function rulesOf(em: EntityManager, customers: Customer[]): Promise<Map<string, PosCustomerDto>> {
  const rows: GroupRow[] = customers.length
    ? await em.query(
        `SELECT m.customer_id, g.id, g.name, t.id AS price_type_id, t.name AS price_type_name, g.reminder,
                g.no_debt, g.no_layaway, g.no_exchange
         FROM customer_group_members m
         JOIN customer_groups g ON g.id = m.group_id AND g.is_active
         LEFT JOIN price_types t ON t.id = g.price_type_id AND t.is_active
         WHERE m.customer_id = ANY($1)
         ORDER BY g.sort_order, g.name`,
        [customers.map((customer) => customer.id)],
      )
    : []
  return new Map(
    customers.map((customer) => {
      const groups = rows.filter((row) => row.customer_id === customer.id)
      const priced = groups.find((group) => group.price_type_id)
      return [
        customer.id,
        {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          groups: groups.map((group) => group.name),
          reminders: groups.flatMap((group) => group.reminder ?? []),
          priceType: priced ? { id: priced.price_type_id as string, name: priced.price_type_name as string } : null,
          noDebt: groups.some((group) => group.no_debt),
          noLayaway: groups.some((group) => group.no_layaway),
          noExchange: groups.some((group) => group.no_exchange),
        },
      ]
    }),
  )
}
