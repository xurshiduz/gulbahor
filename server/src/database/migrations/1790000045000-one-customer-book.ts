import { searchKey } from '@erp/core'
import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/** As the customers' service keys them: the number with the country code and from the operator's digits on. */
function keyOf(customer: { name: string; phone: string | null; note: string | null; tags: string[] }): string {
  const digits = (customer.phone ?? '').replace(/\D/g, '')
  return searchKey(`${customer.name} ${digits} ${digits.slice(3)} ${customer.note ?? ''} ${customer.tags.join(' ')}`)
}

/** What a partners' permission becomes: the customers' ones that do what it did. */
const RENAMED: [string, string[]][] = [
  ['partners.*', ['customers.*']],
  ['partners.view', ['customers.view']],
  ['partners.manage', ['customers.manage']],
  ['partners.debts', ['customers.debts', 'customers.suppliers']],
  ['partners.pay', ['customers.receive', 'customers.pay_out']],
  ['partners.adjust', ['customers.adjust']],
  ['pos.partner_sale', ['pos.debt']],
]

/**
 * One book of customers (KEYINGI-REJA, 16): partners are no more a list of their own. Each partner becomes a
 * customer with the same id — or, where a customer has their phone, that customer — and keeps everything that was
 * theirs: their account, now one of the customer's (one to a currency), their payments (TL-), the receipts they
 * supplied, the sales put on their account. A phone two partners shared stays with the one whose account was used
 * (else the older) and goes into the other's note.
 *
 * Undone only where no customer's account has seen money: then the partners are made again from the customers
 * that supply goods or were sold to on account, with the same ids.
 */
export class OneCustomerBook1790000045000 implements MigrationInterface {
  name = 'OneCustomerBook1790000045000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)

    // ── Who each partner becomes ──
    await queryRunner.query(`
      WITH ranked AS (
        SELECT p.id, row_number() OVER (
          PARTITION BY p.org_id, p.phone
          ORDER BY EXISTS (
            SELECT 1 FROM accounts a JOIN ledger_lines l ON l.account_id = a.id WHERE a.partner_id = p.id
          ) DESC, p.created_at, p.id
        ) AS rank
        FROM partners p WHERE p.phone IS NOT NULL
      )
      UPDATE partners p SET note = concat_ws(' · ', nullif(p.note, ''), 'Tel: ' || p.phone), phone = NULL
      FROM ranked r WHERE r.id = p.id AND r.rank > 1;

      CREATE TEMP TABLE moved (partner_id uuid PRIMARY KEY, customer_id uuid NOT NULL, merged boolean NOT NULL)
        ON COMMIT DROP;
      INSERT INTO moved
        SELECT p.id, c.id, true FROM partners p JOIN customers c ON c.org_id = p.org_id AND c.phone = p.phone;
      INSERT INTO moved
        SELECT p.id, p.id, false FROM partners p WHERE NOT EXISTS (SELECT 1 FROM moved m WHERE m.partner_id = p.id);

      -- A customer who was a partner too takes what the partner's card said; the partner's name, if another, in the note.
      UPDATE customers c SET
        currency = p.currency,
        price_type_id = CASE WHEN t.kind = 'retail' THEN NULL ELSE coalesce(p.price_type_id, c.price_type_id) END,
        is_supplier = c.is_supplier OR p.is_supplier,
        note = CASE WHEN lower(p.name) <> lower(c.name) THEN concat_ws(' · ', nullif(c.note, ''), p.name) ELSE c.note END
      FROM moved m JOIN partners p ON p.id = m.partner_id LEFT JOIN price_types t ON t.id = p.price_type_id
      WHERE m.merged AND c.id = m.customer_id;

      INSERT INTO customers (id, org_id, name, phone, note, currency, price_type_id, is_supplier, is_active,
                             search_key, created_at, updated_at)
        SELECT p.id, p.org_id, p.name, p.phone, p.note, p.currency,
               CASE WHEN t.kind = 'retail' THEN NULL ELSE p.price_type_id END, p.is_supplier, p.is_active,
               '', p.created_at, p.updated_at
        FROM partners p JOIN moved m ON m.partner_id = p.id AND NOT m.merged
        LEFT JOIN price_types t ON t.id = p.price_type_id;
    `)
    const keyed: { id: string; name: string; phone: string | null; note: string | null; tags: string[] }[] =
      await queryRunner.query(
        `SELECT c.id, c.name, c.phone, c.note, c.tags FROM customers c JOIN moved m ON m.customer_id = c.id`,
      )
    for (const customer of keyed) {
      await queryRunner.query(`UPDATE customers SET search_key = $2 WHERE id = $1`, [customer.id, keyOf(customer)])
    }

    // ── What pointed at partners points at customers ──
    await queryRunner.query(`
      ALTER TABLE receipts DROP CONSTRAINT receipts_supplier_id_fkey;
      UPDATE receipts r SET supplier_id = m.customer_id FROM moved m WHERE m.merged AND r.supplier_id = m.partner_id;
      ALTER TABLE receipts ADD CONSTRAINT receipts_supplier_id_fkey
        FOREIGN KEY (supplier_id) REFERENCES customers(id) ON DELETE RESTRICT;

      ALTER TABLE receipt_lines DROP CONSTRAINT receipt_lines_supplier_id_fkey;
      UPDATE receipt_lines r SET supplier_id = m.customer_id
        FROM moved m WHERE m.merged AND r.supplier_id = m.partner_id;
      ALTER TABLE receipt_lines ADD CONSTRAINT receipt_lines_supplier_id_fkey
        FOREIGN KEY (supplier_id) REFERENCES customers(id) ON DELETE RESTRICT;

      ALTER TABLE accounts DROP CONSTRAINT accounts_partner_id_fkey, DROP CONSTRAINT accounts_partner,
        DROP CONSTRAINT accounts_kind_check;
      DROP INDEX accounts_of_partner;
      ALTER TABLE accounts RENAME COLUMN partner_id TO customer_id;
      UPDATE accounts a SET customer_id = m.customer_id FROM moved m WHERE m.merged AND a.customer_id = m.partner_id;
      UPDATE accounts SET kind = 'customer' WHERE kind = 'partner';
      ALTER TABLE accounts
        ADD CONSTRAINT accounts_kind_check
          CHECK (kind IN ('cash', 'safe', 'card', 'terminal', 'bank', 'system', 'customer')),
        ADD CONSTRAINT accounts_customer CHECK ((kind = 'customer') = (customer_id IS NOT NULL)),
        ADD CONSTRAINT accounts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
      CREATE UNIQUE INDEX accounts_of_customer ON accounts (customer_id, currency) WHERE customer_id IS NOT NULL;

      ALTER TABLE partner_payments RENAME TO customer_payments;
      ALTER TABLE customer_payments RENAME COLUMN partner_id TO customer_id;
      ALTER TABLE customer_payments DROP CONSTRAINT partner_payments_partner_id_fkey;
      UPDATE customer_payments p SET customer_id = m.customer_id
        FROM moved m WHERE m.merged AND p.customer_id = m.partner_id;
      ALTER TABLE customer_payments ADD CONSTRAINT customer_payments_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
      ALTER TABLE customer_payments RENAME CONSTRAINT partner_payments_kind_check TO customer_payments_kind_check;
      ALTER TABLE customer_payments RENAME CONSTRAINT partner_payments_status_check TO customer_payments_status_check;
      ALTER TABLE customer_payments
        RENAME CONSTRAINT partner_payments_currency_check TO customer_payments_currency_check;
      ALTER TABLE customer_payments RENAME CONSTRAINT partner_payments_org_id_fkey TO customer_payments_org_id_fkey;
      ALTER INDEX partner_payments_pkey RENAME TO customer_payments_pkey;
      ALTER INDEX partner_payments_org_number RENAME TO customer_payments_org_number;
      ALTER INDEX partner_payments_client_key RENAME TO customer_payments_client_key;
      ALTER INDEX partner_payments_list RENAME TO customer_payments_list;
      ALTER INDEX partner_payments_partner RENAME TO customer_payments_customer;
      ALTER INDEX partner_payments_search RENAME TO customer_payments_search;

      ALTER TABLE partner_payment_lines RENAME TO customer_payment_lines;
      ALTER TABLE customer_payment_lines
        RENAME CONSTRAINT partner_payment_lines_payment_id_fkey TO customer_payment_lines_payment_id_fkey;
      ALTER TABLE customer_payment_lines
        RENAME CONSTRAINT partner_payment_lines_account_id_fkey TO customer_payment_lines_account_id_fkey;
      ALTER TABLE customer_payment_lines
        RENAME CONSTRAINT partner_payment_lines_shift_id_fkey TO customer_payment_lines_shift_id_fkey;
      ALTER TABLE customer_payment_lines
        RENAME CONSTRAINT partner_payment_lines_org_id_fkey TO customer_payment_lines_org_id_fkey;
      ALTER TABLE customer_payment_lines
        RENAME CONSTRAINT partner_payment_lines_amount_check TO customer_payment_lines_amount_check;
      ALTER TABLE customer_payment_lines
        RENAME CONSTRAINT partner_payment_lines_currency_check TO customer_payment_lines_currency_check;
      ALTER INDEX partner_payment_lines_pkey RENAME TO customer_payment_lines_pkey;
      ALTER INDEX partner_payment_lines_payment RENAME TO customer_payment_lines_payment;
      ALTER INDEX partner_payment_lines_shift RENAME TO customer_payment_lines_shift;

      -- The books say what the entries were; the counter of TL- numbers keeps its key.
      UPDATE ledger_entries SET kind = 'customer_payment' WHERE kind = 'partner_payment';
      UPDATE ledger_entries SET kind = 'customer_payment_cancel' WHERE kind = 'partner_payment_cancel';
      UPDATE ledger_entries SET document_type = 'customer_payment' WHERE document_type = 'partner_payment';

      -- A sale to a partner was a sale to a customer, on their account.
      UPDATE sales s SET customer_id = m.customer_id, customer_name = coalesce(s.partner_name, s.customer_name)
        FROM moved m WHERE s.partner_id = m.partner_id;
      DROP INDEX sales_partner;
      ALTER TABLE sales DROP CONSTRAINT sales_customer_or_partner, DROP COLUMN partner_name, DROP COLUMN partner_id;

      ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_method_check;
      UPDATE sale_payments SET method = 'account' WHERE method = 'partner';
      ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal', 'exchange', 'debt', 'account'));
      ALTER TABLE sale_return_payments DROP CONSTRAINT sale_return_payments_method_check;
      UPDATE sale_return_payments SET method = 'account' WHERE method = 'partner';
      ALTER TABLE sale_return_payments ADD CONSTRAINT sale_return_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal', 'debt', 'account'));

      DROP TABLE partners;
    `)

    // ── Permissions ──
    // The warehouse picks a receipt's supplier without seeing the customers' book.
    await queryRunner.query(
      `UPDATE roles SET permissions = array_remove(permissions, 'partners.view') WHERE template_key = 'warehouse'`,
    )
    for (const [from, to] of RENAMED) {
      for (const [table, column] of [
        ['roles', 'permissions'],
        ['users', 'extra_permissions'],
      ]) {
        await queryRunner.query(
          `UPDATE ${table} SET ${column} = ARRAY(SELECT DISTINCT unnest(array_remove(${column}, $1) || $2::text[]) ORDER BY 1)
           WHERE $1 = ANY (${column})`,
          [from, to],
        )
      }
    }
    await queryRunner.query(
      `UPDATE roles SET name = 'Ulgurji menejer',
         description = 'Ulgurji xaridor va yetkazib beruvchilar bilan ishlaydi: hisobiga tovar, to‘lov, akt-sverka.'
       WHERE template_key = 'partners_manager' AND name = 'Hamkorlar menejeri'`,
    )
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    const [{ used }]: { used: boolean }[] = await queryRunner.query(`
      SELECT EXISTS (SELECT 1 FROM ledger_lines l JOIN accounts a ON a.id = l.account_id WHERE a.kind = 'customer')
          OR EXISTS (SELECT 1 FROM customer_payments)
          OR EXISTS (SELECT 1 FROM sale_payments WHERE method = 'account') AS used
    `)
    if (used) {
      throw new Error('Mijozlar hisobida pul yozuvi bor: orqaga qaytarib bo‘lmaydi, bazani nusxadan tiklang')
    }
    await queryRunner.query(`
      CREATE TABLE partners (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL,
        phone text,
        is_supplier boolean NOT NULL DEFAULT false,
        is_buyer boolean NOT NULL DEFAULT false,
        note text,
        is_active boolean NOT NULL DEFAULT true,
        search_key text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        currency text NOT NULL DEFAULT 'UZS' CONSTRAINT partners_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
        price_type_id uuid REFERENCES price_types(id) ON DELETE SET NULL
      );
      CREATE INDEX partners_search ON partners USING gin (search_key gin_trgm_ops);
      ${tenantPolicy('partners')}

      INSERT INTO partners (id, org_id, name, phone, is_supplier, is_buyer, note, is_active, search_key,
                            created_at, updated_at, currency, price_type_id)
        SELECT c.id, c.org_id,
               CASE WHEN count(*) OVER (PARTITION BY c.org_id, lower(c.name)) > 1
                 THEN c.name || ' (' || row_number() OVER (PARTITION BY c.org_id, lower(c.name) ORDER BY c.created_at) || ')'
                 ELSE c.name END,
               NULL, c.is_supplier, NOT c.is_supplier, c.note, c.is_active, c.search_key, c.created_at, c.updated_at,
               c.currency, c.price_type_id
        FROM customers c
        WHERE c.is_supplier OR EXISTS (SELECT 1 FROM receipts r WHERE r.supplier_id = c.id)
           OR EXISTS (SELECT 1 FROM receipt_lines r WHERE r.supplier_id = c.id)
           OR EXISTS (SELECT 1 FROM accounts a WHERE a.customer_id = c.id);
      CREATE UNIQUE INDEX partners_org_name ON partners (org_id, lower(name));

      ALTER TABLE receipts DROP CONSTRAINT receipts_supplier_id_fkey;
      ALTER TABLE receipts ADD CONSTRAINT receipts_supplier_id_fkey
        FOREIGN KEY (supplier_id) REFERENCES partners(id) ON DELETE RESTRICT;
      ALTER TABLE receipt_lines DROP CONSTRAINT receipt_lines_supplier_id_fkey;
      ALTER TABLE receipt_lines ADD CONSTRAINT receipt_lines_supplier_id_fkey
        FOREIGN KEY (supplier_id) REFERENCES partners(id) ON DELETE RESTRICT;

      DROP INDEX accounts_of_customer;
      ALTER TABLE accounts DROP CONSTRAINT accounts_customer_id_fkey, DROP CONSTRAINT accounts_customer,
        DROP CONSTRAINT accounts_kind_check;
      UPDATE accounts SET kind = 'partner' WHERE kind = 'customer';
      ALTER TABLE accounts RENAME COLUMN customer_id TO partner_id;
      ALTER TABLE accounts
        ADD CONSTRAINT accounts_kind_check
          CHECK (kind IN ('cash', 'safe', 'card', 'terminal', 'bank', 'system', 'partner')),
        ADD CONSTRAINT accounts_partner CHECK ((kind = 'partner') = (partner_id IS NOT NULL)),
        ADD CONSTRAINT accounts_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE RESTRICT;
      CREATE UNIQUE INDEX accounts_of_partner ON accounts (partner_id) WHERE partner_id IS NOT NULL;

      ALTER TABLE customer_payment_lines RENAME TO partner_payment_lines;
      ALTER TABLE partner_payment_lines
        RENAME CONSTRAINT customer_payment_lines_payment_id_fkey TO partner_payment_lines_payment_id_fkey;
      ALTER TABLE partner_payment_lines
        RENAME CONSTRAINT customer_payment_lines_account_id_fkey TO partner_payment_lines_account_id_fkey;
      ALTER TABLE partner_payment_lines
        RENAME CONSTRAINT customer_payment_lines_shift_id_fkey TO partner_payment_lines_shift_id_fkey;
      ALTER TABLE partner_payment_lines
        RENAME CONSTRAINT customer_payment_lines_org_id_fkey TO partner_payment_lines_org_id_fkey;
      ALTER TABLE partner_payment_lines
        RENAME CONSTRAINT customer_payment_lines_amount_check TO partner_payment_lines_amount_check;
      ALTER TABLE partner_payment_lines
        RENAME CONSTRAINT customer_payment_lines_currency_check TO partner_payment_lines_currency_check;
      ALTER INDEX customer_payment_lines_pkey RENAME TO partner_payment_lines_pkey;
      ALTER INDEX customer_payment_lines_payment RENAME TO partner_payment_lines_payment;
      ALTER INDEX customer_payment_lines_shift RENAME TO partner_payment_lines_shift;

      ALTER TABLE customer_payments DROP CONSTRAINT customer_payments_customer_id_fkey;
      ALTER TABLE customer_payments RENAME COLUMN customer_id TO partner_id;
      ALTER TABLE customer_payments RENAME TO partner_payments;
      ALTER TABLE partner_payments ADD CONSTRAINT partner_payments_partner_id_fkey
        FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE RESTRICT;
      ALTER TABLE partner_payments RENAME CONSTRAINT customer_payments_kind_check TO partner_payments_kind_check;
      ALTER TABLE partner_payments RENAME CONSTRAINT customer_payments_status_check TO partner_payments_status_check;
      ALTER TABLE partner_payments
        RENAME CONSTRAINT customer_payments_currency_check TO partner_payments_currency_check;
      ALTER TABLE partner_payments RENAME CONSTRAINT customer_payments_org_id_fkey TO partner_payments_org_id_fkey;
      ALTER INDEX customer_payments_pkey RENAME TO partner_payments_pkey;
      ALTER INDEX customer_payments_org_number RENAME TO partner_payments_org_number;
      ALTER INDEX customer_payments_client_key RENAME TO partner_payments_client_key;
      ALTER INDEX customer_payments_list RENAME TO partner_payments_list;
      ALTER INDEX customer_payments_customer RENAME TO partner_payments_partner;
      ALTER INDEX customer_payments_search RENAME TO partner_payments_search;

      ALTER TABLE sales
        ADD COLUMN partner_id uuid REFERENCES partners(id) ON DELETE RESTRICT,
        ADD COLUMN partner_name text,
        ADD CONSTRAINT sales_customer_or_partner CHECK (customer_id IS NULL OR partner_id IS NULL);
      CREATE INDEX sales_partner ON sales (partner_id) WHERE partner_id IS NOT NULL;
      ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_method_check;
      ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal', 'exchange', 'debt', 'partner'));
      ALTER TABLE sale_return_payments DROP CONSTRAINT sale_return_payments_method_check;
      ALTER TABLE sale_return_payments ADD CONSTRAINT sale_return_payments_method_check
        CHECK (method IN ('cash', 'card', 'terminal', 'debt', 'partner'));

      DELETE FROM customers c WHERE EXISTS (SELECT 1 FROM partners p WHERE p.id = c.id)
        AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.customer_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM customer_debts d WHERE d.customer_id = c.id);
    `)
    for (const [from, to] of [...RENAMED].reverse()) {
      if (from === 'partners.*') {
        continue
      }
      await queryRunner.query(
        `UPDATE roles SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY[$1]) ORDER BY 1)
         WHERE permissions @> $2::text[]`,
        [from, to],
      )
    }
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }
}
