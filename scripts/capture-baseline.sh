#!/usr/bin/env bash
set -euo pipefail

# CAPTURE THE BASELINE SCHEMA — run this ONCE, then commit the generated file.
#
# WHY: supabase/migrations/ is a PARTIAL CHANGELOG, not a source of truth. The earliest
# migration ALTERs `sites`, but nothing in the folder ever CREATEs it — so a fresh replay
# dies with `relation "sites" does not exist`, and the product cannot be rebuilt from the
# repo. This script captures prod's FULL schema as the first migration so replay runs
# baseline -> ALTERs cleanly.
#
# The baseline MUST come from prod's actual pg_dump — never hand-authored. CC has no DB
# access; the founder runs this.
#
# ─── STEP 1: capture ─────────────────────────────────────────────────────────
#   export PROD_DB_URL='postgresql://<read-only-role>:<pw>@<host>:5432/postgres'   # do NOT commit this
#   bash scripts/capture-baseline.sh
#
# ─── STEP 2: tell the ALREADY-EXISTING DBs the baseline is already applied ────
#   Prod and staging ALREADY have every object the baseline creates, so they must NOT
#   re-run it (a pg_dump emits plain `CREATE TABLE …`, not IF NOT EXISTS — re-running
#   would error "relation already exists"). Mark it applied WITHOUT running it:
#     supabase migration repair --status applied 00000000000000 --db-url "$STAGING_DB_URL"
#     supabase migration repair --status applied 00000000000000 --db-url "$PROD_DB_URL"
#   (Only the FRESH CI shadow — `supabase db reset --local` — actually executes the baseline.)
#
# ─── STEP 3: verify the fresh replay is green, locally, before merging ────────
#   supabase start && supabase db reset --local     # must complete with NO errors
#   git add "$OUT" && git commit -m "chore(db): baseline schema from prod dump"

OUT="supabase/migrations/00000000000000_baseline_schema.sql"

: "${PROD_DB_URL:?set PROD_DB_URL to the prod postgres connection string (prefer a read-only role; never commit it)}"

command -v supabase >/dev/null 2>&1 || { echo "supabase CLI not found — install it first (https://supabase.com/docs/guides/cli)"; exit 1; }

echo "Dumping prod schema (schema-only, no data) → $OUT"
# EXACT COMMAND: schema-only dump of the user schemas (public + any app schemas).
# `supabase db dump` excludes Supabase-managed schemas (auth/storage/…) and, by default,
# dumps DDL only (no rows — no `--data-only`). --db-url targets prod directly.
supabase db dump --db-url "$PROD_DB_URL" -f "$OUT"

echo
echo "Wrote $OUT ($(wc -l < "$OUT") lines). Review it, then do STEP 2 + STEP 3 above."
echo "Reminder: after the baseline lands, the custom_domain*/site_annotations entries in"
echo "scripts/schema-drift-ignore.json are now formalized by the baseline — remove them so"
echo "the drift check re-enforces those objects instead of silently skipping them."
