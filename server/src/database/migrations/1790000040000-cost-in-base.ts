import { MigrationInterface, QueryRunner } from 'typeorm'

/** Every table that kept a second cost beside the base, and the columns it kept it in. */
const SECOND_COSTS: [string, string[]][] = [
  ['receipts', ['goods_usd', 'expenses_usd', 'cost_usd']],
  ['receipt_lines', ['cost_usd']],
  ['receipt_expenses', ['amount_usd']],
  ['stock_batches', ['cost_usd']],
  ['stock_balances', ['cost_usd']],
  ['stock_movements', ['cost_usd']],
  ['stock_documents', ['cost_usd']],
  ['stock_document_lines', ['cost_usd']],
  ['stock_document_items', ['cost_usd']],
  ['sales', ['cost_usd']],
  ['sale_lines', ['cost_usd']],
  ['sale_items', ['cost_usd', 'returned_usd']],
  ['sale_return_lines', ['cost_usd']],
]

/**
 * Costs are kept in the base alone. The columns named for dollars held a
 * second cost — dollars once, then whatever "cost currency" the business
 * chose — and go, with that choice. What a piece cost in the currency it was
 * bought in is still there: the receipt line's price, and the receipt's rate.
 *
 * A receipt has one rate now, between its own currency and the base, written
 * the way round the business writes rates (`rate_way`: `in` — one of the
 * receipt's currency in the base, `per` — one of the base in it). The two it
 * had went through a third currency between them; what they made of one of
 * the receipt's currency in the base is kept, the larger number first.
 *
 * Undone, the columns come back holding the base, and the rate goes back as
 * two with the base between.
 */
export class CostInBase1790000040000 implements MigrationInterface {
  name = 'CostInBase1790000040000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE receipts
        ADD COLUMN rate numeric(18, 6) CHECK (rate > 0),
        ADD COLUMN rate_way text NOT NULL DEFAULT 'in' CHECK (rate_way IN ('in', 'per'));
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`
      WITH worth AS (
        SELECT r.id, CASE WHEN r.currency = 'USD' THEN r.uzs_rate ELSE r.uzs_rate / r.usd_rate END AS one
        FROM receipts r JOIN organizations o ON o.id = r.org_id
        WHERE r.currency <> o.base_currency
      )
      UPDATE receipts r
      SET rate = round(CASE WHEN w.one >= 1 THEN w.one ELSE 1 / w.one END, 6),
          rate_way = CASE WHEN w.one >= 1 THEN 'in' ELSE 'per' END
      FROM worth w WHERE w.id = r.id;
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
    await queryRunner.query(`
      ALTER TABLE receipts DROP COLUMN usd_rate, DROP COLUMN uzs_rate;
      ALTER TABLE organizations DROP COLUMN IF EXISTS cost_currency;
    `)
    for (const [table, columns] of SECOND_COSTS) {
      await queryRunner.query(`ALTER TABLE ${table} ${columns.map((column) => `DROP COLUMN ${column}`).join(', ')}`)
    }
    // The check that an empty balance is worth nothing went with the dollar column it named.
    await queryRunner.query(
      `ALTER TABLE stock_balances ADD CONSTRAINT stock_balances_empty CHECK (qty > 0 OR cost_uzs = 0)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE stock_balances DROP CONSTRAINT stock_balances_empty`)
    for (const [table, columns] of SECOND_COSTS) {
      await queryRunner.query(
        `ALTER TABLE ${table} ${columns.map((column) => `ADD COLUMN ${column} bigint`).join(', ')}`,
      )
      // Each holds the base again, as the columns did where no second currency was kept.
      await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
      await queryRunner.query(
        `UPDATE ${table} SET ${columns.map((column) => `${column} = ${column.replace(/_usd$/, '_uzs')}`).join(', ')}`,
      )
      await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
    }
    await queryRunner.query(`
      ALTER TABLE stock_balances ADD CHECK (qty > 0 OR (cost_usd = 0 AND cost_uzs = 0));
      ALTER TABLE receipts ADD COLUMN usd_rate numeric(18, 6), ADD COLUMN uzs_rate numeric(18, 6);
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`
      UPDATE receipts SET usd_rate = 1,
        uzs_rate = CASE WHEN rate IS NULL THEN 1 WHEN rate_way = 'in' THEN rate ELSE round(1 / rate, 6) END;
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
    await queryRunner.query(`
      ALTER TABLE receipts
        ALTER COLUMN usd_rate SET NOT NULL, ADD CHECK (usd_rate > 0),
        ALTER COLUMN uzs_rate SET NOT NULL, ADD CHECK (uzs_rate > 0),
        DROP COLUMN rate, DROP COLUMN rate_way;
    `)
  }
}
