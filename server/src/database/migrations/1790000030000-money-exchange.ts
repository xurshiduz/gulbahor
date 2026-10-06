import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A transfer between places in two currencies: an exchange.
 *
 * What leaves one place is still `currency` and `amount`, worth `base` when
 * it was sent. What enters the other is now said apart: `to_amount` of
 * `to_currency`, worth `to_base`. The rate is fixed when the money is sent,
 * so the person who takes it in confirms a sum, not a rate. `fx` is what the
 * exchange made for the business against the day's rates (`to_base - base`:
 * more than nothing is a gain); it reaches the books when the money arrives.
 *
 * A transfer made before this moved money of one currency: it entered as it
 * left, at the same worth, with nothing between.
 */
export class MoneyExchange1790000030000 implements MigrationInterface {
  name = 'MoneyExchange1790000030000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE money_transfers
        ADD COLUMN to_currency text,
        ADD COLUMN to_amount bigint,
        ADD COLUMN to_base bigint,
        ADD COLUMN fx bigint NOT NULL DEFAULT 0
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`UPDATE money_transfers SET to_currency = currency, to_amount = amount, to_base = base`)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
    await queryRunner.query(`
      ALTER TABLE money_transfers
        ALTER COLUMN to_currency SET NOT NULL,
        ALTER COLUMN to_amount SET NOT NULL,
        ALTER COLUMN to_base SET NOT NULL,
        ADD CONSTRAINT money_transfers_to_currency_check CHECK (to_currency ~ '^[A-Z]{3}$'),
        ADD CONSTRAINT money_transfers_to_amount_check CHECK (to_amount > 0),
        ADD CONSTRAINT money_transfers_fx_check CHECK (fx = to_base - base)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE money_transfers
        DROP COLUMN fx,
        DROP COLUMN to_base,
        DROP COLUMN to_amount,
        DROP COLUMN to_currency
    `)
  }
}
