-- The read-only role arrowpush_readonly (docs/SPEC.md §5, backend, "Database"): the weekly
-- pg_dump (.github/workflows/database-upkeep.yml, with --enable-row-security) connects as it.
--
-- Row-level security stays on with no other policies: the tables' owner (the server's role) is
-- not subject to it, every other role sees no rows. This role gets SELECT and one read policy per
-- table, and no write privilege. Tables made later by the same role get SELECT by default; each
-- later migration that adds a table adds its policy (readOnlyRole.test.ts checks every table).
--
-- On Supabase the owner makes the role first, as postgres, with LOGIN and a password; then this
-- migration only grants. Where it is missing (tests) it is made here without LOGIN, which needs
-- the CREATEROLE privilege.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'arrowpush_readonly') THEN
    CREATE ROLE arrowpush_readonly NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA arrowpush TO arrowpush_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA arrowpush TO arrowpush_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA arrowpush GRANT SELECT ON TABLES TO arrowpush_readonly;

CREATE POLICY read_only_select ON arrowpush.applied_migrations
  FOR SELECT TO arrowpush_readonly USING (true);
CREATE POLICY read_only_select ON arrowpush.users
  FOR SELECT TO arrowpush_readonly USING (true);
CREATE POLICY read_only_select ON arrowpush.sessions
  FOR SELECT TO arrowpush_readonly USING (true);
CREATE POLICY read_only_select ON arrowpush.accounts
  FOR SELECT TO arrowpush_readonly USING (true);
CREATE POLICY read_only_select ON arrowpush.verifications
  FOR SELECT TO arrowpush_readonly USING (true);
CREATE POLICY read_only_select ON arrowpush.reactions
  FOR SELECT TO arrowpush_readonly USING (true);
CREATE POLICY read_only_select ON arrowpush.reaction_versions
  FOR SELECT TO arrowpush_readonly USING (true);
CREATE POLICY read_only_select ON arrowpush.reviews
  FOR SELECT TO arrowpush_readonly USING (true);
