import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Every table that holds a business's data carries `org_id` and is closed by
 * row-level security: a query sees rows only when the transaction has named
 * its organization (`app.org_id`). Forgetting to do so returns nothing rather
 * than everything. `app.bypass_rls` exists for the few system paths that have
 * no organization yet, such as finding a user at login.
 */
const TENANT_TABLES = ['locations', 'roles', 'users', 'user_roles', 'user_locations', 'sessions', 'audit_log', 'user_preferences']

const policy = (table: string, column: string) => `
  ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON ${table}
    USING (
      ${column} = nullif(current_setting('app.org_id', true), '')::uuid
      OR current_setting('app.bypass_rls', true) = 'on'
    )
    WITH CHECK (
      ${column} = nullif(current_setting('app.org_id', true), '')::uuid
      OR current_setting('app.bypass_rls', true) = 'on'
    );
`

export class Foundation1790000000000 implements MigrationInterface {
  name = 'Foundation1790000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`)

    await queryRunner.query(`
      CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END $$;

      CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
      END $$;
    `)

    await queryRunner.query(`
      CREATE TABLE organizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        timezone text NOT NULL DEFAULT 'Asia/Tashkent',
        base_currency text NOT NULL DEFAULT 'UZS' CHECK (base_currency IN ('UZS', 'USD')),
        modules text[] NOT NULL DEFAULT '{}',
        settings jsonb NOT NULL DEFAULT '{}',
        setup_completed boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE locations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        parent_id uuid REFERENCES locations(id) ON DELETE RESTRICT,
        kind text NOT NULL CHECK (kind IN ('store', 'warehouse', 'mixed', 'zone')),
        name text NOT NULL,
        code text NOT NULL,
        address text,
        phone text,
        is_active boolean NOT NULL DEFAULT true,
        search_key text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK ((kind = 'zone') = (parent_id IS NOT NULL))
      );
      CREATE UNIQUE INDEX locations_org_code ON locations (org_id, code);
      CREATE UNIQUE INDEX locations_org_name ON locations (org_id, lower(name));
      CREATE INDEX locations_search ON locations USING gin (search_key gin_trgm_ops);

      CREATE TABLE roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL,
        description text,
        template_key text,
        permissions text[] NOT NULL DEFAULT '{}',
        is_system boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX roles_org_name ON roles (org_id, lower(name));

      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        full_name text NOT NULL,
        login text NOT NULL,
        phone text,
        password_hash text NOT NULL,
        pin_hash text,
        pin_failures int NOT NULL DEFAULT 0,
        language text NOT NULL DEFAULT 'uz',
        is_active boolean NOT NULL DEFAULT true,
        all_locations boolean NOT NULL DEFAULT false,
        must_change_password boolean NOT NULL DEFAULT false,
        last_login_at timestamptz,
        search_key text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      -- A login names one person across the whole system: it is how a business is found at sign-in.
      CREATE UNIQUE INDEX users_login ON users (lower(login));
      CREATE UNIQUE INDEX users_org_phone ON users (org_id, phone) WHERE phone IS NOT NULL;
      CREATE INDEX users_search ON users USING gin (search_key gin_trgm_ops);

      CREATE TABLE user_roles (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, role_id)
      );
      CREATE INDEX user_roles_role ON user_roles (role_id);

      CREATE TABLE user_locations (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, location_id)
      );
      CREATE INDEX user_locations_location ON user_locations (location_id);

      CREATE TABLE sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_hash text NOT NULL,
        -- The token just replaced stays good for a moment: two tabs may refresh at once.
        prev_refresh_hash text,
        rotated_at timestamptz,
        device text NOT NULL DEFAULT '',
        user_agent text,
        ip text,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        revoked_reason text
      );
      CREATE UNIQUE INDEX sessions_refresh ON sessions (refresh_hash);
      CREATE INDEX sessions_user ON sessions (user_id) WHERE revoked_at IS NULL;

      CREATE TABLE audit_log (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        actor_id uuid,
        actor_name text,
        action text NOT NULL,
        entity text,
        entity_id text,
        summary text,
        changes jsonb,
        ip text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX audit_log_org_time ON audit_log (org_id, created_at DESC);
      CREATE INDEX audit_log_entity ON audit_log (org_id, entity, entity_id);

      CREATE TABLE user_preferences (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        key text NOT NULL,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, key)
      );
    `)

    for (const table of ['organizations', 'locations', 'roles', 'users']) {
      await queryRunner.query(
        `CREATE TRIGGER ${table}_touch BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION touch_updated_at()`,
      )
    }

    // History is written once and never changed, not even by the application itself.
    await queryRunner.query(
      `CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_change()`,
    )

    await queryRunner.query(policy('organizations', 'id'))
    for (const table of TENANT_TABLES) {
      await queryRunner.query(policy(table, 'org_id'))
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS user_preferences, audit_log, sessions, user_locations, user_roles, users, roles, locations, organizations CASCADE;
      DROP FUNCTION IF EXISTS forbid_change();
      DROP FUNCTION IF EXISTS touch_updated_at();
    `)
  }
}
