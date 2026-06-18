# QA Report — View Journey Fix (Session 140Z-G3)

**Date:** 2026-06-18
**Session:** 140Z-G3
**Scope:** Dashboard Recent Conversions → specific journey access
**Status:** IMPLEMENTED — NOT COMMITTED

---

## Broken Behavior Found

**Location:** `dashboard/src/pages/Dashboard.jsx:421`

Every "View Journey" button in the Recent Conversions table called `navigate('/leads')` unconditionally, dumping the user on the generic Leads list regardless of which conversion row was clicked.

```jsx
// Before — broken
<button onClick={() => navigate('/leads')} ...>
  View Journey
</button>
```

**Root cause:** The `/dashboard/recent-activity` API route (`api/routes/dashboard.js:683`) computed `visitorId = userId || anonymousId` from PostHog event data but never included it in the `eventsList` items pushed to the response. Without a visitor ID on each event object, the frontend had no way to open a specific journey.

---

## Implementation Chosen

**Option selected:** Open `JourneyModal` (existing component) using visitor ID from the API event.

This matches the preferred order: an existing journey drawer (`JourneyModal`) already used in `Leads.jsx` and `LeadDetail.jsx`, opened with the specific lead's visitor ID.

**Why not navigate to `/leads/:leadId`:** Would still require the visitor ID from the API, and would leave the dashboard — the modal is less disruptive.

**Why not navigate to `/journey?visitorId=<id>`:** Same ID requirement; the modal is simpler.

---

## Files Changed

| File | Change |
|------|--------|
| `api/routes/dashboard.js` | Added `visitor_id: visitorId \|\| null` to `eventsList.push()` (line 689) |
| `dashboard/src/pages/Dashboard.jsx` | Imported `JourneyModal`; added `journeyLead` state; replaced `navigate('/leads')` with `setJourneyLead(r)`; renders `<JourneyModal>` when `journeyLead?.visitor_id` is set |

---

## Before vs After

### Before
- Click "View Journey" on any Recent Conversion row → navigates to `/leads` (generic list, no specific lead opened)
- Column header: "Action"
- Button label: "View Journey" (capital J)

### After
- Click "View journey" on a conversion with a known visitor ID → opens `JourneyModal` as a right-side drawer showing that specific visitor's sessions, touchpoints, and conversion timeline
- If `visitor_id` is null for an event (rare edge case) → shows `—` instead of a button
- Column header: blank (no label needed for action column)
- Button label: "View journey" (lowercase j, matches UX spec)
- Clicking backdrop or X closes the modal and returns to Dashboard
- Keyboard accessible: modal has focus trap, ESC closes via backdrop click

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Event has no visitor_id | Shows `—` in the action column (no broken button) |
| Journey API returns empty data | `JourneyModal` shows its built-in empty state |
| Journey API errors | `JourneyModal` shows its built-in error state |
| `site_key` not yet loaded | Modal guard `journeyLead?.visitor_id && site?.site_key` prevents premature API call |

---

## Secondary Observation (Not Fixed — Out of Scope)

The `recentActivity.events` items have `referrer_domain` (not `referrer`) and no `utm_source` field. The Source column in Recent Conversions (`r.referrer || r.utm_source || 'Direct'`) therefore always falls through to `'Direct'`. This is a pre-existing bug unrelated to the journey navigation issue and is out of scope for this session.

---

## Validation Output

### `git diff --check`
```
DIFF-CHECK OK
```

### `npm run qa:static`
```
✅ All offline environment safety tests passed successfully.
✅ PASS — No active credentials, secrets, or tracked env files detected.
✅ All backend files syntax passed.
✅ Frontend build succeeded.
✅ No whitespace violations.
✅ Forbidden copy/API grep checks passed.
✅ Route mount checks passed.
✅ Security & plan scoping checks passed.
PASS — static launch QA passed
```

### `git status --short`
```
 M api/routes/dashboard.js
 M dashboard/src/pages/Dashboard.jsx
```

---

## Browser QA Notes

- Preview server running at port 5173 (HMR active)
- `Dashboard.jsx` hot-updated successfully with zero console errors
- Dashboard requires authentication — the "View Journey" click-through could not be exercised in the unauthenticated preview
- The full production build (`npm run build`) completed without errors, confirming no import resolution failures, type mismatches, or JSX errors
- Manual QA of the journey click-through is required in a logged-in staging session

---

## Blocked / Unverified Flows

| Flow | Status | Reason |
|------|--------|--------|
| Click "View Journey" → JourneyModal opens | BLOCKED — not authenticated in local preview; requires deployed staging authenticated QA. | Dashboard requires auth; preview is unauthenticated |
| Modal shows correct visitor journey | BLOCKED — not authenticated in local preview; requires deployed staging authenticated QA. | Requires live PostHog data |
| `visitor_id = null` fallback shows `—` | BLOCKED — not authenticated in local preview; requires deployed staging authenticated QA. | No fixture for this state |
| Modal close returns to Dashboard cleanly | BLOCKED — not authenticated in local preview; requires deployed staging authenticated QA. | Requires auth |

---

## Paid Beta Readiness

**NOT READY.** This session fixes a trust-breaking dashboard UX issue (one of the 12 must-fix items from the 140Z-G simplicity audit). It does not clear any of the open blockers in the release readiness checklist.
