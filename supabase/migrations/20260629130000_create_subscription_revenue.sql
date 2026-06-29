-- Migration: create subscription_revenue (Step 3 of MRR/trial→paid).
--
-- The recurring-revenue + lifecycle rows the MRR-by-source metric (Step 4) sums.
-- GRAIN: one row per Step-1 subscription $conversion (all five event_types). MRR
-- = SUM(amount) WHERE event_type IN ('subscription','renewal') — renewals never
-- double-count because each is a distinct invoice (one row per invoice_id).
-- trial→paid rate = count(trial_start) vs count(trial_converted) by source.
--
-- SOURCE is DENORMALIZED (copied from subscription_identity at nightly write
-- time, keyed site_id+stripe_customer_id) so renewals carry the acquisition-
-- locked source with no re-join to touchpoints (which don't exist for a billing
-- event). When the identity isn't resolvable, the row is attribution_status=
-- 'unknown' with null source — never a fabricated source. A guarded nightly
-- backfill sweep flips 'unknown'→resolved ONLY when the matching
-- subscription_identity is now 'resolved' (never touches already-resolved rows).
--
-- IDEMPOTENCY: two layers. (1) Step-1 ingest dedups via revenue_idempotency_keys
-- so duplicate webhook deliveries never produce duplicate $conversion events.
-- (2) dedup_key = invoice_id (revenue events) OR `${subscription_id}:${event_type}`
-- (funnel events), mirroring stripe-subscription.js buildSubscriptionIdempotency
-- Keys — UNIQUE (site_id, dedup_key) guards against nightly reprocessing
-- re-inserting the same logical event. The nightly write is ON CONFLICT DO
-- NOTHING — amount is write-once; only the source backfill (above) may change a
-- row, via a separate guarded UPDATE.
--
-- PRIVACY: stripe_customer_id is a billing identifier — stored for the join
-- only; it MUST NEVER surface in customer-facing UI, logs, or error messages.
--
-- RETENTION: intentionally EXCLUDED from the age-based purge
-- (api/lib/retention-purge.js) — revenue history must not silently truncate when
-- a site sets data_retention_days; the MRR trend depends on the full history.
-- Cleanup happens only via the site_id ON DELETE CASCADE (GDPR tenant delete).
--
-- CURRENCY: per-row (NOT NULL DEFAULT 'USD'). Mixed-currency summing is a Step-4
-- metric concern (per-currency sum / mixed-suppress) — not handled here.
--
-- RLS mirrors subscription_identity / capi_deliveries: tenant-scoped SELECT for
-- the site owner ∪ company members; NO INSERT/UPDATE policy — the service-role
-- nightly job writes and bypasses RLS. Default-deny (CLAUDE.md §6.5).
--
-- CC writes this file only; the orchestrator reviews and hand-applies it
-- (staging -> prod) per CLAUDE.md §8. Not applied by code.

CREATE TABLE IF NOT EXISTS public.subscription_revenue (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id                uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  stripe_customer_id     text NOT NULL,          -- billing id (never surface)
  stripe_subscription_id text,
  invoice_id             text,                   -- revenue events; null for funnel events
  event_type             text NOT NULL CHECK (event_type IN ('subscription','renewal','trial_start','trial_converted','churn')),
  amount                 numeric(14,2) NOT NULL DEFAULT 0,   -- dollars; 0 for funnel events
  currency               text NOT NULL DEFAULT 'USD',
  period_start           timestamptz,            -- nullable (not yet emitted by Step 1)
  period_end             timestamptz,

  -- Denormalized acquisition source (copied from subscription_identity):
  first_touch_source     text,
  first_touch_channel    text,
  attribution_status     text NOT NULL DEFAULT 'unknown',     -- 'resolved' | 'unknown'

  -- Provenance:
  provider_event_id      text,                   -- Stripe event id
  source_conversion_id   uuid,                   -- originating $conversion event uuid (NOT a FK)
  occurred_at            timestamptz NOT NULL,
  captured_at            timestamptz NOT NULL DEFAULT now(),

  -- Dedup: invoice_id (revenue) OR `${subscription_id}:${event_type}` (funnel).
  dedup_key              text NOT NULL,

  CONSTRAINT uq_subscription_revenue UNIQUE (site_id, dedup_key)
);

-- Backfill sweep + the MRR-by-source query both filter by site_id + customer.
CREATE INDEX IF NOT EXISTS idx_subscription_revenue_site_customer
  ON public.subscription_revenue (site_id, stripe_customer_id);

ALTER TABLE public.subscription_revenue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscription_revenue'
      AND policyname = 'site members can view subscription revenue'
  ) THEN
    CREATE POLICY "site members can view subscription revenue"
      ON public.subscription_revenue FOR SELECT
      USING (
        site_id IN (
          SELECT s.id FROM public.sites s
          LEFT JOIN public.company_members cm ON cm.company_id = s.company_id
          WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
        )
      );
  END IF;
END $$;
