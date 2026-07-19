# Attribution Field Handoff Audit — Session 140P-A

**Date:** 2026-06-17
**Branch:** `main` @ `3e52e8a Session 140N`
**CI:** green
**Purpose:** Audit tracker, docs, and UI before implementing hidden-field/UTM handoff helper.

---

## 1. Current UTM / Click-ID / Referrer / Landing Page Capture Behavior

### URL / query params read at load time

Source: `_pk` array at `tracker.js:188` and `tracker.cookieless.js:50` — identical in both trackers.

31 params captured from `URLSearchParams(location.search)`:

| Group | Params |
|---|---|
| UTM | `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `utm_id` |
| Aliases | `ref`, `source`, `via` |
| Google | `gclid`, `gbraid`, `wbraid` |
| Meta | `fbclid` |
| Microsoft | `msclkid` |
| TikTok | `ttclid` |
| LinkedIn | `li_fat_id`, `li_fatid` |
| Twitter/X | `twclid` |
| Display/DoubleClick | `dclid` |
| Snap | `snapclid` |
| Pinterest | `pclid` |
| SC/Bing display | `sccid` |
| KO | `ko_click_id` |
| Internal ST | `st_campaign_id`, `st_adgroup_id`, `st_ad_id`, `st_target_id`, `st_network`, `st_device`, `st_matchtype`, `st_verify` |

### Referrer and landing page

| Field | How captured | Sent in events? | Persisted? | In getContext()? |
|---|---|---|---|---|
| `referrer` | `document.referrer` at pageview time | ✅ yes | ❌ no | ❌ no |
| `page_url` / landing page | `location.href` at pageview time | ✅ yes | ❌ no | ❌ no |

The tracker sends `referrer` and `page_url` in every `$pageview`, `$conversion`, and `form_submit` event payload. They are not stored in localStorage or sessionStorage and are not accessible via `getContext()`.

### Identity fields

| Field | Standard tracker | Cookieless tracker |
|---|---|---|
| `anonymous_id` | UUID stored in `localStorage['st_aid']` — persists cross-session | Rotates daily via server hash at `/api/tracker/id`; available async after server response |
| `session_id` | UUID stored in `sessionStorage['st_sid']` — per-tab, survives navigation | Same as `anonymous_id` until server responds |

### First-touch vs. last-touch storage

| Concept | Standard tracker | Cookieless tracker |
|---|---|---|
| First-touch | `st_ft_src`, `st_ft_med`, `st_ft_cmp`, `st_ft_ts` in localStorage — written once at first visit, never overwritten | Derived in-memory from current URL params via `deriveFirstTouch()` at page load — session-scoped, not persistent across page loads |
| Last-touch / current | Not explicitly stored; derived from current page URL params + referrer on each call to `getContext()` or `params()` | Same |

---

## 2. `window.sourcetrack.getContext()` — Exact Field Inventory

### Standard tracker (`tracker.js:431–471`)

```js
{
  anonymous_id:           AID || null,          // UUID string; persists cross-session via localStorage
  session_id:             SID || null,          // UUID string; per-tab via sessionStorage
  first_touch_source:     ls('st_ft_src') || 'direct',   // persisted first visit
  first_touch_medium:     ls('st_ft_med') || 'none',
  first_touch_campaign:   ls('st_ft_cmp') || '',
  current_source:         string,               // derived: utm_source || ref || referrer host || 'direct'
  current_medium:         string,               // derived: utm_medium || inferred from click IDs || 'none'
  current_campaign:       string,               // utm_campaign || ''
  click_ids: {
    gclid:        string | null,
    gbraid:       string | null,
    wbraid:       string | null,
    fbclid:       string | null,
    msclkid:      string | null,
    ttclid:       string | null,
    li_fat_id:    string | null,
    li_fatid:     string | null,
    twclid:       string | null,
    dclid:        string | null,
    snapclid:     string | null,
    pclid:        string | null,
    sccid:        string | null,
    ko_click_id:  string | null
  }
}
```

### Cookieless tracker (`tracker.cookieless.js:272–301`) — parity gaps

| Field | Standard | Cookieless | Gap |
|---|---|---|---|
| `anonymous_id` | UUID from localStorage; available synchronously | Fetched async from `/api/tracker/id`; **null until server responds** | Timing gap — must call on submit, not on DOMContentLoaded |
| `session_id` | sessionStorage UUID; available synchronously | Same as anonymous_id until server responds | Same timing gap |
| `first_touch_source` | Reads `localStorage['st_ft_src']` — true cross-session first touch | Derived from current page params via `deriveFirstTouch()` — **session-scoped only** | Semantically different: cookieless returns current-session first touch, not lifetime first touch |
| `first_touch_medium` | Same localStorage persistence | Session-scoped only | Same gap |
| `first_touch_campaign` | Same localStorage persistence | Session-scoped only | Same gap |
| `current_source` | Derived from current params | Derived from current params | No gap |
| `click_ids` | From current URL params | From current URL params | No gap |

**Summary of cookieless parity gap:** In cookieless mode, `first_touch_*` fields reflect the current landing session only, not the true historical first touch. This must be documented clearly in the handoff helper guide. Callers relying on `first_touch_source` for CRM hidden fields should understand it may be the same as `current_source` in cookieless contexts.

### What `getContext()` does NOT expose (tracker captures it internally but doesn't return it)

| Field | Internal location | Gap |
|---|---|---|
| `utm_term` | `params().utm_term` — in `_pk` array; sent in events | **Missing from getContext()** |
| `utm_content` | `params().utm_content` — in `_pk` array; sent in events | **Missing from getContext()** |
| `referrer` | `document.referrer` — sent in events | **Missing from getContext()** |
| `landing_page_path` | `location.pathname` | **Not exposed anywhere in public API** |
| `first_touch_timestamp` | `localStorage['st_ft_ts']` — written by `storeFirstTouch()` | Not in getContext() |
| `ai_source` | Derived by `aiSrc()` — sent in events | Not in getContext() |
| `utm_id`, `st_*` custom params | In `_pk` array; sent in events | Not in click_ids object |

These gaps mean `fillHiddenFields()` with proposed keys like `st_utm_term`, `st_referrer`, `st_landing_page` cannot resolve correctly against current `getContext()`. Extension is required (see §6).

---

## 3. Existing Field-Filling or Form-Handoff Helpers

**No `fillHiddenFields`, no `getHandoffParams`, no `data-sourcetrack` attribute, and no auto-injection helper currently exist in either tracker.**

What does exist:

| Helper | File | Line | Purpose |
|---|---|---|---|
| `getContext()` | `tracker.js` | 431 | Returns attribution context object for manual JS use |
| `getContext()` | `tracker.cookieless.js` | 272 | Same — with timing gap noted above |
| `decorateUrl(url)` | `tracker.js` | 339 | Appends `__st_id` and `__st_ft` (base64 first-touch) to a URL — intended for cross-domain handoff |
| `decorateUrl(url)` | `tracker.cookieless.js` | 215 | Same — note: AID may be null; method returns original URL unchanged if AID not resolved |
| Form submit detection | both trackers | — | Emits `form_submit` event passively — reads no input values |
| Booking UTM passthrough | both trackers | — | Rewrites booking host links on `mousedown` — independent of hidden-field handoff |

The `docs/guides/form_checkout_source_handoff.md` documents a manual pattern: the site owner writes JS to call `getContext()` on form submit and populate pre-existing hidden inputs. This is the complete current capability — a docs pattern, not a tracker API.

---

## 4. Current Docs and In-App Copy Claims

| Doc / file | Relevant content | Accuracy |
|---|---|---|
| `docs/guides/form_checkout_source_handoff.md` | Full manual pattern — `getContext()` → hidden inputs, Stripe checkout `client_reference_id`, cookieless timing caveat, privacy safeguards | ✅ Accurate for the manual approach |
| `docs/guides/forms-and-booking-support.md` | Support matrix — ❌ column references `getContext()` + webhooks for unsupported form tools | ✅ Accurate; no overclaims |
| `README.md` | No hidden-field or `getContext()` mention | No issue — no claims to correct |
| `dashboard/src/pages/SolutionLeadGen.jsx` FAQ | Added in 140N — describes auto-detected vs. manual setup paths accurately | ✅ Accurate |
| `dashboard/src/pages/PublicIntegrations.jsx` | No hidden-field or handoff content | No issue |

No existing doc claims native integration with Typeform, Tally, HubSpot Forms, Jotform, or Google Forms. No existing doc claims `fillHiddenFields()` exists (it doesn't yet). No overclaims to correct before 140P-B.

---

## 5. Standard Tracker vs. Cookieless Tracker Parity Gaps

| Area | Standard | Cookieless | Implication for handoff helper |
|---|---|---|---|
| `anonymous_id` availability | Synchronous | Async (null until server responds) | Both trackers must expose helper; callers must invoke on submit, not on load |
| `first_touch_*` persistence | Cross-session (localStorage) | Session-scoped (derived in-memory) | Document clearly; do not claim cookieless `first_touch_source` is cross-session |
| `decorateUrl()` | Appends `__st_id` + `__st_ft` | Same, but `__st_id` omitted if AID not yet resolved | Cookieless `decorateUrl()` degrades gracefully; doc must mention |
| `fillHiddenFields()` (proposed) | Will read from extended `getContext()` | Same — but null IDs possible | Parity required; both implementations must behave identically with same failure modes |
| `getHandoffParams()` (proposed) | Will return flat object from extended `getContext()` | Same | Parity required |

---

## 6. Approved Implementation Plan for 140P-B

Decisions confirmed:

- **Q1 (Extension approach):** Option A — extend `getContext()` as the canonical source of safe attribution context. No independent re-parsing of URL params in helper code.
- **Q2 (Landing page):** Do not expose raw `location.href`. Expose `landing_page_path` (path only, no query string or hash). UTM and click-ID fields are already exposed separately via the existing `click_ids` object and new top-level UTM fields. Raw full URL is not exposed by default.
- **Q3 (Module shape):** Implement inside existing tracker IIFEs for both standard and cookieless trackers. No separate script. Helper methods are inert unless called.

### Step 1 — Extend `getContext()` in both trackers

Add these fields to the return value:

```js
{
  // — existing fields unchanged —

  // New: raw UTM params (captured but previously omitted)
  utm_source:           p.utm_source    || null,   // raw URL param (may differ from current_source derivation)
  utm_medium:           p.utm_medium    || null,
  utm_campaign:         p.utm_campaign  || null,
  utm_term:             p.utm_term      || null,
  utm_content:          p.utm_content   || null,

  // New: referrer (document.referrer, not PII — a domain name or full referrer URL)
  referrer:             ref             || null,   // document.referrer

  // New: landing page path ONLY — no query string, no hash, no sensitive params
  landing_page_path:    location.pathname || null,

  // New: last_touch aliases for current_source/medium/campaign (explicit naming)
  last_touch_source:    currentSrc,
  last_touch_medium:    currentMed,
  last_touch_campaign:  currentCmp,
}
```

**Not added:** `location.href`, `location.search`, or any raw full URL. Query-string params are exposed individually through the `utm_*` and `click_ids` fields. No raw full URL by default.

### Step 2 — Add three public helper methods to both trackers

**`getHandoffParams(opts)`** — returns a flat key-value object suitable for use in hidden fields, URL params, or POST bodies. Prefix is configurable:

```js
// sourcetrack.getHandoffParams({ prefix: 'st_' })
// Returns: { st_anonymous_id: '...', st_utm_source: 'google', ... }
getHandoffParams: function (opts) {
  opts = opts || {}
  var prefix = typeof opts.prefix === 'string' ? opts.prefix : 'st_'
  var ctx = window.sourcetrack.getContext()
  var out = {}
  var safe = [
    'anonymous_id', 'session_id',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'referrer', 'landing_page_path',
    'first_touch_source', 'first_touch_medium', 'first_touch_campaign',
    'last_touch_source', 'last_touch_medium', 'last_touch_campaign'
  ]
  for (var i = 0; i < safe.length; i++) {
    var k = safe[i]
    if (ctx[k] !== null && ctx[k] !== undefined) {
      out[prefix + k] = String(ctx[k])
    }
  }
  var cids = ctx.click_ids || {}
  var cidKeys = Object.keys(cids)
  for (var j = 0; j < cidKeys.length; j++) {
    var ck = cidKeys[j]
    if (cids[ck] !== null && cids[ck] !== undefined) {
      out[prefix + ck] = String(cids[ck])
    }
  }
  return out
}
```

**`fillHiddenFields(opts)`** — fills pre-existing `input[type=hidden]` elements by name:

```js
// sourcetrack.fillHiddenFields({ selector, fields, createMissing })
fillHiddenFields: function (opts) {
  opts = opts || {}
  var selector     = opts.selector || 'form'
  var fieldMap     = opts.fields   || {}
  var createMissing = !!opts.createMissing  // false by default
  var ctx = window.sourcetrack.getContext()

  function resolve(key) {
    if (Object.prototype.hasOwnProperty.call(ctx, key)) return ctx[key]
    if (ctx.click_ids && Object.prototype.hasOwnProperty.call(ctx.click_ids, key)) return ctx.click_ids[key]
    return null
  }

  var forms = document.querySelectorAll(selector)
  for (var fi = 0; fi < forms.length; fi++) {
    var form = forms[fi]
    var keys = Object.keys(fieldMap)
    for (var ki = 0; ki < keys.length; ki++) {
      var inputName = keys[ki]
      var ctxKey    = fieldMap[inputName]
      var val       = resolve(ctxKey)
      if (val === null || val === undefined) continue
      var input = form.querySelector('input[type=hidden][name="' + inputName + '"]')
      if (!input && createMissing) {
        input = document.createElement('input')
        input.type = 'hidden'
        input.name = inputName
        form.appendChild(input)
      }
      if (input) {
        input.value = String(val)
      }
    }
  }
}
```

**`decorateUrl(url, opts)`** — already exists; extend to accept an `opts` parameter for future use without breaking the current signature. No behavior change in 140P-B — surface the extension point only.

### Step 3 — Unit test coverage required before commit

- `fillHiddenFields` fills existing `input[type=hidden]` — correct value
- `fillHiddenFields` skips missing inputs when `createMissing: false`
- `fillHiddenFields` creates inputs when `createMissing: true`
- `fillHiddenFields` never writes to `input[type=text]`, `input[type=email]`, or `textarea`
- `fillHiddenFields` is silent when `anonymous_id` is null (cookieless async race)
- `getHandoffParams` returns flat object with correct prefix
- `getHandoffParams` omits null values
- Extended `getContext()` includes `utm_term`, `utm_content`, `referrer`, `landing_page_path`
- `landing_page_path` is pathname only — no query string, no hash

### Step 4 — Update docs

| Doc | Change |
|---|---|
| `docs/guides/form_checkout_source_handoff.md` | Add `fillHiddenFields()` and `getHandoffParams()` as first-party helpers. Keep manual JS pattern as fallback. Add cookieless timing caveat for new helpers. |
| `docs/guides/forms-and-booking-support.md` | Update ❌ column "Recommended setup" to reference `fillHiddenFields()` for native/HTML forms and `decorateUrl()` for redirect-based hosted forms. |

---

## 7. Privacy Risks — Raw URLs, Referrers, IDs, and Hidden Fields

| Risk | Detail | Mitigation in 140P-B |
|---|---|---|
| Raw `location.href` in hidden field | Full URL may contain reset tokens, session tokens, or personal data in query params | **Not exposed.** `landing_page_path` is `location.pathname` only — no query string, no hash. |
| `referrer` forwarded to third-party form provider | `document.referrer` may be a full URL including query params from the referring page | Exposed in `getContext()` as-is; docs must note that referrer may contain query params from prior page. Callers should review before forwarding to third parties. |
| `anonymous_id` linked to person in CRM | Once visitor fills their email and the form is submitted, the CRM can link anonymous_id to the person | **Intended behavior** — this is the attribution stitch point. Pseudonymous, not PII. Documented clearly. |
| `click_ids` (gclid, fbclid, msclkid) | Ad-platform identifiers — sensitive in some privacy regimes (EU, CCPA) | Exposed in `click_ids` object; callers choose which to forward. Docs must note they are ad-platform identifiers. |
| `fillHiddenFields` reading visible inputs | Could theoretically be misused to read email/name field values if selector is too broad | Implementation uses `querySelector('input[type=hidden][name=X]')` — only matches hidden inputs by exact name. Never reads visible input values. |
| Auto-injection | Hidden fields appearing in forms without developer intent could cause unexpected form submissions or data forwarding | No auto-injection. Explicit call only. No DOMContentLoaded hook. |
| `createMissing: true` creating fields | Could create unexpected hidden inputs in third-party form embeds | `createMissing: false` is the default. `true` must be an explicit opt-in. Docs must warn to use only in forms you control. |

---

## 8. SEO and Copy Implications for Docs

### Claims that are now safe to make (after 140P-B)

- "Pass attribution context — UTM parameters, click IDs, and visitor ID — into any form using a single helper call."
- "Supports hidden field handoff for Typeform, Tally, HubSpot Forms, Jotform, Google Forms, and custom forms that accept hidden inputs or redirect URL parameters."
- "Requires hidden fields or redirect URL parameters to be set up by the developer. The tracker fills them when called — it does not modify forms automatically."
- "Available in both standard and cookieless tracker variants."

### Claims that remain forbidden after 140P-B

- "Works with every form." — unsupported forms using iframes or proprietary event systems still cannot be auto-detected.
- "Captures all forms automatically." — `fillHiddenFields()` is explicit, not automatic.
- "Native integration with Typeform / Tally / HubSpot Forms / Jotform / Google Forms." — these remain external tools with their own event systems. The helper fills hidden fields in *your* form HTML, not inside their embeds.
- "Confirmed booking detection for TidyCal / SavvyCal." — unchanged; passthrough-only.
- "Server-side event persistence proven for forms in deployed E2E." — server-accepted persistence with a valid staging site_key remains BLOCKED.
- "GDPR-safe / fully compliant." — non-negotiable.
- "Improves ROAS automatically." — not a claim we make.

### Docs pages that will need copy review after 140P-B implementation

| Page | Needed update |
|---|---|
| `docs/guides/form_checkout_source_handoff.md` | Add `fillHiddenFields()` / `getHandoffParams()` as primary pattern. Keep manual fallback. |
| `docs/guides/forms-and-booking-support.md` | Update ❌ column recommended setup to reference new helpers. |
| `dashboard/src/pages/SolutionLeadGen.jsx` FAQ | No change needed — existing answer already accurate. |
| `README.md` | Optionally add one-liner about `fillHiddenFields()` under the Public API section. |

---

## 9. Recommended 140P-B Scope

**Session 140P-B — Implement Safe Hidden Field Handoff Helper**

Deliverables (in order):

1. Extend `getContext()` in `tracker/tracker.js` and `tracker/tracker.cookieless.js` — add `utm_term`, `utm_content`, `utm_source`, `utm_medium`, `utm_campaign` (raw params), `referrer`, `landing_page_path`, `last_touch_source`, `last_touch_medium`, `last_touch_campaign`.
2. Add `getHandoffParams(opts)` to both trackers.
3. Add `fillHiddenFields(opts)` to both trackers.
4. Extend `decorateUrl(url, opts)` signature — no behavior change, add opts param for future use.
5. Rebuild minified files: `tracker.min.js`, `tracker.cookieless.min.js`.
6. Add unit tests (see §6 Step 3).
7. Update `docs/guides/form_checkout_source_handoff.md`.
8. Update `docs/guides/forms-and-booking-support.md` ❌ column.
9. Run `npm run qa:static`, `npm run qa:secrets`, full CI.
10. Return raw diff + validation. Do not commit until explicit approval.

---

## 10. Explicit Non-Goals for 140P-B

- Do not auto-inject hidden fields on DOMContentLoaded or form submit.
- Do not change form submit detection (`form_submit` event) behavior.
- Do not add provider-specific native integrations.
- Do not claim confirmed booking support beyond Calendly/Cal.com embeds.
- Do not claim "works with every form" or "captures all forms automatically."
- Do not capture form field values entered by the user.
- Do not expose raw `location.href` or `location.search` in `getContext()` by default.
- Do not add cookies.
- Do not forward PII through the helper.
- Do not claim paid beta readiness.
- Do not implement URL decoration options beyond the existing `__st_id` / `__st_ft` pattern.
