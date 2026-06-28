-- Migration: create site_alerts (Anomaly Watcher persisted notifications).
--
-- Holds anomaly-watcher output: one row per detected anomaly, surfaced in the
-- dashboard bell/drawer and soft-dismissed via dismissed_at.
--
-- LEDGER SYNC: this table is ALREADY APPLIED on prod. This file records the
-- schema in the migration ledger so repo state matches live. Idempotent
-- (IF NOT EXISTS + guarded policy creates) so re-applying is a no-op.
--
-- RLS: tenant-scoped SELECT (owner_id = auth.uid() via sites); service_role
-- manages all rows (the cron writes with the service-role key). Default-deny
-- otherwise per CLAUDE.md §6.5.
--
-- CC writes this file only; the orchestrator reviews and hand-applies it
-- (staging -> prod) per CLAUDE.md §8. Not applied by code.

CREATE TABLE IF NOT EXISTS site_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  data_json jsonb,
  created_at timestamptz DEFAULT now(),
  dismissed_at timestamptz
);

ALTER TABLE site_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_alerts'
      AND policyname = 'Users can view own site alerts'
  ) THEN
    CREATE POLICY "Users can view own site alerts"
    ON site_alerts FOR SELECT
    USING (site_id IN (SELECT id FROM sites WHERE owner_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_alerts'
      AND policyname = 'Service role manages alerts'
  ) THEN
    CREATE POLICY "Service role manages alerts"
    ON site_alerts FOR ALL
    USING (auth.role() = 'service_role');
  END IF;
END $$;
