-- Migration: Add Google Search Console tables
-- Safe to re-run (idempotent, additive only)

-- Ensure pgcrypto extension is active for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Connections table
CREATE TABLE IF NOT EXISTS public.gsc_connections (
  id                       uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key                 text         NOT NULL UNIQUE REFERENCES public.sites(site_key) ON DELETE CASCADE,
  property_url             text,         -- Nullable; populated when the user selects a GSC site property
  encrypted_refresh_token  text,         -- Nullable to allow storing disconnect or error states
  google_account_email     text,         -- Optional/nullable
  status                   text         NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'needs_reconnect', 'error')),
  last_error_code          text,
  last_error_message       text,
  last_synced_at           timestamptz,
  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT               check_refresh_token_if_connected CHECK (status <> 'connected' OR encrypted_refresh_token IS NOT NULL)
);

-- 2. Aggregated Search Performance cache table
CREATE TABLE IF NOT EXISTS public.gsc_performance_daily (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key       text         NOT NULL REFERENCES public.sites(site_key) ON DELETE CASCADE,
  property_url   text         NOT NULL,
  date           date         NOT NULL,
  query          text         NOT NULL,
  page_url       text         NOT NULL, -- Raw GSC URL (useful for debugging)
  page_path      text         NOT NULL, -- Normalized pathname (e.g. '/pricing')
  clicks         integer      NOT NULL DEFAULT 0,
  impressions    integer      NOT NULL DEFAULT 0,
  ctr            numeric      NOT NULL DEFAULT 0,
  position       numeric      NOT NULL DEFAULT 0,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT     unique_gsc_perf_row UNIQUE (site_key, property_url, date, query, page_url)
);

-- 3. Sync Runs log table
CREATE TABLE IF NOT EXISTS public.gsc_sync_runs (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key        text         NOT NULL REFERENCES public.sites(site_key) ON DELETE CASCADE,
  property_url    text         NOT NULL,
  sync_start      timestamptz  NOT NULL DEFAULT now(),
  sync_end        timestamptz,
  status          text         NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  records_synced  integer      NOT NULL DEFAULT 0,
  error_message   text,
  sync_type       text         NOT NULL CHECK (sync_type IN ('manual', 'daily'))
);

-- Indexes for performance lookups
CREATE INDEX IF NOT EXISTS idx_gsc_perf_lookup
  ON public.gsc_performance_daily(site_key, page_path, date);

CREATE INDEX IF NOT EXISTS idx_gsc_connections_site_key
  ON public.gsc_connections(site_key);

CREATE INDEX IF NOT EXISTS idx_gsc_sync_runs_site_status_start
  ON public.gsc_sync_runs(site_key, status, sync_start DESC);

CREATE INDEX IF NOT EXISTS idx_gsc_perf_site_date
  ON public.gsc_performance_daily(site_key, date);

-- 4. Triggers to automatically update updated_at timestamp on row change
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_gsc_connections_updated_at ON public.gsc_connections;
CREATE TRIGGER update_gsc_connections_updated_at
  BEFORE UPDATE ON public.gsc_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_gsc_performance_daily_updated_at ON public.gsc_performance_daily;
CREATE TRIGGER update_gsc_performance_daily_updated_at
  BEFORE UPDATE ON public.gsc_performance_daily
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Configuration
ALTER TABLE public.gsc_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gsc_performance_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gsc_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site members can view gsc connections" ON public.gsc_connections;
DROP POLICY IF EXISTS "site members can manage gsc connections" ON public.gsc_connections;
DROP POLICY IF EXISTS "site members can view gsc performance" ON public.gsc_performance_daily;
DROP POLICY IF EXISTS "site members can view gsc sync runs" ON public.gsc_sync_runs;

CREATE POLICY "site members can view gsc connections"
  ON public.gsc_connections FOR SELECT
  USING (
    site_key IN (
      SELECT s.site_key FROM public.sites s
      LEFT JOIN public.company_members cm ON cm.company_id = s.company_id
      WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
    )
  );

CREATE POLICY "site members can manage gsc connections"
  ON public.gsc_connections FOR ALL
  USING (
    site_key IN (
      SELECT s.site_key FROM public.sites s
      LEFT JOIN public.company_members cm ON cm.company_id = s.company_id
      WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    site_key IN (
      SELECT s.site_key FROM public.sites s
      LEFT JOIN public.company_members cm ON cm.company_id = s.company_id
      WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
    )
  );

CREATE POLICY "site members can view gsc performance"
  ON public.gsc_performance_daily FOR SELECT
  USING (
    site_key IN (
      SELECT s.site_key FROM public.sites s
      LEFT JOIN public.company_members cm ON cm.company_id = s.company_id
      WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
    )
  );

CREATE POLICY "site members can view gsc sync runs"
  ON public.gsc_sync_runs FOR SELECT
  USING (
    site_key IN (
      SELECT s.site_key FROM public.sites s
      LEFT JOIN public.company_members cm ON cm.company_id = s.company_id
      WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
    )
  );
