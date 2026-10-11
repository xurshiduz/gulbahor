import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * Change goes back in parts (KEYINGI-REJA, 17.2). A sale said how much it
 * handed back in the base and in one other currency, in four columns of its
 * own. Now each part is a row: notes out of a drawer in any currency the
 * till keeps, a sum put on the customer's account, a sum sent from one of
 * the shop's cards — with what of the change it stood for in the base and,
 * where that was agreed apart from the day's rate, what the rate made of
 * the difference (`fx`, + the shop's gain).
 *
 * What sales had handed back moves into rows; the columns go.
 */
export class SaleChanges1790000048000 implements MigrationInterface {
  name = 'SaleChanges1790000048000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sale_changes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        position int NOT NULL,
        way text NOT NULL CHECK (way IN ('cash', 'account', 'card')),
        -- The drawer or the card it came out of, or the customer's account it was put on.
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
        amount bigint NOT NULL CHECK (amount > 0),
        -- What of the change it stood for, in the base.
        base bigint NOT NULL CHECK (base >= 0),
        fx bigint NOT NULL DEFAULT 0
      );
      CREATE INDEX sale_changes_sale ON sale_changes (sale_id, position);
      CREATE INDEX sale_changes_account ON sale_changes (account_id);
    `)
    await queryRunner.query(tenantPolicy('sale_changes'))

    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    await queryRunner.query(`
      INSERT INTO sale_changes (org_id, sale_id, position, way, account_id, currency, amount, base)
      SELECT s.org_id, s.id, 0, 'cash', a.id, s.change_currency, s.change_other, s.change_other_base
      FROM sales s
      JOIN accounts a ON a.register_id = s.register_id AND a.kind = 'cash' AND a.currency = s.change_currency
      WHERE s.change_other > 0;

      INSERT INTO sale_changes (org_id, sale_id, position, way, account_id, currency, amount, base)
      SELECT s.org_id, s.id, 1, 'cash', a.id, o.base_currency, s.change_uzs, s.change_uzs
      FROM sales s
      JOIN organizations o ON o.id = s.org_id
      JOIN accounts a ON a.register_id = s.register_id AND a.kind = 'cash' AND a.currency = o.base_currency
      WHERE s.change_uzs > 0;
    `)
    const [{ had, moved }]: { had: number; moved: number }[] = await queryRunner.query(
      `SELECT (SELECT count(*) FILTER (WHERE change_uzs > 0) + count(*) FILTER (WHERE change_other > 0) FROM sales)::int AS had,
              (SELECT count(*) FROM sale_changes)::int AS moved`,
    )
    if (had !== moved) {
      throw new Error(
        `Qaytim yozuvlarining hammasi ko‘chmadi (${moved} / ${had}): qaytim berilgan kassaning tortmasi topilmadi.`,
      )
    }
    await queryRunner.query(`
      ALTER TABLE sales
        DROP COLUMN change_uzs,
        DROP COLUMN change_other,
        DROP COLUMN change_currency,
        DROP COLUMN change_other_base;
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    const [{ made }]: { made: number }[] = await queryRunner.query(
      `SELECT (
         (SELECT count(*) FROM sale_changes WHERE way <> 'cash' OR fx <> 0)
         + (SELECT count(*) FROM (
              SELECT c.sale_id FROM sale_changes c JOIN organizations o ON o.id = c.org_id
              WHERE c.currency <> o.base_currency GROUP BY c.sale_id HAVING count(*) > 1
            ) many)
       )::int AS made`,
    )
    if (made) {
      throw new Error(
        `Hisobga yozilgan, kartadan berilgan, kelishilgan qiymatdagi yoki bir nechta valyutadagi qaytim bor (${made} ta): ular eski tuzilishga sig‘maydi.`,
      )
    }
    await queryRunner.query(`
      ALTER TABLE sales
        ADD COLUMN change_uzs bigint NOT NULL DEFAULT 0,
        ADD COLUMN change_other bigint NOT NULL DEFAULT 0,
        ADD COLUMN change_currency text CHECK (change_currency ~ '^[A-Z]{3}$'),
        ADD COLUMN change_other_base bigint NOT NULL DEFAULT 0;

      UPDATE sales s SET change_uzs = c.amount
      FROM sale_changes c JOIN organizations o ON o.id = c.org_id
      WHERE c.sale_id = s.id AND c.currency = o.base_currency;

      UPDATE sales s SET change_other = c.amount, change_currency = c.currency, change_other_base = c.base
      FROM sale_changes c JOIN organizations o ON o.id = c.org_id
      WHERE c.sale_id = s.id AND c.currency <> o.base_currency;

      DROP TABLE sale_changes;
    `)
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }
}
