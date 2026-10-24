import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Printers plugged into the agent's computer: reached by the name Windows gives them (`printers.queue`), not by
 * an address — their `host` is left empty. And each agent's receipt printer, which it makes the computer's default.
 */
export class UsbPrinters1790000065000 implements MigrationInterface {
  name = 'UsbPrinters1790000065000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE printers ADD COLUMN queue text`)
    await queryRunner.query(`ALTER TABLE agents ADD COLUMN receipt_printer text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE agents DROP COLUMN receipt_printer`)
    await queryRunner.query(`ALTER TABLE printers DROP COLUMN queue`)
  }
}
