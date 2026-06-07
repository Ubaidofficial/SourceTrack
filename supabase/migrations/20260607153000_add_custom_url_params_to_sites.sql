-- Migration: Add custom_url_params TEXT[] column to sites table
-- Date: 2026-06-07

ALTER TABLE sites ADD COLUMN IF NOT EXISTS custom_url_params TEXT[] DEFAULT '{}' NOT NULL;
