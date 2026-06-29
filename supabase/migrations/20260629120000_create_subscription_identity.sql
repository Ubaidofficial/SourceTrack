-- Migration: create subscription_identity (Step 2 of MRR/trial→paid).
--
-- Durable, acquisition-locked link from a Stripe customer to the source that
-- acquired them, so RENEWALS (which carry only a customer/subscription id, no
-- anonymous_id) can attribute back to the original acquisition source without
-- re-joining to touchpoints (which don't exist for a billing event).
--
-- Populated by api/jobs/nightly-attribution.js: when nightly processes a
-- subscription-type $conversion (carrying webhook_customer_id +
-- stripe_subscription_id from the Step-1 webhook) it has just computed
-- first_touch_source for that visitor and upserts ONE row per
-- (site_id, stripe_customer_id) with DO NOTHING — write-once / acquisition-
-- locked, so renewals and later runs never overwrite the original snapshot.
-- (Trade-off: a ≤24h window after the first subscription event where the row
-- isn't written yet — that customer reads as 'unknown' until the next nightly.)
--
-- Snapshot is DENORMALIZED (first+last touch source/channel/campaign), not a FK
-- to attributed_conversions: that table is reprocessed (delete+insert), so a FK
-- would dangle, and renewals must not need a re-join. source_conversion_id is
-- provenance-only (the originating $conversion event uuid) — NOT a foreign key.
--
-- PRIVACY: stripe_customer_id is a billing identifier. It is stored for the
-- renewal join only and MUST NEVER surface in customer-facing UI, logs, or error
-- messages. The MRR-by-source metric needs the *source*, not the customer id.
--
-- Retention: intentionally EXCLUDED from the age-based retention purge
-- (api/lib/retention-purge.js) — a renewal may reference this link indefinitely.
-- Cleanup happens only via the site_id ON DELETE CASCADE (GDPR tenant delete).
--
-- RLS mirrors capi_deliveries (20260628120000): tenant-scoped SELECT for the
-- site owner ∪ company members; NO INSERT/UPDATE policy — the service-role
-- nightly job writes and bypasses RLS. Default-deny otherwise (CLAUDE.md §6.5).
--
-- CC writes this file only; the orchestrator reviews and hand-applies it
-- (staging -> prod) per CLAUDE.md §8. Not applied by code.

CREATE TABLE IF NOT EXISTS public.subscription_identity (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id               uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  stripe_customer_id    text NOT NULL,          -- renewal join key (billing id — never surface)

  -- Acquisition attribution snapshot (denormalized, write-once / acquisition-locked):
  first_touch_source    text,                   -- mirrors attributed_conversions.first_touch_source (MRR-by-source key)
  first_touch_channel   text,
  first_touch_campaign  text,
  last_touch_source     text,
  last_touch_channel    text,
  attribution_status    text NOT NULL DEFAULT 'unknown',  -- 'resolved' | 'unknown'

  -- Provenance (debug/traceability only — NOT used for joins):
  anonymous_id          text,                   -- the stitched visitor (null when unstitchable)
  first_subscription_id text,                   -- the subscription that created this link
  source_conversion_id  uuid,                   -- originating $conversion event uuid (provenance, NOT a FK)
  captured_at           timestamptz NOT NULL DEFAULT now(),
  source_locked_at      timestamptz,            -- when the snapshot was written/locked

  CONSTRAINT uq_subscription_identity_site_customer UNIQUE (site_id, stripe_customer_id)
);

-- Tenant lookup index (the renewal join is by site_id + stripe_customer_id,
-- already covered by the UNIQUE constraint's implicit index).

ALTER TABLE public.subscription_identity ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscription_identity'
      AND policyname = 'site members can view subscription identity'
  ) THEN
    CREATE POLICY "site members can view subscription identity"
      ON public.subscription_identity FOR SELECT
      USING (
        site_id IN (
          SELECT s.id FROM public.sites s
          LEFT JOIN public.company_members cm ON cm.company_id = s.company_id
          WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
        )
      );
  END IF;
END $$;
