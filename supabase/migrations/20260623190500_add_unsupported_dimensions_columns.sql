-- Migration to add country, device, browser, and landing_page columns to attributed_conversions
ALTER TABLE public.attributed_conversions
  ADD COLUMN first_touch_country VARCHAR(100) DEFAULT NULL,
  ADD COLUMN last_touch_country VARCHAR(100) DEFAULT NULL,
  ADD COLUMN first_touch_device VARCHAR(50) DEFAULT NULL,
  ADD COLUMN last_touch_device VARCHAR(50) DEFAULT NULL,
  ADD COLUMN first_touch_browser VARCHAR(100) DEFAULT NULL,
  ADD COLUMN last_touch_browser VARCHAR(100) DEFAULT NULL,
  ADD COLUMN first_touch_landing_page TEXT DEFAULT NULL,
  ADD COLUMN last_touch_landing_page TEXT DEFAULT NULL;

-- Indexes for optimize dimension grouping performance
CREATE INDEX IF NOT EXISTS idx_attr_conv_first_country ON public.attributed_conversions(site_id, first_touch_country);
CREATE INDEX IF NOT EXISTS idx_attr_conv_last_country ON public.attributed_conversions(site_id, last_touch_country);
CREATE INDEX IF NOT EXISTS idx_attr_conv_first_device ON public.attributed_conversions(site_id, first_touch_device);
CREATE INDEX IF NOT EXISTS idx_attr_conv_last_device ON public.attributed_conversions(site_id, last_touch_device);
CREATE INDEX IF NOT EXISTS idx_attr_conv_first_browser ON public.attributed_conversions(site_id, first_touch_browser);
CREATE INDEX IF NOT EXISTS idx_attr_conv_last_browser ON public.attributed_conversions(site_id, last_touch_browser);
CREATE INDEX IF NOT EXISTS idx_attr_conv_first_lp ON public.attributed_conversions(site_id, first_touch_landing_page);
CREATE INDEX IF NOT EXISTS idx_attr_conv_last_lp ON public.attributed_conversions(site_id, last_touch_landing_page);
