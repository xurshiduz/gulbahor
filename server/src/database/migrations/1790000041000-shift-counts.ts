import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/** The drawer columns a shift kept for the base and for dollars, now rows of `shift_counts`. */
const DRAWER_COLUMNS = ['opening', 'counted', 'expected', 'diff']

/**
 * A shift counts every drawer of its till, in whatever currencies the till
 * takes: a row for each, where it kept two pairs of columns — the base and
 * dollars. Shifts already kept move across: the base always, dollars where
 * there were any, or where the till takes them.
 *
 * Undone, the base and dollar rows go back to their columns; any other
 * currency's count is lost.
 */
export class ShiftCounts1790000041000 implements MigrationInterface {
  name = 'ShiftCounts1790000041000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE shift_counts (
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
        -- What the drawer opened with; what the closing count found, what the books said, and the difference.
        opening bigint NOT NULL DEFAULT 0,
        counted bigint,
        expected bigint,
        diff bigint,
        PRIMARY KEY (shift_id, currency)
      );
    `)
    await queryRunner.query(tenantPolicy('shift_counts'))
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`
      INSERT INTO shift_counts (org_id, shift_id, currency, opening, counted, expected, diff)
      SELECT s.org_id, s.id, o.base_currency, s.opening_uzs, s.counted_uzs, s.expected_uzs, s.diff_uzs
      FROM shifts s JOIN organizations o ON o.id = s.org_id;

      INSERT INTO shift_counts (org_id, shift_id, currency, opening, counted, expected, diff)
      SELECT s.org_id, s.id, 'USD', s.opening_usd, s.counted_usd, s.expected_usd, s.diff_usd
      FROM shifts s JOIN organizations o ON o.id = s.org_id JOIN registers r ON r.id = s.register_id
      WHERE o.base_currency <> 'USD'
        AND (s.opening_usd <> 0 OR coalesce(s.counted_usd, 0) <> 0 OR coalesce(s.expected_usd, 0) <> 0
             OR coalesce(s.diff_usd, 0) <> 0 OR 'USD' = ANY (r.currencies));
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
    await queryRunner.query(
      `ALTER TABLE shifts ${DRAWER_COLUMNS.flatMap((column) => [`DROP COLUMN ${column}_uzs`, `DROP COLUMN ${column}_usd`]).join(', ')}`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shifts
        ADD COLUMN opening_uzs bigint NOT NULL DEFAULT 0, ADD COLUMN opening_usd bigint NOT NULL DEFAULT 0,
        ADD COLUMN counted_uzs bigint, ADD COLUMN counted_usd bigint,
        ADD COLUMN expected_uzs bigint, ADD COLUMN expected_usd bigint,
        ADD COLUMN diff_uzs bigint, ADD COLUMN diff_usd bigint;
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`
      UPDATE shifts s SET opening_uzs = c.opening, counted_uzs = c.counted, expected_uzs = c.expected, diff_uzs = c.diff
      FROM shift_counts c JOIN organizations o ON o.id = c.org_id
      WHERE c.shift_id = s.id AND c.currency = o.base_currency;

      UPDATE shifts s SET opening_usd = c.opening, counted_usd = c.counted, expected_usd = c.expected, diff_usd = c.diff
      FROM shift_counts c JOIN organizations o ON o.id = c.org_id
      WHERE c.shift_id = s.id AND c.currency = 'USD' AND o.base_currency <> 'USD';
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
    await queryRunner.query(`DROP TABLE shift_counts`)
  }
}
