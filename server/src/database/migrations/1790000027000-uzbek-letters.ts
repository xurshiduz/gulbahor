import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * The names the system itself wrote, in the letters Uzbek is spelt with.
 *
 * Everything the screens say is now written o‘ and g‘ (U+2018), with ’
 * (U+2019) for the tutuq belgisi, where it used to be the typewriter's
 * apostrophe. A business that is already here was given its first roles,
 * kinds of expense, colours and the rest in the old spelling; those are
 * respelt — and only those: a name is changed only while it is still exactly
 * what the system wrote. What people typed themselves is theirs and is left
 * alone. Search does not notice: its keys drop every kind of apostrophe.
 */
const NAMES: [table: string, column: string, names: string[], only?: string][] = [
  ['roles', 'name', ['Do‘kon menejeri']],
  ['money_categories', 'name', ['Kommunal to‘lovlar', 'Soliq va yig‘imlar', 'Egasi qo‘shdi']],
  ['accounts', 'name', ['Boshlang‘ich qoldiq', 'Yo‘ldagi pul'], `kind = 'system'`],
  ['locations', 'name', ['Yo‘lda'], `kind = 'transit'`],
  ['attributes', 'name', ['O‘lcham', 'O‘lcham (harfli)', 'O‘lcham (raqamli)', 'Poyabzal o‘lchami', 'Bolalar bo‘yi']],
  ['attribute_values', 'name', ['To‘q sariq', 'Ko‘k', 'To‘q ko‘k']],
  ['categories', 'name', ['Ko‘ylaklar', 'O‘g‘il bolalar']],
]

/** Where goods come from: one country stands on many of them, so there is no twin to look out for. */
const COUNTRIES = ['O‘zbekiston', 'Qirg‘iziston', 'Qozog‘iston']

/** A name as the typewriter had it. */
const plain = (name: string) => name.replace(/[‘’]/g, "'")

/** The end of a till's drawer of so'm: the till's own name before it is whatever its people called it. */
const DRAWER = [" (so'm)", ' (so‘m)']

export class UzbekLetters1790000027000 implements MigrationInterface {
  name = 'UzbekLetters1790000027000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.respell(queryRunner, (name) => [plain(name), name], DRAWER)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.respell(queryRunner, (name) => [name, plain(name)], [DRAWER[1], DRAWER[0]])
  }

  private async respell(
    queryRunner: QueryRunner,
    pair: (name: string) => string[],
    [drawerFrom, drawerTo]: string[],
  ): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    for (const [table, column, names, only] of NAMES) {
      for (const name of names) {
        const [from, to] = pair(name)
        // Where a business already has the other spelling beside this one, both are left as they are.
        await queryRunner.query(
          `UPDATE ${table} AS mine SET ${column} = $2
           WHERE mine.${column} = $1 ${only ? `AND mine.${only}` : ''}
             AND NOT EXISTS (SELECT 1 FROM ${table} AS twin WHERE twin.org_id = mine.org_id AND twin.${column} = $2)`,
          [from, to],
        )
      }
    }
    for (const name of COUNTRIES) {
      await queryRunner.query(`UPDATE products SET origin_country = $2 WHERE origin_country = $1`, pair(name))
    }
    await queryRunner.query(
      `UPDATE accounts SET name = left(name, length(name) - length($1)) || $2
       WHERE kind = 'cash' AND right(name, length($1)) = $1`,
      [drawerFrom, drawerTo],
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }
}
