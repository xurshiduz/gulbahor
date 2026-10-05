import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A card serves several shops.
 *
 * `accounts.location_ids` names the shops an account serves; empty means
 * every shop. It is what decides who may use the account and which tills
 * offer it. `location_id` stays as the one shop of an account that has
 * exactly one (a drawer, a safe, a terminal), for the lists that show it.
 */
export class AccountShops1790000014000 implements MigrationInterface {
  name = 'AccountShops1790000014000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN location_ids uuid[] NOT NULL DEFAULT '{}'`)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`UPDATE accounts SET location_ids = ARRAY[location_id] WHERE location_id IS NOT NULL`)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
    await queryRunner.query(`CREATE INDEX accounts_location_ids ON accounts USING gin (location_ids)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS accounts_location_ids;
      ALTER TABLE accounts DROP COLUMN location_ids;
    `)
  }
}
