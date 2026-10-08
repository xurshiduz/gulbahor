import { queryKeys } from '@erp/core'
import { Brackets, ObjectLiteral, SelectQueryBuilder } from 'typeorm'

/**
 * Filters by a row's `search_key`. Every word of the query must appear, in
 * any order; the query is also tried as if typed with the wrong keyboard
 * layout. `column` is trusted SQL, never user input.
 */
export function applySearch<T extends ObjectLiteral>(qb: SelectQueryBuilder<T>, column: string, q: string | undefined) {
  const keys = queryKeys(q ?? '')
  if (!keys.length) {
    return
  }
  qb.andWhere(
    new Brackets((anyKey) => {
      keys.forEach((key, i) => {
        anyKey.orWhere(
          new Brackets((everyWord) => {
            key.split(' ').forEach((word, j) => {
              everyWord.andWhere(`${column} LIKE :search_${i}_${j}`, { [`search_${i}_${j}`]: `%${escapeLike(word)}%` })
            })
          }),
        )
      })
    }),
  )
}

/** Orders by a whitelisted column; anything else falls back to the default. */
export function applySort<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  sortable: Record<string, string>,
  sort: string | undefined,
  order: 'asc' | 'desc',
  fallback: string,
) {
  const column = (sort && sortable[sort]) || sortable[fallback]
  qb.orderBy(column, order === 'desc' ? 'DESC' : 'ASC')
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}
