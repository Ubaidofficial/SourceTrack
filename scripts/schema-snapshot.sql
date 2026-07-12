-- Canonical schema snapshot for the drift check (scripts/schema-drift-check.mjs).
-- Emits ONE json array of {table_name, column_name, data_type, is_nullable, column_default}
-- for the public schema, deterministically ordered. Run identically against every
-- source (the migrations-shadow DB, staging, prod) so the snapshots are comparable.
--
-- READ-ONLY: this only reads information_schema — it writes nothing. Safe against prod.
--
-- Usage (CI):
--   psql "$DB_URL" -tAqX -f scripts/schema-snapshot.sql > snapshot.json
--
-- Exclusions: Supabase-managed / migration-bookkeeping tables that legitimately differ
-- by environment and are NOT app schema. Keep this list tiny and explicit — anything
-- removed from here is drift-checked.
SELECT coalesce(
  json_agg(
    json_build_object(
      'table_name',     c.table_name,
      'column_name',    c.column_name,
      'data_type',      c.data_type,
      'is_nullable',    c.is_nullable,
      'column_default', c.column_default
    )
    ORDER BY c.table_name, c.column_name
  ),
  '[]'::json
)
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema
 AND t.table_name   = c.table_name
 AND t.table_type   = 'BASE TABLE'          -- tables only; views are derived, not drift
WHERE c.table_schema = 'public'
  AND c.table_name NOT IN (
    'schema_migrations',                     -- supabase migration bookkeeping (differs by env)
    'supabase_migrations'
  );
