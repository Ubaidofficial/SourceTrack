-- Migration: server API keys for server-side event tracking
-- Safe: additive only, no DROP/DELETE/TRUNCATE

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

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner access" ON api_keys
  FOR ALL USING (auth.uid() = owner_id);
