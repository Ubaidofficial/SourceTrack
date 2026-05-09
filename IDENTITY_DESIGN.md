# IDENTITY_DESIGN.md — TrackIQ

## Current Architecture

### Anonymous ID Flow
```
Browser → cookie: __ti_id_{siteKey} = UUIDv4
         cookie: __ti_ft_{siteKey} = {timestamp, source, medium, campaign}
         cookie: __ti_lt_{siteKey} = {timestamp, source, medium, campaign}

Tracker → POST /api/track { anonymous_id, event, utm_*, page_url, ... }
       → POST /api/identify { anonymous_id, traits }
```

### How identify works today
- `window.trackiq.identify({ email, user_id, ... })` sends traits to `/api/identify`
- Backend captures `$identify` event with `$set` on the anonymous_id's PostHog person
- The anonymous_id IS the PostHog distinctId — no alias/link step happens

### Gap
- No mapping from anonymous_id → real user identity in PostHog's person model
- PostHog's native `$identify` merges persons via `ph.alias()` / `$create_alias`, but the current code only calls `ph.capture()` with `$set`
- Multi-domain tracking: cookies are domain-scoped, so `__ti_id_*` is lost across domain boundaries

---

## 1. Identity Stitching Design

### 1.1 Anonymous → Identified Mapping

```
Browser A (anon_1) ──identify({email: "a@b.com", user_id: "u1"})──→ person_1
Browser B (anon_2) ──identify({email: "a@b.com", user_id: "u1"})──→ person_1 (merged)
```

**Strategy: Two-step identification**

| Step | Action | PostHog effect |
|---|---|---|
| 1. `$identify` | Capture `$identify` with `$set: { email, user_id }` | Sets person properties on the anonymous person |
| 2. `$create_alias` | Call `ph.alias({ distinctId: user_id, alias: anonymous_id })` | Merges anonymous person into the identified person going forward |

**Why alias instead of just $set:**
- `$set` alone doesn't merge browser profiles — two anonymous IDs with the same email remain separate persons
- `alias` tells PostHog "this anonymous_id IS this user_id" — future events for either map to the same person
- PostHog's person model then resolves all events under `user_id`

### 1.2 When to call identify

| Trigger | Data | Notes |
|---|---|---|
| User signs up | `{ email, user_id }` | Primary identification event |
| User logs in on new device/browser | `{ email, user_id }` | Merges browser profile |
| Form submit with email (lead) | `{ email }` | Pre-signup identification |
| Already identified user returns | `{ user_id }` | Keep existing identity |

### 1.3 Avoiding Double Counting

**Problem:** If anon_1 converts before identification, and anon_2 converts after identification, attributing both conversions to user_id could double-count.

**Solution: Conversion deduplication layer**

```
Rule: All conversion events for a site MUST have a unique key:
      site_id + anonymous_id + conversion_value + timestamp_bucket(hour)
```

On the backend, before capturing a conversion:
1. Check PostHog for existing conversion with same `site_id + anonymous_id` in the same hour bucket
2. If found, skip capture and return 200 (idempotent)
3. If not found, capture normally

For HogQL attribution queries, add:
```sql
-- Deduplicate conversions per anonymous_id per hour
WHERE properties.is_conversion = true
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY properties.site_id, distinct_id, dateDiff('hour', timestamp)
  ORDER BY timestamp
) = 1
```

**TODO: confirm** — PostHog's `QUALIFY` clause availability in the HogQL engine.

### 1.4 Proposed PostHog Properties

Add these to SYSTEM.md guarded with `TODO: confirm`:

```yaml
# Identity properties (Session 5 — Identity Stitching)
# TODO: confirm before adding to SYSTEM.md allowed list
properties.user_id:       # String — app's user ID (from identify call)
properties.user_email:    # String — user's email (from identify call)
properties.is_identified: # Boolean — true if user has been identified
properties.session_id:    # String — UUIDv4, regenerated when user returns after 30min inactivity
```

### 1.5 Data Flow Diagram

```
                    ┌─────────────┐
                    │  Browser A  │
                    │  anon_id=1  │
                    └──────┬──────┘
                           │ $pageview (anon_id=1)
                           │ signup form submit
                           │ trackiq.identify({email:"x@y.com", user_id:"u1"})
                           ▼
              ┌────────────────────────┐
              │    POST /api/identify   │
              │    { anonymous_id: 1,   │
              │      traits: {email,   │
              │      user_id} }         │
              └────────────┬───────────┘
                           │
              ┌────────────▼───────────┐
              │  1. ph.capture({       │
              │     distinctId: 1,     │
              │     event: $identify,  │
              │     $set: {email, uid} │
              │   })                   │
              │  2. ph.alias({         │
              │     distinctId: "u1",  │
              │     alias: 1           │
              │   })                   │
              └────────────────────────┘
                           │
              ┌────────────▼───────────┐
              │  Subsequent events     │
              │  use distinctId: "u1"  │
              │  with anon_id: 1 in    │
              │  properties            │
              └────────────────────────┘
```

---

## 2. Multi-Domain Funnel Design

### 2.1 Problem

Cookie `__ti_id_{siteKey}` is scoped to `blog.example.com`. When user navigates to `app.example.com`, the cookie is invisible — a new anonymous ID is created. The funnel is broken.

### 2.2 Cookie Strategy

**Option A: TLD cookie (recommended for subdomains)**
```js
document.cookie = '__ti_id_xxx=anon_1; domain=.example.com; SameSite=None; Secure; path=/; max-age=31536000'
```
Setting `domain=.example.com` makes the cookie available on `blog.example.com`, `app.example.com`, `checkout.example.com`.

**Option B: URL param pass-through (required for different TLDs)**
```
blog.example.com → ?__tq_id=anon_1 → app.different.com reads param, sets cookie
```

The tracker should:
1. On load, check URL for `__tq_id` param
2. If found and no existing cookie → set cookie to that value
3. If found and existing cookie differs → call `identify` to alias them
4. On link clicks to configured target domains → append `__tq_id` to URL

### 2.3 Cookie Domain Configuration

```js
// In window.__trackiq_config or site config
{
  cookie_domain: '.example.com',  // TLD cookie scope
  cross_domain_links: ['app.example.com', 'checkout.example.com']
}
```

**TODO: confirm** — whether to use TLD cookie by default vs. explicit config.

### 2.4 Cross-Domain URL Param Flow

```
blog.example.com (anon_id=abc)
  │  link to app.example.com
  │  tracker rewrites href: app.example.com?__tq_id=abc
  ▼
app.example.com
  │  reads __tq_id=abc from URL → sets cookie __ti_id_xxx=abc
  │  reads __tq_ft=... from URL (first-touch data)
  │  strips params from URL (replaceState)
  │  sendEvent($pageview) with anon_id=abc
  ▼
checkout.example.com (same flow)
```

### 2.5 Ignored Referrers

```yaml
# Default ignored referrers (payment gateways, email, auth redirects)
ignored_referrers:
  - paypal.com
  - checkout.stripe.com
  - accounts.google.com
  - login.microsoftonline.com
  - mail.google.com
  - outlook.live.com
  - appleid.apple.com
  - github.com/login
```

When referrer matches an ignored domain:
- Do NOT overwrite last-touch cookie
- Do NOT update `referrer` property in events (send null)
- Still count as a session, just not a new acquisition source

**TODO: confirm** — the full ignored referrers list per site.

---

## 3. Configuration Model

### 3.1 Site Config Shape (Supabase `sites` table addition)

```sql
-- Proposed new column (or separate config table)
-- TODO: confirm schema before implementing
ALTER TABLE sites ADD COLUMN config jsonb DEFAULT '{}'::jsonb;
```

```json
{
  "attribution": {
    "default_model": "last_touch",
    "lookback_window_days": 30,
    "first_touch_window_days": 90,
    "last_touch_window_days": 30
  },
  "identity": {
    "cookie_domain": null,
    "cross_domain_links": [],
    "auto_identify_on_signup": true
  },
  "referrers": {
    "ignored": [
      "paypal.com",
      "checkout.stripe.com",
      "accounts.google.com"
    ],
    "direct_is_source": true
  },
  "events": {
    "conversion_dedup_window_minutes": 60,
    "session_idle_timeout_minutes": 30
  }
}
```

### 3.2 Default Configuration

If no config set, use these defaults:

```json
{
  "attribution": {
    "default_model": "last_touch",
    "lookback_window_days": 30
  },
  "identity": {
    "auto_identify_on_signup": false
  },
  "referrers": {
    "ignored": [
      "paypal.com",
      "checkout.stripe.com",
      "accounts.google.com",
      "login.microsoftonline.com",
      "appleid.apple.com"
    ],
    "direct_is_source": true
  },
  "events": {
    "conversion_dedup_window_minutes": 60,
    "session_idle_timeout_minutes": 30
  }
}
```

---

## 4. Implementation Plan

### Phase 1: Identity Stitching (Tracker + Backend)

**Tracker changes (`tracker/tracker.js`):**
- [ ] Add `identified_user_id` state variable (null until `identify` called)
- [ ] On `identify(traits)`:
  - Set `identified_user_id = traits.user_id`
  - Send `$identify` event (existing behavior)
  - Set cookie `__ti_uid_{siteKey} = { user_id, email }` (persist across page loads)
- [ ] On page load, read `__ti_uid_*` cookie and auto-set identified state
- [ ] Send `distinctId` as user_id when identified, anonymous_id when not

**Backend changes:**
- [ ] `api/routes/identify.js`:
  - After `ph.capture($identify, $set)`, call `ph.alias({ distinctId: user_id, alias: anonymous_id })`
  - Only call alias if `traits.user_id` is present (not just email)
- [ ] `api/routes/track.js`:
  - Accept optional `user_id` field in body
  - If `user_id` present and event is `$conversion`, run dedup check
  - Set `properties.user_id` and `properties.user_email` on all events

**PostHog property updates (`SYSTEM.md`):**
- [ ] Add `properties.user_id` — TODO: confirm
- [ ] Add `properties.user_email` — TODO: confirm
- [ ] Add `properties.is_identified` — TODO: confirm
- [ ] Add `properties.session_id` — TODO: confirm

### Phase 2: Multi-Domain (Tracker)

**Tracker changes (`tracker/tracker.js`):**
- [ ] Read `config.cookie_domain` and use for cookie `domain=` param
- [ ] Read `config.cross_domain_links` list
- [ ] On `DOMContentLoaded`:
  - Check URL for `__tq_id` param → set cookie if missing
  - Check URL for `__tq_ft` param → restore first-touch cookie
  - `history.replaceState` to strip params
- [ ] Add `MutationObserver` or click listener:
  - Intercept `<a>` clicks to `cross_domain_links` domains
  - Append `?__tq_id={anonymousId}&__tq_ft={firstTouch}` to href

**Backend changes:**
- [ ] `api/middleware/ai-platform.js` or new middleware:
  - Check referrer against `ignored_referrers` site config
  - If ignored, set `req.referrer_ignored = true`
- [ ] `api/routes/track.js`:
  - If `req.referrer_ignored`, set `properties.referrer = null`

### Phase 3: Configuration (Supabase + Dashboard)

**Supabase changes (`supabase/schema.sql`):**
- [ ] Add `config jsonb DEFAULT '{}'` column to `sites` table — TODO: confirm
- [ ] Add `site_configs` table if separate from sites — TODO: confirm

**Dashboard changes:**
- [ ] Settings page → add "Tracking Configuration" section
  - Attribution model dropdown
  - Lookback window slider
  - Ignored referrers tag input
  - Cookie domain input
- [ ] Install page → show cross-domain setup instructions

**API changes:**
- [ ] `GET /api/sites/config` — returns site config
- [ ] `PUT /api/sites/config` — updates site config
- [ ] `auth.js` middleware → load config into `req.site.config`

---

## 5. Edge Cases & Decisions

| Scenario | Decision |
|---|---|
| User identifies with email only (no user_id) | Don't alias — email alone isn't unique enough for identity merging |
| Same user, same browser, two different user_ids | Last identify wins — alias from old to new? TODO: confirm |
| Cross-domain with different site_keys | Don't share identity — different sites are separate |
| User clears cookies mid-session | New anonymous_id created; if they re-identify, alias merges back |
| Conversion before identify, then identify later | Backfill: on identify, check for unconverted-identified conversions and re-attach. TODO: confirm complexity. |
| Bot/crawler traffic | Filter in backend: check user-agent against known bot list before capturing. TODO: confirm. |
