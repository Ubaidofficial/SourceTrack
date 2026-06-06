-- Migration: Revenue Ingestion Foundation
-- Safe to re-run (idempotent, additive only, no destructive SQL)

-- 1. Create revenue idempotency keys table with non-empty check constraints
CREATE TABLE IF NOT EXISTS revenue_idempotency_keys (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key    text        NOT NULL REFERENCES public.sites(site_key) ON DELETE CASCADE,
  provider    text        NOT NULL CHECK (provider <> ''),
  key_type    text        NOT NULL CHECK (key_type <> ''), -- 'provider_event_id', 'order_id', 'payment_id', 'idempotency_key'
  key_value   text        NOT NULL CHECK (key_value <> ''),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT  unique_site_provider_key UNIQUE (site_key, provider, key_type, key_value)
);

CREATE INDEX IF NOT EXISTS idx_revenue_idempotency_lookup 
  ON revenue_idempotency_keys(site_key, provider, key_type, key_value);

-- 2. Create revenue ingestion events (audit log) table
CREATE TABLE IF NOT EXISTS revenue_ingestion_events (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key           text        NOT NULL REFERENCES public.sites(site_key) ON DELETE CASCADE,
  provider           text        NOT NULL CHECK (provider <> ''), -- 'stripe', 'shopify', 'payments_api', etc.
  provider_event_id  text,
  order_id           text,
  value              numeric,
  currency           text,
  status             text        NOT NULL CHECK (status IN ('success', 'duplicate', 'error')),
  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenue_ingestion_lookup 
  ON revenue_ingestion_events(site_key, provider, created_at DESC);

-- Enable RLS on new tables (matching system conventions)
ALTER TABLE revenue_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_ingestion_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe re-run)
DROP POLICY IF EXISTS "site members can view idempotency keys" ON revenue_idempotency_keys;
DROP POLICY IF EXISTS "site members can view ingestion events" ON revenue_ingestion_events;

CREATE POLICY "site members can view idempotency keys"
  ON revenue_idempotency_keys FOR SELECT
  USING (
    site_key IN (
      SELECT s.site_key FROM sites s
      LEFT JOIN company_members cm ON cm.company_id = s.company_id
      WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
    )
  );

CREATE POLICY "site members can view ingestion events"
  ON revenue_ingestion_events FOR SELECT
  USING (
    site_key IN (
      SELECT s.site_key FROM sites s
      LEFT JOIN company_members cm ON cm.company_id = s.company_id
      WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
    )
  );

-- 3. Create PL/pgSQL function to claim idempotency keys atomically
CREATE OR REPLACE FUNCTION claim_revenue_idempotency_keys(
  p_site_key text,
  p_provider text,
  p_keys jsonb
) RETURNS boolean AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_keys) LOOP
    INSERT INTO revenue_idempotency_keys (site_key, provider, key_type, key_value)
    VALUES (
      p_site_key,
      p_provider,
      item->>'key_type',
      item->>'key_value'
    );
  END LOOP;
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  -- Any unique_violation across any inserts rolls back all inserts in this block
  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- 4. Alter sites table to support hashed API keys and encrypted secrets
ALTER TABLE sites ADD COLUMN IF NOT EXISTS api_key text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS api_key_hash text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS encrypted_stripe_webhook_secret text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS encrypted_shopify_shared_secret text;

-- Ensure pgcrypto is available for hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Backfill hashes for existing plaintext api_keys (if present)
UPDATE sites 
SET api_key_hash = encode(sha256(api_key::bytea), 'hex')
WHERE api_key IS NOT NULL AND api_key_hash IS NULL;
