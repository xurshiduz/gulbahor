import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * Two checks on the till.
 *
 * A sale or a return that needed a manager's word (a discount over the
 * limit, goods taken back late) remembers who gave it. And a shift, closing,
 * writes down what each terminal's own slip says it took, to be set against
 * the payments rung up on that terminal.
 */
export class TillControls1790000009000 implements MigrationInterface {
  name = 'TillControls1790000009000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales ADD COLUMN approved_by uuid, ADD COLUMN approved_by_name text;
      ALTER TABLE sale_returns ADD COLUMN approved_by uuid, ADD COLUMN approved_by_name text;

      CREATE TABLE shift_terminal_counts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        -- What the terminal's slip says, what the till rang up on it, and the difference.
        counted bigint NOT NULL,
        expected bigint NOT NULL,
        diff bigint NOT NULL,
        UNIQUE (shift_id, account_id)
      );
    `)
    await queryRunner.query(tenantPolicy('shift_terminal_counts'))
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS shift_terminal_counts CASCADE;
      ALTER TABLE sale_returns DROP COLUMN approved_by, DROP COLUMN approved_by_name;
      ALTER TABLE sales DROP COLUMN approved_by, DROP COLUMN approved_by_name;
    `)
  }
}
