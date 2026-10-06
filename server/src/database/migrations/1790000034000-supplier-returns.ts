import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Goods sent back to the supplier they came from: a stock document of its
 * own kind. It names the receipt they came on (`receipt_id`): they leave
 * from that receipt's batches, and what the business owes for them comes
 * off the supplier's account at the receipt's prices, in the account's own
 * currency. Cancelled, both come back.
 */
const KINDS_BEFORE = `'receipt', 'receipt_cancel', 'revalue', 'transfer', 'transfer_cancel', 'transfer_loss', 'writeoff', 'writeoff_cancel', 'count', 'sale', 'sale_void', 'sale_return'`
const KINDS = `${KINDS_BEFORE}, 'supplier_return', 'supplier_return_cancel'`

const ROLE_GRANTS: Record<string, string[]> = {
  manager: ['supplier_returns.*'],
  accountant: ['supplier_returns.view'],
  warehouse: ['supplier_returns.view', 'supplier_returns.manage'],
}

export class SupplierReturns1790000034000 implements MigrationInterface {
  name = 'SupplierReturns1790000034000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind;
      ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind CHECK (kind IN (${KINDS}));

      ALTER TABLE stock_documents DROP CONSTRAINT stock_documents_kind_check;
      ALTER TABLE stock_documents ADD CONSTRAINT stock_documents_kind_check
        CHECK (kind IN ('transfer', 'writeoff', 'count', 'supplier_return'));
      ALTER TABLE stock_documents
        ADD COLUMN receipt_id uuid REFERENCES receipts(id) ON DELETE RESTRICT,
        ADD CONSTRAINT stock_documents_receipt CHECK ((kind = 'supplier_return') = (receipt_id IS NOT NULL));
      CREATE INDEX stock_documents_receipt_idx ON stock_documents (receipt_id) WHERE receipt_id IS NOT NULL;
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    for (const [role, grants] of Object.entries(ROLE_GRANTS)) {
      await queryRunner.query(
        `UPDATE roles SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || $1::text[]) ORDER BY 1)
         WHERE template_key = $2`,
        [grants, role],
      )
    }
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM stock_documents WHERE kind = 'supplier_return';
      DROP INDEX stock_documents_receipt_idx;
      ALTER TABLE stock_documents DROP CONSTRAINT stock_documents_receipt, DROP COLUMN receipt_id;
      ALTER TABLE stock_documents DROP CONSTRAINT stock_documents_kind_check;
      ALTER TABLE stock_documents ADD CONSTRAINT stock_documents_kind_check
        CHECK (kind IN ('transfer', 'writeoff', 'count'));
      ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind;
      ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind CHECK (kind IN (${KINDS_BEFORE}));
    `)
  }
}
