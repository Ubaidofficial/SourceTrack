-- Add Time Decay and W-Shaped attribution columns to attributed_conversions
ALTER TABLE attributed_conversions
  ADD COLUMN IF NOT EXISTS time_decay_attribution jsonb,
  ADD COLUMN IF NOT EXISTS w_shaped_attribution   jsonb;
