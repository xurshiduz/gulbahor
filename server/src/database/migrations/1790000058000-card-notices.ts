import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * Card control begins with reading what the banks' bots write (KEYINGI-REJA,
 * 18-bo'lim).
 *
 * `telegram_accounts` — the Telegram accounts the business has signed into
 * from here, each read for the banks' chats alone. What is kept of an account
 * is the key of its session, sealed (`session`); never a code or a password.
 *
 * `card_notices` — every message as it came, and what was read out of it:
 * which way the money went, how much, on which card, when by the bank's
 * clock, and what was left. A message is kept once, by where it came from
 * (`source_key`: the account, chat and message, or a key of its own for one
 * put in by hand); one that could not be read is kept all the same, `unread`.
 *
 * Nothing here moves money in the books: a notice is evidence, set beside
 * what the system says of the card.
 */
export class CardNotices1790000058000 implements MigrationInterface {
  name = 'CardNotices1790000058000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE telegram_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        phone text NOT NULL,
        name text,
        telegram_id text,
        -- The session's key, sealed with the server's own; null once the account is switched off or signed out.
        session text,
        status text NOT NULL CHECK (status IN ('connected', 'offline', 'signed_out', 'off')),
        -- The banks' chats it reads: [{ "id": "...", "title": "..." }].
        chats jsonb NOT NULL DEFAULT '[]',
        last_notice_at timestamptz,
        last_seen_at timestamptz,
        error text,
        created_by uuid,
        created_by_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT telegram_accounts_phone UNIQUE (org_id, phone)
      );
    `)
    await queryRunner.query(tenantPolicy('telegram_accounts'))

    await queryRunner.query(`
      CREATE TABLE card_notices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        source text NOT NULL CHECK (source IN ('telegram', 'manual')),
        source_key text NOT NULL,
        telegram_account_id uuid REFERENCES telegram_accounts(id) ON DELETE SET NULL,
        bot text,
        received_at timestamptz NOT NULL,
        text text NOT NULL,
        kind text NOT NULL CHECK (kind IN ('move', 'balance', 'unread')),
        direction text CHECK (direction IN ('in', 'out')),
        amount bigint,
        currency text CHECK (currency ~ '^[A-Z]{3}$'),
        heading text,
        place text,
        card_tail text,
        -- The bank's own clock as written, "2026-09-15T17:46": no zone, so kept as text.
        stated_at text,
        balance bigint,
        account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
        gap boolean NOT NULL DEFAULT false,
        added_by uuid,
        added_by_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT card_notices_source UNIQUE (org_id, source_key),
        CONSTRAINT card_notices_move CHECK (
          kind <> 'move' OR (direction IS NOT NULL AND amount > 0 AND currency IS NOT NULL)
        )
      );
      CREATE INDEX card_notices_by_time ON card_notices (org_id, received_at DESC, id);
      CREATE INDEX card_notices_by_card ON card_notices (org_id, card_tail, received_at DESC);
    `)
    await queryRunner.query(tenantPolicy('card_notices'))
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE card_notices; DROP TABLE telegram_accounts;`)
  }
}
