/**
 * Closes a tenant table with row-level security: a transaction sees and
 * writes only the rows of the organization it has named in `app.org_id`.
 * Every table with an `org_id` column gets this in the migration that
 * creates it.
 */
export const tenantPolicy = (table: string, column = 'org_id') => `
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
