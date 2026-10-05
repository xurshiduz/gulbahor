import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A shop's main till.
 *
 * A shop may have several tills. One of them is the one money is taken from
 * and put into when nobody says which: a payment to a supplier, an expense.
 * Every shop that has a till has exactly one main till; the oldest that is
 * still in use becomes it here.
 */
export class MainTill1790000023000 implements MigrationInterface {
  name = 'MainTill1790000023000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE registers ADD COLUMN is_main boolean NOT NULL DEFAULT false`)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`
      UPDATE registers r SET is_main = true
      WHERE r.id = (
        SELECT f.id FROM registers f WHERE f.location_id = r.location_id
        ORDER BY f.is_active DESC, f.created_at, f.id LIMIT 1
      )
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
    await queryRunner.query(`CREATE UNIQUE INDEX registers_main ON registers (location_id) WHERE is_main`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS registers_main`)
    await queryRunner.query(`ALTER TABLE registers DROP COLUMN is_main`)
  }
}
