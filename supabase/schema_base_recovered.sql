-- SourceTrack Base Schema Recovery Snapshot (Session 139I-B)
-- Recovered from production metadata (ref zxjjjsipafojhzkkumvh)
-- Defines the 5 core telemetry and attribution tables missing from repository migrations.

-- 1. Table: pageviews
CREATE TABLE IF NOT EXISTS public.pageviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  url text NOT NULL,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  country text,
  device text,
  browser text,
  session_id text,
  duration_seconds integer DEFAULT 0,
  ai_source text,
  timestamp timestamp with time zone DEFAULT now(),
  entry_page text,
  exit_page text
);

ALTER TABLE public.pageviews ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pv_site_time ON public.pageviews (site_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pv_session ON public.pageviews (session_id);
CREATE INDEX IF NOT EXISTS idx_pageviews_site_ts ON public.pageviews (site_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pageviews_session ON public.pageviews (session_id) WHERE (session_id IS NOT NULL);


-- 2. Table: custom_events
CREATE TABLE IF NOT EXISTS public.custom_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text,
  event_type text NOT NULL,
  event_name text,
  url text,
  session_id text,
  properties jsonb DEFAULT '{}'::jsonb,
  timestamp timestamp with time zone DEFAULT now()
);

ALTER TABLE public.custom_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS custom_events_site_id_event_type_timestamp_idx ON public.custom_events (site_id, event_type, timestamp);


-- 3. Table: attributed_conversions
CREATE TABLE IF NOT EXISTS public.attributed_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  conversion_event_id text NOT NULL,
  distinct_id text NOT NULL,
  conversion_date date NOT NULL,
  conversion_timestamp timestamp with time zone NOT NULL,
  conversion_type text,
  conversion_value numeric DEFAULT 0,
  first_touch_source text,
  first_touch_medium text,
  first_touch_campaign text,
  first_touch_timestamp timestamp with time zone,
  last_touch_source text,
  last_touch_medium text,
  last_touch_campaign text,
  last_touch_timestamp timestamp with time zone,
  linear_attribution jsonb,
  touchpoint_count integer DEFAULT 0,
  processed_at timestamp with time zone DEFAULT now(),
  processing_version text DEFAULT '1.0'::text,
  channel text,
  channel_30d text,
  status text DEFAULT 'lead'::text CHECK (status = ANY (ARRAY['lead'::text, 'mql'::text, 'sql'::text, 'customer'::text, 'rejected'::text])),
  qualified_at timestamp with time zone,
  qualified_by text,
  first_touch_channel text,
  last_touch_channel text,
  attribution_confidence integer DEFAULT 50,
  confidence_signals jsonb,
  external_event_id text,
  dedup_count integer DEFAULT 0,
  u_shaped_attribution jsonb,
  anonymous_id text,
  time_decay_attribution jsonb,
  w_shaped_attribution jsonb,
  custom_properties jsonb
);

ALTER TABLE public.attributed_conversions ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS attributed_conversions_site_id_conversion_event_id_key ON public.attributed_conversions (site_id, conversion_event_id);
CREATE INDEX IF NOT EXISTS idx_attributed_conversions_site_date ON public.attributed_conversions (site_id, conversion_date);
CREATE INDEX IF NOT EXISTS idx_attributed_conversions_distinct_id ON public.attributed_conversions (distinct_id);
CREATE INDEX IF NOT EXISTS idx_ac_channel ON public.attributed_conversions (channel);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attributed_conversions_dedup ON public.attributed_conversions (site_id, external_event_id) WHERE (external_event_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_attributed_conversions_anonymous_id ON public.attributed_conversions (anonymous_id);
CREATE INDEX IF NOT EXISTS idx_ac_site_date ON public.attributed_conversions (site_id, conversion_date DESC);
CREATE INDEX IF NOT EXISTS idx_ac_site_channel ON public.attributed_conversions (site_id, first_touch_channel);
CREATE INDEX IF NOT EXISTS idx_ac_site_source ON public.attributed_conversions (site_id, first_touch_source);
CREATE INDEX IF NOT EXISTS idx_ac_site_distinct ON public.attributed_conversions (site_id, distinct_id);
CREATE INDEX IF NOT EXISTS idx_ac_site_status ON public.attributed_conversions (site_id, status) WHERE (status IS NOT NULL);


-- 4. Table: campaign_costs
CREATE TABLE IF NOT EXISTS public.campaign_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  campaign_name text NOT NULL,
  spend numeric DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  platform text NOT NULL DEFAULT 'manual'::text,
  campaign_id text,
  cost_dedupe_key text NOT NULL,
  clicks integer DEFAULT 0 CHECK (clicks >= 0),
  impressions integer DEFAULT 0 CHECK (impressions >= 0),
  currency character varying DEFAULT 'USD'::character varying CHECK (currency::text ~ '^[A-Z]{3}$'::text)
);

ALTER TABLE public.campaign_costs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_costs_site ON public.campaign_costs (site_id, period_start);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_costs_site_platform_key_date_idx ON public.campaign_costs (site_id, platform, cost_dedupe_key, period_start);


-- 5. Table: data_quality_reports
CREATE TABLE IF NOT EXISTS public.data_quality_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  check_name text NOT NULL,
  status text CHECK (status = ANY (ARRAY['ok'::text, 'warning'::text, 'critical'::text])),
  value numeric,
  threshold numeric,
  message text,
  checked_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.data_quality_reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_dqr_site ON public.data_quality_reports (site_id, checked_at DESC);
