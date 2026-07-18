-- Convergence Migration: lead_qualifications.qualified_by text → uuid
-- (Deferred from #275, founder-decided)
--
-- Direction: PROD → STAGING's shape. Staging already has qualified_by as uuid
-- (via 20260626125900_create_lead_qualifications.sql). Prod has it as text
-- (baseline schema). Prod has exactly 1 row; value verified as a valid UUID.
--
-- Guard: RAISEs if any non-castable value exists — never silently skips or deletes.
-- Idempotent: no-ops if the column is already uuid.
--
-- NOTE: revenue_ingestion_events columns (payment_id, event_type, idempotency_key)
-- are NOT handled here. They are already covered by the existing migration
-- 20260712000100_backfill_revenue_ingestion_orphan_columns.sql, which needs to be
-- applied to staging separately.
--
-- NOTE: sites.owner_id default is deliberately left untouched per founder decision;
-- a NOT NULL fix comes later, not as convergence.

DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'lead_qualifications'
    AND column_name = 'qualified_by';

  IF col_type = 'text' OR col_type = 'character varying' THEN
    -- Guard: RAISE if any non-castable uuid values exist
    IF EXISTS (
      SELECT 1
      FROM public.lead_qualifications
      WHERE qualified_by IS NOT NULL
        AND qualified_by !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    ) THEN
      RAISE EXCEPTION 'Cannot migrate qualified_by to UUID: found non-UUID castable values.';
    END IF;

    -- Safe to cast
    ALTER TABLE public.lead_qualifications
      ALTER COLUMN qualified_by TYPE uuid USING qualified_by::uuid;
  END IF;
END $$;
