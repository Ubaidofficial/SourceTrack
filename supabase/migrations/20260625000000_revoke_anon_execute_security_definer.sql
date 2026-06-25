-- Revoke client-facing EXECUTE on two over-granted functions.
--
-- Staging grant-state audit found both functions hold EXECUTE for PUBLIC,
-- anon, authenticated, postgres, and service_role. The PUBLIC grant is the
-- key problem: revoking only anon/authenticated leaves PUBLIC intact, and
-- anon inherits PUBLIC, so the grant must be revoked FROM PUBLIC too.
--
--   * public.enforce_free_tier_abuse_guards()  — SECURITY DEFINER.
--       Trigger function on sites (BEFORE INSERT/UPDATE). Flagged by the
--       advisor's anon_security_definer check. Triggers fire as part of the
--       statement regardless of the invoking role's EXECUTE privilege, so
--       revoking direct EXECUTE does not stop the guard from firing on
--       anon-key sites inserts. There is no .rpc() call to it.
--
--   * public.claim_revenue_idempotency_keys(text,text,jsonb)  — SECURITY
--       INVOKER (prosecdef=false on staging). Sole caller is the backend via
--       the service_role key (api/lib/idempotency.js -> getSupabase()). No
--       client needs direct EXECUTE; the anon/authenticated/PUBLIC grants are
--       unnecessary attack surface.
--
-- service_role (backend caller) and postgres (superuser) grants are left
-- untouched. REVOKE is idempotent: revoking a privilege that was never
-- granted emits a notice, not an error.

REVOKE EXECUTE ON FUNCTION public.claim_revenue_idempotency_keys(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_free_tier_abuse_guards() FROM PUBLIC, anon, authenticated;
