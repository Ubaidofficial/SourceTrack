-- Revoke EXECUTE on SECURITY DEFINER functions from client-facing roles.
--
-- Both functions below are SECURITY DEFINER, which Supabase's security
-- advisor flags ("anon_security_definer") because any role with EXECUTE can
-- invoke them with the definer's elevated privileges. Neither needs to be
-- callable by the anon or authenticated (or default PUBLIC) roles:
--
--   * claim_revenue_idempotency_keys(text,text,jsonb)
--       Sole caller is the backend via the service_role key
--       (api/lib/idempotency.js -> getSupabase()). service_role is not
--       affected by these REVOKEs.
--
--   * enforce_free_tier_abuse_guards()
--       Trigger function on sites (BEFORE INSERT/UPDATE). Triggers fire as
--       part of the statement regardless of the invoking role's EXECUTE
--       privilege, so revoking direct EXECUTE does not stop the guard from
--       firing on anon-key sites inserts. There is no .rpc() call to it.
--
-- REVOKE is idempotent: revoking a privilege that was never granted emits a
-- notice, not an error. Revoking from PUBLIC + anon + authenticated covers
-- every client-facing grantee whichever one currently holds it.

REVOKE EXECUTE ON FUNCTION claim_revenue_idempotency_keys(text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_revenue_idempotency_keys(text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION claim_revenue_idempotency_keys(text, text, jsonb) FROM authenticated;

REVOKE EXECUTE ON FUNCTION enforce_free_tier_abuse_guards() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION enforce_free_tier_abuse_guards() FROM anon;
REVOKE EXECUTE ON FUNCTION enforce_free_tier_abuse_guards() FROM authenticated;
