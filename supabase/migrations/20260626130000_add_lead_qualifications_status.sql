-- Migration: add durable 4-state `status` column to public.lead_qualifications (B-full).
-- `status` becomes the source of truth for Unqualified/Qualified/MQL/SQL; the existing
-- `qualified` boolean is kept in sync by the app for backward-compat.
-- CHECK is NOT VALID so it enforces on new/updated rows without scanning the existing
-- legacy row (status NULL is allowed and self-heals on the next write).
-- NOTE: this also begins reconciling lead_qualifications drift (the table exists in prod
-- with no prior in-repo migration); a full base-table capture is OUT OF SCOPE here — flagged.

ALTER TABLE public.lead_qualifications
  ADD COLUMN IF NOT EXISTS status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lead_qualifications_status_check'
      AND conrelid = 'public.lead_qualifications'::regclass
  ) THEN
    ALTER TABLE public.lead_qualifications
      ADD CONSTRAINT lead_qualifications_status_check
      CHECK (status IS NULL OR status IN ('unqualified','qualified','mql','sql')) NOT VALID;
  END IF;
END $$;
