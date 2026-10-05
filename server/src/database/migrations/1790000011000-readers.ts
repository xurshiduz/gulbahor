import { MigrationInterface, QueryRunner } from 'typeorm'

import { tenantPolicy } from './rls'

/**
 * RFID readers that stay in one place: the one on a till's counter and the
 * gate at a shop's door. Both are reached through an agent, as printers are.
 *
 * A gate decides by itself whether a piece may leave, from a list the agent
 * keeps in memory. To keep that list current the agent asks what changed
 * since it last asked, so every tagged piece now says when it last changed.
 * `gate_events` is the log of pieces that went through a gate unsold.
 */
const ROLE_GRANTS: Record<string, string[]> = {
  store_manager: ['devices.alarms'],
  cashier: ['devices.alarms'],
  seller: ['devices.alarms'],
}

export class Readers1790000011000 implements MigrationInterface {
  name = 'Readers1790000011000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rfid_units ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
      -- The moment of the change itself, not of the start of its transaction: an agent asking
      -- "what changed since" must not miss a piece sold in a transaction that began before it asked.
      CREATE FUNCTION touch_unit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW.updated_at = clock_timestamp();
        RETURN NEW;
      END $$;
      CREATE TRIGGER rfid_units_touch BEFORE UPDATE ON rfid_units FOR EACH ROW EXECUTE FUNCTION touch_unit();
      CREATE INDEX rfid_units_changed ON rfid_units (org_id, updated_at);
      CREATE INDEX rfid_units_guarded ON rfid_units (org_id, epc) WHERE status IN ('ready', 'in_stock');

      CREATE TABLE readers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL,
        kind text NOT NULL CHECK (kind IN ('desk', 'gate')),
        agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        -- A desk reader belongs to a till; a gate stands at a shop's door.
        register_id uuid REFERENCES registers(id) ON DELETE CASCADE,
        location_id uuid REFERENCES locations(id) ON DELETE CASCADE,
        host text NOT NULL,
        port int NOT NULL DEFAULT 8888 CHECK (port BETWEEN 1 AND 65535),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT readers_place CHECK (
          (kind = 'desk' AND register_id IS NOT NULL) OR (kind = 'gate' AND location_id IS NOT NULL)
        )
      );
      CREATE UNIQUE INDEX readers_org_name ON readers (org_id, lower(name));
      CREATE UNIQUE INDEX readers_of_register ON readers (register_id) WHERE kind = 'desk';
      CREATE INDEX readers_agent ON readers (agent_id);
      CREATE TRIGGER readers_touch BEFORE UPDATE ON readers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

      CREATE TABLE gate_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        reader_id uuid REFERENCES readers(id) ON DELETE SET NULL,
        reader_name text NOT NULL,
        location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
        epc text NOT NULL,
        unit_id uuid REFERENCES rfid_units(id) ON DELETE SET NULL,
        variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
        -- What the piece was called then: the log reads the same after the goods are renamed.
        title text NOT NULL,
        sku text,
        search_key text NOT NULL DEFAULT '',
        read_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX gate_events_list ON gate_events (org_id, read_at DESC);
    `)

    for (const table of ['readers', 'gate_events']) {
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
      DROP TABLE IF EXISTS gate_events, readers CASCADE;
      DROP TRIGGER IF EXISTS rfid_units_touch ON rfid_units;
      DROP FUNCTION IF EXISTS touch_unit();
      DROP INDEX IF EXISTS rfid_units_changed;
      DROP INDEX IF EXISTS rfid_units_guarded;
      ALTER TABLE rfid_units DROP COLUMN IF EXISTS updated_at;
    `)
  }
}
