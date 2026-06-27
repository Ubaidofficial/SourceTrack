-- Migration: add the missing RLS policy to public.lead_qualifications.
--
-- The legacy non-timestamped supabase/migration_lead_qualification.sql declared
-- ENABLE RLS + a "Site member access" policy, but prod shows 0 policies on the
-- table (the policy was never applied). This forward, idempotent migration
-- re-asserts RLS + a tenant-scoped policy.
--
-- IMPORTANT: company_members has NO site_id column (it keys company_id + user_id),
-- so the policy MUST join sites.company_id -> company_members.company_id. A
-- policy of the form `site_id IN (SELECT site_id FROM company_members ...)` is
-- INVALID (no such column) and is intentionally NOT used here.
--
-- CC writes this file only; the orchestrator reviews and hand-applies it
-- (staging -> prod) per CLAUDE.md §8. Not applied by code.

ALTER TABLE public.lead_qualifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lead_qualifications'
      AND policyname = 'site members manage lead qualifications'
  ) THEN
    CREATE POLICY "site members manage lead qualifications"
    ON public.lead_qualifications FOR ALL
    USING (
      site_id IN (
        SELECT s.id FROM public.sites s WHERE s.owner_id = auth.uid()
        UNION
        SELECT s.id FROM public.sites s
        JOIN public.company_members cm ON cm.company_id = s.company_id
        WHERE cm.user_id = auth.uid()
      )
    )
    WITH CHECK (
      site_id IN (
        SELECT s.id FROM public.sites s WHERE s.owner_id = auth.uid()
        UNION
        SELECT s.id FROM public.sites s
        JOIN public.company_members cm ON cm.company_id = s.company_id
        WHERE cm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- Verification (run after apply):
--   SELECT policyname FROM pg_policies WHERE tablename = 'lead_qualifications';
--   -- expect: 1 row -> "site members manage lead qualifications"
