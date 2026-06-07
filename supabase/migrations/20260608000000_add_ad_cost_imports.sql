-- Migration: Add Ad Cost Imports schema and constraints
-- Safe to re-run (idempotent, additive only, no destructive table drops)

-- 1. Add new columns safely to campaign_costs
ALTER TABLE public.campaign_costs
ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS campaign_id text,
ADD COLUMN IF NOT EXISTS cost_dedupe_key text,
ADD COLUMN IF NOT EXISTS clicks integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS impressions integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS currency varchar(3) DEFAULT 'USD';

-- 2. Backfill existing rows with defaults
UPDATE public.campaign_costs
SET
  platform = COALESCE(NULLIF(platform, ''), 'manual'),
  cost_dedupe_key = COALESCE(
    NULLIF(cost_dedupe_key, ''),
    'name:' || lower(trim(campaign_name))
  )
WHERE cost_dedupe_key IS NULL OR cost_dedupe_key = '';

-- 3. Safely deduplicate existing rows before unique constraint/index application
-- Uses row_number() instead of MAX(id) because id is UUID and MAX is not deterministic on UUIDs.
-- Keeps the most recently created duplicate per (site_id, platform, cost_dedupe_key, period_start).
CREATE TEMP TABLE temp_keep_ids AS
SELECT id AS keep_id
FROM (
  SELECT id,
    row_number() OVER (
      PARTITION BY site_id, platform, cost_dedupe_key, period_start
      ORDER BY created_at DESC NULLS LAST, id::text DESC
    ) AS rn
  FROM public.campaign_costs
) ranked
WHERE rn = 1;

-- Aggregate spend/clicks/impressions per duplicate group
CREATE TEMP TABLE temp_merged_costs AS
SELECT
  site_id,
  platform,
  cost_dedupe_key,
  period_start,
  COALESCE(SUM(spend), 0) AS total_spend,
  COALESCE(SUM(clicks), 0) AS total_clicks,
  COALESCE(SUM(impressions), 0) AS total_impressions
FROM public.campaign_costs
GROUP BY site_id, platform, cost_dedupe_key, period_start;

-- Delete all duplicate records that are not the chosen primary ID
DELETE FROM public.campaign_costs
WHERE id NOT IN (SELECT keep_id FROM temp_keep_ids);

-- Update the remaining single record with aggregated sums
UPDATE public.campaign_costs c
SET
  spend = t.total_spend,
  clicks = t.total_clicks,
  impressions = t.total_impressions
FROM temp_merged_costs t
WHERE c.site_id = t.site_id
  AND c.platform = t.platform
  AND c.cost_dedupe_key = t.cost_dedupe_key
  AND c.period_start = t.period_start;

DROP TABLE temp_keep_ids;
DROP TABLE temp_merged_costs;

-- 4. Enforce NOT NULL on deduplication key
ALTER TABLE public.campaign_costs ALTER COLUMN cost_dedupe_key SET NOT NULL;

-- 5. Drop old unique constraint and create the new unique index
ALTER TABLE public.campaign_costs DROP CONSTRAINT IF EXISTS campaign_costs_site_id_campaign_name_period_start_key;

CREATE UNIQUE INDEX IF NOT EXISTS campaign_costs_site_platform_key_date_idx
ON public.campaign_costs (site_id, platform, cost_dedupe_key, period_start);

-- 6. Add lightweight CHECK constraints
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_costs_clicks_nonnegative') THEN
    ALTER TABLE public.campaign_costs ADD CONSTRAINT campaign_costs_clicks_nonnegative CHECK (clicks >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_costs_impressions_nonnegative') THEN
    ALTER TABLE public.campaign_costs ADD CONSTRAINT campaign_costs_impressions_nonnegative CHECK (impressions >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_costs_currency_format') THEN
    ALTER TABLE public.campaign_costs ADD CONSTRAINT campaign_costs_currency_format CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
END $$;

-- 7. Create ad_sync_runs table for import history logging
CREATE TABLE IF NOT EXISTS public.ad_sync_runs (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key        text         NOT NULL REFERENCES public.sites(site_key) ON DELETE CASCADE,
  platform        text         NOT NULL,
  source          text         NOT NULL DEFAULT 'csv_import',
  sync_start      timestamptz  NOT NULL DEFAULT now(),
  sync_end        timestamptz,
  status          text         NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  records_synced  integer      NOT NULL DEFAULT 0,
  error_message   text,
  sync_type       text         NOT NULL CHECK (sync_type IN ('manual', 'daily'))
);

-- Enable RLS and add policies
ALTER TABLE public.ad_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site members can view ad sync runs" ON public.ad_sync_runs;

CREATE POLICY "site members can view ad sync runs"
  ON public.ad_sync_runs FOR SELECT
  USING (
    site_key IN (
      SELECT s.site_key FROM public.sites s
      LEFT JOIN public.company_members cm ON cm.company_id = s.company_id
      WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
    )
  );
