-- Migration: c2_convergence_group_c
-- Purpose: Schema convergence for Group C (altering 6 varchar columns in attributed_conversions to text)

ALTER TABLE public.attributed_conversions
  ALTER COLUMN first_touch_country TYPE text,
  ALTER COLUMN last_touch_country TYPE text,
  ALTER COLUMN first_touch_device TYPE text,
  ALTER COLUMN last_touch_device TYPE text,
  ALTER COLUMN first_touch_browser TYPE text,
  ALTER COLUMN last_touch_browser TYPE text;
