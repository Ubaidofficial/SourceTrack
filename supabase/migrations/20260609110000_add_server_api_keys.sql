-- Migration: Server API Keys & Sites ID Schema Hygiene
-- Safe: additive only, no DROP/DELETE/TRUNCATE, idempotent backfills

-- 1. Sites ID Schema Hygiene
-- Backfill missing sites.id values from site_key (casting to uuid if valid format)
UPDATE public.sites
SET id = COALESCE(
  CASE
    WHEN site_key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN site_key::uuid
    ELSE NULL
  END,
  gen_random_uuid()
)
WHERE id IS NULL;

-- Enforce sites.id default value
ALTER TABLE public.sites ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Create unique index on sites(id) if not exists to enforce integrity
CREATE UNIQUE INDEX IF NOT EXISTS sites_id_idx ON public.sites(id);

-- 2. Creation of api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id),
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  name text,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance and uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS api_keys_site_id_idx ON api_keys(site_id);
CREATE INDEX IF NOT EXISTS api_keys_owner_id_idx ON api_keys(owner_id);

-- Enable RLS and define owner access
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'Owner access'
  ) THEN
    CREATE POLICY "Owner access" ON api_keys
      FOR ALL USING (auth.uid() = owner_id);
  END IF;
END
$$;
