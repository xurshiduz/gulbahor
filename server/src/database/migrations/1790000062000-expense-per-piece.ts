import { MigrationInterface, QueryRunner } from 'typeorm'

/** A receipt expense may be written per piece (a hanger, a bag): `piece` joins the ways an expense is shared out. */
export class ExpensePerPiece1790000062000 implements MigrationInterface {
  name = 'ExpensePerPiece1790000062000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE receipt_expenses DROP CONSTRAINT receipt_expenses_basis_check;
      ALTER TABLE receipt_expenses ADD CONSTRAINT receipt_expenses_basis_check
        CHECK (basis IN ('value', 'quantity', 'weight', 'piece'));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE receipt_expenses SET basis = 'quantity' WHERE basis = 'piece';
      ALTER TABLE receipt_expenses DROP CONSTRAINT receipt_expenses_basis_check;
      ALTER TABLE receipt_expenses ADD CONSTRAINT receipt_expenses_basis_check
        CHECK (basis IN ('value', 'quantity', 'weight'));
    `)
  }
}
