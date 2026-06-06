-- Migration: Add excluded_paths and timezone columns to sites table
-- Safe to re-run (fully idempotent)

ALTER TABLE sites ADD COLUMN IF NOT EXISTS excluded_paths text[] DEFAULT '{}';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC';
