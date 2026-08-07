-- Re-derive sites.pv_limit from the site's current plan, and correct the column comment.
--
-- WHY: #428 (eda53505, 2026-07-26, "repackage tiers to differentiate on volume") changed
-- PLAN_DEFAULT_PV_LIMIT in api/lib/plan-features.js:18-26 and shipped NO backfill — its
-- diff touched plan-features.js plus four test files and nothing else. Because
-- getPvLimit(plan, perSiteOverride) (plan-features.js:149-152) returns the OVERRIDE
-- whenever one is present, and sites.pv_limit carries a column DEFAULT of 5000 so an
-- override ALWAYS exists, the repricing reached ZERO existing sites. Every live site is
-- still metered on its pre-#428 value. See KI-109.
--
-- ⚠️ THIS MIGRATION IS DRAFTED BY CC AND APPLIED BY THE FOUNDER (CLAUDE.md §8).
-- CC has not run it against any database.
--
-- ─── BLAST RADIUS — every affected row, before -> after ──────────────────────────────
-- Read from PROD (zxjjjsipafojhzkkumvh) 2026-08-07, read-only. Four sites exist in total,
-- so this list is exhaustive, not a sample:
--
--   domain             plan     pv_limit BEFORE   ->  AFTER      change
--   ------------------ -------- ----------------  --  ---------  ---------------------
--   www.techrupt.pk    growth              150,000 -> 1,000,000  RAISED (6.7x) — the
--                                                                 customer-visible one:
--                                                                 pricing.md:47 sells
--                                                                 1,000,000
--   khalidrasool.com   free                  5,000 ->    10,000  RAISED (2x)
--   bookmentions.net   free                  5,000 ->    10,000  RAISED (2x)
--   localhost:5173     trial                10,000 ->    10,000  NO CHANGE (already equal)
--
-- Net: 3 rows updated, 1 row untouched. NO row is lowered, and no row is deleted.
--
-- ─── THE NEVER-LOWER GUARANTEE ───────────────────────────────────────────────────────
-- GREATEST() is load-bearing, not defensive styling. If any row's stored override EXCEEDS
-- its new plan default, that row is LEFT ALONE. Lowering a live site's cap is the one way
-- this migration could cause the exact data loss it exists to prevent: at the hard cap
-- api/routes/track.js:408 returns 402 and the event is destroyed permanently (§6 — there
-- is no PostHog fallback and no replay).
--
-- On PROD today GREATEST() changes nothing — no row exceeds its new default (5,000 <
-- 10,000; 150,000 < 1,000,000; 10,000 = 10,000). It is here for STAGING, for any row
-- created between this file being written and being applied, and for a deliberate
-- hand-set override that must not be silently clawed back.
--
-- 'inactive' and 'archived' default to 0, so GREATEST() leaves any such row at whatever it
-- holds rather than zeroing it. That is intentional: this migration must never be the
-- thing that takes a site to a 0 cap.
--
-- ─── IDEMPOTENCY ─────────────────────────────────────────────────────────────────────
-- Safe to run repeatedly and across environments (§8). GREATEST() is a monotonic ceiling,
-- so a second run is a no-op; the WHERE clause makes that explicit by touching only rows
-- whose value would actually change. Uses no DDL on the column, so there is nothing to
-- guard with IF NOT EXISTS.
--
-- Values below MUST match api/lib/plan-features.js:18-26 exactly. If they ever diverge,
-- plan-features.js is authoritative and this file is stale — see the recurrence question
-- in the PR that introduced this migration.

UPDATE sites
SET pv_limit = GREATEST(
  COALESCE(pv_limit, 0),
  CASE plan
    WHEN 'free'     THEN    10000
    WHEN 'trial'    THEN    10000
    WHEN 'starter'  THEN   250000
    WHEN 'growth'   THEN  1000000
    WHEN 'scale'    THEN  5000000
    WHEN 'inactive' THEN        0
    WHEN 'archived' THEN        0
    ELSE 0                      -- unknown/legacy plan: GREATEST keeps the current value
  END
)
WHERE pv_limit IS DISTINCT FROM GREATEST(
  COALESCE(pv_limit, 0),
  CASE plan
    WHEN 'free'     THEN    10000
    WHEN 'trial'    THEN    10000
    WHEN 'starter'  THEN   250000
    WHEN 'growth'   THEN  1000000
    WHEN 'scale'    THEN  5000000
    WHEN 'inactive' THEN        0
    WHEN 'archived' THEN        0
    ELSE 0
  END
);

-- Correct the column comment. The original (baseline_schema.sql:919) reads "Set by Stripe
-- webhook from price metadata", and api/lib/plan-features.js:17 said the same thing. That
-- phrasing is why this defect looked impossible to diagnose: no Stripe price carries
-- pv_limit metadata, so the stated mechanism could not have produced the stored values and
-- the search kept stalling. The ACTUAL mechanism is pvLimitFromPrice
-- (api/routes/billing.js:77-81), which reads price.metadata.pv_limit if present and
-- OTHERWISE falls back to getPvLimit(plan) — the plan default frozen at write time. The
-- fallback is the normal path; metadata is the exception nobody uses.
--
-- Applied as a forward migration rather than by editing baseline_schema.sql: §8 is
-- forward-only for already-applied migrations, and editing that file would leave the LIVE
-- database comment wrong while making the repo disagree with what was actually applied.
COMMENT ON COLUMN public.sites.pv_limit IS
  'Monthly pageview cap for this site. Overrides the plan default and ALWAYS wins in getPvLimit(plan, override) — and the column DEFAULT means an override always exists, so PLAN_DEFAULT_PV_LIMIT never applies to an existing row. Written by the Stripe billing webhook via pvLimitFromPrice (api/routes/billing.js:77-81): price.metadata.pv_limit when present, OTHERWISE the plan default AS IT STOOD AT WRITE TIME. Because the value is frozen at write time, changing PLAN_DEFAULT_PV_LIMIT does NOT reach existing sites without a backfill (KI-109).';
