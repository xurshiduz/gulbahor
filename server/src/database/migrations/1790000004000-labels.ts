import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * Labels, tagged pieces and the way to a printer.
 *
 * `rfid_units` is one row per tagged piece: its code, what it is and where
 * it was last known to be. Codes come from one sequence for every business,
 * so no two tags of ours are ever alike.
 *
 * The server does not reach printers itself: it may be on a domain, far
 * from the shop's network. An `agent` is a small program in the shop that
 * connects out to the server; `print_jobs` wait for it and are handed over
 * when it is there.
 */
const ROLE_GRANTS: Record<string, string[]> = {
  manager: ['labels.*', 'devices.*'],
  store_manager: ['labels.print'],
  warehouse: ['labels.print'],
}

export class Labels1790000004000 implements MigrationInterface {
  name = 'Labels1790000004000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE SEQUENCE rfid_epc_serial;

      CREATE TABLE rfid_units (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        epc text NOT NULL CHECK (epc ~ '^[0-9A-F]{24}$'),
        variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        -- The batch the piece came in with, known once its receipt is posted: what it cost.
        batch_id uuid REFERENCES stock_batches(id) ON DELETE SET NULL,
        receipt_id uuid REFERENCES receipts(id) ON DELETE SET NULL,
        -- Which of the receipt's pieces of this variant it is: 1, 2, 3...
        unit_no int,
        location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
        status text NOT NULL DEFAULT 'ready'
          CONSTRAINT rfid_units_status CHECK (status IN ('ready', 'in_stock', 'void')),
        print_count int NOT NULL DEFAULT 0,
        last_printed_at timestamptz,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX rfid_units_org_epc ON rfid_units (org_id, epc);
      CREATE UNIQUE INDEX rfid_units_receipt_unit ON rfid_units (receipt_id, variant_id, unit_no)
        WHERE receipt_id IS NOT NULL;
      CREATE INDEX rfid_units_variant ON rfid_units (variant_id, location_id);

      CREATE TABLE agents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL,
        location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
        key_hash text NOT NULL UNIQUE,
        hostname text,
        version text,
        last_seen_at timestamptz,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX agents_org_name ON agents (org_id, lower(name));

      CREATE TABLE printers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL,
        location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
        agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        host text NOT NULL,
        port int NOT NULL DEFAULT 9100 CHECK (port BETWEEN 1 AND 65535),
        dpi int NOT NULL DEFAULT 203 CHECK (dpi IN (203, 300)),
        label_size text NOT NULL,
        rfid boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX printers_org_name ON printers (org_id, lower(name));

      CREATE TABLE print_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        printer_id uuid REFERENCES printers(id) ON DELETE SET NULL,
        agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        printer_name text NOT NULL,
        title text NOT NULL,
        labels int NOT NULL,
        payload text NOT NULL,
        status text NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued', 'sent', 'done', 'failed', 'cancelled')),
        error text,
        attempts int NOT NULL DEFAULT 0,
        created_by uuid,
        created_by_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        sent_at timestamptz,
        done_at timestamptz
      );
      CREATE INDEX print_jobs_list ON print_jobs (org_id, created_at DESC);
      CREATE INDEX print_jobs_queue ON print_jobs (agent_id, created_at) WHERE status = 'queued';

      CREATE TRIGGER agents_touch BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
      CREATE TRIGGER printers_touch BEFORE UPDATE ON printers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
    `)

    for (const table of ['rfid_units', 'agents', 'printers', 'print_jobs']) {
      await queryRunner.query(tenantPolicy(table))
    }

    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`)
    for (const [templateKey, permissions] of Object.entries(ROLE_GRANTS)) {
      await queryRunner.query(
        `UPDATE roles
         SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || $2::text[]) ORDER BY 1)
         WHERE template_key = $1`,
        [templateKey, permissions],
      )
    }
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'off', true)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS print_jobs, printers, agents, rfid_units CASCADE;
      DROP SEQUENCE IF EXISTS rfid_epc_serial;
    `)
  }
}
