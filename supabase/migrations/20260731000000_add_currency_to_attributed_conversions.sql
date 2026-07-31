-- Add currency to attributed_conversions, and backfill it from revenue_ingestion_events.
--
-- WHY: attributed_conversions is the only money table with a value and no unit.
-- conversion_value is a bare numeric; every customer-facing revenue figure derived from
-- it was rendered with a hardcoded '$'. Currency is captured correctly at ingestion
-- (revenue_ingestion_events.currency) and is already a typed column on the Tinybird
-- `events` datasource, but it was dropped at attribution materialization — so the
-- dashboard had no currency to render even in principle.
--
-- Confirmed on prod (read-only, 2026-07-31): Shopify order 7087772008621 landed as
-- value 753.06 / currency USD — a self-consistent shop-currency pair, NOT a mismatch.
-- This migration is therefore a LABELLING fix (carry the unit through), not a
-- value-capture change. Capture stays shop-currency: presentment amounts across
-- different buyers' currencies are not summable and would corrupt revenue-by-source.
--
-- NULLABLE, AND DELIBERATELY NO DEFAULT.
-- subscription_revenue.currency is `text NOT NULL DEFAULT 'USD'` — that default is the
-- exact fake-unit pattern being removed from the CAPI senders in this same change set.
-- A DEFAULT here would manufacture a currency for rows that never had one, which is a
-- §6 "no fake values" violation on a money rail. NULL means "unit unknown" and readers
-- MUST suppress or label rather than assume USD.
--
-- Rows that legitimately stay NULL after backfill:
--   * refunds — nightly writes conversion_event_id '<order_id>:refund', which by design
--     does not equal revenue_ingestion_events.order_id, so they do not match here. They
--     inherit their unit from the original conversion at read time, not from this column.
--   * browser/tracker-side conversions — never pass through revenue_ingestion_events.
--   * the 6 live payments_api rows already carrying currency = NULL on prod.
--
-- BACKFILL JOIN KEY — verified against real rows, not assumed:
--   attributed_conversions.conversion_event_id = revenue_ingestion_events.order_id,
--   tenant-scoped through sites.site_key.
-- Measured on prod before writing this: order_id matches 2 of 5 attributed_conversions
-- rows; external_event_id matches 0; payment_id matches 0. order_id is the only key that
-- matches anything, and both current matches are gate0_/wave1_ synthetic seed rows —
-- so the backfill is close to a no-op TODAY (prod attributed_conversions holds 5 rows
-- total). It is written to be correct for the volume this table carries once the nightly
-- job has run against real traffic, not for the 5 rows currently present.
--
-- AMBIGUITY IS LEFT NULL, NOT GUESSED. revenue_ingestion_events holds many rows per
-- order (Shopify's 8-attempt retries land as status='duplicate'). The backfill reads only
-- status='success' rows with a non-null currency, and only writes when that set agrees on
-- exactly ONE currency (HAVING COUNT(DISTINCT ...) = 1). A disagreeing order stays NULL.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS; the constraint is guarded on pg_constraint; the
-- UPDATE only touches rows where currency IS NULL, so re-running never overwrites a value
-- written since.
--
-- RLS: none needed here. attributed_conversions already has RLS enabled with tenant-scoped
-- policies; adding a column inherits them. Re-declaring them would create a second,
-- divergent copy.
--
-- NOT A PII COLUMN — a 3-letter ISO 4217 code is not personal data, so the §6.5 "new PII
-- store ⇒ all three GDPR paths" rule does not apply. attributed_conversions is already
-- covered by /gdpr/account via an explicit delete in the handler.

ALTER TABLE public.attributed_conversions
  ADD COLUMN IF NOT EXISTS currency text;

-- Mirrors campaign_costs_currency_format, the existing precedent in this schema, but
-- admits NULL: campaign_costs.currency carries a DEFAULT and is effectively always set,
-- whereas "unit unknown" is a real and expected state here (see above).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attributed_conversions_currency_format'
  ) THEN
    ALTER TABLE public.attributed_conversions
      ADD CONSTRAINT attributed_conversions_currency_format
      CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
END $$;

COMMENT ON COLUMN public.attributed_conversions.currency IS
  'ISO 4217 code for conversion_value, in the merchant''s SHOP currency (not the buyer''s presentment currency — presentment amounts are not summable across buyers). NULL means the unit is unknown: readers must suppress or label the figure, never assume USD.';

-- Backfill. Unambiguous successful ingestions only; everything else stays NULL.
UPDATE public.attributed_conversions ac
SET currency = m.currency
FROM (
  SELECT ac2.id AS ac_id, MIN(rie.currency) AS currency
  FROM public.attributed_conversions ac2
  JOIN public.sites s
    ON s.id = ac2.site_id
  JOIN public.revenue_ingestion_events rie
    ON rie.site_key = s.site_key
   AND rie.order_id = ac2.conversion_event_id
   AND rie.status = 'success'
   AND rie.currency IS NOT NULL
   AND rie.currency ~ '^[A-Z]{3}$'
  GROUP BY ac2.id
  HAVING COUNT(DISTINCT rie.currency) = 1
) m
WHERE ac.id = m.ac_id
  AND ac.currency IS NULL;

-- Notify PostgREST to reload schema cache so the new column is selectable immediately.
NOTIFY pgrst, 'reload schema';
