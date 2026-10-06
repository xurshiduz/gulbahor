import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Money kept in any currency a business has switched on.
 *
 * A safe, a card or a bank account may now hold yuan or roubles as well as
 * so'm and dollars, and so may the lines that say which of the business's
 * places a payment, an expense or a debt payment went through, and a
 * transfer between two such places. Which currencies a business has is for
 * the application to say (`org_currencies`); the tables only ask that a
 * currency look like one.
 *
 * The rate a line's two sums made between them used to be so'm for a
 * dollar, kept to the tiyin. Between yuan and dollars it is a handful
 * ("7,2456"), so it is kept to six places.
 *
 * Partners' accounts, prices and what the tills take stay in so'm or
 * dollars for now.
 */
const CODE = `~ '^[A-Z]{3}$'`

const TABLES = ['accounts', 'money_transfers', 'money_op_lines', 'partner_payment_lines', 'debt_payment_lines']
const RATES = ['money_op_lines', 'partner_payment_lines', 'debt_payment_lines']

export class MoneyInAnyCurrency1790000029000 implements MigrationInterface {
  name = 'MoneyInAnyCurrency1790000029000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`
        ALTER TABLE ${table} DROP CONSTRAINT ${table}_currency_check;
        ALTER TABLE ${table} ADD CONSTRAINT ${table}_currency_check CHECK (currency ${CODE});
      `)
    }
    for (const table of RATES) {
      await queryRunner.query(`ALTER TABLE ${table} ALTER COLUMN rate TYPE numeric(18, 6)`)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of RATES) {
      await queryRunner.query(`ALTER TABLE ${table} ALTER COLUMN rate TYPE numeric(14, 2)`)
    }
    for (const table of TABLES) {
      await queryRunner.query(`
        ALTER TABLE ${table} DROP CONSTRAINT ${table}_currency_check;
        ALTER TABLE ${table} ADD CONSTRAINT ${table}_currency_check CHECK (currency IN ('UZS', 'USD'));
      `)
    }
  }
}
