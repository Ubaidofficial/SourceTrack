-- Migration: Add Outbound Webhooks Configuration & Log Tables
-- Safe to re-run (fully idempotent).

CREATE TABLE IF NOT EXISTS webhook_destinations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key    text        NOT NULL REFERENCES sites(site_key) ON DELETE CASCADE,
  url         text        NOT NULL,
  secret      text        NOT NULL,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT  webhook_destinations_site_unique UNIQUE (site_key)
);

CREATE INDEX IF NOT EXISTS webhook_destinations_site_key ON webhook_destinations(site_key);

-- Enable RLS
ALTER TABLE webhook_destinations ENABLE ROW LEVEL SECURITY;

-- Policy for managing webhook destinations
DROP POLICY IF EXISTS "site members can manage webhooks" ON webhook_destinations;
CREATE POLICY "site members can manage webhooks"
  ON webhook_destinations FOR ALL
  USING (
    site_key IN (
      SELECT s.site_key FROM sites s
      LEFT JOIN company_members cm ON cm.company_id = s.company_id
      WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    site_key IN (
      SELECT s.site_key FROM sites s
      LEFT JOIN company_members cm ON cm.company_id = s.company_id
      WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id uuid        NOT NULL REFERENCES webhook_destinations(id) ON DELETE CASCADE,
  event_type     text        NOT NULL,
  status_code    integer,
  success        boolean     NOT NULL,
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_destination_id ON webhook_deliveries(destination_id);

-- Enable RLS
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Policy for select access on deliveries
DROP POLICY IF EXISTS "site members can view webhook deliveries" ON webhook_deliveries;
CREATE POLICY "site members can view webhook deliveries"
  ON webhook_deliveries FOR SELECT
  USING (
    destination_id IN (
      SELECT wd.id FROM webhook_destinations wd
      JOIN sites s ON s.site_key = wd.site_key
      LEFT JOIN company_members cm ON cm.company_id = s.company_id
      WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
    )
  );
