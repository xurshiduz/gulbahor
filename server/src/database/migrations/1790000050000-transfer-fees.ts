import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * What a bank keeps for moving money (KEYINGI-REJA, 17.4). A transfer may
 * cost something on top of what it moves: so much leaves the account beside
 * the sum itself and is an expense. The expense is a document of its own
 * (`money_ops`), written with the transfer and tied to it both ways: it goes
 * back with the transfer when that is refused or taken back, and is not
 * taken back on its own.
 *
 * It is written under the kind of expense marked `bank_fee`: the business's
 * "Bank komissiyasi", whatever it has been renamed to since — or a new one
 * where there is none.
 */
export class TransferFees1790000050000 implements MigrationInterface {
  name = 'TransferFees1790000050000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`
      ALTER TABLE money_transfers
        ADD COLUMN fee bigint NOT NULL DEFAULT 0 CHECK (fee >= 0),
        ADD COLUMN fee_op_id uuid REFERENCES money_ops(id) ON DELETE RESTRICT;
      ALTER TABLE money_transfers ADD CONSTRAINT money_transfers_fee_op CHECK ((fee = 0) = (fee_op_id IS NULL));
      ALTER TABLE money_ops ADD COLUMN transfer_id uuid REFERENCES money_transfers(id) ON DELETE RESTRICT;

      ALTER TABLE money_categories ADD COLUMN system_key text;
      CREATE UNIQUE INDEX money_categories_system_key ON money_categories (org_id, system_key)
        WHERE system_key IS NOT NULL;

      UPDATE money_categories c SET system_key = 'bank_fee'
      WHERE c.id = (
        SELECT f.id FROM money_categories f
        WHERE f.org_id = c.org_id AND f.kind = 'expense' AND lower(f.name) = lower('Bank komissiyasi')
        ORDER BY f.created_at LIMIT 1
      );

      INSERT INTO money_categories (org_id, kind, name, in_profit, is_active, sort_order, system_key)
      SELECT o.id, 'expense', 'Bank komissiyasi', true, true,
             (SELECT coalesce(max(c.sort_order), 0) + 1 FROM money_categories c WHERE c.org_id = o.id), 'bank_fee'
      FROM organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM money_categories c WHERE c.org_id = o.id AND c.system_key = 'bank_fee'
      );
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    const [{ made }]: { made: number }[] = await queryRunner.query(
      `SELECT count(*)::int AS made FROM money_transfers WHERE fee <> 0`,
    )
    if (made) {
      throw new Error(`Komissiyali o‘tkazmalar bor (${made} ta): ular eski tuzilishga sig‘maydi.`)
    }
    await queryRunner.query(`
      DROP INDEX money_categories_system_key;
      ALTER TABLE money_categories DROP COLUMN system_key;
      ALTER TABLE money_ops DROP COLUMN transfer_id;
      ALTER TABLE money_transfers DROP CONSTRAINT money_transfers_fee_op;
      ALTER TABLE money_transfers DROP COLUMN fee_op_id, DROP COLUMN fee;
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }
}
