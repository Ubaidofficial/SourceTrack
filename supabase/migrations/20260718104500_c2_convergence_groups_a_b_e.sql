-- Migration: c2_convergence_groups_a_b_e
-- Purpose: Schema convergence for Groups A, B, and E (Not Null and Default constraints)

-- Group A: Staging-loosened columns -> NOT NULL
ALTER TABLE public.api_keys
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN site_id SET NOT NULL;

ALTER TABLE public.lead_qualifications
  ALTER COLUMN site_id SET NOT NULL;

ALTER TABLE public.sites
  ALTER COLUMN site_key SET NOT NULL;

-- Group B: 14 columns -> NOT NULL
ALTER TABLE public.companies
  ALTER COLUMN name SET NOT NULL;

ALTER TABLE public.company_members
  ALTER COLUMN role SET NOT NULL,
  ALTER COLUMN company_id SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.dashboard_widgets
  ALTER COLUMN owner_id SET NOT NULL,
  ALTER COLUMN widget_type SET NOT NULL;

ALTER TABLE public.qa_notes
  ALTER COLUMN feature_key SET NOT NULL,
  ALTER COLUMN note_text SET NOT NULL,
  ALTER COLUMN note_type SET NOT NULL;

ALTER TABLE public.saved_reports
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN config SET NOT NULL,
  ALTER COLUMN site_id SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.lead_qualifications
  ALTER COLUMN qualified SET NOT NULL;

-- Group E: Defaults
ALTER TABLE public.managed_proxy_domains
  ALTER COLUMN status SET DEFAULT 'pending_dns';

ALTER TABLE public.sites
  ALTER COLUMN api_key SET DEFAULT (gen_random_uuid())::text,
  ALTER COLUMN business_type SET DEFAULT 'saas',
  -- REVIEW: random-uuid owner default is probably wrong, founder decision
  -- ALTER COLUMN owner_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + '14 days'::interval),
  ALTER COLUMN trial_started_at SET DEFAULT now();

ALTER TABLE public.lead_qualifications
  ALTER COLUMN notes SET DEFAULT '';
