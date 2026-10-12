import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * One person written down twice is made one (KEYINGI-REJA, 16, decision 23).
 * The one that goes is put away for good and points at the one that stays
 * (`merged_into`); their balance went there by a ledger entry of its own, and
 * their accounts stay as they were, empty, with their history. A customer
 * points at whoever they are now, never at someone who was merged in turn.
 */
export class CustomerMerges1790000053000 implements MigrationInterface {
  name = 'CustomerMerges1790000053000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customers
        ADD COLUMN merged_into uuid REFERENCES customers(id) ON DELETE RESTRICT,
        ADD COLUMN merged_at timestamptz,
        ADD CONSTRAINT customers_merged CHECK (
          (merged_into IS NULL) = (merged_at IS NULL)
          AND (merged_into IS NULL OR (merged_into <> id AND NOT is_active))
        );
      CREATE INDEX customers_merged_into ON customers (merged_into) WHERE merged_into IS NOT NULL;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    const [{ made }]: { made: number }[] = await queryRunner.query(
      `SELECT count(*)::int AS made FROM customers WHERE merged_into IS NOT NULL`,
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
    if (made) {
      throw new Error(`Birlashtirilgan mijozlar bor (${made} ta): ular eski tuzilishga sig‘maydi.`)
    }
    await queryRunner.query(`
      DROP INDEX customers_merged_into;
      ALTER TABLE customers DROP CONSTRAINT customers_merged, DROP COLUMN merged_at, DROP COLUMN merged_into;
    `)
  }
}
