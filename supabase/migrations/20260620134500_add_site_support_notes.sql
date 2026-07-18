-- Migration: site_support_notes
-- Purpose: Adds a minimal, service-role/API-only internal support notes mechanism for operators.
-- Scope constraints: Super_admin only. No customer-visible RLS.

CREATE TABLE IF NOT EXISTS public.site_support_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text NOT NULL CHECK (char_length(note) <= 5000 AND char_length(btrim(note)) > 0),
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Protect table with RLS. Customers should NEVER see these.
ALTER TABLE public.site_support_notes ENABLE ROW LEVEL SECURITY;

-- No policies are defined! This means the table is locked down.
-- Only the postgres user and the service_role key can read/write.
-- Because the API uses the service_role key (via getSupabase()),
-- the server logic governs access (requireRole('super_admin')).

-- Indexes on both FK columns, which were unindexed at table creation:
--   site_id    — ON DELETE CASCADE; this is the admin route's primary filter column.
--   admin_user_id — ON DELETE SET NULL; indexed for reverse-lookup (audits by user).
-- Both indexes were applied directly to staging + prod on 2026-07-18.
-- This block is a repo-record catch-up so fresh environments (CI, local) match.
CREATE INDEX IF NOT EXISTS idx_site_support_notes_site_created
  ON public.site_support_notes (site_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_support_notes_admin_user
  ON public.site_support_notes (admin_user_id);
