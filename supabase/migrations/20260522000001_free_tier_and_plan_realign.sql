-- Free tier rollout + plan-name realignment with Landing.jsx marketing.
--
-- 1) Drops the legacy plan CHECK constraint that only allowed (trial, pro, inactive).
-- 2) Re-adds a CHECK with the full canonical set (free, trial, starter, growth, business, inactive, archived).
-- 3) Adds `pv_limit` (monthly pageview cap, per-site so Stripe price tiers can vary).
-- 4) Adds `last_seen_at` (used by inactive-account auto-archive for free plan).
-- 5) Renames legacy plans (pro→growth, agency→business) and backfills pv_limit.
-- 6) Sets default `plan` for new sites to 'free'.
-- 7) Adds count_monthly_pageviews RPC used by tier-check middleware.

-- Step 1: Drop the legacy CHECK constraint. Name may vary by deployment — the
-- DO block discovers it from pg_constraint so this migration is idempotent
-- across environments that ran earlier ad-hoc constraint edits.
DO $$
DECLARE
  c_name text;
BEGIN
  FOR c_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'sites'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%plan%'
  LOOP
    EXECUTE format('ALTER TABLE sites DROP CONSTRAINT IF EXISTS %I', c_name);
  END LOOP;
END $$;

-- Step 2: Add new columns BEFORE the rename UPDATEs so backfill in step 5 sees them.
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS pv_limit      integer DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS last_seen_at  timestamptz DEFAULT NULL;

-- Step 3: Re-add a permissive CHECK with the full canonical plan set.
ALTER TABLE sites
  ADD CONSTRAINT sites_plan_check
  CHECK (plan IN ('free', 'trial', 'starter', 'growth', 'business', 'inactive', 'archived'));

-- Step 4: Rename legacy plan values now that the new CHECK allows them.
UPDATE sites SET plan = 'growth'   WHERE plan = 'pro';
UPDATE sites SET plan = 'business' WHERE plan = 'agency';

-- Step 5: Backfill pv_limit from each site's current plan (one-time — Stripe
-- webhook writes pv_limit going forward based on the price metadata).
UPDATE sites SET pv_limit =
  CASE plan
    WHEN 'free'     THEN 5000
    WHEN 'trial'    THEN 10000
    WHEN 'starter'  THEN 10000
    WHEN 'growth'   THEN 50000
    WHEN 'business' THEN 100000
    WHEN 'inactive' THEN 0
    WHEN 'archived' THEN 0
    ELSE 5000
  END
WHERE pv_limit IS NULL OR pv_limit = 5000;

-- Step 6: New signups default to free (not trial). Trial applies only when a
-- user clicks "Start free trial" on a paid plan card.
ALTER TABLE sites
  ALTER COLUMN plan SET DEFAULT 'free';

-- Enforce 30-day retention on free sites that don't already have a stricter setting.
UPDATE sites SET data_retention_days = 30
WHERE plan = 'free'
  AND (data_retention_days IS NULL OR data_retention_days > 30);

COMMENT ON COLUMN sites.pv_limit IS
  'Monthly pageview cap for this site. Free=5K, Starter@10K=10K, Starter@50K=50K, etc. Set by Stripe webhook from price metadata.';
COMMENT ON COLUMN sites.last_seen_at IS
  'Last pageview ingest timestamp. Updated by tracker ingest. Used to auto-archive free accounts inactive for 60+ days.';

CREATE INDEX IF NOT EXISTS sites_plan_last_seen_idx
  ON sites (plan, last_seen_at)
  WHERE plan = 'free';

-- Step 7: RPC used by tier-check middleware to count monthly pageviews per site.
CREATE OR REPLACE FUNCTION count_monthly_pageviews(p_site_id uuid, p_month_start timestamptz)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(COUNT(*), 0)::bigint
  FROM pageviews
  WHERE site_id = p_site_id
    AND timestamp >= p_month_start;
$$;
