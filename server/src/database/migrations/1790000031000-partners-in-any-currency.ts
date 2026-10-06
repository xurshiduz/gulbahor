import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A partner's account in any currency the business has switched on: a
 * supplier in Guangzhou is owed yuan, and what he is owed is said in yuan.
 * Which currencies a business has is for the application to say; the
 * tables only ask that a currency look like one.
 */
const TABLES = ['partners', 'partner_payments']

export class PartnersInAnyCurrency1790000031000 implements MigrationInterface {
  name = 'PartnersInAnyCurrency1790000031000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`
        ALTER TABLE ${table} DROP CONSTRAINT ${table}_currency_check;
        ALTER TABLE ${table} ADD CONSTRAINT ${table}_currency_check CHECK (currency ~ '^[A-Z]{3}$');
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`
        ALTER TABLE ${table} DROP CONSTRAINT ${table}_currency_check;
        ALTER TABLE ${table} ADD CONSTRAINT ${table}_currency_check CHECK (currency IN ('UZS', 'USD'));
      `)
    }
  }
}
