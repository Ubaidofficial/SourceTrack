-- Migration: Add stripe_subscription_id column to sites table
--
-- Context: The Stripe billing webhook (api/routes/billing.js) writes
--   stripe_subscription_id on checkout.session.completed and
--   customer.subscription.updated, but the column never existed on `sites`.
-- Every such webhook therefore threw (PostgREST 42703 "column does not exist"),
-- returned 500, and the plan flip never persisted — a real $99 live checkout
-- stayed on plan='free'.
-- This migration adds the missing column so the webhook update() succeeds.
--
-- Applied manually (no migrate-on-deploy): run against staging, then production.
-- Idempotent: IF NOT EXISTS guard prevents failure on re-run.

ALTER TABLE sites ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
