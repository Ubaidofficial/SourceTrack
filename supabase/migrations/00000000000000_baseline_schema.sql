-- ══════════════════════════════════════════════════════════════════════════════
-- BASELINE SCHEMA — PLACEHOLDER (not yet captured).
--
-- This file reserves the baseline slot: dated 00000000000000 so it replays BEFORE
-- every 2026-* migration, giving them a `sites` (and every other table) to ALTER.
--
-- It MUST be replaced by prod's ACTUAL schema dump — never hand-authored:
--     export PROD_DB_URL='postgresql://…'      # read-only role; never commit it
--     bash scripts/capture-baseline.sh          # overwrites THIS file from `supabase db dump`
--
-- Until then the folder cannot rebuild the database. Rather than fail later with the
-- cryptic `relation "sites" does not exist`, this placeholder fails HERE with the fix.
-- (Replace it, mark it applied on the existing prod/staging DBs, and the fresh shadow
-- replay goes green — see scripts/capture-baseline.sh STEP 2 + STEP 3.)
-- ══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE EXCEPTION 'BASELINE NOT CAPTURED — run scripts/capture-baseline.sh to dump prod''s schema into supabase/migrations/00000000000000_baseline_schema.sql. The migrations folder cannot rebuild the database until then.';
END $$;
