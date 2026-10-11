import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * What a bank keeps of what a terminal took (KEYINGI-REJA, 17.4): the
 * acquiring fee, in percent, kept on the terminal's account. When the
 * terminal's money is written as having reached the bank, the fee is worked
 * out from it and offered; whoever writes it may put it right.
 */
export class TerminalFees1790000051000 implements MigrationInterface {
  name = 'TerminalFees1790000051000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts ADD COLUMN fee_percent numeric(5, 2)
        CHECK (fee_percent >= 0 AND fee_percent <= 50 AND (fee_percent IS NULL OR kind = 'terminal'));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN fee_percent;`)
  }
}
