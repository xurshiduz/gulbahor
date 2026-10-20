import { queryKeys, soundKey } from '@erp/core'
import { Brackets, ObjectLiteral, SelectQueryBuilder } from 'typeorm'

/** `soundKey` in SQL, over a stored search key: the two must fold alike. */
export const SOUND = (column: string) =>
  `regexp_replace(replace(translate(replace(replace(replace(replace(${column}, 'dzh', 'j'), 'dj', 'j'), 'kh', 'h'), ` +
  `'gh', 'g'), 'xq', 'hk'), 'iy', 'i'), '(.)\\1+', '\\1', 'g')`

/**
 * Filters by a row's `search_key`. Every word of the query must appear, in
 * any order; the query is also tried as if typed with the wrong keyboard
 * layout. With `names`, a word may also be spelt another way (`soundKey`):
 * "muhammadali" finds "Мухаммадали". `column` is trusted SQL, never user input.
 */
export function applySearch<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  column: string,
  q: string | undefined,
  options: { names?: boolean } = {},
) {
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
              const name = `search_${i}_${j}`
              const params = { [name]: `%${escapeLike(word)}%`, [`${name}_sound`]: `%${escapeLike(soundKey(word))}%` }
              everyWord.andWhere(
                options.names
                  ? `(${column} LIKE :${name} OR ${SOUND(column)} LIKE :${name}_sound)`
                  : `${column} LIKE :${name}`,
                params,
              )
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
