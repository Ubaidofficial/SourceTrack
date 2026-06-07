-- Migration 121A: Add dashboard placement columns to saved_reports
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS show_on_dashboard boolean DEFAULT false NOT NULL;
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS dashboard_position integer DEFAULT 0 NOT NULL;
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS dashboard_size text DEFAULT 'medium' NOT NULL;

-- Validate size column with custom constraint name
ALTER TABLE saved_reports DROP CONSTRAINT IF EXISTS saved_reports_dashboard_size_check;
ALTER TABLE saved_reports ADD CONSTRAINT saved_reports_dashboard_size_check CHECK (dashboard_size IN ('small', 'medium', 'large'));
