-- Migration: Add Managed Proxy Domains
-- Safe to re-run (idempotent, additive only, no destructive SQL)

CREATE TABLE IF NOT EXISTS public.managed_proxy_domains (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key         text         NOT NULL UNIQUE REFERENCES public.sites(site_key) ON DELETE CASCADE,
  domain           text         NOT NULL UNIQUE CHECK (domain <> ''),
  status           text         NOT NULL CHECK (status IN ('pending_dns', 'pending_ssl_or_routing', 'active', 'error')),
  cname_target     text         NOT NULL CHECK (cname_target <> ''),
  verified_at      timestamptz,
  last_checked_at  timestamptz,
  error_code       text,
  error_message    text,
  created_by       uuid         REFERENCES auth.users(id),
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);

-- Index for Host lookup in Express middleware
CREATE INDEX IF NOT EXISTS idx_managed_proxy_domains_domain 
  ON public.managed_proxy_domains(domain);

-- Enable RLS
ALTER TABLE public.managed_proxy_domains ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist for safe re-runs
DROP POLICY IF EXISTS "site members can view proxy domains" ON public.managed_proxy_domains;
DROP POLICY IF EXISTS "site members can manage proxy domains" ON public.managed_proxy_domains;

-- Create Select RLS Policy
CREATE POLICY "site members can view proxy domains"
  ON public.managed_proxy_domains FOR SELECT
  USING (
    site_key IN (
      SELECT s.site_key FROM public.sites s
      LEFT JOIN public.company_members cm ON cm.company_id = s.company_id
      WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
    )
  );

-- Create Write/Manage RLS Policy (All operations)
CREATE POLICY "site members can manage proxy domains"
  ON public.managed_proxy_domains FOR ALL
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
