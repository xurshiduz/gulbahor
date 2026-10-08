import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A business keeps its books in any currency of the catalogue, not only in
 * so'm or dollars: a shop in Almaty keeps them in tenge, one in Bishkek in
 * soms. Prices are in that currency or in dollars beside it. Which
 * currencies those are is for the application to say; the tables only ask
 * that a currency look like one.
 *
 * Columns named for so'm (`cost_uzs`, `change_uzs`, `uzs_per_usd`…) keep
 * their names: they hold the base, whichever currency that is.
 *
 * Undone, a business or a price in another currency stops the way back.
 */
const CODE = `~ '^[A-Z]{3}$'`

const COLUMNS: [table: string, column: string][] = [
  ['organizations', 'base_currency'],
  ['price_types', 'currency'],
  ['prices', 'currency'],
]

export class BaseCurrency1790000035000 implements MigrationInterface {
  name = 'BaseCurrency1790000035000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of COLUMNS) {
      await queryRunner.query(`
        ALTER TABLE ${table} DROP CONSTRAINT ${table}_${column}_check;
        ALTER TABLE ${table} ADD CONSTRAINT ${table}_${column}_check CHECK (${column} ${CODE});
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of COLUMNS) {
      await queryRunner.query(`
        ALTER TABLE ${table} DROP CONSTRAINT ${table}_${column}_check;
        ALTER TABLE ${table} ADD CONSTRAINT ${table}_${column}_check CHECK (${column} IN ('UZS', 'USD'));
      `)
    }
  }
}
