import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * A bank's notice of money moving is set beside the books (KEYINGI-REJA, 18-bo'lim, T2).
 *
 * Every notice of money moving stands somewhere (`standing`): `open` until somebody says what the money was,
 * `linked` once it is tied to the document that wrote it — a sale, a customer's payment, an expense, a
 * transfer — and `dismissed` when it is knowingly left off the books, with the reason. A tie moves no money:
 * it says the bank saw what the books hold. Undone, the document gives its notices back (`LedgerService.post`).
 *
 * `card_checks` — money in the books the bank never wrote of, looked at and found right by a named person.
 */
export class CardLinks1790000059000 implements MigrationInterface {
  name = 'CardLinks1790000059000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE card_notices
        ADD COLUMN standing text CHECK (standing IN ('open', 'linked', 'dismissed')),
        ADD COLUMN link_way text CHECK (link_way IN ('picked', 'auto', 'matched')),
        ADD COLUMN document_type text,
        ADD COLUMN document_id uuid,
        ADD COLUMN reason text,
        ADD COLUMN handled_by uuid,
        ADD COLUMN handled_by_name text,
        ADD COLUMN handled_at timestamptz;
      UPDATE card_notices SET standing = 'open' WHERE kind = 'move';
      ALTER TABLE card_notices
        ADD CONSTRAINT card_notices_standing CHECK ((kind = 'move') = (standing IS NOT NULL)),
        ADD CONSTRAINT card_notices_linked CHECK (
          (standing = 'linked') = (document_id IS NOT NULL AND document_type IS NOT NULL AND link_way IS NOT NULL)
        ),
        ADD CONSTRAINT card_notices_dismissed CHECK ((standing = 'dismissed') = (reason IS NOT NULL));
      CREATE INDEX card_notices_document ON card_notices (document_type, document_id) WHERE document_id IS NOT NULL;
      CREATE INDEX card_notices_open ON card_notices (org_id, account_id, received_at) WHERE standing = 'open';
    `)

    await queryRunner.query(`
      CREATE TABLE card_checks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        document_type text NOT NULL,
        document_id uuid NOT NULL,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        note text,
        created_by uuid,
        created_by_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT card_checks_one UNIQUE (org_id, document_type, document_id, account_id)
      );
    `)
    await queryRunner.query(tenantPolicy('card_checks'))
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE card_checks;
      DROP INDEX card_notices_open;
      DROP INDEX card_notices_document;
      ALTER TABLE card_notices
        DROP CONSTRAINT card_notices_dismissed,
        DROP CONSTRAINT card_notices_linked,
        DROP CONSTRAINT card_notices_standing,
        DROP COLUMN handled_at,
        DROP COLUMN handled_by_name,
        DROP COLUMN handled_by,
        DROP COLUMN reason,
        DROP COLUMN document_id,
        DROP COLUMN document_type,
        DROP COLUMN link_way,
        DROP COLUMN standing;
    `)
  }
}
