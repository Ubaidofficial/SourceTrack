# Staging Supabase Auth StorageKey Env Collision Audit & Fix — Session 139N-4E

## 1. Problem
During the staging password reset verification (Session 139N-4D), a secondary auth bug was identified: `dashboard/src/lib/supabase.js` hardcoded the Supabase auth `storageKey` using the production project reference (`sb-zxjjjsipafojhzkkumvh-auth-token`).

Because staging and production shared/collided in the same browser localStorage namespace, they could overwrite or invalidate each other's sessions, causing bad auth states, stale sessions, or cross-environment session leakage and confusion.

## 2. Root Cause
The `supabase` client configuration inside `dashboard/src/lib/supabase.js` did not dynamically adapt the `storageKey` parameter to the environment-specific project ref of `VITE_SUPABASE_URL`. Instead, it explicitly hardcoded `sb-zxjjjsipafojhzkkumvh-auth-token`.

## 3. Files Changed
* `dashboard/src/lib/supabase.js` - Added dynamic project reference extraction and environment-specific storage key fallback.

## 4. Exact Storage Key Derivation Behavior
The implementation parses the active `VITE_SUPABASE_URL` to extract the host subdomain (which represents the Supabase project reference).

```javascript
function getSupabaseProjectRef(url) {
  try {
    const hostname = new URL(url).hostname
    return hostname.split('.')[0] || 'sourcetrack'
  } catch {
    return 'sourcetrack'
  }
}

const supabaseProjectRef = getSupabaseProjectRef(supabaseUrl)
const authStorageKey = `sb-${supabaseProjectRef}-auth-token`
```

### Derivation Examples:
* **Production**: `VITE_SUPABASE_URL=https://zxjjjsipafojhzkkumvh.supabase.co` -> resolves to storageKey `sb-zxjjjsipafojhzkkumvh-auth-token`.
* **Staging**: `VITE_SUPABASE_URL=https://nrsvpwzekfrdrzkoecfk.supabase.co` -> resolves to storageKey `sb-nrsvpwzekfrdrzkoecfk-auth-token`.
* **Fallback**: If parsing fails or the URL is malformed, it defaults to `sb-sourcetrack-auth-token`.

This logic guarantees that local development, staging, and production keep their authentication state completely isolated in the user's browser.

## 5. Validation Output
All automated quality checks and frontend build processes completed successfully.

### Command Execution:
```bash
npm run qa:identity:unit && npm run qa:tracker:unit && npm run qa:attribution:unit && npm run qa:env-safety && npm run qa:static
```

### Verification Findings:
* **API unit tests**: PASS
* **Static launch check**: PASS
* **Frontend Vite build**: PASS (`dist/assets/index-BuluYkI3.js` built successfully without errors)
* **Grep verification check**: The hardcoded production reference `sb-zxjjjsipafojhzkkumvh-auth-token` has been fully removed from the active dashboard application source code.

## 6. Staging Browser Sanity Check
* **Local/Static Verification**: PASS. Verified code parses URLs and outputs the expected key format correctly.
* **Deployed Staging Verification**: **PENDING** until the code is committed, pushed, and deployed to staging. Post-deploy browser verification is required to confirm that the deployed staging dashboard uses `sb-nrsvpwzekfrdrzkoecfk-auth-token` in localStorage.

## 7. Remaining Production Blockers
The following items remain open:
* **Production/canonical-domain password reset E2E remains unverified**.
* **Paid beta remains blocked** until production/canonical-domain auth and remaining P0 blockers are verified.

## 8. Verdict
`PASS — code now derives Supabase auth storageKey from VITE_SUPABASE_URL/project ref.`

> [!CAUTION]
> * Post-deploy browser verification still required to confirm deployed staging uses `sb-nrsvpwzekfrdrzkoecfk-auth-token`.
> * Production/canonical-domain password reset E2E remains unverified.
> * Paid beta remains blocked until production auth and remaining P0 blockers are verified.
