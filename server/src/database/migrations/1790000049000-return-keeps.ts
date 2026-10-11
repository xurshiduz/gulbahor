import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Money owed for goods brought back has two more ways to go (KEYINGI-REJA,
 * 17.3):
 *
 * - `kept` — it stays on the customer's account instead of being handed
 *   over: a row by `account` like what comes off a debt the sale made, told
 *   apart from it by this mark;
 * - `fx` — notes of another currency handed back for a worth agreed apart
 *   from the day's rate, or a sum kept on an account in another currency:
 *   what that left the shop with (+) or cost it (−).
 */
export class ReturnKeeps1790000049000 implements MigrationInterface {
  name = 'ReturnKeeps1790000049000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sale_return_payments
        ADD COLUMN fx bigint NOT NULL DEFAULT 0,
        ADD COLUMN kept boolean NOT NULL DEFAULT false;
      ALTER TABLE sale_return_payments ADD CONSTRAINT sale_return_payments_kept
        CHECK (NOT kept OR method = 'account');
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    const [{ made }]: { made: number }[] = await queryRunner.query(
      `SELECT count(*)::int AS made FROM sale_return_payments WHERE kept OR fx <> 0`,
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
    if (made) {
      throw new Error(
        `Hisobda qoldirilgan yoki kelishilgan qiymatda qaytarilgan pul yozuvlari bor (${made} ta): ular eski tuzilishga sig‘maydi.`,
      )
    }
    await queryRunner.query(`
      ALTER TABLE sale_return_payments DROP CONSTRAINT sale_return_payments_kept;
      ALTER TABLE sale_return_payments DROP COLUMN kept, DROP COLUMN fx;
    `)
  }
}
