-- Migration: Extend site_usage_monthly with pageview_count + claim_site_pageview_usage RPC
-- Session: 140G-4 — Pageview Limit Enforcement / Usage Counter Architecture
--
-- Purpose: Add atomic real-time pageview usage tracking to the existing
--          site_usage_monthly table (created in 140G-3 for conversion caps).
--          Prevents check-then-increment race conditions on high-concurrency ingestion.
--          The RPC mirrors claim_site_conversion_usage exactly in design.
--
-- Safe: additive only, no DROP/DELETE/TRUNCATE, idempotent.
--
-- Rollback/Safety Notes:
-- To rollback, execute:
--   DROP FUNCTION IF EXISTS claim_site_pageview_usage(UUID, VARCHAR, INTEGER);
--   ALTER TABLE site_usage_monthly DROP COLUMN IF EXISTS pageview_count;

-- 1. Add pageview_count column to existing site_usage_monthly table
ALTER TABLE site_usage_monthly
  ADD COLUMN IF NOT EXISTS pageview_count integer NOT NULL DEFAULT 0 CHECK (pageview_count >= 0);

-- 2. Atomic check-and-increment RPC for pageview quota
--
-- Security rationale (mirrors 140G-3 conversion RPC):
-- SECURITY DEFINER removed — function runs with service_role privileges because
-- the backend always calls via the service_role key (which bypasses RLS naturally).
-- Removing SECURITY DEFINER reduces surface area by not granting postgres/superuser
-- escalation to non-superuser callers. search_path is set explicitly to public, pg_temp
-- to prevent search path injection attacks.
CREATE OR REPLACE FUNCTION claim_site_pageview_usage(
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

  -- Seed row if missing (use ON CONFLICT DO NOTHING to avoid duplicate errors).
  -- Shares the same row as claim_site_conversion_usage for this site+month.
  INSERT INTO site_usage_monthly (site_id, month, conversion_count, pageview_count)
  VALUES (p_site_id, p_month, 0, 0)
  ON CONFLICT (site_id, month) DO NOTHING;

  -- Lock the row for update to ensure concurrency safety
  SELECT pageview_count INTO v_current_count
  FROM site_usage_monthly
  WHERE site_id = p_site_id AND month = p_month
  FOR UPDATE;

  -- Check limit
  IF v_current_count >= p_limit THEN
    RETURN QUERY SELECT FALSE, v_current_count;
  ELSE
    -- Atomic increment and return updated count
    UPDATE site_usage_monthly
    SET pageview_count = pageview_count + 1, updated_at = now()
    WHERE site_id = p_site_id AND month = p_month
    RETURNING pageview_count INTO v_current_count;

    RETURN QUERY SELECT TRUE, v_current_count;
  END IF;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- 3. Revoke public/anon/authenticated execution, allow service_role only
REVOKE EXECUTE ON FUNCTION claim_site_pageview_usage(UUID, VARCHAR, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_site_pageview_usage(UUID, VARCHAR, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_site_pageview_usage(UUID, VARCHAR, INTEGER) TO service_role;

-- 4. Re-grant table privileges to service_role (safe to repeat from 140G-3 migration)
GRANT SELECT, INSERT, UPDATE ON TABLE site_usage_monthly TO service_role;
