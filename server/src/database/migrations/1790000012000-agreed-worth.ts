import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Dollars taken for an agreed worth: "call the 50 dollars 600 000".
 *
 * A payment's `base` is what it paid of the sale. When that was agreed and is
 * not what the day's rate makes the notes, `fx` holds the difference: what
 * the shop was left with (+) or what it cost it (−). The drawer takes the
 * notes in at the rate, `base + fx`, and the difference goes to the rate
 * difference account.
 */
export class AgreedWorth1790000012000 implements MigrationInterface {
  name = 'AgreedWorth1790000012000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sale_payments ADD COLUMN fx bigint NOT NULL DEFAULT 0`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sale_payments DROP COLUMN fx`)
  }
}
