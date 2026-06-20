# QA Report: Remaining E2E Audit Triage (140Z-G3-D19-C)

## 1. Audit Target: Custom staging API/domain routing
- **Claim**: App might be hardcoding staging API or custom domains inappropriately.
- **Evidence Gathered**:
  - `grep -RIn "VITE_API_URL\|API_URL\|staging\|railway\|srctk\|sourcetrack-dashboard-staging\|app.sourcetrack.ai\|api.srctk.com"` revealed that `API_ORIGIN` and tracker domains rely safely on `import.meta.env.VITE_API_URL` and `import.meta.env.VITE_TRACKER_BASE_URL`.
  - The string "staging" only appears in `data-exclude="/admin/*, /staging/*"` as an example for path exclusion in documentation/UI examples.
  - No active application logic hardcodes a staging API domain. `app.sourcetrack.ai` and `api.srctk.com` are correctly maintained as production domains.
- **Classification**: `STATIC AUDIT CLEAN / NEEDS DEPLOYED DOMAIN VERIFICATION`
- **Verdict**: No hardcoded staging API/domain was found in application code. This does not prove deployed staging/custom-domain DNS health; deployed domain verification remains separate if staging domains are part of the release gate.

## 2. Audit Target: Public/share dashboard flow static audit
- **Claim**: User-facing shared dashboard links might route to the backend `/public/` path instead of `/share/`.
- **Evidence Gathered**:
  - `grep -RIn "/public/\|/share/" dashboard/src api` confirms frontend routing uses `/share/:token` via `App.jsx`.
  - D19-A fixed the URL builder in `Settings.jsx` to correctly output `/share/${shareToken}` for users to copy.
  - Backend route safely remains `/api/public/:token`. No other user-facing `/public/` paths exist.
- **Classification**: `ALREADY FIXED` (in D19-A)
- **Verdict**: Patched locally in D19-A. Deployed browser verification remains explicitly skipped for now and must stay pending.

## 3. Audit Target: Email reports job safety static audit
- **Claim**: Email report eligibility logic must match canonical `sites.plan` constraint and exclude free/inactive sites. Validate `enterprise`, `pro`, `early_bird` aliases.
- **Evidence Gathered**:
  - `grep -RIn "CHECK (plan IN" supabase/migrations` confirms the schema constraint: `('free', 'trial', 'starter', 'growth', 'scale', 'business', 'inactive', 'archived')`.
  - `enterprise`, `pro`, `early_bird` are NOT real plans in the database schema; they are either legacy terms, marketing aliases, or non-existent.
  - `api/jobs/email-reports.js` (patched in D19-A) safely checks `['starter', 'growth', 'scale', 'business'].includes(site.plan) || isActiveTrial`.
- **Classification**: `ALREADY FIXED` (in D19-A)
- **Verdict**: Static eligibility logic is verified against the canonical plan enum. No real paid plans are skipped by the whitelist, and free/inactive/archived plan states are excluded. Runtime email delivery/job execution was not tested in this audit-only session.

## 4. Remaining Claude/Audit Claims
- **Claim**: Any other unverified line-level findings from past E2E summaries.
- **Evidence Gathered**: No additional actionable backend or UI routing bugs were discovered in the codebase matching previous claims.
- **Classification**: `NOT REPRODUCED / OUT OF SCOPE`

## Explicit Pending Items
1. D18H-E deployed Support Preview browser retest remains **PENDING**.
2. D19-B deployed `/share/:token` browser verification remains **PENDING**.

## Final Status
**AUDIT ONLY / NO IMPLEMENTATION**
Paid beta remains NOT READY.
