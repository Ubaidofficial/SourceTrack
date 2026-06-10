-- Migration: Align scale plan with database CHECK constraint.
-- Purpose: The database CHECK constraint on the sites table restricted allowed plans
-- to ('free', 'trial', 'starter', 'growth', 'business', 'inactive', 'archived').
-- The codebase uses 'scale' as the canonical name instead of 'business'. This
-- mismatch caused Stripe webhook writes to fail when writing 'scale' to the plan column.
--
-- Backward Compatibility: Keeps the 'business' plan in the CHECK constraint temporarily
-- for backwards compatibility, but adds the canonical 'scale' plan. Updates any existing
-- 'business' rows to 'scale' since the codebase standardizes on 'scale' in plan-features.js.
--
-- Rollback Notes (Prose Only):
-- Rollback is migration-specific. To manually revert this change:
-- 1. Identify all sites currently using the 'scale' plan and update their plan column back to 'business'.
-- 2. Drop the sites_plan_check constraint.
-- 3. Re-add the sites_plan_check constraint allowing only ('free', 'trial', 'starter', 'growth', 'business', 'inactive', 'archived').

-- Step 1: Drop the existing sites_plan_check constraint by name if it exists.
ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_plan_check;

-- Step 2: Dynamically discover and drop any other CHECK constraints specifically targeting the sites.plan column.
-- This ensures idempotency and clean upgrades across environments where the constraint name may differ.
DO $$
DECLARE
  c_name text;
BEGIN
  FOR c_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'sites'::regclass
      AND c.contype = 'c'
      AND a.attname = 'plan'
  LOOP
    EXECUTE format('ALTER TABLE sites DROP CONSTRAINT IF EXISTS %I', c_name);
  END LOOP;
END $$;

-- Step 3: Re-add the CHECK constraint allowing the canonical 'scale' plan and legacy 'business' plan.
ALTER TABLE sites
  ADD CONSTRAINT sites_plan_check
  CHECK (plan IN ('free', 'trial', 'starter', 'growth', 'scale', 'business', 'inactive', 'archived'));

-- Step 4: Backfill existing 'business' rows to 'scale' safely now that the CHECK constraint supports it.
UPDATE sites SET plan = 'scale' WHERE plan = 'business';
