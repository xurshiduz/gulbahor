import type { EntityManager } from 'typeorm'

/**
 * Reserves `count` consecutive numbers of a business's running counter and
 * returns the first. Two transactions asking at once wait on the row, so no
 * number is handed out twice; a transaction that rolls back gives its
 * numbers back.
 */
export async function nextNumbers(em: EntityManager, orgId: string, key: string, count = 1): Promise<number> {
  const [{ value }] = await em.query(
    `INSERT INTO counters (org_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (org_id, key) DO UPDATE SET value = counters.value + $3
     RETURNING value`,
    [orgId, key, count],
  )
  return Number(value) - count + 1
}
