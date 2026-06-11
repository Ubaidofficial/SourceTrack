-- Migration: Add business_type column to sites table
--
-- Context: This column existed in production but was never captured in a
-- migration file. During Session 139I-C staging bootstrap, the column was
-- missing and onboarding failed with:
--   "column sites.business_type does not exist"
-- A manual hotfix (ALTER TABLE) was applied directly to staging to unblock QA.
-- This migration makes the schema source-of-truth match both production and
-- staging, and ensures future deployments/bootstraps include the column.
--
-- Idempotent: IF NOT EXISTS guard prevents failure on re-run.

ALTER TABLE sites ADD COLUMN IF NOT EXISTS business_type text;
