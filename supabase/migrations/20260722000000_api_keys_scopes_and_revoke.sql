-- KI-43: api_keys has no scope model and revoke destroys audit history.
-- Adds the two columns the LOCKED plan specifies (KNOWN_ISSUES.md #43). DDL only —
-- no enforcement, no reads: PR A (scope enforcement) and PR B (soft revoke) land separately.
--
-- scopes: fail-closed backstop. DEFAULT '{}' grants NOTHING, so a non-app INSERT that omits
-- scopes authorizes nothing; the app supplies ['write:events'] explicitly on generate.
-- revoked_at: nullable, no default — harmless while unread; PR B switches revoke from
-- hard DELETE to setting this, preserving last_used_at audit history.
--
-- apply-then-merge (§8): founder applies staging -> prod BEFORE merging PR A/PR B.
-- Safe now only because prod api_keys is 0 rows. Idempotent + forward-only.

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
