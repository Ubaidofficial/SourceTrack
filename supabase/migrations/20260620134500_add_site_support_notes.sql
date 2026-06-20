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
