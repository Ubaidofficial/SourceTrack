-- Migration: Add site_usage_monthly table and claim_site_conversion_usage function
-- Purpose: Atomic real-time conversion usage tracking and cap enforcement.
--          Prevents check-then-increment race conditions during high concurrent ingestion.
-- Safe: additive only, no DROP/DELETE/TRUNCATE, idempotent.
--
-- Rollback/Safety Notes:
-- To rollback, execute:
--   DROP FUNCTION IF EXISTS claim_site_conversion_usage(UUID, VARCHAR, INTEGER);
--   DROP TABLE IF EXISTS site_usage_monthly CASCADE;

-- 1. Create site_usage_monthly table
CREATE TABLE IF NOT EXISTS site_usage_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  month varchar(7) NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
  conversion_count integer NOT NULL DEFAULT 0 CHECK (conversion_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Unique index: one row per site per month
CREATE UNIQUE INDEX IF NOT EXISTS site_usage_monthly_site_month_uniq
  ON site_usage_monthly (site_id, month);

-- 3. Enable RLS (backend service-role only, no public policies)
ALTER TABLE site_usage_monthly ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER removal rationale:
-- Execute privileges are revoked from PUBLIC, anon, and authenticated roles, and granted
-- exclusively to service_role. Since the backend invokes this function using the service_role key,
-- it runs with service_role privileges which naturally bypasses RLS on site_usage_monthly.
-- Removing SECURITY DEFINER reduces security surface area by preventing the function from running
-- with the full postgres/superuser privileges unless called by a superuser.
-- Security Hardening: To prevent search path injection attacks, search_path is set explicitly
-- to public, pg_temp.
CREATE OR REPLACE FUNCTION claim_site_conversion_usage(
  p_site_id UUID,
  p_month VARCHAR(7),
  p_limit INTEGER
)
RETURNS TABLE (
  allowed BOOLEAN,
  current_count INTEGER
) AS $$
DECLARE
  v_current_count INTEGER;
BEGIN
  -- Validate inputs
  IF p_site_id IS NULL OR p_month IS NULL OR p_limit IS NULL OR p_limit < 0 THEN
    RETURN QUERY SELECT FALSE, 0;
    RETURN;
  END IF;

  -- Seed row if missing (use ON CONFLICT DO NOTHING to avoid duplicate errors)
  INSERT INTO site_usage_monthly (site_id, month, conversion_count)
  VALUES (p_site_id, p_month, 0)
  ON CONFLICT (site_id, month) DO NOTHING;

  -- Lock the row for update to ensure concurrency safety
  SELECT conversion_count INTO v_current_count
  FROM site_usage_monthly
  WHERE site_id = p_site_id AND month = p_month
  FOR UPDATE;

  -- Check limit
  IF v_current_count >= p_limit THEN
    RETURN QUERY SELECT FALSE, v_current_count;
  ELSE
    -- Increment count and return the updated count
    UPDATE site_usage_monthly
    SET conversion_count = conversion_count + 1, updated_at = now()
    WHERE site_id = p_site_id AND month = p_month
    RETURNING conversion_count INTO v_current_count;

    RETURN QUERY SELECT TRUE, v_current_count;
  END IF;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- 5. Revoke public/anon/authenticated execution, allow service_role only
REVOKE EXECUTE ON FUNCTION claim_site_conversion_usage(UUID, VARCHAR, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_site_conversion_usage(UUID, VARCHAR, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_site_conversion_usage(UUID, VARCHAR, INTEGER) TO service_role;

-- 6. Grant table privileges to service_role (needed as SECURITY DEFINER was removed)
GRANT SELECT, INSERT, UPDATE ON TABLE site_usage_monthly TO service_role;
