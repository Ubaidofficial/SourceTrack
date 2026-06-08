-- Migration: Add Ad Platform Connections schema and constraints
-- Safe to re-run (idempotent, additive only, no destructive table drops)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create ad_platform_connections table
CREATE TABLE IF NOT EXISTS public.ad_platform_connections (
  id                        uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key                  text         NOT NULL REFERENCES public.sites(site_key) ON DELETE CASCADE,
  platform                  text         NOT NULL,
  account_id                text,
  account_name              text,
  encrypted_refresh_token   text,
  encrypted_access_token    text,
  login_customer_id         text,
  status                    text         NOT NULL DEFAULT 'connected',
  last_error_code           text,
  last_error_message        text,
  last_synced_at            timestamptz,
  created_at                timestamptz  NOT NULL DEFAULT now(),
  updated_at                timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ad_platform_connections_platform_check CHECK (platform IN ('google_ads', 'meta_ads')),
  CONSTRAINT ad_platform_connections_status_check CHECK (status IN ('connected', 'needs_account', 'needs_reconnect', 'error')),
  CONSTRAINT ad_platform_connections_site_platform_key UNIQUE (site_key, platform)
);

-- Drop constraints if they already exist to be safe
ALTER TABLE public.ad_platform_connections DROP CONSTRAINT IF EXISTS chk_google_credentials;
ALTER TABLE public.ad_platform_connections DROP CONSTRAINT IF EXISTS chk_meta_credentials;

-- Google credentials check constraint
ALTER TABLE public.ad_platform_connections ADD CONSTRAINT chk_google_credentials CHECK (
  platform != 'google_ads'
  OR (
    (
      status = 'needs_account'
      AND encrypted_refresh_token IS NOT NULL
    )
    OR (
      status = 'connected'
      AND encrypted_refresh_token IS NOT NULL
      AND NULLIF(trim(account_id), '') IS NOT NULL
    )
    OR status IN ('needs_reconnect', 'error')
  )
);

-- Meta credentials check constraint
ALTER TABLE public.ad_platform_connections ADD CONSTRAINT chk_meta_credentials CHECK (
  platform != 'meta_ads'
  OR (
    status != 'needs_account'
    AND (
      status != 'connected'
      OR (
        encrypted_access_token IS NOT NULL
        AND NULLIF(trim(account_id), '') IS NOT NULL
      )
    )
  )
);

-- updated_at trigger (idempotent setup)
DROP TRIGGER IF EXISTS set_ad_platform_connections_updated_at ON public.ad_platform_connections;
CREATE TRIGGER set_ad_platform_connections_updated_at
BEFORE UPDATE ON public.ad_platform_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE public.ad_platform_connections ENABLE ROW LEVEL SECURITY;

-- Policy definitions
DROP POLICY IF EXISTS "site members can view connections" ON public.ad_platform_connections;
CREATE POLICY "site members can view connections"
  ON public.ad_platform_connections FOR SELECT
  USING (
    site_key IN (
      SELECT s.site_key FROM public.sites s
      LEFT JOIN public.company_members cm ON cm.company_id = s.company_id
      WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "site members can manage connections" ON public.ad_platform_connections;
CREATE POLICY "site members can manage connections"
  ON public.ad_platform_connections FOR ALL
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

-- Sync runs index optimization
CREATE INDEX IF NOT EXISTS ad_sync_runs_site_platform_time_idx ON public.ad_sync_runs (site_key, platform, sync_start DESC);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
