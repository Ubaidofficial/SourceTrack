-- Track which usage thresholds we've emailed each site in each calendar month,
-- so the daily usage-threshold-emails job is idempotent (one email per
-- threshold per site per month).

CREATE TABLE IF NOT EXISTS usage_email_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL,
  month       text NOT NULL,          -- 'YYYY-MM'
  threshold   integer NOT NULL,        -- 50, 80, or 100
  sent_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, month, threshold)
);

CREATE INDEX IF NOT EXISTS usage_email_log_site_month_idx
  ON usage_email_log (site_id, month);

COMMENT ON TABLE usage_email_log IS
  'Idempotency log for the usage-threshold-emails job. Prevents resending the same threshold email within a month.';
