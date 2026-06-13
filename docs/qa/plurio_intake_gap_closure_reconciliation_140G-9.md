# Plurio Intake Gap Closure Reconciliation & Tiny Tracker Parity Check — QA Report (Session 140G-9)

**Date:** 2026-06-13
**Branch:** `main`
**Status:** PENDING REVIEW — not committed

---

## 1. Exact Files Audited

- `tracker/tracker.js` — Standard storage-based tracker
- `tracker/tracker.cookieless.js` — Storage-free cookieless tracker
- `api/lib/utils.js` — Sanitization and parameter normalization helpers
- `api/lib/channel-classifier.js` — Channel classification rules
- `api/lib/setup-doctor.js` — Setup Doctor diagnostic logic
- `api/lib/attribution-engine.js` — Live attribution stitching and models
- `api/jobs/nightly-attribution.js` — Nightly pre-aggregation job
- `api/routes/conversion-offline.js` — Offline conversion endpoint
- `api/routes/events.js` — Events listing endpoint
- `dashboard/src/pages/EventDebugger.jsx` — Event Debugger table and details drawer
- `api/tests/tracker-click-ids.test.js` — Click ID normalization unit tests
- `docs/qa/plurio_intake_tracker_parity_audit_139N0.md` — Original Plurio Intake audit report
- `docs/qa/consent_cookieless_url_passthrough_audit_139N3.md` — Consent, cookieless, and URL passthrough audit report

---

## 2. Exact Commands Run

```bash
git status --short
git log --oneline -5

# Search for click IDs in source files
grep -RIn "sccid\|ko_click_id\|gclid\|fbclid\|msclkid\|ttclid\|li_fat_id\|twclid\|dclid\|gbraid\|wbraid\|snapclid\|pclid" \
  tracker api dashboard/src docs package.json \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude-dir=build || true

# Search consent, GTM, dataLayer, and cross-domain keywords
grep -RIn "dataLayer\|sourcetrack_ready\|intk_ready\|GTM\|Google Tag Manager\|consent-required\|sourcetrack.consent\|optIn\|optOut\|hasConsent\|cross-domain\|data-cross-domains\|decorateUrl" \
  tracker api dashboard/src docs \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude-dir=build || true

# Compile tracker files
npm run build:tracker

# Run test suites
npm run qa:tracker:unit
npm run qa:identity:unit
npm run qa:attribution:unit
npm run qa:static
```

---

## 3. Current Intake Feature/Marketing Patterns Worth Copying

We only want to copy/adapt features that make SourceTrack stronger for founders, marketers, SaaS teams, agencies, and ecommerce teams without making the product heavy:
1. **Simple GTM install story**: A clean quick-start guide explaining how to load the SourceTrack script in a GTM Custom HTML Tag.
2. **"Source attached to every form/lead" positioning**: Explaining how standard identifiers (`anonymous_id`, campaign fields) can be passed to signup, checkout, CRM, or Stripe metadata.
3. **Parity for additional click IDs**: Capturing mobile/app and emerging platform click IDs (`sccid`, `ko_click_id`).
4. **Consent-aware posture**: Providing public JS APIs (`consent()`, `optIn()`, `optOut()`, `hasConsent()`) to hook into site consent banners.

---

## 4. What SourceTrack Already Has

- **Surgical UTM & click ID capture**: Captures 12 click IDs (`gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`, `li_fatid`, `twclid`, `dclid`, `snapclid`, `pclid`).
- **Robust Channel Classification**: Groups traffic dynamically into Paid Search, Paid Social, Display, Affiliate, Email, SMS, Organic Search, Organic Social, Referral, and Direct.
- **Advanced Server-side Attribution**: Implements First-Touch, Last-Touch, Linear, U-Shaped, W-Shaped, and Time-Decay attribution server-side (instead of client-side).
- **Cookieless rotating visitor hashes**: Derives daily rotating visitor identities using salted IP/UA hashes on `/api/tracker/id`.
- **URL decoration / cross-domain passthrough**: Appends visitor IDs and first-touch properties to outbound links (`decorateUrl`).
- **Consent Gate override**: Defers tracking if loaded with `data-consent-required="true"`.
- **Guided Setup Doctor**: Diagnostic interface validating event freshness and domain settings.

---

## 5. What SourceTrack Should NOT Copy

- **Client-side attribution calculations**: Calculating models client-side is insecure, exposes calculation logic, and prevents changing models retroactively. SourceTrack correctly processes attribution server-side.
- **Browser-side PII scraping**: Automatically scraping email or phone fields from forms. This represents significant privacy and compliance risks.
- **Heavy CMP integrations**: Building automated integrations with Cookiebot/OneTrust directly in the tracker script. We delegate GCM v2 and CMP management to the site owners, keeping our tracker tiny and lightweight.
- **Heavy GTM dashboard / framework**: Adding bloated dashboard widgets for GTM container management.

---

## 6. Gap Table

| Feature / Gap | Status | Resolution / Notes |
|---|---|---|
| **Simple GTM Quick-Start Guide** | **Closed** | Guide exists in `DocsGTM.jsx` outlining tag setup and Initialization triggers. |
| **"Source attached to lead" docs** | **Partial** | Existing developer docs reference identify/webhook handoff, but a dedicated GTM/form/checkout source-handoff guide remains recommended. |
| **Click ID coverage parity** | **Closed** | Added `sccid` (Snapchat) and `ko_click_id` (Kochava) to trackers, helpers, classifiers, diagnostics, and DB query mapping in this session. |
| **Consent API documentation** | **Closed / Partial** | Basic tracker consent API is now documented in `DevelopersTracker.jsx`; full GCM v2/CMP integrations remain intentionally deferred. |
| **Cross-domain link decoration** | **Partial** | Supported in tracker code via `data-cross-domains` and `window.sourcetrack.decorateUrl()`, but not live browser-verified in this session. |
| **dataLayer integrations** | **Deferred** | Do not implement client-side dataLayer integrations. Kept as a recommendation only. |
| **Browser PII scraping/hashing** | **Deferred** | Explicitly deferred to respect privacy policies and avoid compliance risks. |

---

## 7. Current Click ID Parity Result

SourceTrack now supports **14 click IDs** in total:
1. `gclid` (Google Ads Click ID)
2. `gbraid` (Google Ads iOS App Click ID)
3. `wbraid` (Google Ads iOS Web Click ID)
4. `fbclid` (Meta/Facebook Click ID)
5. `msclkid` (Microsoft Ads Click ID)
6. `ttclid` (TikTok Ads Click ID)
7. `li_fat_id` (LinkedIn Ads Click ID)
8. `li_fatid` (LinkedIn Ads Click ID Alias)
9. `twclid` (Twitter/X Ads Click ID)
10. `dclid` (Google Display Ads Click ID)
11. `snapclid` (Snapchat Click ID)
12. `pclid` (Pinterest Click ID)
13. `sccid` (Snapchat Click ID Alternate) — **Added in this session**
14. `ko_click_id` (Kochava Click ID) — **Added in this session**

---

## 8. Presence of `sccid` and `ko_click_id`

Both `sccid` and `ko_click_id` are now fully integrated across the codebase:
- **Tracker**: whitelist `_pk` extraction, first-touch attribution mapping, and payload formatting.
- **PII Redaction**: `ko_click_id` added to bypassed keys list (preventing redaction).
- **Server Normalization**: `normalizeClickIds` trims whitespace and falls back to null.
- **Channel Classification**: `sccid` is classified as `Paid Social`. `ko_click_id` is preserved but not mapped to a default channel without UTMs (avoiding false assumptions).
- **Setup Diagnostics**: setup doctor HogQL queries and `clickIdTypes` array updated.
- **Live Attribution Engine**: SELECT variables, destructured row mapping, and touchpoint Journey object builders updated.
- **Nightly Pre-aggregation Job**: HogQL select variables, destructured row mapping, and first-touch/last-touch channel resolvers updated.
- **Event Debugger**: Event row preview badges and details drawer sidebar keys updated.
- **Unit/Integration Tests**: Unit tests expanded.

---

## 9. Exact Files Changed and Tests

### Modified Files (13)

- `tracker/tracker.js` — Whitelist parameter extraction, first-touch classifier, fields mapping.
- `tracker/tracker.cookieless.js` — Whitelist parameter extraction, first-touch classifier, fields mapping.
- `tracker/tracker.min.js` — Recompiled standard minified script.
- `tracker/tracker.cookieless.min.js` — Recompiled cookieless minified script.
- `api/lib/utils.js` — PII redaction bypassed keys, click ID normalization helper.
- `api/lib/channel-classifier.js` — Classified `sccid` as Paid Social.
- `api/lib/setup-doctor.js` — HogQL SELECT queries and clickIdTypes array.
- `api/lib/attribution-engine.js` — Live attribution pageview HogQL SELECT queries, destructuring index mapping, and touchpoint object mapping.
- `api/jobs/nightly-attribution.js` — Pre-aggregation pageview HogQL SELECT query, destructuring index mapping, and touchpoint object mapping.
- `api/routes/conversion-offline.js` — Whitelist parameter parsing loop.
- `api/routes/events.js` — Event retrieval HogQL SELECT query, destructuring array mapping, and return payload mapping.
- `dashboard/src/pages/EventDebugger.jsx` — Badges cell list, sidebar details drawer keys.
- `api/tests/tracker-click-ids.test.js` — Normalized unit tests and static consistency test assertions.

### Test Verification

- `npm run qa:tracker:unit` — **PASS (48/48)**
- `npm run qa:identity:unit` — **PASS (98/98)**
- `npm run qa:attribution:unit` — **PASS (9/9)**
- `npm run qa:static` — **PASS**

---

## 10. Consent / GTM / dataLayer / Cross-Domain Recommendation

- **Consent API & GTM Setup**: Keep the current setup. Simple Custom HTML injection via GTM is clean, performs well, and requires no custom tag templates. Maintain developer guides explaining `data-consent-required` and JS APIs `consent()`, `optIn()`, and `optOut()`.
- **dataLayer**: Avoid building a heavy client-side dataLayer push system. If required by customers in the future, it should remain strictly opt-in behind a script tag attribute (e.g. `data-datalayer="true"`) to prevent performance overhead.
- **Cross-Domain Tracking**: Keep it "supported in code but not live-verified" in our documentation to remain truthful. Cross-domain tracking depends heavily on matching domains in site settings, browser settings (which may strip parameters), and client-side link listeners.

---

## 11. Remaining Paid-Beta Blockers

Paid beta remains blocked by the remaining open release gates, including:
1. **Live PostHog retention/deletion verification**
2. **Paid billing portal verification / Stripe portal return URLs**
3. **Production billing verification**
4. **Production env/secrets verification**
5. **Tenant isolation verification**
6. **Privacy/deletion live verification**
7. **Observability setup**
8. **Backup/restore drill**
9. **Install QA**
10. **Docs truth audit**
11. **Support readiness**
12. **Legal/policy readiness**
13. **Final staging/production smoke verification**

---

## 12. Validation Output

```
▶ Click ID Normalization Helper Unit Tests
  ✔ returns all 14 click ID fields with null fallbacks when empty (0.516458ms)
  ✔ correctly maps and trims valid click IDs (0.111542ms)
  ✔ normalizes LinkedIn aliases preferring li_fat_id (0.105375ms)
  ✔ handles non-string types gracefully by falling back to null (0.073083ms)
✔ Click ID Normalization Helper Unit Tests (1.764709ms)

▶ Tracker Source Files Static Checks
  ✔ standard tracker.js has all parameters (0.978375ms)
  ✔ cookieless tracker.cookieless.js has all parameters (0.358792ms)
✔ Tracker Source Files Static Checks (2.151666ms)

▶ Setup Diagnostics & UI Consistency Checks
  ✔ setup-doctor.js clickIdTypes has all 14 click IDs (0.597042ms)
  ✔ EventDebugger.jsx contains references to all 14 click IDs (0.82025ms)
✔ Setup Diagnostics & UI Consistency Checks (1.650833ms)

tests 48 | pass 48 | fail 0
```

---

## 13. Git Status

```bash
$ git status --short
 M api/jobs/nightly-attribution.js
 M api/lib/attribution-engine.js
 M api/lib/channel-classifier.js
 M api/lib/setup-doctor.js
 M api/lib/utils.js
 M api/routes/conversion-offline.js
 M api/routes/events.js
 M api/tests/tracker-click-ids.test.js
 M dashboard/src/pages/EventDebugger.jsx
 M tracker/tracker.cookieless.js
 M tracker/tracker.cookieless.min.js
 M tracker/tracker.js
 M tracker/tracker.min.js
?? docs/qa/plurio_intake_gap_closure_reconciliation_140G-9.md
```
