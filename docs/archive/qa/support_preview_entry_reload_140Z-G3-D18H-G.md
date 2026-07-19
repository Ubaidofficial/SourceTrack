# QA Report: Support Preview Entry Reload Fix (140Z-G3-D18H-G)

## 1. Root Cause

`GET /api/admin/sites` explicitly redacts `site_key` before returning the site list
(`site_key_redacted` built, `delete s.site_key` applied — `api/routes/admin.js:162`).
So every `site` object in `Admin.jsx` has **no** `site_key`.

### Patch progression

| Attempt | Admin.jsx | SiteContext.jsx | Result |
|---------|-----------|-----------------|--------|
| Pre-patch | Wrote `{ site_id, site_name, site_domain }` — no `site_key` | Only checked `site_id`; continued into `/sites` fetch; forcedSite had no `site_key` | Preview mode engaged (banner visible) but all API calls using `activeSite.site_key` sent `undefined` |
| First D18H-G patch | Wrote `site_key: site.site_key` → `undefined` (from redacted list); JSON.stringify drops the key silently | Added `site_id && site_key` gate | Gate now requires `site_key`, which is never written → preview never engages; sidebar shows INTERNAL only |
| **Second D18H-G patch (this session)** | Calls `GET /admin/preview/:id`, reads `data.site_key` from API, writes `site_key: data.site_key` | Gate checks `site_id && site_key`; early-return before any `/sites` call | Both conditions satisfied; preview fully engages |

## 2. Security Gate Finding

`site_key` is the **public tracking identifier** embedded in `tracker.min.js` and in the
`<script>` tag on every customer's website. It carries no write or admin capability —
it is already publicly visible in page source. Writing it to operator-side `sessionStorage`
(same browser tab, admin-only origin) is safe. The `/admin/sites` list redaction remains
intact; `site_key` is only retrieved through the explicit `/admin/preview/:id` endpoint by
an authenticated `super_admin`.

## 3. Files Changed

| File | Change |
|------|--------|
| `dashboard/src/pages/Admin.jsx` | `handlePreview` now calls `GET /admin/preview/:id`, extracts `data.site_key`, writes full payload (with `site_key`) to `sessionStorage`, then hard-reloads; errors shown via `setPageError` — no silent failure |
| `dashboard/src/contexts/SiteContext.jsx` | Preview guard moved before the `/sites` fetch; checks `site_id && site_key`; sets `forcedSite` with `support_preview: true`, `site_key`, `id`, `name`, `domain`; calls `setLoading(false)` and `return` before any API call — no later effect re-hydrates `activeSite` from `localStorage` |

## 4. Files NOT Changed (correctly)

- `api/routes/admin.js` — `/admin/sites` redaction untouched (`delete s.site_key` at line 162 remains)
- `dashboard/src/components/SupportModeBanner.jsx` — exit button correctly clears `sessionStorage` and hard-reloads to `/ops`
- `dashboard/src/utils/supportPreview.js` — `isSupportPreviewActive()` checks `site_id` (sufficient for the ProtectedRoute redirect guard at `App.jsx:192`); independent of `site_key`

## 5. Before / After Expected Behavior

**Before:** Clicking Preview in `/ops` navigated to `/dashboard` but SiteContext fell back to
the admin's own sites. No banner, sidebar showed only INTERNAL → Ops Console, domain label
showed the admin's test site domain (e.g., `localhost:5173`).

**After:** Clicking Preview fetches the full payload from `/admin/preview/:id`, writes a
complete `sourcetrack_admin_preview` entry (with `site_key`) to `sessionStorage`,
hard-reloads to `/dashboard`. On mount, SiteContext reads the preview payload, sets
`activeSite` to the customer's site with `support_preview: true`, skips `/sites`, and
returns early. Layout renders the customer sidebar, SupportModeBanner, and correct domain.
Exit clears `sessionStorage` and returns to `/ops`.

## 6. Runtime Test Status — BLOCKED

The task spec requires a Vitest/RTL test that:
1. Puts a valid `sourcetrack_admin_preview` in `sessionStorage`
2. Asserts `SiteProvider` sets `activeSite` to the forced site with `support_preview: true`
3. Asserts `/sites` was NOT called

**Finding:** The `dashboard/` package has no frontend test harness — no Vitest, Jest, or
`@testing-library` in `devDependencies`, no `vitest.config.*`, no `jest.config.*`, no
`src/tests/` directory. Per the scope constraint for this session, a new test framework was
not scaffolded. The runtime test cannot be added without first establishing a frontend test
harness.

## 7. Validation Output

```
git status --short
 M dashboard/src/contexts/SiteContext.jsx
 M dashboard/src/pages/Admin.jsx
?? docs/qa/support_preview_entry_reload_140Z-G3-D18H-G.md

git diff --check
(clean — no whitespace errors)

npm run qa:static
PASS — static launch QA passed

npm run qa:attribution:unit  →  16 pass / 0 fail
npm run qa:tracker:unit      → 217 pass / 0 fail
npm run qa:identity:unit     → 145 pass / 0 fail
                               ─────────────────
Total                          378 pass / 0 fail
```

Key grep hits confirming invariants:
- `api/routes/admin.js:162` — `delete s.site_key` (redaction intact)
- `api/routes/admin.js:263` — `GET /preview/:siteKeyOrId` returns `site_key: site.site_key`
- `dashboard/src/pages/Admin.jsx:98` — calls `/admin/preview/:id`
- `dashboard/src/pages/Admin.jsx:100` — writes `sourcetrack_admin_preview` to sessionStorage
- `dashboard/src/contexts/SiteContext.jsx:29` — reads `sourcetrack_admin_preview`
- `dashboard/src/contexts/SiteContext.jsx:40` — sets `support_preview: true`

## 8. Final Status

```
CODE COMPLETE / STATIC CLEAN / RUNTIME-UNIT BLOCKED (no frontend test harness) / DEPLOYED UNVERIFIED
```

The fix is logically correct and statically verified. Browser verification has not been
performed in this session. Paid beta remains NOT READY.
